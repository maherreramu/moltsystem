-- 0057: unificar promesa entrega — migrar fecha_promesa_satelites → phase_promises
-- La columna op_ds.fecha_promesa_satelites fue la primera implementación de la promesa
-- del lider de fase para satélites. phase_promises es la versión general por fase.
-- Son el mismo concepto: se migran los datos existentes y se expone promesa_fase en la RPC.

-- A. Migrar datos existentes (solo donde no haya ya un registro en phase_promises)
INSERT INTO phase_promises (opd_id, fase, fecha_promesa, set_by, set_at)
SELECT od.id, 'satelites'::fase_enum, od.fecha_promesa_satelites, 'migration-0057', NOW()
FROM op_ds od
WHERE od.fecha_promesa_satelites IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM phase_promises pp
    WHERE pp.opd_id = od.id
      AND pp.fase   = 'satelites'::fase_enum
  );

-- B. Actualizar get_opds_data() para incluir promesa_fase desde phase_promises
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
      pp_prom.fecha_promesa                                  AS promesa_fase
    FROM v_slack vs
    JOIN v_score sc        ON sc.opd_id   = vs.opd_id
    JOIN op_ds od          ON od.id       = vs.opd_id
    JOIN ops o             ON o.op_num    = vs.op_num
    JOIN clientes c        ON c.id        = o.cliente_id
    JOIN clientes_impel ci ON ci.id_impel = c.cliente_impel_id
    LEFT JOIN phase_plans pp_fase
          ON pp_fase.opd_id = vs.opd_id
         AND pp_fase.fase   = od.fase_actual
    LEFT JOIN phase_promises pp_prom
          ON pp_prom.opd_id = vs.opd_id
         AND pp_prom.fase   = od.fase_actual
    ORDER BY od.prioridad_manual ASC NULLS LAST, sc.score_efectivo DESC NULLS LAST, vs.slack ASC NULLS LAST
  ) t;
$$;

GRANT EXECUTE ON FUNCTION get_opds_data() TO authenticated;
