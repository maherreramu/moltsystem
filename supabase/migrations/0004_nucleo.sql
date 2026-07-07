-- 0004_nucleo.sql — Tablas operativas core: ops y op_ds
-- ops: cabecera de la orden (cliente + fecha compromiso)
-- op_ds: unidad de fabricación — viaja por las 8 fases del Kanban

-- ─── Órdenes de producción (cabecera) ────────────────────────────────────────
CREATE TABLE ops (
  op_num                    TEXT PRIMARY KEY,     -- "OP-6729" desde IMPEL
  cliente_id                UUID NOT NULL REFERENCES clientes,
  nombre                    TEXT,
  fecha_creacion_impel      DATE,
  fecha_compromiso          DATE NOT NULL,         -- ancla pull — inamovible salvo replan
  fecha_compromiso_original DATE,                  -- snapshot al cargar
  total_uds                 INTEGER,
  comercial                 TEXT,                  -- Miguel / Santiago / Camila / Mateo
  flag_parcial              BOOLEAN NOT NULL DEFAULT false,
  op_origen                 TEXT,                  -- solo si flag_parcial = true
  activa                    BOOLEAN NOT NULL DEFAULT true,
  fecha_paso_produccion     TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT ops_parcial_check CHECK (
    (flag_parcial = false) OR (flag_parcial = true AND op_origen IS NOT NULL)
  )
);

CREATE INDEX idx_ops_cliente ON ops(cliente_id);
CREATE INDEX idx_ops_activa  ON ops(activa) WHERE activa = true;

CREATE TRIGGER ops_updated_at
  BEFORE UPDATE ON ops
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─── Detalle de OP: una referencia/prenda por OP-D ───────────────────────────
CREATE TABLE op_ds (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  impel_id   TEXT UNIQUE NOT NULL,          -- ID en IMPEL (clave del ETL)
  op_num     TEXT NOT NULL REFERENCES ops,
  ref        TEXT NOT NULL,                 -- "6729-1"
  descripcion TEXT,
  cantidad    INTEGER NOT NULL CHECK (cantidad > 0),

  -- Estado actual en el Kanban
  fase_actual fase_enum NOT NULL DEFAULT 'fase_0',

  -- Checkboxes de Fase 0 (compuerta de entrada a producción)
  f0_ficha_tec    BOOLEAN NOT NULL DEFAULT false,
  f0_patronaje    BOOLEAN NOT NULL DEFAULT false,
  f0_muestra      BOOLEAN NOT NULL DEFAULT false,
  f0_aprobacion   BOOLEAN NOT NULL DEFAULT false,
  f0_tela_avios   BOOLEAN NOT NULL DEFAULT false,
  f0_op_creada    BOOLEAN NOT NULL DEFAULT false,

  -- Días planeados por fase (editables — defaults de lead_time_recurso)
  dias_fase_0     SMALLINT NOT NULL DEFAULT 5,
  dias_compras    SMALLINT NOT NULL DEFAULT 5,
  dias_trazo      SMALLINT NOT NULL DEFAULT 3,
  dias_corte      SMALLINT NOT NULL DEFAULT 4,
  dias_tiqueteo   SMALLINT NOT NULL DEFAULT 2,
  dias_satelites  SMALLINT NOT NULL DEFAULT 15,
  dias_empaque    SMALLINT NOT NULL DEFAULT 4,
  dias_despacho   SMALLINT NOT NULL DEFAULT 1,

  -- Recursos por fase (afectan tiempos y dispatch)
  recurso_corte   recurso_corte_enum  NOT NULL DEFAULT 'morgan',
  tipo_empaque    tipo_empaque_enum   NOT NULL DEFAULT 'estandar',
  tipo_despacho   tipo_despacho_enum  NOT NULL DEFAULT 'estandar',

  -- Control operativo
  primera_vez     BOOLEAN NOT NULL DEFAULT false,  -- flag manual — junta inaugural
  plan_congelado  BOOLEAN NOT NULL DEFAULT false,  -- bloquea recalc_pull automático
  bloqueada       BOOLEAN NOT NULL DEFAULT false,
  motivo_bloqueo  motivo_bloqueo_enum,
  causa_desvio    causa_desvio_enum,

  -- Override de score (solo Miguel)
  score_override  INTEGER CHECK (score_override BETWEEN 0 AND 100),
  score_motivo    TEXT,

  -- Satélites (caja negra: solo dos fechas visibles al sistema)
  fecha_promesa_satelites   DATE,
  fecha_recepcion_satelites DATE,

  -- Metadata de IMPEL
  detalle    TEXT,
  colores    TEXT,
  link_impel TEXT,
  activa     BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_op_ds_op_num   ON op_ds(op_num);
CREATE INDEX idx_op_ds_fase     ON op_ds(fase_actual) WHERE activa = true;
CREATE INDEX idx_op_ds_bloqueada ON op_ds(bloqueada)  WHERE bloqueada = true;
CREATE INDEX idx_op_ds_activa   ON op_ds(activa)      WHERE activa = true;

CREATE TRIGGER op_ds_updated_at
  BEFORE UPDATE ON op_ds
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
