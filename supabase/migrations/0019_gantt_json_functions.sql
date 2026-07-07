-- 0019_gantt_json_functions.sql
-- Funciones que devuelven JSON único para evitar el límite max_rows de PostgREST.
-- Las RPC que retornan JSON (no SETOF) no están sujetas a paginación de filas.
-- Útil para phase_plans (4296 filas > 1000 max_rows default).

CREATE OR REPLACE FUNCTION get_phase_plans_json()
RETURNS JSON
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_agg(row_to_json(p))
  FROM phase_plans p
  JOIN op_ds o ON o.id = p.opd_id
  WHERE o.activa = true;
$$;

CREATE OR REPLACE FUNCTION get_phase_plans_baseline_json()
RETURNS JSON
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_agg(row_to_json(p))
  FROM phase_plans_baseline p
  JOIN op_ds o ON o.id = p.opd_id
  WHERE o.activa = true;
$$;

GRANT EXECUTE ON FUNCTION get_phase_plans_json()          TO authenticated;
GRANT EXECUTE ON FUNCTION get_phase_plans_baseline_json() TO authenticated;
