-- 0011_vista_capacidad.sql — Vista materializada de capacidad por semana y fase
-- Reemplaza el script 13_capacidad.py del sistema anterior.
-- No se puede refrescar desde un trigger inline (bloquea la tabla).
-- Estrategia: refresh nightly via cron Python (scripts/21_sync_incremental.py)
-- o manualmente: REFRESH MATERIALIZED VIEW CONCURRENTLY v_capacidad_semana_fase;

CREATE MATERIALIZED VIEW v_capacidad_semana_fase AS
SELECT
  date_trunc('week', pp.start_date)::DATE                    AS semana_inicio,
  to_char(date_trunc('week', pp.start_date), 'IYYY-IW')      AS semana_label,
  pp.fase,
  COUNT(DISTINCT pp.opd_id)                                  AS op_ds_simultaneas,
  SUM(od.cantidad)                                           AS unidades_totales,
  COUNT(DISTINCT o.cliente_id)                               AS n_clientes,
  CASE
    WHEN COUNT(DISTINCT pp.opd_id) > 20 THEN 'rojo'::semaforo_enum
    WHEN COUNT(DISTINCT pp.opd_id) > 10 THEN 'amarillo'::semaforo_enum
    ELSE 'verde'::semaforo_enum
  END AS color_carga
FROM phase_plans pp
JOIN op_ds od ON od.id    = pp.opd_id
JOIN ops o    ON o.op_num = od.op_num
WHERE od.activa = true
GROUP BY 1, 2, 3
ORDER BY 1, 3;

-- Índice único necesario para REFRESH CONCURRENTLY
CREATE UNIQUE INDEX idx_capacidad_semana_fase
  ON v_capacidad_semana_fase (semana_inicio, fase);
