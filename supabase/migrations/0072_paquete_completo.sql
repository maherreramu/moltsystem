-- Migration: 0072_paquete_completo
-- Description: Adds a boolean column to op_ds to track "paquete completo" in compras and updates v_mi_fase_hoy.

ALTER TABLE op_ds
ADD COLUMN paquete_completo BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN op_ds.paquete_completo IS 'Indica si en la fase de compras se ha marcado como paquete completo';

-- Añadir paquete_completo a v_mi_fase_hoy
CREATE OR REPLACE VIEW v_mi_fase_hoy AS
 SELECT od.id AS opd_id,
    od.ref, od.op_num, ci.razon_social AS cliente, od.cantidad,
    od.fase_actual, od.bloqueada, od.motivo_bloqueo,
    vs.semaforo, vs.slack, sc.score_efectivo,
    pp.due_date AS fecha_fin_planeada,
    ( SELECT count(*) FROM op_d_pendientes p
      WHERE p.opd_padre_id = od.id AND p.estado <> 'cerrado') AS pendientes_abiertos,
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
