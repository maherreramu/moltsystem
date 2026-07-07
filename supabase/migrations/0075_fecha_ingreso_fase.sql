-- Migration: 0075_fecha_ingreso_fase
-- Description: Adds fecha_ingreso_fase to get_opds_data() and v_mi_fase_hoy for traceability.

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
      od.prioridad_manual,
      od.subestado_satelite,
      od.fecha_promesa_satelites,
      od.fecha_recepcion_satelites,
      od.recurso_corte,
      od.tipo_despacho,
      od.colores,
      od.motivo_bloqueo,
      od.causa_desvio,
      o.comercial,
      o.fecha_compromiso,
      ci.razon_social                                        AS cliente_nombre,
      (
        SELECT COUNT(*)::int
        FROM op_d_pendientes p
        WHERE p.opd_padre_id = vs.opd_id
          AND p.estado != 'cerrado'
      )                                                      AS pendientes,
      dias_habiles_entre(CURRENT_DATE, pp_fase.due_date)     AS slack_fase,
      semaforo_de(
        dias_habiles_entre(CURRENT_DATE, pp_fase.due_date)::INT,
        od.fase_actual
      )                                                      AS semaforo_fase,
      pp_prom.fecha_promesa                                  AS promesa_fase,
      pe_ingreso.fecha_ingreso::date                         AS fecha_ingreso_fase
    FROM v_slack vs
    JOIN v_score sc        ON sc.opd_id   = vs.opd_id
    JOIN op_ds od          ON od.id       = vs.opd_id
    JOIN ops o             ON o.op_num    = vs.op_num
    JOIN clientes c        ON c.id        = o.cliente_id
    JOIN clientes_impel ci ON ci.id_impel = c.cliente_impel_id
    LEFT JOIN phase_plans pp_fase
          ON pp_fase.opd_id = vs.opd_id
         AND pp_fase.fase   = od.fase_actual
    LEFT JOIN LATERAL (
      SELECT fecha_promesa
      FROM phase_promises
      WHERE opd_id = vs.opd_id
      ORDER BY (fase = od.fase_actual) DESC, set_at DESC
      LIMIT 1
    ) pp_prom ON TRUE
    LEFT JOIN LATERAL (
      SELECT MAX(ts) AS fecha_ingreso
      FROM phase_events
      WHERE opd_id = vs.opd_id
        AND (
          (tipo = 'op_arrival' AND od.fase_actual = 'fase_0')
          OR
          (tipo IN ('phase_advance', 'phase_advance_parcial', 'phase_jump') AND (payload->>'fase_to') = od.fase_actual::text)
          OR
          (tipo = 'phase_revert' AND (payload->>'fase_to') = od.fase_actual::text)
        )
    ) pe_ingreso ON TRUE
    ORDER BY od.prioridad_manual ASC NULLS LAST, sc.score_efectivo DESC NULLS LAST, vs.slack ASC NULLS LAST
  ) t;
$$;

GRANT EXECUTE ON FUNCTION get_opds_data() TO authenticated;

-- Ahora v_mi_fase_hoy
DROP VIEW IF EXISTS v_mi_fase_hoy;
CREATE VIEW v_mi_fase_hoy AS
 SELECT od.id AS opd_id,
    od.ref, od.op_num, ci.razon_social AS cliente, od.cantidad,
    od.fase_actual, od.bloqueada, od.motivo_bloqueo,
    vs.semaforo, vs.slack, sc.score_efectivo,
    pp.due_date AS fecha_fin_planeada,
    ( SELECT count(*) FROM op_d_pendientes p
      WHERE p.opd_padre_id = od.id AND p.estado <> 'cerrado') AS pendientes_abiertos,
    (od.cantidad - COALESCE(
      (SELECT sum(p.cantidad_afectada) FROM op_d_pendientes p
       WHERE p.opd_padre_id = od.id AND p.estado <> 'cerrado'), 0
    )::integer) AS uds_en_fase,
    od.uds_recibidas_empaque,
    od.detalle, od.fecha_promesa_satelites, od.subestado_satelite,
    o.fecha_compromiso,
    dias_habiles_entre(CURRENT_DATE, pp.due_date) AS slack_fase,
    semaforo_de(dias_habiles_entre(CURRENT_DATE, pp.due_date)::INT, od.fase_actual) AS semaforo_fase,
    pf.prioridad AS prioridad_fase,
    od.paquete_completo,
    pe_ingreso.fecha_ingreso::date AS fecha_ingreso_fase
   FROM op_ds od
     JOIN ops o ON o.op_num = od.op_num
     JOIN clientes c ON c.id = o.cliente_id
     JOIN clientes_impel ci ON ci.id_impel = c.cliente_impel_id
     LEFT JOIN phase_plans pp ON pp.opd_id = od.id AND pp.fase = od.fase_actual
     JOIN v_slack vs ON vs.opd_id = od.id
     JOIN v_score sc ON sc.opd_id = od.id
     LEFT JOIN op_d_prioridad_fase pf ON pf.opd_id = od.id AND pf.fase = od.fase_actual
     LEFT JOIN LATERAL (
       SELECT MAX(ts) AS fecha_ingreso
       FROM phase_events
       WHERE opd_id = od.id
         AND (
           (tipo = 'op_arrival' AND od.fase_actual = 'fase_0')
           OR
           (tipo IN ('phase_advance', 'phase_advance_parcial', 'phase_jump') AND (payload->>'fase_to') = od.fase_actual::text)
           OR
           (tipo = 'phase_revert' AND (payload->>'fase_to') = od.fase_actual::text)
         )
     ) pe_ingreso ON TRUE
  WHERE od.activa = true;

GRANT SELECT ON v_mi_fase_hoy TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'moltsystem_analytics') THEN
    EXECUTE format('GRANT SELECT ON v_mi_fase_hoy TO %I', 'moltsystem_analytics');
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics_readonly') THEN
    EXECUTE format('GRANT SELECT ON v_mi_fase_hoy TO %I', 'analytics_readonly');
  END IF;
END $$;
