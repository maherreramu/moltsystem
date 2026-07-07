-- 0054: agregar fecha_compromiso a v_mi_fase_hoy
-- La vista ya hace JOIN ops, solo se añade o.fecha_compromiso al SELECT.

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
    o.fecha_compromiso
   FROM op_ds od
     JOIN ops o ON o.op_num = od.op_num
     JOIN clientes c ON c.id = o.cliente_id
     JOIN clientes_impel ci ON ci.id_impel = c.cliente_impel_id
     LEFT JOIN phase_plans pp ON pp.opd_id = od.id AND pp.fase = od.fase_actual
     JOIN v_slack vs ON vs.opd_id = od.id
     JOIN v_score sc ON sc.opd_id = od.id
  WHERE od.activa = true;

GRANT SELECT ON v_mi_fase_hoy TO authenticated, service_role;
