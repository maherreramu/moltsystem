# 03 — Modelo de datos iter-1 · Sistema de Producción Molt

**Versión:** 1.1
**Fecha original:** 2026-05-28 · **Actualizado:** 2026-06-01
**Estado:** IMPLEMENTADO — 27 migraciones aplicadas en Supabase (0001–0027)

---

## Propósito de esta iteración

**Iter-1 entrega un sistema de gobierno operativo agregado**, no un MES detallado. Permite:

- Ver el estado de producción en Kanban (8 fases) y Gantt (plan pull)
- Hacer seguimiento diario real contra plan baseline
- Identificar desvíos, bloqueos y necesidad de modificar plan
- Priorizar trabajo según score acordado (PPT 28-may-2026)
- Activar planes de contingencia A/B/C ante cuellos de botella
- Hacer seguimiento de reprocesos y avances parciales

**No es MES.** Iter-2+ profundizará a nivel rollo, paquete, requerimiento atómico y OS individual cuando exista el modelo de datos de compañía (SKUs codificados maestros, BOMs estructurados, inventario codificado de telas/insumos/avíos, catálogo de proveedores normalizado). Mientras eso no exista, iter-1 trata la OP-D como caja semi-cerrada.

El schema iter-1 está diseñado para **extenderse a iter-2+ sin migración destructiva**: las entidades nuevas se acoplan vía FKs a `op_ds` sin tocar lo existente.

---

## Marco arquitectónico

| Capa | Naturaleza | Construido en |
|---|---|---|
| **Núcleo de gobierno** | Lo que es hoy ClickUp, migrado a Postgres con mejor performance y trazabilidad | iter-1 |
| **Módulos transaccionales** | MES detallado por área (rollos, paquetes, OS, etc.) | iter-2+ |
| **Capa maestra de compañía** | SKU codificados, BOMs, inventario codificado | Pre-requisito de iter-2+, fuera de este sistema |

Stack confirmado: Supabase Postgres 15 + Next.js 15 + Metabase para analítica ejecutiva. Ver `docs/ARQUITECTURA.md`.

---

## Modelo de datos

### Convenciones

- Tablas en `snake_case`, plural
- PKs `UUID DEFAULT gen_random_uuid()` salvo donde la clave natural es estable (ej. `op_num` de IMPEL)
- Toda tabla tiene `created_at TIMESTAMPTZ DEFAULT now()` y `updated_at` con trigger
- Las métricas derivadas (score, slack, semáforo) NO se persisten — solo en vistas
- `phase_event` y `op_d_pendiente` son append-only (los pendientes pueden cambiar de estado, pero nunca se borran)
- Nombres de fases: `fase_0`, `compras`, `trazo`, `corte`, `tiqueteo`, `satelites`, `empaque`, `despacho`

### Enums

```sql
CREATE TYPE fase_enum AS ENUM (
  'fase_0', 'compras', 'trazo', 'corte',
  'tiqueteo', 'satelites', 'empaque', 'despacho'
);

CREATE TYPE semaforo_enum AS ENUM ('verde', 'amarillo', 'rojo');

CREATE TYPE cliente_tier_enum AS ENUM ('tier_1', 'tier_2', 'estandar');

CREATE TYPE tipo_relacion_enum AS ENUM (
  'contrato_con_penalizacion',
  'contrato_sin_penalizacion',
  'recurrente',
  'unico'
);

CREATE TYPE condicion_pago_enum AS ENUM (
  'anticipado',
  'hasta_30d',
  '30_a_60d',
  'mas_de_60d'
);

CREATE TYPE esquema_facturacion_enum AS ENUM (
  'directa', 'con_oc_cliente', 'resumen_y_oc'
);

CREATE TYPE canal_cliente_enum AS ENUM ('colombia', 'panama_internacional');

CREATE TYPE complejidad_enum AS ENUM ('alta', 'media', 'baja');

CREATE TYPE recurso_corte_enum AS ENUM ('morgan', 'manual', 'externo');

CREATE TYPE tipo_empaque_enum AS ENUM ('estandar', 'personalizado', 'exportacion');

CREATE TYPE tipo_despacho_enum AS ENUM ('estandar', 'cross_docking', 'personalizado', 'exportacion');

CREATE TYPE motivo_bloqueo_enum AS ENUM (
  'mp_no_llego', 'fase_0_incompleta', 'pendiente_cliente',
  'capacidad_satelite', 'reproceso', 'otro'
);

CREATE TYPE causa_desvio_enum AS ENUM (
  'mp_tardia', 'calidad_mp', 'bloqueo_f0',
  'capacidad_corte', 'capacidad_trazo', 'capacidad_satelite',
  'capacidad_tiqueteo_empaque',
  'reproceso_interno', 'reproceso_satelite',
  'cambio_cliente', 'documentacion_despacho', 'otro'
);

CREATE TYPE pendiente_estado_enum AS ENUM (
  'pendiente', 'en_subsanacion', 'cerrado'
);

CREATE TYPE phase_event_tipo_enum AS ENUM (
  'op_arrival', 'f0_checkbox_update', 'baseline_freeze',
  'phase_advance', 'phase_revert', 'phase_advance_parcial',
  'block', 'unblock', 'replan', 'daily_check',
  'satellite_promise_set', 'satellite_received',
  'score_update', 'resource_change', 'pendiente_created',
  'pendiente_status_change'
);
```

---

### Maestros — espejo IMPEL (solo lectura)

