-- 0052_prioridad_fase.sql
-- Prioridad manual por fase para el Gantt por fase
-- Independiente de op_ds.prioridad_manual (global)

CREATE TABLE op_d_prioridad_fase (
  opd_id    UUID      NOT NULL REFERENCES op_ds(id) ON DELETE CASCADE,
  fase      fase_enum NOT NULL,
  prioridad INTEGER   NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (opd_id, fase)
);

ALTER TABLE op_d_prioridad_fase ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read op_d_prioridad_fase"
  ON op_d_prioridad_fase FOR SELECT TO authenticated USING (true);

GRANT SELECT ON op_d_prioridad_fase TO authenticated;
GRANT ALL ON op_d_prioridad_fase TO service_role;
