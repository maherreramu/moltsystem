-- 0005_plan.sql — Plan pull vigente y baseline inmutable
-- phase_plans: mutable — cambia con recalc_pull o replan explícito
-- phase_plans_baseline: inmutable — snapshot al cerrar Fase 0 (freeze_baseline)

CREATE TABLE phase_plans (
  opd_id     UUID      NOT NULL REFERENCES op_ds ON DELETE CASCADE,
  fase       fase_enum NOT NULL,
  dias       SMALLINT  NOT NULL,
  start_date DATE      NOT NULL,
  due_date   DATE      NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (opd_id, fase),
  CONSTRAINT phase_plans_dates_valid CHECK (due_date >= start_date)
);

CREATE TRIGGER phase_plans_updated_at
  BEFORE UPDATE ON phase_plans
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Baseline: snapshot inmutable al cierre de Fase 0.
-- Regla RN-02: ningún UPDATE ni DELETE permitido — enforced en 0009_triggers.sql
CREATE TABLE phase_plans_baseline (
  opd_id     UUID      NOT NULL REFERENCES op_ds ON DELETE CASCADE,
  fase       fase_enum NOT NULL,
  dias       SMALLINT  NOT NULL,
  start_date DATE      NOT NULL,
  due_date   DATE      NOT NULL,
  frozen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  frozen_by  TEXT,                           -- email del usuario que cerró F0
  PRIMARY KEY (opd_id, fase),
  CONSTRAINT baseline_dates_valid CHECK (due_date >= start_date)
);
