-- 0012_fix_recalc_pull_dias.sql
-- recalc_pull no actualizaba el campo `dias` en phase_plans al cambiar dias_X en op_ds.
-- Ahora sincroniza también dias para que phase_plans.dias sea siempre la fuente de verdad.

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

  SELECT fecha_compromiso INTO v_fecha_ancla FROM ops WHERE op_num = v_opd.op_num;
  v_cursor := v_fecha_ancla;

  UPDATE phase_plans SET
    dias = v_opd.dias_despacho,
    due_date   = v_cursor,
    start_date = restar_dias_habiles(v_cursor, v_opd.dias_despacho)
  WHERE opd_id = p_opd_id AND fase = 'despacho';
  v_cursor := restar_dias_habiles(v_cursor, v_opd.dias_despacho);

  UPDATE phase_plans SET
    dias = v_opd.dias_empaque,
    due_date   = v_cursor,
    start_date = restar_dias_habiles(v_cursor, v_opd.dias_empaque)
  WHERE opd_id = p_opd_id AND fase = 'empaque';
  v_cursor := restar_dias_habiles(v_cursor, v_opd.dias_empaque);

  UPDATE phase_plans SET
    dias = v_opd.dias_satelites,
    due_date   = v_cursor,
    start_date = restar_dias_habiles(v_cursor, v_opd.dias_satelites)
  WHERE opd_id = p_opd_id AND fase = 'satelites';
  v_cursor := restar_dias_habiles(v_cursor, v_opd.dias_satelites);

  UPDATE phase_plans SET
    dias = v_opd.dias_tiqueteo,
    due_date   = v_cursor,
    start_date = restar_dias_habiles(v_cursor, v_opd.dias_tiqueteo)
  WHERE opd_id = p_opd_id AND fase = 'tiqueteo';
  v_cursor := restar_dias_habiles(v_cursor, v_opd.dias_tiqueteo);

  UPDATE phase_plans SET
    dias = v_opd.dias_corte,
    due_date   = v_cursor,
    start_date = restar_dias_habiles(v_cursor, v_opd.dias_corte)
  WHERE opd_id = p_opd_id AND fase = 'corte';
  v_cursor := restar_dias_habiles(v_cursor, v_opd.dias_corte);

  UPDATE phase_plans SET
    dias = v_opd.dias_trazo,
    due_date   = v_cursor,
    start_date = restar_dias_habiles(v_cursor, v_opd.dias_trazo)
  WHERE opd_id = p_opd_id AND fase = 'trazo';
  v_cursor := restar_dias_habiles(v_cursor, v_opd.dias_trazo);

  UPDATE phase_plans SET
    dias = v_opd.dias_compras,
    due_date   = v_cursor,
    start_date = restar_dias_habiles(v_cursor, v_opd.dias_compras)
  WHERE opd_id = p_opd_id AND fase = 'compras';
  v_cursor := restar_dias_habiles(v_cursor, v_opd.dias_compras);

  UPDATE phase_plans SET
    dias = v_opd.dias_fase_0,
    due_date   = v_cursor,
    start_date = restar_dias_habiles(v_cursor, v_opd.dias_fase_0)
  WHERE opd_id = p_opd_id AND fase = 'fase_0';
END;
$$ LANGUAGE plpgsql;
