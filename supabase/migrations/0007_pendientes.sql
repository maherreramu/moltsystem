-- 0007_pendientes.sql — Pendientes y reprocesos por OP-D
-- Creados por avances parciales o reprocesos detectados en cualquier fase.
-- La OP-D padre sigue con (cantidad - sum(cantidad_afectada de pendientes abiertos)).
-- Cierre de OP-D requiere todos sus pendientes en estado 'cerrado'.

CREATE TABLE op_d_pendientes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opd_padre_id UUID NOT NULL REFERENCES op_ds,

  fase_origen       fase_enum          NOT NULL,  -- dónde se generó el problema
  motivo            causa_desvio_enum  NOT NULL,  -- qué tipo de desvío
  cantidad_afectada INTEGER NOT NULL CHECK (cantidad_afectada > 0),

  fase_actual       fase_enum          NOT NULL,  -- dónde está el pendiente HOY
  estado            pendiente_estado_enum NOT NULL DEFAULT 'pendiente',
  fecha_compromiso_subsanacion DATE,

  responsable TEXT,                               -- líder de fase responsable
  notas       TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  closed_at  TIMESTAMPTZ,
  closed_by  TEXT
);

CREATE INDEX idx_pendientes_opd    ON op_d_pendientes(opd_padre_id);
CREATE INDEX idx_pendientes_estado ON op_d_pendientes(estado) WHERE estado != 'cerrado';
CREATE INDEX idx_pendientes_fase   ON op_d_pendientes(fase_actual) WHERE estado != 'cerrado';

CREATE TRIGGER pendientes_updated_at
  BEFORE UPDATE ON op_d_pendientes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
