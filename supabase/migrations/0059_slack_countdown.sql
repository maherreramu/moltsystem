-- 0059: slack como conteo regresivo + semáforo de fase configurable por separado
--
-- Antes: slack = dias_a_compromiso − suma_dias_plan_restantes (margen/buffer)
-- Ahora: slack = dias_habiles_entre(hoy, fecha_compromiso)   (conteo regresivo simple)
--        slack_fase ya era días a due_date de la fase — sin cambio de fórmula
--
-- Para que ambos semáforos sean configurables por separado se agrega
-- scope = 'fase_general': umbrales default para el semáforo de fase.
-- semaforo_de() lo resuelve en cascada: fase específica → fase_general → general.

-- 1. Agregar scope='fase_general' a semaforo_config con defaults razonables
--    para un conteo regresivo de días a due_date de fase (magnitudes menores que
--    días a compromiso comercial).
INSERT INTO semaforo_config (scope, fase, umbral_verde, umbral_amarillo)
VALUES ('fase_general', NULL, 5, 2)
ON CONFLICT (scope, fase) DO NOTHING;

-- 2. Actualizar umbrales de scope='general' para el nuevo significado
--    (días a fecha_compromiso, no margen). Verde ≥ 15, Amarillo ≥ 7.
UPDATE semaforo_config
   SET umbral_verde = 15, umbral_amarillo = 7, updated_at = NOW()
 WHERE scope = 'general' AND fase IS NULL;

-- 3. Actualizar semaforo_de() para resolver en cascada:
--    si p_fase IS NOT NULL: fase_específica → fase_general → general
--    si p_fase IS NULL:     general
CREATE OR REPLACE FUNCTION semaforo_de(slack INT, p_fase fase_enum DEFAULT NULL)
RETURNS semaforo_enum
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verde    SMALLINT;
  v_amarillo SMALLINT;
BEGIN
  IF p_fase IS NOT NULL THEN
    -- 1. Override específico de fase
    SELECT umbral_verde, umbral_amarillo
      INTO v_verde, v_amarillo
      FROM semaforo_config
     WHERE scope = 'fase' AND fase = p_fase
     LIMIT 1;

    -- 2. Default para semáforo de fase
    IF NOT FOUND THEN
      SELECT umbral_verde, umbral_amarillo
        INTO v_verde, v_amarillo
        FROM semaforo_config
       WHERE scope = 'fase_general' AND fase IS NULL
       LIMIT 1;
    END IF;
  END IF;

  -- 3. Fallback: regla general (también es el único camino cuando p_fase IS NULL)
  IF NOT FOUND THEN
    SELECT umbral_verde, umbral_amarillo
      INTO v_verde, v_amarillo
      FROM semaforo_config
     WHERE scope = 'general' AND fase IS NULL
     LIMIT 1;
  END IF;

  -- 4. Hardcode de emergencia
  IF NOT FOUND THEN
    v_verde := 15; v_amarillo := 7;
  END IF;

  IF slack >= v_verde    THEN RETURN 'verde';    END IF;
  IF slack >= v_amarillo THEN RETURN 'amarillo'; END IF;
  RETURN 'rojo';
END;
$$;

GRANT EXECUTE ON FUNCTION semaforo_de(INT, fase_enum) TO authenticated;

-- 4. Actualizar v_slack: slack = días hábiles hasta fecha_compromiso (conteo regresivo)
--    tipos originales: dias_hasta_compromiso = integer, slack = bigint
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
  dr.suma_dias_restantes                                         AS dias_plan_restantes,
  dias_habiles_entre(CURRENT_DATE, o.fecha_compromiso)           AS dias_hasta_compromiso,
  dias_habiles_entre(CURRENT_DATE, o.fecha_compromiso)::bigint   AS slack,
  semaforo_de(
    dias_habiles_entre(CURRENT_DATE, o.fecha_compromiso)::INT,
    NULL
  ) AS semaforo
FROM op_ds od
  JOIN ops o ON o.op_num = od.op_num
  JOIN dias_restantes dr ON dr.opd_id = od.id
WHERE od.activa = true;
