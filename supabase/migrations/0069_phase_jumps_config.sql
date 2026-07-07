-- Tabla de saltos de fase permitidos para lider_fase (configurable desde /admin/config)
-- Espejo de semaforo_config (0049). Admin/directivo no la consultan: pueden saltar libremente.
CREATE TABLE phase_jumps_config (
  from_fase  fase_enum NOT NULL,
  to_fase    fase_enum NOT NULL,
  allowed    BOOLEAN   NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (from_fase, to_fase)
);

ALTER TABLE phase_jumps_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read phase_jumps_config"
  ON phase_jumps_config FOR SELECT TO authenticated USING (true);

GRANT SELECT ON phase_jumps_config TO authenticated;
GRANT ALL    ON phase_jumps_config TO service_role;

-- Semilla: saltos operativos documentados para lider_fase
INSERT INTO phase_jumps_config (from_fase, to_fase, allowed) VALUES
  ('trazo',    'satelites', true),
  ('corte',    'satelites', true),
  ('tiqueteo', 'satelites', true);