```sql
-- Cliente fiscal (ETL desde IMPEL)
CREATE TABLE clientes_impel (
  id_impel        TEXT PRIMARY KEY,
  nit             TEXT,
  razon_social    TEXT NOT NULL,
  nombre_comercial TEXT,
  -- otros campos fiscales según extraiga el ETL
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- SKU modelo (diseño padre)
CREATE TABLE sku_modelo_impel (
  id_impel        TEXT PRIMARY KEY,
  referencia      TEXT NOT NULL,
  nombre          TEXT,
  ficha_tecnica_url TEXT,
  patron_cad_url  TEXT,
  estado          TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- SKU variante por talla/color
CREATE TABLE sku_impel (
  id_impel        TEXT PRIMARY KEY,
  sku_modelo_id   TEXT REFERENCES sku_modelo_impel,
  talla           TEXT,
  color           TEXT,
  codigo_barras   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

### Maestros — capa MES (editables)

```sql
-- Capa operativa del cliente, extiende clientes_impel 1:1
CREATE TABLE clientes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_impel_id TEXT UNIQUE NOT NULL REFERENCES clientes_impel,

  -- Atributos para score (PPT 28-may-2026)
  tier            cliente_tier_enum NOT NULL DEFAULT 'estandar',
  tipo_relacion   tipo_relacion_enum NOT NULL DEFAULT 'unico',
  condicion_pago  condicion_pago_enum NOT NULL DEFAULT 'mas_de_60d',

  -- Atributos operativos
  esquema_facturacion esquema_facturacion_enum NOT NULL DEFAULT 'directa',
  stock_administrado  BOOLEAN NOT NULL DEFAULT false,
  canal               canal_cliente_enum NOT NULL DEFAULT 'colombia',
  complejidad_tipica  complejidad_enum NOT NULL DEFAULT 'media',

  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_clientes_cliente_impel ON clientes(cliente_impel_id);

