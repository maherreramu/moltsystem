-- 0051_satelite_subestado.sql
-- Subestados de satélites con promesa por subestado (orden libre)

CREATE TYPE satelite_subestado_enum AS ENUM (
  'corte_externo',
  'marcacion',
  'confeccion',
  'paquete_completo'
);

ALTER TABLE op_ds ADD COLUMN subestado_satelite satelite_subestado_enum DEFAULT NULL;

CREATE TABLE satelite_subfase_promesa (
  opd_id      UUID                      NOT NULL REFERENCES op_ds(id) ON DELETE CASCADE,
  subestado   satelite_subestado_enum   NOT NULL,
  fecha_promesa DATE                    NOT NULL,
  set_by      TEXT                      NOT NULL,
  set_at      TIMESTAMPTZ               NOT NULL DEFAULT now(),
  PRIMARY KEY (opd_id, subestado)
);

ALTER TABLE satelite_subfase_promesa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read satelite_subfase_promesa"
  ON satelite_subfase_promesa FOR SELECT TO authenticated USING (true);

GRANT SELECT ON satelite_subfase_promesa TO authenticated;
GRANT ALL ON satelite_subfase_promesa TO service_role;

-- Nuevo tipo de evento para cambio de subestado de satélite
ALTER TYPE phase_event_tipo_enum ADD VALUE IF NOT EXISTS 'satelite_subestado_change';

-- Actualizar get_opds_data para incluir subestado_satelite
CREATE OR REPLACE FUNCTION get_opds_data()
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER AS $$
  SELECT json_agg(row_to_json(t))
  FROM (
    SELECT
      vs.opd_id,
      vs.ref,
      vs.op_num,
      vs.cliente_id,
      vs.fase_actual,
      vs.semaforo,
      vs.slack,
      vs.dias_plan_restantes,
      vs.bloqueada,
      vs.plan_congelado,
      sc.score_efectivo,
      od.detalle,
      od.cantidad,
      od.prioridad_manual,
      od.subestado_satelite,
      o.comercial,
      o.fecha_compromiso,
      ci.razon_social                                        AS cliente_nombre,
      (
        SELECT COUNT(*)::int
        FROM op_d_pendientes p
        WHERE p.opd_padre_id = vs.opd_id
          AND p.estado != 'cerrado'
      )                                                      AS pendientes
    FROM v_slack vs
    JOIN v_score sc        ON sc.opd_id   = vs.opd_id
    JOIN op_ds od          ON od.id       = vs.opd_id
    JOIN ops o             ON o.op_num    = vs.op_num
    JOIN clientes c        ON c.id        = o.cliente_id
    JOIN clientes_impel ci ON ci.id_impel = c.cliente_impel_id
    ORDER BY od.prioridad_manual ASC NULLS LAST, sc.score_efectivo DESC NULLS LAST, vs.slack ASC NULLS LAST
  ) t;
$$;

GRANT EXECUTE ON FUNCTION get_opds_data() TO authenticated;
