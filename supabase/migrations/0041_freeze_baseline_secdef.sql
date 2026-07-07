-- 0041_freeze_baseline_secdef.sql
-- freeze_baseline no tenía SECURITY DEFINER, causando "permission denied for
-- table phase_plans_baseline" al ser llamada desde el trigger auto_freeze_baseline
-- (que corre como service_role, sin permisos explícitos en esa tabla).
-- Ahora corre como el owner (postgres) que sí tiene acceso total.

CREATE OR REPLACE FUNCTION freeze_baseline(p_opd_id UUID, p_actor TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION freeze_baseline(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION freeze_baseline(uuid, text) TO service_role;
