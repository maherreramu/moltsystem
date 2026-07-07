-- Migration: 0073_uds_recibidas_empaque_and_uds_en_fase
-- Description: Adds uds_recibidas_empaque to op_ds and computes uds_en_fase in v_mi_fase_hoy.

ALTER TABLE op_ds
ADD COLUMN IF NOT EXISTS uds_recibidas_empaque INTEGER;

ALTER TYPE phase_event_tipo_enum ADD VALUE IF NOT EXISTS 'uds_recibidas_empaque_set';

COMMENT ON COLUMN op_ds.uds_recibidas_empaque IS 'Unidades reales recibidas en la fase de empaque';

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
    od.paquete_completo
   FROM op_ds od
     JOIN ops o ON o.op_num = od.op_num
     JOIN clientes c ON c.id = o.cliente_id
     JOIN clientes_impel ci ON ci.id_impel = c.cliente_impel_id
     LEFT JOIN phase_plans pp ON pp.opd_id = od.id AND pp.fase = od.fase_actual
     JOIN v_slack vs ON vs.opd_id = od.id
     JOIN v_score sc ON sc.opd_id = od.id
     LEFT JOIN op_d_prioridad_fase pf ON pf.opd_id = od.id AND pf.fase = od.fase_actual
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
