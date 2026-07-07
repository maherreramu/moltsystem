-- 0023_opds_rpc.sql
-- get_opds_data() retorna solo la metadata de OP-Ds activas (sin planes ni festivos).
-- Combinado con get_phase_plans_json() y get_phase_plans_baseline_json() (0019) permite
-- dividir el payload de /produccion en 3 caches separados, cada uno bajo el límite
-- de 2MB de unstable_cache de Next.js (el payload unificado superaba los 2MB).

CREATE OR REPLACE FUNCTION get_opds_data()
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER AS $$
  SELECT json_agg(row_to_json(t))
  FROM (
    SELECT
      vs.opd_id,
      vs.ref,
      vs.op_num,
      vs.cliente_id,
      vs.fase_actual,
      vs.semaforo,
      vs.slack,
      vs.dias_plan_restantes,
      vs.bloqueada,
      vs.plan_congelado,
      sc.score_efectivo,
      od.detalle,
      od.cantidad,
      o.comercial,
      o.fecha_compromiso,
      ci.razon_social                                        AS cliente_nombre,
      (
        SELECT COUNT(*)::int
        FROM op_d_pendientes p
        WHERE p.opd_padre_id = vs.opd_id
          AND p.estado != 'cerrado'
      )                                                      AS pendientes
    FROM v_slack vs
    JOIN v_score sc        ON sc.opd_id   = vs.opd_id
    JOIN op_ds od          ON od.id       = vs.opd_id
    JOIN ops o             ON o.op_num    = vs.op_num
    JOIN clientes c        ON c.id        = o.cliente_id
    JOIN clientes_impel ci ON ci.id_impel = c.cliente_impel_id
    ORDER BY sc.score_efectivo DESC NULLS LAST, vs.slack ASC NULLS LAST
  ) t;
$$;

GRANT EXECUTE ON FUNCTION get_opds_data() TO authenticated;
