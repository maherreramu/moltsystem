-- 0020_fix_v_score_n1.sql
-- Elimina la subconsulta correlacionada por fila en el CTE volumen de v_score.
-- Antes: ejecutaba 1 SELECT COUNT(*) por OP-D activa (N+1).
-- Después: pre-agrega op_ds_por_op en un CTE con 1 solo scan.

CREATE OR REPLACE VIEW v_score AS
WITH urgencia AS (
  SELECT
    od.id AS opd_id,
    dias_habiles_entre(CURRENT_DATE, o.fecha_compromiso) AS slack_dias,
    CASE
      WHEN dias_habiles_entre(CURRENT_DATE, o.fecha_compromiso) <= 0  THEN 35
      WHEN dias_habiles_entre(CURRENT_DATE, o.fecha_compromiso) <= 7  THEN 25
      WHEN dias_habiles_entre(CURRENT_DATE, o.fecha_compromiso) <= 15 THEN 15
      WHEN dias_habiles_entre(CURRENT_DATE, o.fecha_compromiso) <= 30 THEN 5
      ELSE 0
    END AS pts_urgencia
  FROM op_ds od
  JOIN ops o ON o.op_num = od.op_num
  WHERE od.activa = true
),
contractual AS (
  SELECT
    od.id AS opd_id,
    CASE c.tipo_relacion
      WHEN 'contrato_con_penalizacion' THEN 20
      WHEN 'contrato_sin_penalizacion' THEN 12
      WHEN 'recurrente'               THEN 6
      ELSE 0
    END AS pts_contractual
  FROM op_ds od
  JOIN ops o ON o.op_num = od.op_num
  JOIN clientes c ON c.id = o.cliente_id
),
estrategico AS (
  SELECT
    od.id AS opd_id,
    CASE
      WHEN od.primera_vez      THEN 15
      WHEN c.tier = 'tier_1'   THEN 20
      WHEN c.tier = 'tier_2'   THEN 10
      ELSE 4
    END AS pts_estrategico
  FROM op_ds od
  JOIN ops o ON o.op_num = od.op_num
  JOIN clientes c ON c.id = o.cliente_id
),
-- Pre-agrega conteo de OP-Ds por op_num en un solo scan (elimina N+1)
opds_por_op AS (
  SELECT op_num, COUNT(*)::int AS cnt
  FROM op_ds
  WHERE activa = true
  GROUP BY op_num
),
volumen AS (
  SELECT
    od.id AS opd_id,
    CASE c.complejidad_tipica
      WHEN 'alta'  THEN 5
      WHEN 'media' THEN 3
      ELSE 1
    END AS pts_complejidad,
    CASE
      WHEN opc.cnt = 1 AND od.cantidad >= 1000 THEN 5
      WHEN opc.cnt >= 5 AND od.cantidad < 100  THEN 1
      ELSE 3
    END AS pts_velocidad
  FROM op_ds od
  JOIN ops o          ON o.op_num = od.op_num
  JOIN clientes c     ON c.id = o.cliente_id
  JOIN opds_por_op opc ON opc.op_num = od.op_num
),
caja AS (
  SELECT
    od.id AS opd_id,
    CASE c.condicion_pago
      WHEN 'anticipado' THEN 15
      WHEN 'hasta_30d'  THEN 15
      WHEN '30_a_60d'   THEN 8
      ELSE 3
    END AS pts_caja
  FROM op_ds od
  JOIN ops o ON o.op_num = od.op_num
  JOIN clientes c ON c.id = o.cliente_id
)
SELECT
  od.id    AS opd_id,
  od.ref,
  od.op_num,
  u.slack_dias,
  u.pts_urgencia,
  ct.pts_contractual,
  e.pts_estrategico,
  v.pts_complejidad,
  v.pts_velocidad,
  ca.pts_caja,
  (u.pts_urgencia + ct.pts_contractual + e.pts_estrategico
   + v.pts_complejidad + v.pts_velocidad + ca.pts_caja) AS score_calculado,
  od.score_override,
  COALESCE(od.score_override,
    u.pts_urgencia + ct.pts_contractual + e.pts_estrategico
    + v.pts_complejidad + v.pts_velocidad + ca.pts_caja
  ) AS score_efectivo
FROM op_ds od
JOIN urgencia u      ON u.opd_id  = od.id
JOIN contractual ct  ON ct.opd_id = od.id
JOIN estrategico e   ON e.opd_id  = od.id
JOIN volumen v       ON v.opd_id  = od.id
JOIN caja ca         ON ca.opd_id = od.id
WHERE od.activa = true;
