-- 0010_vistas.sql — Vistas derivadas (métricas calculadas)
-- Las métricas (slack, semáforo, score) NO se guardan en tablas — solo en vistas.
-- NOTA: comparaciones de fases usan el enum directamente (>, <) — NUNCA ::text.

-- ─── v_slack — Slack y semáforo por OP-D ─────────────────────────────────────
CREATE OR REPLACE VIEW v_slack AS
WITH dias_restantes AS (
  SELECT
    od.id AS opd_id,
    COALESCE(SUM(pp.dias), 0) AS suma_dias_restantes
  FROM op_ds od
  LEFT JOIN phase_plans pp ON pp.opd_id = od.id
    AND pp.fase > od.fase_actual   -- enum ordena por declaración = orden de producción
  WHERE od.activa = true
  GROUP BY od.id
)
SELECT
  od.id         AS opd_id,
  od.ref,
  od.op_num,
  o.cliente_id,
  od.fase_actual,
  od.bloqueada,
  od.plan_congelado,
  dr.suma_dias_restantes            AS dias_plan_restantes,
  dias_habiles_entre(CURRENT_DATE, o.fecha_compromiso) AS dias_hasta_compromiso,
  dias_habiles_entre(CURRENT_DATE, o.fecha_compromiso)
    - dr.suma_dias_restantes        AS slack,
  CASE
    WHEN dias_habiles_entre(CURRENT_DATE, o.fecha_compromiso) - dr.suma_dias_restantes >= 3
      THEN 'verde'::semaforo_enum
    WHEN dias_habiles_entre(CURRENT_DATE, o.fecha_compromiso) - dr.suma_dias_restantes >= 0
      THEN 'amarillo'::semaforo_enum
    ELSE 'rojo'::semaforo_enum
  END AS semaforo
FROM op_ds od
JOIN ops o ON o.op_num = od.op_num
JOIN dias_restantes dr ON dr.opd_id = od.id
WHERE od.activa = true;

-- ─── v_semaforo_op — Peor semáforo entre las OP-Ds de una OP ─────────────────
CREATE OR REPLACE VIEW v_semaforo_op AS
SELECT
  o.op_num,
  o.cliente_id,
  CASE
    WHEN bool_or(vs.semaforo = 'rojo')     THEN 'rojo'::semaforo_enum
    WHEN bool_or(vs.semaforo = 'amarillo') THEN 'amarillo'::semaforo_enum
    ELSE 'verde'::semaforo_enum
  END AS semaforo_op,
  COUNT(*)                                          AS total_op_ds,
  COUNT(*) FILTER (WHERE vs.semaforo = 'rojo')      AS rojas,
  COUNT(*) FILTER (WHERE vs.semaforo = 'amarillo')  AS amarillas,
  COUNT(*) FILTER (WHERE vs.semaforo = 'verde')     AS verdes
FROM ops o
JOIN op_ds od ON od.op_num = o.op_num
JOIN v_slack vs ON vs.opd_id = od.id
WHERE o.activa = true AND od.activa = true
GROUP BY o.op_num, o.cliente_id;

-- ─── v_score — Score de priorización (5 criterios PPT 28-may-2026) ────────────
-- Total 100 pts. Aplica score_override si presente (Miguel).
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
      WHEN od.primera_vez      THEN 15  -- primera_vez tiene precedencia sobre tier
      WHEN c.tier = 'tier_1'   THEN 20
      WHEN c.tier = 'tier_2'   THEN 10
      ELSE 4
    END AS pts_estrategico
  FROM op_ds od
  JOIN ops o ON o.op_num = od.op_num
  JOIN clientes c ON c.id = o.cliente_id
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
      WHEN (SELECT COUNT(*) FROM op_ds od2 WHERE od2.op_num = od.op_num) = 1
           AND od.cantidad >= 1000 THEN 5
      WHEN (SELECT COUNT(*) FROM op_ds od2 WHERE od2.op_num = od.op_num) >= 5
           AND od.cantidad < 100   THEN 1
      ELSE 3
    END AS pts_velocidad
  FROM op_ds od
  JOIN ops o ON o.op_num = od.op_num
  JOIN clientes c ON c.id = o.cliente_id
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
JOIN urgencia u  ON u.opd_id  = od.id
JOIN contractual ct ON ct.opd_id = od.id
JOIN estrategico e  ON e.opd_id  = od.id
JOIN volumen v      ON v.opd_id  = od.id
JOIN caja ca        ON ca.opd_id = od.id
WHERE od.activa = true;

