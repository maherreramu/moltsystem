# 06 — Plan iter-1.5 · Sistema de Producción Molt

**Versión:** 0.3
**Fecha:** 2026-06-01
**Estado:** Backlog confirmado — implementación post go-live iter-1
**Prerequisito:** Sprint 7 completado + sistema estable en producción ≥ 2 semanas

---

## Objetivo del iter-1.5

Iter-1.5 cierra las brechas que iter-1 dejó explícitamente fuera por complejidad o porque requieren datos reales de operación para definirse bien. **No es iter-2** (eso requiere el modelo de datos de compañía). Es la capa de maduración del gobierno operativo.

---

## Estado de requerimientos

| RF | Nombre | Estado |
|---|---|---|
| RF-01 | Vendido sin OP | ⏳ Pendiente |
| RF-02 | RLS granular por rol y fase | 🔄 Parcialmente en iter-1 |
| RF-03 | Realtime Kanban | ✅ **COMPLETADO en iter-1** |
| RF-04 | Acciones rápidas desde Kanban | ⏳ Pendiente |
| RF-05 | Caracterización de clientes | ✅ **COMPLETADO en iter-1** |
| RF-06 | Sync incremental IMPEL diario | 🔄 Script existe, falta activar cron |

---

## Requerimientos pendientes

### RF-01 · Vendido sin OP — proyección de demanda futura ⏳

**Origen:** requerimiento de Mateo + comité (2026-05-29)
**Prioridad:** Alta — define utilidad estratégica de la vista de capacidad

Negocios ya cerrados comercialmente que aún no tienen OP formal en IMPEL. Son carga real sobre la capacidad futura. Sin esta capa, `/capacidad` solo es descriptiva del pasado.

**Información a capturar:** cliente, n° estimado de referencias, uds totales, fecha compromiso estimada, comercial, % probabilidad/confianza (100 = cerrado), notas.

**Modelo de datos propuesto:**
```sql
CREATE TABLE proyecciones_comerciales (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id           UUID REFERENCES clientes,
  comercial            TEXT,
  nombre               TEXT NOT NULL,
  n_referencias_est    SMALLINT,
  cantidad_uds_est     INTEGER NOT NULL,
  fecha_compromiso_est DATE NOT NULL,
  probabilidad         SMALLINT DEFAULT 100 CHECK (probabilidad BETWEEN 0 AND 100),
  estado               TEXT NOT NULL DEFAULT 'activo'
                       CHECK (estado IN ('activo','convertido','cancelado')),
  op_num               TEXT REFERENCES ops,
  notas                TEXT,
  created_by           TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);
```

**Pantallas a crear/modificar:**
- `/capacidad` — toggle "Incluir proyecciones" con carga estimada en estilo diferenciado
- `/proyecciones` — nueva página CRUD de proyecciones comerciales
- `/junta` — widget "Proyecciones activas"

**Esfuerzo estimado:** 2 semanas

---

### RF-02 · RLS granular por rol y fase 🔄 Parcialmente en iter-1

**Estado en iter-1:**
- Rol `visualizacion` bloquea todas las escrituras vía `getSbChecked()` en Server Actions
- `assertPuedeEditar()` restringe edición de clientes a `admin` y `directivo`
- `assertIsAdmin()` restringe gestión de usuarios a `admin`

**Lo que falta para iter-1.5:**
- Políticas RLS en Supabase que filtren lecturas automáticamente por `fase_asignada` para `lider_fase`
- `v_mi_fase_hoy` retorna solo OP-Ds de la fase del líder sin filtro app-side
- Las vistas `v_slack`, `v_score` filtrables por fase via JWT claim

**Tabla objetivo:**

| Rol | Lectura | Escritura |
|---|---|---|
| `admin` | Todo | Todo |
| `directivo` | Todo | Score override, revertir fases, caracterizar clientes |
| `lider_fase` | Su fase + resumen global | Solo OP-Ds en su `fase_asignada` |
| `visualizacion` | Todo | Ninguna |

