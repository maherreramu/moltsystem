-- 0049_semaforo_config.sql
-- Semáforo configurable: tabla de umbrales + función semaforo_de()

CREATE TABLE semaforo_config (
  scope           TEXT        NOT NULL DEFAULT 'general',  -- 'general' | 'fase'
  fase            fase_enum,                               -- NULL si scope='general'
  umbral_verde    SMALLINT    NOT NULL DEFAULT 3,
  umbral_amarillo SMALLINT    NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (scope, fase)
);

INSERT INTO semaforo_config (scope, fase, umbral_verde, umbral_amarillo)
VALUES ('general', NULL, 3, 0);

ALTER TABLE semaforo_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read semaforo_config"
  ON semaforo_config FOR SELECT TO authenticated USING (true);

GRANT SELECT ON semaforo_config TO authenticated;
GRANT ALL ON semaforo_config TO service_role;

-- semaforo_de: lee override por fase si existe, si no usa regla general
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
  SELECT umbral_verde, umbral_amarillo
    INTO v_verde, v_amarillo
    FROM semaforo_config
   WHERE scope = 'fase' AND fase = p_fase
   LIMIT 1;

  IF NOT FOUND THEN
    SELECT umbral_verde, umbral_amarillo
      INTO v_verde, v_amarillo
      FROM semaforo_config
     WHERE scope = 'general' AND fase IS NULL
     LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    v_verde := 3; v_amarillo := 0;
  END IF;

  IF slack >= v_verde    THEN RETURN 'verde';    END IF;
  IF slack >= v_amarillo THEN RETURN 'amarillo'; END IF;
  RETURN 'rojo';
END;
$$;

GRANT EXECUTE ON FUNCTION semaforo_de(INT, fase_enum) TO authenticated;
