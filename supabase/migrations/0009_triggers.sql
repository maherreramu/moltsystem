-- 0009_triggers.sql — Triggers de negocio críticos
-- RN-01: gate F0 — bloquea avance a Compras sin los 6 checkboxes
-- RN-02: baseline inmutable — bloquea UPDATE/DELETE en phase_plans_baseline
-- RN-06: recalc_pull automático al cambiar dias_X o fecha_compromiso

-- ─── RN-01: Compuerta de Fase 0 ───────────────────────────────────────────────
-- Una OP-D no puede avanzar de fase_0 a compras sin los 6 checkboxes en true.
CREATE OR REPLACE FUNCTION check_f0_gate()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.fase_actual = 'fase_0' AND NEW.fase_actual = 'compras' THEN
    IF NOT (
      NEW.f0_ficha_tec AND NEW.f0_patronaje AND NEW.f0_muestra AND
      NEW.f0_aprobacion AND NEW.f0_tela_avios AND NEW.f0_op_creada
    ) THEN
      RAISE EXCEPTION
        'OP-D % no puede avanzar a Compras: los 6 checkboxes de Fase 0 deben estar completos. '
        'Pendientes: ficha_tec=%, patronaje=%, muestra=%, aprobacion=%, tela_avios=%, op_creada=%',
        NEW.ref,
        NEW.f0_ficha_tec, NEW.f0_patronaje, NEW.f0_muestra,
        NEW.f0_aprobacion, NEW.f0_tela_avios, NEW.f0_op_creada;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_op_ds_f0_gate
  BEFORE UPDATE ON op_ds
  FOR EACH ROW EXECUTE FUNCTION check_f0_gate();

-- ─── Auto freeze_baseline al cerrar F0 (safety net) ──────────────────────────
-- Aunque la Server Action llama freeze_baseline explícitamente,
-- este trigger garantiza que NUNCA se omita aunque el código lo olvide.
CREATE OR REPLACE FUNCTION auto_freeze_baseline()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.fase_actual = 'fase_0' AND NEW.fase_actual = 'compras' THEN
    PERFORM freeze_baseline(NEW.id, current_user);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_op_ds_auto_freeze
  AFTER UPDATE ON op_ds
  FOR EACH ROW EXECUTE FUNCTION auto_freeze_baseline();

-- ─── RN-02: Baseline inmutable ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION prevent_baseline_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'phase_plans_baseline es inmutable: UPDATE y DELETE no están permitidos';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_baseline_no_update
  BEFORE UPDATE ON phase_plans_baseline
  FOR EACH ROW EXECUTE FUNCTION prevent_baseline_mutation();

CREATE TRIGGER tg_baseline_no_delete
  BEFORE DELETE ON phase_plans_baseline
  FOR EACH ROW EXECUTE FUNCTION prevent_baseline_mutation();

-- ─── RN-06: recalc_pull automático al cambiar dias_X ─────────────────────────
CREATE OR REPLACE FUNCTION trigger_recalc_on_dias_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.dias_fase_0    IS DISTINCT FROM OLD.dias_fase_0   OR
      NEW.dias_compras   IS DISTINCT FROM OLD.dias_compras  OR
      NEW.dias_trazo     IS DISTINCT FROM OLD.dias_trazo    OR
      NEW.dias_corte     IS DISTINCT FROM OLD.dias_corte    OR
      NEW.dias_tiqueteo  IS DISTINCT FROM OLD.dias_tiqueteo OR
      NEW.dias_satelites IS DISTINCT FROM OLD.dias_satelites OR
      NEW.dias_empaque   IS DISTINCT FROM OLD.dias_empaque  OR
      NEW.dias_despacho  IS DISTINCT FROM OLD.dias_despacho) THEN
    PERFORM recalc_pull(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_op_ds_recalc_dias
  AFTER UPDATE ON op_ds
  FOR EACH ROW EXECUTE FUNCTION trigger_recalc_on_dias_change();

-- ─── recalc_pull en cascada al cambiar fecha_compromiso de la OP ─────────────
CREATE OR REPLACE FUNCTION trigger_recalc_on_fecha_compromiso()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.fecha_compromiso IS DISTINCT FROM OLD.fecha_compromiso THEN
    PERFORM recalc_pull(id) FROM op_ds WHERE op_num = NEW.op_num AND activa = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_ops_recalc_fecha
  AFTER UPDATE ON ops
  FOR EACH ROW EXECUTE FUNCTION trigger_recalc_on_fecha_compromiso();
