-- 0008_funciones.sql — Funciones de negocio core
-- dias_habiles_entre, restar_dias_habiles, sumar_dias_habiles: calendario colombiano
-- recalc_pull: recalcula el plan pull de una OP-D (equivalente a recalculate_pull.py)
-- freeze_baseline: snapshot inmutable al cerrar Fase 0

-- ─── dias_habiles_entre(d1, d2) → INTEGER ─────────────────────────────────────
-- Cuenta días hábiles entre d1 y d2 (excluye d1, incluye d2).
-- Resultado positivo si d2 > d1, negativo si d2 < d1.
CREATE OR REPLACE FUNCTION dias_habiles_entre(d1 DATE, d2 DATE)
RETURNS INTEGER AS $$
DECLARE
  diff        INTEGER := 0;
  cursor_date DATE    := d1;
  sign        INTEGER := CASE WHEN d2 >= d1 THEN 1 ELSE -1 END;
  target      DATE    := d2;
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

-- ─── restar_dias_habiles(d, n) → DATE ─────────────────────────────────────────
-- Retrocede n días hábiles desde d. Usado en recalc_pull (sentido pull).
CREATE OR REPLACE FUNCTION restar_dias_habiles(d DATE, n INTEGER)
RETURNS DATE AS $$
DECLARE
  result    DATE    := d;
  restantes INTEGER := n;
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

-- ─── sumar_dias_habiles(d, n) → DATE ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION sumar_dias_habiles(d DATE, n INTEGER)
RETURNS DATE AS $$
DECLARE
  result    DATE    := d;
  restantes INTEGER := n;
BEGIN
  WHILE restantes > 0 LOOP
    result := result + 1;
    IF EXTRACT(DOW FROM result) NOT IN (0, 6)
       AND NOT EXISTS (SELECT 1 FROM festivos_co WHERE fecha = result) THEN
      restantes := restantes - 1;
    END IF;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── recalc_pull(p_opd_id) → VOID ─────────────────────────────────────────────
-- Recalcula todas las fechas de phase_plans para una OP-D, hacia atrás
-- desde ops.fecha_compromiso (modelo pull). No toca phase_plans_baseline.
-- No hace nada si op_ds.plan_congelado = true.
CREATE OR REPLACE FUNCTION recalc_pull(p_opd_id UUID)
RETURNS VOID AS $$
DECLARE
  v_opd         op_ds%ROWTYPE;
  v_fecha_ancla DATE;
  v_cursor      DATE;
BEGIN
  SELECT * INTO v_opd FROM op_ds WHERE id = p_opd_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_opd.plan_congelado THEN RETURN; END IF;

  SELECT fecha_compromiso INTO v_fecha_ancla
  FROM ops WHERE op_num = v_opd.op_num;

  v_cursor := v_fecha_ancla;

  -- Iterar en reversa: despacho → empaque → satelites → tiqueteo
  --                  → corte → trazo → compras → fase_0
  UPDATE phase_plans
    SET due_date = v_cursor, start_date = restar_dias_habiles(v_cursor, v_opd.dias_despacho)
    WHERE opd_id = p_opd_id AND fase = 'despacho';
  v_cursor := restar_dias_habiles(v_cursor, v_opd.dias_despacho);

  UPDATE phase_plans
    SET due_date = v_cursor, start_date = restar_dias_habiles(v_cursor, v_opd.dias_empaque)
    WHERE opd_id = p_opd_id AND fase = 'empaque';
  v_cursor := restar_dias_habiles(v_cursor, v_opd.dias_empaque);

  UPDATE phase_plans
    SET due_date = v_cursor, start_date = restar_dias_habiles(v_cursor, v_opd.dias_satelites)
    WHERE opd_id = p_opd_id AND fase = 'satelites';
  v_cursor := restar_dias_habiles(v_cursor, v_opd.dias_satelites);

  UPDATE phase_plans
    SET due_date = v_cursor, start_date = restar_dias_habiles(v_cursor, v_opd.dias_tiqueteo)
    WHERE opd_id = p_opd_id AND fase = 'tiqueteo';
  v_cursor := restar_dias_habiles(v_cursor, v_opd.dias_tiqueteo);

  UPDATE phase_plans
    SET due_date = v_cursor, start_date = restar_dias_habiles(v_cursor, v_opd.dias_corte)
    WHERE opd_id = p_opd_id AND fase = 'corte';
  v_cursor := restar_dias_habiles(v_cursor, v_opd.dias_corte);

  UPDATE phase_plans
    SET due_date = v_cursor, start_date = restar_dias_habiles(v_cursor, v_opd.dias_trazo)
    WHERE opd_id = p_opd_id AND fase = 'trazo';
  v_cursor := restar_dias_habiles(v_cursor, v_opd.dias_trazo);

  UPDATE phase_plans
    SET due_date = v_cursor, start_date = restar_dias_habiles(v_cursor, v_opd.dias_compras)
    WHERE opd_id = p_opd_id AND fase = 'compras';
  v_cursor := restar_dias_habiles(v_cursor, v_opd.dias_compras);

  UPDATE phase_plans
    SET due_date = v_cursor, start_date = restar_dias_habiles(v_cursor, v_opd.dias_fase_0)
    WHERE opd_id = p_opd_id AND fase = 'fase_0';
END;
$$ LANGUAGE plpgsql;

-- ─── freeze_baseline(p_opd_id, p_actor) → VOID ────────────────────────────────
-- Crea el snapshot inmutable del plan al cerrar Fase 0.
-- Idempotente: no hace nada si ya existe baseline para esta OP-D.
-- Inserta evento baseline_freeze en phase_events.
CREATE OR REPLACE FUNCTION freeze_baseline(p_opd_id UUID, p_actor TEXT)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM phase_plans_baseline WHERE opd_id = p_opd_id) THEN
    INSERT INTO phase_plans_baseline (opd_id, fase, dias, start_date, due_date, frozen_by)
    SELECT opd_id, fase, dias, start_date, due_date, p_actor
    FROM phase_plans
    WHERE opd_id = p_opd_id;

    INSERT INTO phase_events (opd_id, tipo, actor, payload)
    VALUES (p_opd_id, 'baseline_freeze', p_actor,
            jsonb_build_object('frozen_at', now()));
  END IF;
END;
$$ LANGUAGE plpgsql;