-- Sedes destino del cliente (para cross docking y personalizado)
CREATE TABLE sedes_cliente (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      UUID NOT NULL REFERENCES clientes ON DELETE CASCADE,
  nombre_sede     TEXT NOT NULL,
  ciudad          TEXT NOT NULL,
  direccion       TEXT,
  operador_logistico_preferido TEXT,
  contacto        TEXT,
  activa          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sedes_cliente ON sedes_cliente(cliente_id);

-- Catálogo de recursos × lead time por fase
CREATE TABLE lead_time_recurso (
  fase            fase_enum NOT NULL,
  recurso         TEXT NOT NULL,
  dias_default    SMALLINT NOT NULL,
  condiciones     TEXT,
  activo          BOOLEAN NOT NULL DEFAULT true,
  updated_at      TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (fase, recurso)
);

-- Festivos Colombia (para cálculo de días hábiles)
CREATE TABLE festivos_co (
  fecha           DATE PRIMARY KEY,
  descripcion     TEXT
);
```

### Núcleo operativo — OP y OP-D

```sql
-- Orden de producción (cabecera)
CREATE TABLE ops (
  op_num          TEXT PRIMARY KEY,              -- "OP-6729" desde IMPEL
  cliente_id      UUID NOT NULL REFERENCES clientes,
  nombre          TEXT,
  fecha_creacion_impel DATE,
  fecha_compromiso DATE NOT NULL,
  fecha_compromiso_original DATE,                -- snapshot inicial
  total_uds       INTEGER,
  comercial       TEXT,                          -- equipo Molt: Miguel/Santiago/Camila/Mateo
  flag_parcial    BOOLEAN NOT NULL DEFAULT false,
  op_origen       TEXT,                          -- solo si flag_parcial = true
  activa          BOOLEAN NOT NULL DEFAULT true,
  fecha_paso_produccion TIMESTAMPTZ,             -- arrival event en el MES
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ops_cliente ON ops(cliente_id);
CREATE INDEX idx_ops_activa ON ops(activa) WHERE activa = true;

-- Detalle de OP: una referencia/prenda por OP-D
CREATE TABLE op_ds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  impel_id        TEXT UNIQUE NOT NULL,          -- ID en IMPEL
  op_num          TEXT NOT NULL REFERENCES ops,
  ref             TEXT NOT NULL,                 -- "6729-1"
  descripcion     TEXT,
  cantidad        INTEGER NOT NULL CHECK (cantidad > 0),

  -- Estado actual
  fase_actual     fase_enum NOT NULL DEFAULT 'fase_0',

  -- Checkboxes Fase 0 (compuerta de entrada)
  f0_ficha_tec    BOOLEAN NOT NULL DEFAULT false,
  f0_patronaje    BOOLEAN NOT NULL DEFAULT false,
  f0_muestra      BOOLEAN NOT NULL DEFAULT false,
  f0_aprobacion   BOOLEAN NOT NULL DEFAULT false,
  f0_tela_avios   BOOLEAN NOT NULL DEFAULT false,
  f0_op_creada    BOOLEAN NOT NULL DEFAULT false,

  -- Días planeados por fase (editables, default desde lead_time_recurso)
  dias_fase_0     SMALLINT NOT NULL DEFAULT 5,
  dias_compras    SMALLINT NOT NULL DEFAULT 5,
  dias_trazo      SMALLINT NOT NULL DEFAULT 3,
  dias_corte      SMALLINT NOT NULL DEFAULT 4,
  dias_tiqueteo   SMALLINT NOT NULL DEFAULT 2,
  dias_satelites  SMALLINT NOT NULL DEFAULT 15,
  dias_empaque    SMALLINT NOT NULL DEFAULT 4,
  dias_despacho   SMALLINT NOT NULL DEFAULT 1,

  -- Recursos por fase (default heurístico)
  recurso_corte   recurso_corte_enum NOT NULL DEFAULT 'morgan',
  tipo_empaque    tipo_empaque_enum NOT NULL DEFAULT 'estandar',
  tipo_despacho   tipo_despacho_enum NOT NULL DEFAULT 'estandar',

  -- Control operativo
  primera_vez     BOOLEAN NOT NULL DEFAULT false,  -- flag manual, junta
  plan_congelado  BOOLEAN NOT NULL DEFAULT false,  -- protege de recálculo
  bloqueada       BOOLEAN NOT NULL DEFAULT false,
  motivo_bloqueo  motivo_bloqueo_enum,
  causa_desvio    causa_desvio_enum,

  -- Override de score (Miguel)
  score_override  INTEGER CHECK (score_override BETWEEN 0 AND 100),
  score_motivo    TEXT,

  -- Satélites (caja negra: solo 2 fechas)
  fecha_promesa_satelites DATE,
  fecha_recepcion_satelites DATE,

  -- Metadata
  detalle         TEXT,                          -- de IMPEL
  colores         TEXT,                          -- de IMPEL
  link_impel      TEXT,
  activa          BOOLEAN NOT NULL DEFAULT true,

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_op_ds_op_num ON op_ds(op_num);
CREATE INDEX idx_op_ds_fase ON op_ds(fase_actual) WHERE activa = true;
CREATE INDEX idx_op_ds_bloqueada ON op_ds(bloqueada) WHERE bloqueada = true;
CREATE INDEX idx_op_ds_activa ON op_ds(activa) WHERE activa = true;
```

### Plan baseline + plan vigente

```sql
-- Plan vigente por OP-D × fase (mutable solo en F0 o por replan formal)
CREATE TABLE phase_plans (
  opd_id          UUID NOT NULL REFERENCES op_ds ON DELETE CASCADE,
  fase            fase_enum NOT NULL,
  dias            SMALLINT NOT NULL,
  start_date      DATE NOT NULL,
  due_date        DATE NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (opd_id, fase)
);

-- Plan baseline: snapshot inmutable al cerrar F0
CREATE TABLE phase_plans_baseline (
  opd_id          UUID NOT NULL REFERENCES op_ds ON DELETE CASCADE,
  fase            fase_enum NOT NULL,
  dias            SMALLINT NOT NULL,
  start_date      DATE NOT NULL,
  due_date        DATE NOT NULL,
  frozen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  frozen_by       TEXT,                          -- usuario que cerró F0
  PRIMARY KEY (opd_id, fase)
);
```

**Regla:** `phase_plans_baseline` se llena automáticamente al disparar el evento `baseline_freeze` (cuando F0 está completa y se mueve a Compras). Una vez llenado, **nunca se modifica**.

### Event store

```sql
-- Historial inmutable de eventos por OP-D
CREATE TABLE phase_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opd_id          UUID NOT NULL REFERENCES op_ds,
  fase            fase_enum,
  tipo            phase_event_tipo_enum NOT NULL,
  actor           TEXT NOT NULL,                 -- email del usuario
  payload         JSONB,
  ts              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_phase_events_opd ON phase_events(opd_id, ts DESC);
CREATE INDEX idx_phase_events_tipo ON phase_events(tipo, ts DESC);
```

**Regla:** append-only. No hay UPDATE ni DELETE permitidos en esta tabla (enforced por política RLS o trigger).

### Pendientes y reprocesos

```sql
-- Pendientes de subsanación: avances parciales y reprocesos por fase
CREATE TABLE op_d_pendientes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opd_padre_id    UUID NOT NULL REFERENCES op_ds,

  fase_origen     fase_enum NOT NULL,            -- dónde se generó el problema
  motivo          causa_desvio_enum NOT NULL,    -- qué tipo de error
  cantidad_afectada INTEGER NOT NULL CHECK (cantidad_afectada > 0),

  fase_actual     fase_enum NOT NULL,            -- dónde está el pendiente HOY
  estado          pendiente_estado_enum NOT NULL DEFAULT 'pendiente',
  fecha_compromiso_subsanacion DATE,

  responsable     TEXT,                          -- líder fase responsable
  notas           TEXT,

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  closed_at       TIMESTAMPTZ,
  closed_by       TEXT
);

CREATE INDEX idx_pendientes_opd ON op_d_pendientes(opd_padre_id);
CREATE INDEX idx_pendientes_estado ON op_d_pendientes(estado) WHERE estado != 'cerrado';
CREATE INDEX idx_pendientes_fase ON op_d_pendientes(fase_actual) WHERE estado != 'cerrado';
```

**Funcionamiento:** la OP-D padre sigue su flujo normal con `(cantidad - sum(cantidad_afectada de pendientes abiertos))`. Cada pendiente tiene su propio mini-flujo y mini-semáforo. Cierre de la OP-D padre requiere que todos sus pendientes estén `cerrado`.

---

## Vistas SQL — métricas derivadas

### v_score — cálculo del score de prioridad

Implementa los 5 criterios del PPT (28-may-2026), total 100 puntos. Aplica `score_override` si está presente.

```sql
CREATE VIEW v_score AS
WITH urgencia AS (
  SELECT
    od.id AS opd_id,
    dias_habiles_entre(CURRENT_DATE, o.fecha_compromiso) AS slack_dias,
    CASE
      WHEN dias_habiles_entre(CURRENT_DATE, o.fecha_compromiso) <= 0 THEN 35
      WHEN dias_habiles_entre(CURRENT_DATE, o.fecha_compromiso) BETWEEN 1 AND 7 THEN 25
      WHEN dias_habiles_entre(CURRENT_DATE, o.fecha_compromiso) BETWEEN 8 AND 15 THEN 15
      WHEN dias_habiles_entre(CURRENT_DATE, o.fecha_compromiso) BETWEEN 16 AND 30 THEN 5
      ELSE 0
    END AS pts_urgencia
  FROM op_ds od
  JOIN ops o ON o.op_num = od.op_num
  WHERE od.activa = true
),
contractual AS (
  SELECT
    od.id AS opd_id,
    CASE c.tipo_relacion
      WHEN 'contrato_con_penalizacion' THEN 20
      WHEN 'contrato_sin_penalizacion' THEN 12
      WHEN 'recurrente' THEN 6
      ELSE 0
    END AS pts_contractual
  FROM op_ds od
  JOIN ops o ON o.op_num = od.op_num
  JOIN clientes c ON c.id = o.cliente_id
),
estrategico AS (
  SELECT
    od.id AS opd_id,
    CASE
      WHEN od.primera_vez THEN 15
      WHEN c.tier = 'tier_1' THEN 20
      WHEN c.tier = 'tier_2' THEN 10
      ELSE 4
    END AS pts_estrategico
  FROM op_ds od
  JOIN ops o ON o.op_num = od.op_num
  JOIN clientes c ON c.id = o.cliente_id
),
volumen_complejidad AS (
  SELECT
    od.id AS opd_id,
    -- Sub-A complejidad (de la OP, no la OPD individual)
    CASE c.complejidad_tipica
      WHEN 'alta' THEN 5
      WHEN 'media' THEN 3
      ELSE 1
    END AS pts_complejidad,
    -- Sub-B velocidad ejecución (heurística: ratio refs/total_uds)
    CASE
      WHEN (SELECT COUNT(*) FROM op_ds WHERE op_num = od.op_num) = 1
           AND od.cantidad >= 1000 THEN 5
      WHEN (SELECT COUNT(*) FROM op_ds WHERE op_num = od.op_num) >= 5
           AND od.cantidad < 100 THEN 1
      ELSE 3
    END AS pts_velocidad
  FROM op_ds od
  JOIN ops o ON o.op_num = od.op_num
  JOIN clientes c ON c.id = o.cliente_id
),
caja AS (
  SELECT
    od.id AS opd_id,
    CASE c.condicion_pago
      WHEN 'anticipado' THEN 15
      WHEN 'hasta_30d' THEN 15
      WHEN '30_a_60d' THEN 8
      ELSE 3
    END AS pts_caja
  FROM op_ds od
  JOIN ops o ON o.op_num = od.op_num
  JOIN clientes c ON c.id = o.cliente_id
)
SELECT
  od.id AS opd_id,
  od.ref,
  od.op_num,
  u.slack_dias,
  u.pts_urgencia,
  ct.pts_contractual,
  e.pts_estrategico,
  vc.pts_complejidad,
  vc.pts_velocidad,
  ca.pts_caja,
  (u.pts_urgencia + ct.pts_contractual + e.pts_estrategico
   + vc.pts_complejidad + vc.pts_velocidad + ca.pts_caja) AS score_calculado,
  od.score_override,
  COALESCE(od.score_override,
           u.pts_urgencia + ct.pts_contractual + e.pts_estrategico
           + vc.pts_complejidad + vc.pts_velocidad + ca.pts_caja) AS score_efectivo
FROM op_ds od
JOIN urgencia u ON u.opd_id = od.id
JOIN contractual ct ON ct.opd_id = od.id
JOIN estrategico e ON e.opd_id = od.id
JOIN volumen_complejidad vc ON vc.opd_id = od.id
JOIN caja ca ON ca.opd_id = od.id
WHERE od.activa = true;
```

### v_slack — slack y semáforo por OP-D

```sql
CREATE VIEW v_slack AS
WITH dias_restantes AS (
  SELECT
    od.id AS opd_id,
    COALESCE(SUM(pp.dias), 0) AS suma_dias_restantes
  FROM op_ds od
  LEFT JOIN phase_plans pp ON pp.opd_id = od.id
    AND pp.fase > od.fase_actual   -- enum ordena por declaración = orden de producción; NO castear a ::text
  WHERE od.activa = true
  GROUP BY od.id
)
SELECT
  od.id AS opd_id,
  od.ref,
  od.op_num,
  od.cliente_id,
  od.fase_actual,
  dr.suma_dias_restantes AS dias_plan_restantes,
  dias_habiles_entre(CURRENT_DATE, o.fecha_compromiso) AS dias_hasta_compromiso,
  dias_habiles_entre(CURRENT_DATE, o.fecha_compromiso) - dr.suma_dias_restantes AS slack,
  CASE
    WHEN dias_habiles_entre(CURRENT_DATE, o.fecha_compromiso) - dr.suma_dias_restantes >= 3 THEN 'verde'::semaforo_enum
    WHEN dias_habiles_entre(CURRENT_DATE, o.fecha_compromiso) - dr.suma_dias_restantes >= 0 THEN 'amarillo'::semaforo_enum
    ELSE 'rojo'::semaforo_enum
  END AS semaforo
FROM op_ds od
JOIN ops o ON o.op_num = od.op_num
JOIN dias_restantes dr ON dr.opd_id = od.id
WHERE od.activa = true;
```

### v_semaforo_op — peor estado entre OP-Ds

```sql
CREATE VIEW v_semaforo_op AS
SELECT
  o.op_num,
  o.cliente_id,
  CASE
    WHEN bool_or(vs.semaforo = 'rojo') THEN 'rojo'::semaforo_enum
    WHEN bool_or(vs.semaforo = 'amarillo') THEN 'amarillo'::semaforo_enum
    ELSE 'verde'::semaforo_enum
  END AS semaforo_op,
  COUNT(*) AS total_op_ds,
  COUNT(*) FILTER (WHERE vs.semaforo = 'rojo') AS rojas,
  COUNT(*) FILTER (WHERE vs.semaforo = 'amarillo') AS amarillas,
  COUNT(*) FILTER (WHERE vs.semaforo = 'verde') AS verdes
FROM ops o
JOIN op_ds od ON od.op_num = o.op_num
JOIN v_slack vs ON vs.opd_id = od.id
WHERE o.activa = true AND od.activa = true
GROUP BY o.op_num, o.cliente_id;
```

### v_plan_vs_real — comparación baseline / actual / real

```sql
CREATE VIEW v_plan_vs_real AS
WITH eventos_avance AS (
  SELECT
    opd_id,
    fase,
    MIN(ts) FILTER (WHERE tipo IN ('phase_advance', 'phase_advance_parcial')) AS fecha_real_inicio,
    MIN(ts) FILTER (WHERE tipo = 'phase_advance' AND payload->>'fase_from' = fase::text) AS fecha_real_fin
  FROM phase_events
  GROUP BY opd_id, fase
)
SELECT
  od.id AS opd_id,
  od.ref,
  pp.fase,
  pb.dias AS dias_baseline,
  pb.start_date AS start_baseline,
  pb.due_date AS due_baseline,
  pp.dias AS dias_plan_actual,
  pp.start_date AS start_plan_actual,
  pp.due_date AS due_plan_actual,
  ea.fecha_real_inicio,
  ea.fecha_real_fin
FROM op_ds od
JOIN phase_plans pp ON pp.opd_id = od.id
LEFT JOIN phase_plans_baseline pb ON pb.opd_id = od.id AND pb.fase = pp.fase
LEFT JOIN eventos_avance ea ON ea.opd_id = od.id AND ea.fase = pp.fase
WHERE od.activa = true;
```

### v_pendientes_abiertos

```sql
CREATE VIEW v_pendientes_abiertos AS
SELECT
  p.id,
  p.opd_padre_id,
  od.ref AS opd_ref,
  od.op_num,
  p.fase_origen,
  p.motivo,
  p.cantidad_afectada,
  p.fase_actual,
  p.estado,
  p.fecha_compromiso_subsanacion,
  CASE
    WHEN p.fecha_compromiso_subsanacion < CURRENT_DATE THEN 'vencido'
    WHEN p.fecha_compromiso_subsanacion <= CURRENT_DATE + 3 THEN 'urgente'
    ELSE 'en_curso'
  END AS urgencia,
  p.responsable,
  p.notas,
  p.created_at,
  EXTRACT(DAY FROM (now() - p.created_at)) AS dias_abierto
FROM op_d_pendientes p
JOIN op_ds od ON od.id = p.opd_padre_id
WHERE p.estado != 'cerrado';
```

### v_capacidad_semana_fase

```sql
CREATE MATERIALIZED VIEW v_capacidad_semana_fase AS
SELECT
  date_trunc('week', pp.start_date)::date AS semana_inicio,
  pp.fase,
  COUNT(DISTINCT pp.opd_id) AS op_ds_simultaneas,
  SUM(od.cantidad) AS unidades_totales,
  CASE
    WHEN COUNT(DISTINCT pp.opd_id) <= 10 THEN 'verde'
    WHEN COUNT(DISTINCT pp.opd_id) <= 20 THEN 'amarillo'
    ELSE 'rojo'
  END AS color_carga
FROM phase_plans pp
JOIN op_ds od ON od.id = pp.opd_id
WHERE od.activa = true
GROUP BY 1, 2
ORDER BY 1, 2;

-- Refrescar manual o por trigger al cambiar phase_plans
CREATE INDEX idx_capacidad_semana ON v_capacidad_semana_fase(semana_inicio, fase);
```

### v_foco_semanal — plan de la semana en ejecución

```sql
CREATE VIEW v_foco_semanal AS
SELECT
  od.id AS opd_id,
  od.ref,
  od.op_num,
  c.id AS cliente_id,
  ci.razon_social AS cliente,
  od.fase_actual,
  pp.fase AS fase_objetivo_semana,
  pp.start_date,
  pp.due_date,
  vs.semaforo,
  vs.slack,
  sc.score_efectivo,
  od.bloqueada,
  od.motivo_bloqueo
FROM op_ds od
JOIN phase_plans pp ON pp.opd_id = od.id
JOIN ops o ON o.op_num = od.op_num
JOIN clientes c ON c.id = o.cliente_id
JOIN clientes_impel ci ON ci.id_impel = c.cliente_impel_id
JOIN v_slack vs ON vs.opd_id = od.id
JOIN v_score sc ON sc.opd_id = od.id
WHERE od.activa = true
  AND pp.start_date <= date_trunc('week', CURRENT_DATE) + INTERVAL '6 days'
  AND pp.due_date >= date_trunc('week', CURRENT_DATE)
ORDER BY sc.score_efectivo DESC, vs.slack ASC;
```

### v_mi_fase_hoy — pantalla del líder

```sql
CREATE VIEW v_mi_fase_hoy AS
SELECT
  od.id AS opd_id,
  od.ref,
  od.op_num,
  ci.razon_social AS cliente,
  od.cantidad,
  od.fase_actual,
  od.bloqueada,
  od.motivo_bloqueo,
  vs.semaforo,
  vs.slack,
  sc.score_efectivo,
  pp.due_date AS fecha_fin_planeada,
  -- Pendientes activos sobre esta OP-D
  (SELECT COUNT(*) FROM op_d_pendientes p
   WHERE p.opd_padre_id = od.id AND p.estado != 'cerrado') AS pendientes_abiertos
FROM op_ds od
JOIN ops o ON o.op_num = od.op_num
JOIN clientes c ON c.id = o.cliente_id
JOIN clientes_impel ci ON ci.id_impel = c.cliente_impel_id
LEFT JOIN phase_plans pp ON pp.opd_id = od.id AND pp.fase = od.fase_actual
JOIN v_slack vs ON vs.opd_id = od.id
JOIN v_score sc ON sc.opd_id = od.id
WHERE od.activa = true;
-- El frontend filtra por fase_actual = (fase del líder logueado)
```

---

## Funciones SQL clave

### dias_habiles_entre

```sql
CREATE OR REPLACE FUNCTION dias_habiles_entre(d1 DATE, d2 DATE)
RETURNS INTEGER AS $$
DECLARE
  diff INTEGER := 0;
  cursor_date DATE := d1;
  sign INTEGER := CASE WHEN d2 >= d1 THEN 1 ELSE -1 END;
  target DATE := d2;
BEGIN
  IF d1 = d2 THEN RETURN 0; END IF;
  IF sign = -1 THEN
    cursor_date := d2;
    target := d1;
  END IF;

  WHILE cursor_date < target LOOP
    cursor_date := cursor_date + 1;
    IF EXTRACT(DOW FROM cursor_date) NOT IN (0, 6)
       AND NOT EXISTS (SELECT 1 FROM festivos_co WHERE fecha = cursor_date) THEN
      diff := diff + 1;
    END IF;
  END LOOP;

  RETURN diff * sign;
END;
$$ LANGUAGE plpgsql STABLE;
```

### restar_dias_habiles / sumar_dias_habiles

```sql
CREATE OR REPLACE FUNCTION restar_dias_habiles(d DATE, dias INTEGER)
RETURNS DATE AS $$
DECLARE
  result DATE := d;
  restantes INTEGER := dias;
BEGIN
  WHILE restantes > 0 LOOP
    result := result - 1;
    IF EXTRACT(DOW FROM result) NOT IN (0, 6)
       AND NOT EXISTS (SELECT 1 FROM festivos_co WHERE fecha = result) THEN
      restantes := restantes - 1;
    END IF;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;
```

### recalc_pull — recálculo del plan desde la fecha compromiso

```sql
CREATE OR REPLACE FUNCTION recalc_pull(p_opd_id UUID)
RETURNS VOID AS $$
DECLARE
  v_ancla DATE;
  v_cursor DATE;
  v_opd op_ds%ROWTYPE;
BEGIN
  SELECT * INTO v_opd FROM op_ds WHERE id = p_opd_id;
  SELECT fecha_compromiso INTO v_ancla FROM ops WHERE op_num = v_opd.op_num;

  IF v_opd.plan_congelado THEN RETURN; END IF;

  -- Iterar fases en reversa, partiendo de la fecha ancla
  v_cursor := v_ancla;
  UPDATE phase_plans SET due_date = v_cursor,
    start_date = restar_dias_habiles(v_cursor, dias)
  WHERE opd_id = p_opd_id AND fase = 'despacho';
  SELECT start_date INTO v_cursor FROM phase_plans WHERE opd_id = p_opd_id AND fase = 'despacho';

  UPDATE phase_plans SET due_date = v_cursor,
    start_date = restar_dias_habiles(v_cursor, dias)
  WHERE opd_id = p_opd_id AND fase = 'empaque';
  SELECT start_date INTO v_cursor FROM phase_plans WHERE opd_id = p_opd_id AND fase = 'empaque';

  -- ... repetir para satelites, tiqueteo, corte, trazo, compras, fase_0
END;
$$ LANGUAGE plpgsql;
```

### freeze_baseline — snapshot al cerrar F0

```sql
CREATE OR REPLACE FUNCTION freeze_baseline(p_opd_id UUID, p_actor TEXT)
RETURNS VOID AS $$
BEGIN
  -- Solo si no existe baseline previa
  IF NOT EXISTS (SELECT 1 FROM phase_plans_baseline WHERE opd_id = p_opd_id) THEN
    INSERT INTO phase_plans_baseline (opd_id, fase, dias, start_date, due_date, frozen_by)
    SELECT opd_id, fase, dias, start_date, due_date, p_actor
    FROM phase_plans WHERE opd_id = p_opd_id;

    INSERT INTO phase_events (opd_id, tipo, actor, payload)
    VALUES (p_opd_id, 'baseline_freeze', p_actor,
            jsonb_build_object('frozen_at', now()));
  END IF;
END;
$$ LANGUAGE plpgsql;
```

---

## Reglas de negocio críticas

| ID | Regla | Enforcement |
|---|---|---|
| **RN-01** | Una OP-D no avanza de Fase 0 a Compras sin los 6 checkboxes F0 en true | Trigger BEFORE UPDATE sobre `op_ds.fase_actual` |
| **RN-02** | `phase_plans_baseline` es inmutable una vez creada | Trigger BEFORE UPDATE/DELETE |
| **RN-03** | `phase_events` es append-only | RLS policy: solo INSERT |
| **RN-04** | `fecha_compromiso` solo cambia con evento `replan` registrado | Trigger AFTER UPDATE genera evento si cambia |
| **RN-05** | Mover OP-D entre fases NO modifica `phase_plans` | El UPDATE de `fase_actual` solo inserta evento `phase_advance` |
| **RN-06** | Edición de `dias_X` o de `recurso_corte`/`tipo_empaque`/`tipo_despacho` dispara `recalc_pull` | Trigger AFTER UPDATE |
| **RN-07** | Cierre de OP-D requiere todos sus `op_d_pendientes` en `cerrado` | Validación en frontend + trigger |
| **RN-08** | OP "parcial" requiere `flag_parcial = true` + `op_origen` poblado | CHECK constraint |
| **RN-09** | Causa de desvío `capacidad_*` activa sugerencia de Plan A/B/C en UI | Lógica de frontend |
| **RN-10** | El semáforo de la OP es el peor de sus OP-Ds | Vista `v_semaforo_op` |
| **RN-11** | Slack < 0 (rojo) requiere registro de causa de desvío | Validación junta lunes |
| **RN-12** | `phase_plans_baseline` se llena exactamente una vez por OP-D al evento `baseline_freeze` (cierre de F0) | Función `freeze_baseline` |

---

## Score de priorización — referencia

Modelo del **comité 28-may-2026**. Total 100 puntos.

| Bloque | Pts | Categorías |
|---|---|---|
| **Urgencia / Slack** | 35 | ≤0d=35 · 1-7=25 · 8-15=15 · 16-30=5 · >30=0 |
| **Obligación Contractual** | 20 | con penalización=20 · sin penalización=12 · recurrente s/contrato=6 · único=0 |
| **Valor Estratégico** | 20 | tier 1=20 · primera vez=15 · tier 2=10 · estándar=4 |
| **Volumen / Complejidad** | 10 | Sub-A complejidad (5) + Sub-B velocidad (5) |
| **Impacto en Caja** | 15 | anticipo o ≤30d=15 · 30-60d=8 · >60d=3 |

**F0 NO es criterio sino compuerta.** Sin F0 completa, la OP no entra a la fila.

**Override:** Miguel puede sobreescribir con `score_override` + motivo. Queda registrado en `phase_event` tipo `score_update`.

---

## Causas de desvío y planes de contingencia

| Causa | Quién registra | Plan sugerido (A/B/C) |
|---|---|---|
| `mp_tardia` | Líder compras / Camila | Proveedor alternativo / Recompra urgente / Aviso al cliente |
| `calidad_mp` | Compras / corte | Recompra urgente + nota crédito |
| `bloqueo_f0` | Junta lunes | Devolver a F0, identificar checkbox |
| `capacidad_corte` | Líder corte | A=turno adicional Morgan / B=satélites o externo / C=reprogramar OP |
| `capacidad_trazo` | Líder trazo | A=más personas mesa / B=digitalizar o tercero / C=patrones ya trazados |
| `capacidad_satelite` | Santiago/Cristian | A=redistribuir / B=nuevo satélite / C=renegociar fecha |
| `capacidad_tiqueteo_empaque` | Líder tiqueteo/empaque | A=turno adicional / B=tercero / C=por definir |
| `reproceso_interno` | Líder fase | Crear `op_d_pendiente` + asignar responsable |
| `reproceso_satelite` | Santiago al recibir | Crear `op_d_pendiente` + coordinar con satélite |
| `cambio_cliente` | Miguel/Camila | Renegociación formal + replan |
| `documentacion_despacho` | Líder despacho | Coordinar con ejecutivo cuenta |
| `otro` | Cualquiera | Texto libre + evaluación junta |

**Regla de oro PPT:** comunicación proactiva al cliente se activa al detectar cuello (paso 2 Gestionar), no al incumplir (paso 4).

---

## Heurísticas iniciales — recursos por fase

**Propuesta inicial. Ajustar con junta antes del go-live.** Vive en tabla `lead_time_recurso` (configurable, no hardcoded).

### Corte

| Recurso | Días default | Condiciones de uso |
|---|---|---|
| `morgan` | 13 | Cantidad ≥50 Y urgencia ≥22 días Y tela compatible |
| `manual` | 4 | Cantidad <50, tela delicada, muestras, urgencias pequeñas |
| `externo` | 4 | Urgencia <22 días, sin cola en taller, ahorra 9d vs Morgan |

### Empaque

| Recurso | Días default | Condiciones de uso |
|---|---|---|
| `estandar` | 4 | Caso base — empaque común |
| `personalizado` | 10 | Cliente con `stock_administrado` o kit por colaborador |
| `exportacion` | 10 | Canal Panamá o internacional |

### Despacho

| Recurso | Días default | Condiciones de uso |
|---|---|---|
| `estandar` | 1 | Bogotá |
| `cross_docking` | 2 | N sedes Colombia |
| `personalizado` | 3 | Kit por colaborador |
| `exportacion` | 7 | Panamá / internacional |

### Otras fases (sin recursos múltiples)

| Fase | Días default | Default complejo |
|---|---|---|
| `fase_0` | 5 | 10 si primera vez / cliente exigente |
| `compras` | 5 | 15 si MP importada China |
| `trazo` | 3 | 7 si >20 referencias o sin molde base |
| `tiqueteo` | 2 | 3 si >3,000 uds con muchas referencias |
| `satelites` | 15 | 22 si sastrería especializada (Avianca) |

---

## Pantallas de la app

### Audiencias y vistas correspondientes

| Pantalla | Audiencia | Tablas/vistas que consume |
|---|---|---|
| **Kanban** | Todos | `op_ds`, `v_slack`, `v_pendientes_abiertos` (badges) |
| **Gantt + baseline** | Junta lunes | `v_plan_vs_real` |
| **Cola priorizada** | Junta lunes | `v_score` ordenada DESC |
| **Plan de la semana** | Junta + directivos | `v_foco_semanal` |
| **Mi fase hoy** | Líder de fase | `v_mi_fase_hoy` filtrada por fase del usuario |
| **Pendientes abiertos** | Líderes + comité | `v_pendientes_abiertos` |
| **Capacidad** | Junta + directivos | `v_capacidad_semana_fase` |
| **Detalle OP-D** | Todos | `op_ds` + `phase_plans` + `phase_plans_baseline` + `phase_events` + `op_d_pendientes` |
| **Junta lunes (agenda)** | Junta | Mix de cola priorizada + capacidad + foco semanal |

### Acciones operativas que disparan eventos

| Acción de usuario | Evento que se registra | Cambios en datos |
|---|---|---|
| Marcar checkbox F0 | `f0_checkbox_update` | UPDATE `op_ds.f0_*` |
| Mover OP-D a siguiente fase (completo) | `phase_advance` | UPDATE `op_ds.fase_actual` |
| Mover OP-D parcial (genera pendiente) | `phase_advance_parcial` + `pendiente_created` | UPDATE fase + INSERT pendiente |
| Marcar bloqueada | `block` | UPDATE `op_ds.bloqueada`, `motivo_bloqueo` |
| Desbloquear | `unblock` | UPDATE `op_ds.bloqueada = false` |
| Editar días o recurso | `replan` + `resource_change` | UPDATE op_ds + recalc_pull |
| Cerrar F0 (pasa a Compras) | `baseline_freeze` + `phase_advance` | INSERT en baseline + UPDATE fase |
| Daily: avance/sin novedad/bloqueo | `daily_check` | (según acción) |
| Santiago setea promesa satélite | `satellite_promise_set` | UPDATE `fecha_promesa_satelites` |
| Santiago marca recibido | `satellite_received` | UPDATE `fecha_recepcion_satelites` |
| Override de score | `score_update` | UPDATE `score_override` |
| Cerrar pendiente subsanado | `pendiente_status_change` | UPDATE estado + `closed_at` |

---

## Migración desde ClickUp

### Estrategia: cargue snapshot + sincronización progresiva

1. **Día 1 (ETL inicial)**
   - Extraer 537 OP-Ds activas desde ClickUp con sus 52 custom fields + estado de phase tasks
   - Mapear a schema iter-1 (script `scripts/20_load_clickup_to_supabase.py`)
   - Generar `phase_plans` desde los Días X y `fecha_compromiso`
   - Para OP-Ds ya pasadas Fase 0: generar `phase_plans_baseline = phase_plans` (asumiendo que el plan actual ya es el congelado)
   - Generar `clientes_impel` + `clientes` con defaults (tier=estandar, condicion_pago=mas_de_60d). El comité ajusta después.

2. **Paridad**
   - Comparar 5 OP-Ds de referencia: semáforo, slack, score deben coincidir
   - Si difiere, identificar causa raíz antes de avanzar

3. **Operación paralela (2-4 semanas)**
   - ETL diario sigue cargando IMPEL a ambos (ClickUp + Supabase)
   - Sistema nuevo es read-only para el equipo
   - Junta del lunes comienza a usar `v_foco_semanal` y `v_capacidad_semana_fase` desde Supabase

4. **Cut-over por líder de fase**
   - Cristian (satélites) primero: ya tiene la fricción más grande con Excel
   - Daniela (compras), Brayan (corte), Katherin (trazo), Milena (tiqueteo), Carlos (empaque/despacho) progresivamente
   - Cada uno empieza usando "Mi fase hoy" para reportar avance/bloqueo
   - Cuando el daily templated Excel deja de ser necesario, el sistema nuevo es la fuente operativa

5. **Apagado controlado de ClickUp**
   - Después de 2-4 semanas estable, decisión de apagar o dejar como espejo unidireccional
   - `state/*.json` del repo anterior queda como backup histórico

---

## Mapa de extensión a iter-2+

Las entidades MES detalladas se acoplan al schema iter-1 sin migración destructiva:

| Iter-2+ entidad | Se vincula a iter-1 vía | Habilita |
|---|---|---|
| `requerimientos_compra` | `opd_id` FK | Reemplazar Excel de compras, trazabilidad item × OPD |
| `bom_efectivo_linea` | `opd_id` FK + versionado | Homologaciones append-only |
| `oc_seguimiento` + `oc_seguimiento_linea` | FK desde `requerimientos_compra` | Estado de OC por línea, lead time real proveedor |
| `orden_espera` + `orden_espera_linea` | FK desde `oc_seguimiento` | Cola accionable bodeguero |
| `recepcion` + `recepcion_linea` + `rollo_tela` | FK desde `orden_espera_linea` | Atributos físicos por rollo, trazabilidad lote→prenda |
| `orden_trazo` + `corte` + `paquete` | `opd_id` FK + FK a rollo | Secuencia de capa, consumo real de tela |
| `os` + `os_evento` | `opd_id` FK | OS individuales por satélite, esquemas tercerización |
| `reproceso_satelite` | FK desde `os` | Reprocesos cobrables a satélite (distinto de `op_d_pendientes`) |
| `pt_recepcion` + `stock_pt` | FK desde `os` | Inventario real de PT, control stock administrado |
| `solicitud_cliente` + `remision_despacho` | FK a `op_ds` y `stock_pt` | Envío de reacción, modalidades de despacho |
| `factura_cliente` + `oc_cliente` | FK a `remision_despacho` | Cierre del ciclo con Siigo |

**Prerequisito común para iter-2+:** modelo de datos de compañía codificado (SKUs, BOMs, inventario, proveedores). Sin eso, iter-1 es el techo útil.

---

## Pendientes de configuración antes del go-live

1. **Definir tiers de cliente** (junta posterior al PPT del 28-may): Riopaila, Avianca, Bodytech, Nutresa, EMI, Maracaneiros, Punto de Pago — clasificar como tier 1 / tier 2 / estándar.
2. **Definir condiciones de pago** por cliente: anticipado / hasta_30d / 30-60d / mas_de_60d.
3. **Ajustar heurísticas de `lead_time_recurso`** con junta antes de cargar las primeras OP-Ds.
4. **Cargar `festivos_co`** con festivos colombianos 2026.
5. **Decisión de hosting Supabase**: cloud free tier vs self-host VPS (D-01 en `docs/ARQUITECTURA.md`).
6. **Auth inicial**: magic link Microsoft o email/password.
7. **Configurar tier 1 vs tier 2** con la junta (no estaba definido al 28-may).

---

## Próximos pasos (post-síntesis)

1. **Validar este documento** con Miguel, Santiago, Camila.
2. **Generar migraciones SQL** numeradas `supabase/migrations/0001_*` a `00NN_*` con todo el DDL anterior.
3. **Generar script ETL** `scripts/20_load_clickup_to_supabase.py`.
4. **Scaffolding Next.js** con primeras pantallas: Kanban + Gantt + Mi fase hoy.
5. **Paridad** contra ClickUp (5 OP-Ds de referencia).
6. **Junta inaugural** con sistema nuevo en sombra.

---

---

## Cambios post-v1.0 (aplicados en migraciones 0020–0027)

### Tabla `clientes` — campos nuevos (migración 0026)
```sql
ALTER TABLE clientes
  ADD COLUMN homologado_a UUID REFERENCES clientes(id),  -- alias no destructivo
  ADD COLUMN es_manual    BOOLEAN NOT NULL DEFAULT false; -- cliente creado en /clientes
```
- `homologado_a`: máx 1 nivel de profundidad. Constraint `chk_no_self_homologacion` evita ciclos.
- `es_manual`: cuando es `true`, el `cliente_impel_id` es sintético (`MAN-XXXXXXXX`).

### Vista `v_cliente_efectivo` (migración 0026)
Resuelve los 4 atributos de score a través de la homologación:
```sql
CREATE VIEW v_cliente_efectivo AS
SELECT c.id AS cliente_id, COALESCE(c.homologado_a, c.id) AS canonical_id,
       canon.tier, canon.tipo_relacion, canon.condicion_pago, canon.complejidad_tipica
FROM clientes c
JOIN clientes canon ON canon.id = COALESCE(c.homologado_a, c.id);
```
`v_score` ahora hace `JOIN v_cliente_efectivo ce ON ce.cliente_id = o.cliente_id` en lugar de `JOIN clientes c`.

### Tabla `usuarios_sistema` (migración 0016 + 0027)
```sql
CREATE TABLE usuarios_sistema (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  email         TEXT UNIQUE NOT NULL,
  rol           rol_sistema_enum NOT NULL DEFAULT 'directivo',
  fase_asignada fase_enum,  -- solo para lider_fase
  nombre        TEXT,
  activo        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
```
Roles disponibles (migración 0027 añadió `visualizacion`):
```sql
CREATE TYPE rol_sistema_enum AS ENUM ('admin', 'directivo', 'lider_fase', 'visualizacion');
```

### Nuevos tipos de `phase_event_tipo_enum` (reales, post-implementación)
Además de los planificados, se agregaron:
- `phase_revert` — reversión de fase (admin)
- `pendiente_avance` — fase_actual del pendiente avanzó
- `pendiente_cerrado` — pendiente marcado como cerrado

### Nuevas RPCs JSON (migraciones 0019–0027)
| Función | Retorna | Propósito |
|---|---|---|
| `get_phase_plans_json()` | JSON | Phase plans activos (bypasa max_rows=1000) |
| `get_phase_plans_baseline_json()` | JSON | Baselines activos |
| `get_produccion_data()` | JSON | Payload unificado (referencia) |
| `get_opds_data()` | JSON | Metadata OP-Ds (<2MB para Next.js cache) |
| `get_festivos_data()` | JSON | Festivos (SECURITY DEFINER) |
| `get_plan_semana(date)` | JSON | Foco semanal paramétrico |
| `get_clientes_data()` | JSON | Clientes con n_ops_activas, homologado_a_nombre |
| `get_usuarios_sistema_admin()` | JSON | Lista usuarios para /admin/usuarios |
| `check_user_access(email)` | TABLE | Verifica autorización (middleware) |

---

*Molt SAS · Modelo de datos iter-1 · v1.1 · 2026-06-01*