-- ─── v_plan_vs_real — Comparación baseline / plan vigente / real ──────────────
CREATE OR REPLACE VIEW v_plan_vs_real AS
WITH eventos_avance AS (
  SELECT
    opd_id,
    fase,
    MIN(ts) FILTER (WHERE tipo IN ('phase_advance','phase_advance_parcial')) AS fecha_real_inicio,
    MIN(ts) FILTER (WHERE tipo = 'phase_advance'
                      AND payload->>'fase_from' = fase::text) AS fecha_real_fin
  FROM phase_events
  GROUP BY opd_id, fase
)
SELECT
  od.id  AS opd_id,
  od.ref,
  pp.fase,
  pb.dias       AS dias_baseline,
  pb.start_date AS start_baseline,
  pb.due_date   AS due_baseline,
  pp.dias       AS dias_plan_actual,
  pp.start_date AS start_plan_actual,
  pp.due_date   AS due_plan_actual,
  ea.fecha_real_inicio,
  ea.fecha_real_fin
FROM op_ds od
JOIN phase_plans pp ON pp.opd_id = od.id
LEFT JOIN phase_plans_baseline pb ON pb.opd_id = od.id AND pb.fase = pp.fase
LEFT JOIN eventos_avance ea ON ea.opd_id = od.id AND ea.fase = pp.fase
WHERE od.activa = true;

-- ─── v_pendientes_abiertos ────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_pendientes_abiertos AS
SELECT
  p.id,
  p.opd_padre_id,
  od.ref        AS opd_ref,
  od.op_num,
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

-- ─── v_foco_semanal — OP-Ds que deben avanzar esta semana ────────────────────
CREATE OR REPLACE VIEW v_foco_semanal AS
SELECT
  od.id    AS opd_id,
  od.ref,
  od.op_num,
  c.id     AS cliente_id,
  ci.razon_social AS cliente,
  od.fase_actual,
  pp.fase  AS fase_objetivo_semana,
  pp.start_date,
  pp.due_date,
  vs.semaforo,
  vs.slack,
  sc.score_efectivo,
  od.bloqueada,
  od.motivo_bloqueo
FROM op_ds od
JOIN phase_plans pp ON pp.opd_id = od.id
JOIN ops o          ON o.op_num  = od.op_num
JOIN clientes c     ON c.id      = o.cliente_id
JOIN clientes_impel ci ON ci.id_impel = c.cliente_impel_id
JOIN v_slack vs     ON vs.opd_id = od.id
JOIN v_score sc     ON sc.opd_id = od.id
WHERE od.activa = true
  AND pp.start_date <= date_trunc('week', CURRENT_DATE) + INTERVAL '6 days'
  AND pp.due_date   >= date_trunc('week', CURRENT_DATE)
ORDER BY sc.score_efectivo DESC, vs.slack ASC;

-- ─── v_mi_fase_hoy — Pantalla del líder de fase ───────────────────────────────
-- El frontend filtra por fase_actual = (fase del líder logueado)
CREATE OR REPLACE VIEW v_mi_fase_hoy AS
SELECT
  od.id    AS opd_id,
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
  (SELECT COUNT(*)
   FROM op_d_pendientes p
   WHERE p.opd_padre_id = od.id AND p.estado != 'cerrado'
  ) AS pendientes_abiertos
FROM op_ds od
JOIN ops o          ON o.op_num  = od.op_num
JOIN clientes c     ON c.id      = o.cliente_id
JOIN clientes_impel ci ON ci.id_impel = c.cliente_impel_id
LEFT JOIN phase_plans pp ON pp.opd_id = od.id AND pp.fase = od.fase_actual
JOIN v_slack vs     ON vs.opd_id = od.id
JOIN v_score sc     ON sc.opd_id = od.id
WHERE od.activa = true;
