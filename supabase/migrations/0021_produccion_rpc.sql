-- 0021_produccion_rpc.sql
-- Consolida en 1 RPC JSON los 19 queries HTTP que dispara /produccion hoy:
--   fetchKanbanData (5) + fetchTablaData (6) + fetchGanttData (8)
-- Al devolver JSON escalar bypasea el límite max_rows=1000 de PostgREST
-- (mismo patrón que get_phase_plans_json de la migración 0019).

CREATE OR REPLACE FUNCTION get_produccion_data()
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER AS $$
  SELECT json_build_object(
    'opds', (
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
          ci.razon_social                                          AS cliente_nombre,
          (
            SELECT COUNT(*)::int
            FROM op_d_pendientes p
            WHERE p.opd_padre_id = vs.opd_id
              AND p.estado != 'cerrado'
          )                                                        AS pendientes
        FROM v_slack vs
        JOIN v_score sc        ON sc.opd_id = vs.opd_id
        JOIN op_ds od          ON od.id     = vs.opd_id
        JOIN ops o             ON o.op_num  = vs.op_num
        JOIN clientes c        ON c.id      = o.cliente_id
        JOIN clientes_impel ci ON ci.id_impel = c.cliente_impel_id
        ORDER BY sc.score_efectivo DESC NULLS LAST, vs.slack ASC NULLS LAST
      ) t
    ),
    'plans',    get_phase_plans_json(),
    'baseline', get_phase_plans_baseline_json(),
    'festivos', (SELECT json_agg(fecha ORDER BY fecha) FROM festivos_co)
  );
$$;

GRANT EXECUTE ON FUNCTION get_produccion_data() TO authenticated;
