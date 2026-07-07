-- 0006_events.sql — Event store append-only
-- Regla RN-03: phase_events nunca se modifica ni borra.
-- Enforcement via trigger (más fuerte que RLS — service_role no lo bypassa).

CREATE TABLE phase_events (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opd_id UUID NOT NULL REFERENCES op_ds,
  fase   fase_enum,
  tipo   phase_event_tipo_enum NOT NULL,
  actor  TEXT NOT NULL,               -- email del usuario o 'system'/'etl'
  payload JSONB,
  ts     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_phase_events_opd  ON phase_events(opd_id, ts DESC);
CREATE INDEX idx_phase_events_tipo ON phase_events(tipo,   ts DESC);

-- Append-only enforcement: bloquea UPDATE y DELETE sin excepción
CREATE OR REPLACE FUNCTION prevent_phase_events_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'phase_events es append-only: UPDATE y DELETE no están permitidos';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_phase_events_no_update
  BEFORE UPDATE ON phase_events
  FOR EACH ROW EXECUTE FUNCTION prevent_phase_events_mutation();

CREATE TRIGGER tg_phase_events_no_delete
  BEFORE DELETE ON phase_events
  FOR EACH ROW EXECUTE FUNCTION prevent_phase_events_mutation();