**Esfuerzo estimado:** 1 semana

---

### RF-03 · Realtime Kanban ✅ COMPLETADO en iter-1 (2026-06-01)

Supabase Realtime + `router.refresh()` debounced implementado en `produccion-client.tsx` y `mi-fase-client.tsx`. Ver `docs/ARQUITECTURA.md §8` para detalles técnicos.

---

### RF-04 · Acciones rápidas desde Kanban ⏳

Hoy el Kanban tiene drag-and-drop para avanzar fases. Falta:
- Click derecho (o long press) en card → menú contextual: bloquear / sin novedad / ver detalle
- Badge de pendientes clickeable → abre tab Pendientes del drawer directamente

**Nota:** implementar junto con RF-02 ya que las acciones disponibles dependen del rol.

**Esfuerzo estimado:** 2 días

---

### RF-05 · Caracterización de clientes ✅ COMPLETADO en iter-1 (2026-06-01)

Implementado en `/clientes` con:
- Selects inline para tier, tipo_relacion, condicion_pago, complejidad_tipica
- Score base visible (máx 60pts) con barra visual
- Homologación no destructiva (alias → canónico, 1 nivel)
- Creación de clientes manuales (con `clientes_impel` sintético `MAN-XXXXXXXX`)
- Filtro "Solo con OPs activas" por defecto (35 de 537)
- Reasignación de cliente por OP desde `/ops`
- ETL con `ignore_duplicates=True` — no pisa caracterización manual

**Pendiente de acción del equipo:** Mateo y comité deben clasificar los ~35 clientes con OPs activas usando `/clientes`.

---

### RF-06 · Sync incremental IMPEL → Supabase diario 🔄

**Estado:** `scripts/21_sync_incremental.py` existe. Falta:
- Activar cron en VPS (parte de Sprint 7)
- Configurar llamada a `POST /api/revalidate` al terminar (invalida cache)
- Definir comportamiento ante nuevas OP-Ds vs actualizaciones de `fecha_compromiso`

**Prioridad:** Alta — prerequisito operativo para que el sistema se mantenga en sincronía con IMPEL sin intervención manual.

**Esfuerzo estimado:** 3 días (incluyendo activación cron + pruebas de idempotencia)

---

## Cronograma estimado revisado

| Requerimiento | Esfuerzo | Orden | Estado |
|---|---|---|---|
| RF-06 Sync incremental (activar cron) | 3 días | 1 — prerequisito operativo | 🔄 Parcial |
| RF-02 RLS granular | 1 semana | 2 — antes de líderes externos | ⏳ |
| RF-01 Vendido sin OP | 2 semanas | 3 — mayor valor analítico | ⏳ |
| RF-04 Acciones Kanban | 2 días | 4 — junto con RF-02 | ⏳ |
| Sentry (Sprint 0.9) | 1 día | 5 — observabilidad | ⏳ |

**Total estimado:** 4-5 semanas post Sprint 7

---

## Lo que iter-1.5 NO incluye

- Trazabilidad por rollo, paquete o OS individual (iter-2)
- BOM, OC formales, inventario codificado (iter-2)
- Costeo por proyecto (iter-2)
- Canal Panamá con lógica diferenciada (iter-2)

---

## Nota: Redis como ítem condicional

Redis no es parte del roadmap activo. Se agrega **solo si** se presenta una de estas condiciones:
- 2+ instancias de Next.js tras balanceador (el `unstable_cache` filesystem no se comparte entre instancias)
- ETL corre 3+ veces/día y necesita invalidación granular por entidad vía `pg_notify`

Arquitectura si se activa: `pg_notify` desde trigger Postgres → listener Node.js → invalidación Redis → Next.js lee de Redis en cache miss.

---

*Molt SAS · Plan iter-1.5 · v0.3 · 2026-06-01*
