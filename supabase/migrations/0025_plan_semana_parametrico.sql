-- 0025_plan_semana_parametrico.sql
-- Versión paramétrica de v_foco_semanal que acepta una fecha de lunes.
-- Permite navegar hacia semanas pasadas y futuras desde el frontend.
-- p_lunes: lunes de la semana objetivo (default = lunes de la semana actual).

CREATE OR REPLACE FUNCTION get_plan_semana(
  p_lunes date DEFAULT date_trunc('week', CURRENT_DATE)::date
)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER AS $$
  SELECT json_agg(row_to_json(t) ORDER BY t.score_efectivo DESC NULLS LAST, t.slack ASC NULLS LAST)
  FROM (
    SELECT
      od.id                        AS opd_id,
      od.ref,
      od.op_num,
      ci.razon_social              AS cliente,
      od.fase_actual,
      pp.fase                      AS fase_objetivo,
      pp.start_date::text          AS start_date,
      pp.due_date::text            AS due_date,
      vs.semaforo,
      vs.slack,
      sc.score_efectivo,
      od.bloqueada,
      od.motivo_bloqueo
    FROM op_ds od
    JOIN phase_plans pp    ON pp.opd_id     = od.id
    JOIN ops o             ON o.op_num      = od.op_num
    JOIN clientes c        ON c.id          = o.cliente_id
    JOIN clientes_impel ci ON ci.id_impel   = c.cliente_impel_id
    JOIN v_slack vs        ON vs.opd_id     = od.id
    JOIN v_score sc        ON sc.opd_id     = od.id
    WHERE od.activa = true
      AND pp.start_date <= p_lunes + 6
      AND pp.due_date   >= p_lunes
  ) t;
$$;

GRANT EXECUTE ON FUNCTION get_plan_semana(date) TO authenticated;
