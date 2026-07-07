-- Migration: 0076_v_pendientes_abiertos
-- Description: Adds cantidad_total_opd to v_pendientes_abiertos view

DROP VIEW IF EXISTS v_pendientes_abiertos;

CREATE VIEW v_pendientes_abiertos AS
SELECT
  p.id,
  p.opd_padre_id,
  od.ref        AS opd_ref,
  od.op_num,
  od.cantidad   AS cantidad_total_opd,
  p.fase_origen,
  p.motivo,
  p.cantidad_afectada,
  p.fase_actual,
  p.estado,
  p.fecha_compromiso_subsanacion,
  CASE
    WHEN p.fecha_compromiso_subsanacion < CURRENT_DATE            THEN 'vencido'
    WHEN p.fecha_compromiso_subsanacion <= CURRENT_DATE + 3       THEN 'urgente'
    ELSE 'en_curso'
  END AS urgencia,
  p.responsable,
  p.notas,
  p.created_at,
  EXTRACT(DAY FROM (now() - p.created_at))::INTEGER AS dias_abierto
FROM op_d_pendientes p
JOIN op_ds od ON od.id = p.opd_padre_id
WHERE p.estado != 'cerrado';

GRANT SELECT ON v_pendientes_abiertos TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'moltsystem_analytics') THEN
    EXECUTE format('GRANT SELECT ON v_pendientes_abiertos TO %I', 'moltsystem_analytics');
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics_readonly') THEN
    EXECUTE format('GRANT SELECT ON v_pendientes_abiertos TO %I', 'analytics_readonly');
  END IF;
END $$;
