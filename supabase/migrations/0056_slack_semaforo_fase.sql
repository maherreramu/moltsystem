-- 0056: agregar slack_fase y semaforo_fase a get_opds_data() y v_mi_fase_hoy
-- slack_fase = dias_habiles_entre(hoy, phase_plans.due_date) para la fase_actual
-- semaforo_fase = semaforo_de(slack_fase, fase_actual) — usa umbrales configurables

-- A. get_opds_data() — agrega LEFT JOIN phase_plans pp_fase + 2 campos calculados
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
      )                                                      AS semaforo_fase
    FROM v_slack vs
    JOIN v_score sc        ON sc.opd_id   = vs.opd_id
    JOIN op_ds od          ON od.id       = vs.opd_id
    JOIN ops o             ON o.op_num    = vs.op_num
    JOIN clientes c        ON c.id        = o.cliente_id
    JOIN clientes_impel ci ON ci.id_impel = c.cliente_impel_id
    LEFT JOIN phase_plans pp_fase
          ON pp_fase.opd_id = vs.opd_id
         AND pp_fase.fase   = od.fase_actual
    ORDER BY od.prioridad_manual ASC NULLS LAST, sc.score_efectivo DESC NULLS LAST, vs.slack ASC NULLS LAST
  ) t;
$$;

GRANT EXECUTE ON FUNCTION get_opds_data() TO authenticated;

-- B. v_mi_fase_hoy — el alias pp ya tiene LEFT JOIN phase_plans para fase = fase_actual
--    Solo se añaden los dos campos calculados al SELECT.
CREATE OR REPLACE VIEW v_mi_fase_hoy AS
 SELECT od.id AS opd_id,
    od.ref,
    od.op_num,
    ci.razon_social AS cliente,
    od.cantidad,
    od.fase_actual,
    od.bloqueada,
    od.motivo_bloqueo,
    vs.semaforo,
    vs.slack,
    sc.score_efectivo,
    pp.due_date AS fecha_fin_planeada,
    ( SELECT count(*) AS count
           FROM op_d_pendientes p
          WHERE p.opd_padre_id = od.id AND p.estado <> 'cerrado'::pendiente_estado_enum) AS pendientes_abiertos,
    od.detalle,
    od.fecha_promesa_satelites,
    od.subestado_satelite,
    o.fecha_compromiso,
    dias_habiles_entre(CURRENT_DATE, pp.due_date)           AS slack_fase,
    semaforo_de(
      dias_habiles_entre(CURRENT_DATE, pp.due_date)::INT,
      od.fase_actual
    )                                                        AS semaforo_fase
   FROM op_ds od
     JOIN ops o ON o.op_num = od.op_num
     JOIN clientes c ON c.id = o.cliente_id
     JOIN clientes_impel ci ON ci.id_impel = c.cliente_impel_id
     LEFT JOIN phase_plans pp ON pp.opd_id = od.id AND pp.fase = od.fase_actual
     JOIN v_slack vs ON vs.opd_id = od.id
     JOIN v_score sc ON sc.opd_id = od.id
  WHERE od.activa = true;

GRANT SELECT ON v_mi_fase_hoy TO authenticated, service_role;
