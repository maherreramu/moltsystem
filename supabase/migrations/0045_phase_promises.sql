-- 0045_phase_promises.sql
-- Promesas de fecha por fase, editables por líderes de su fase asignada.
-- Se reutiliza el evento satellite_promise_set con campo `fase` para distinguir.

CREATE TABLE IF NOT EXISTS phase_promises (
  opd_id        UUID        NOT NULL REFERENCES op_ds(id) ON DELETE CASCADE,
  fase          fase_enum   NOT NULL,
  fecha_promesa DATE        NOT NULL,
  set_by        TEXT        NOT NULL,
  set_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (opd_id, fase)
);

ALTER TABLE phase_promises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read phase_promises"
  ON phase_promises FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert phase_promises"
  ON phase_promises FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update phase_promises"
  ON phase_promises FOR UPDATE TO authenticated USING (true);

GRANT ALL ON phase_promises TO authenticated;
