-- 0050_semaforo_por_fase.sql
-- Actualiza v_slack para usar semaforo_de() y agrega v_semaforo_fase

-- 1. v_slack: reemplazar CASE hardcodeado por semaforo_de()
CREATE OR REPLACE VIEW v_slack AS
WITH dias_restantes AS (
  SELECT od_1.id AS opd_id,
    COALESCE(sum(pp.dias), 0::bigint) AS suma_dias_restantes
  FROM op_ds od_1
    LEFT JOIN phase_plans pp ON pp.opd_id = od_1.id AND pp.fase > od_1.fase_actual
  WHERE od_1.activa = true
  GROUP BY od_1.id
)
SELECT od.id AS opd_id,
  od.ref,
  od.op_num,
  o.cliente_id,
  od.fase_actual,
  od.bloqueada,
  od.plan_congelado,
  dr.suma_dias_restantes AS dias_plan_restantes,
  dias_habiles_entre(CURRENT_DATE, o.fecha_compromiso) AS dias_hasta_compromiso,
  dias_habiles_entre(CURRENT_DATE, o.fecha_compromiso) - dr.suma_dias_restantes AS slack,
  semaforo_de(
    (dias_habiles_entre(CURRENT_DATE, o.fecha_compromiso) - dr.suma_dias_restantes)::INT,
    NULL
  ) AS semaforo
FROM op_ds od
  JOIN ops o ON o.op_num = od.op_num
  JOIN dias_restantes dr ON dr.opd_id = od.id
WHERE od.activa = true;

-- 2. v_semaforo_fase: semáforo por fase para cada OP-D activa
-- slack_fase = días hábiles entre hoy y la promesa por fase (o plan si no hay promesa)
CREATE OR REPLACE VIEW v_semaforo_fase AS
SELECT
  od.id    AS opd_id,
  pp.fase,
  dias_habiles_entre(
    CURRENT_DATE,
    COALESCE(prom.fecha_promesa, pp.due_date)
  ) AS slack_fase,
  semaforo_de(
    dias_habiles_entre(
      CURRENT_DATE,
      COALESCE(prom.fecha_promesa, pp.due_date)
    )::INT,
    pp.fase
  ) AS semaforo_fase
FROM op_ds od
  JOIN phase_plans pp ON pp.opd_id = od.id AND pp.fase >= od.fase_actual
  LEFT JOIN phase_promises prom ON prom.opd_id = od.id AND prom.fase = pp.fase
WHERE od.activa = true;

GRANT SELECT ON v_semaforo_fase TO authenticated;
