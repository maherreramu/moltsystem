-- 0026_clientes_homologacion_manual.sql
-- Extiende clientes con: homologación no destructiva (alias→canónico),
-- flag de cliente manual, vista v_cliente_efectivo para resolución de atributos,
-- actualización de v_score para leer atributos vía homologación,
-- RPC get_clientes_data() y políticas RLS de escritura para admin/directivos.

-- ─── 1. Columnas nuevas en clientes ─────────────────────────────────────────
ALTER TABLE clientes
  ADD COLUMN homologado_a UUID NULL REFERENCES clientes(id),
  ADD COLUMN es_manual    BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE clientes
  ADD CONSTRAINT chk_no_self_homologacion
  CHECK (homologado_a IS NULL OR homologado_a <> id);

CREATE INDEX idx_clientes_homologado_a ON clientes(homologado_a)
  WHERE homologado_a IS NOT NULL;

-- ─── 2. Vista v_cliente_efectivo ─────────────────────────────────────────────
-- Resuelve los 4 atributos de score a través de la homologación (1 nivel).
-- Si homologado_a IS NULL → usa los atributos propios.
-- Si homologado_a = X    → usa los atributos de X.
CREATE OR REPLACE VIEW v_cliente_efectivo AS
SELECT
  c.id                               AS cliente_id,
  COALESCE(c.homologado_a, c.id)     AS canonical_id,
  canon.tier,
  canon.tipo_relacion,
  canon.condicion_pago,
  canon.complejidad_tipica
FROM clientes c
JOIN clientes canon ON canon.id = COALESCE(c.homologado_a, c.id);

GRANT SELECT ON v_cliente_efectivo TO authenticated;

-- ─── 3. Recrear v_score con atributos vía v_cliente_efectivo ─────────────────
-- Preserva el fix N+1 (CTE opds_por_op). primera_vez sigue viniendo de op_ds.
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
    CASE ce.tipo_relacion
      WHEN 'contrato_con_penalizacion' THEN 20
      WHEN 'contrato_sin_penalizacion' THEN 12
      WHEN 'recurrente'               THEN 6
      ELSE 0
    END AS pts_contractual
  FROM op_ds od
  JOIN ops o ON o.op_num = od.op_num
  JOIN v_cliente_efectivo ce ON ce.cliente_id = o.cliente_id
),
estrategico AS (
  SELECT
    od.id AS opd_id,
    CASE
      WHEN od.primera_vez       THEN 15
      WHEN ce.tier = 'tier_1'   THEN 20
      WHEN ce.tier = 'tier_2'   THEN 10
      ELSE 4
    END AS pts_estrategico
  FROM op_ds od
  JOIN ops o ON o.op_num = od.op_num
  JOIN v_cliente_efectivo ce ON ce.cliente_id = o.cliente_id
),
opds_por_op AS (
  SELECT op_num, COUNT(*)::int AS cnt
  FROM op_ds WHERE activa = true
  GROUP BY op_num
),
volumen AS (
  SELECT
    od.id AS opd_id,
    CASE ce.complejidad_tipica
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
  JOIN ops o              ON o.op_num   = od.op_num
  JOIN v_cliente_efectivo ce ON ce.cliente_id = o.cliente_id
  JOIN opds_por_op opc    ON opc.op_num = od.op_num
),
caja AS (
  SELECT
    od.id AS opd_id,
    CASE ce.condicion_pago
      WHEN 'anticipado' THEN 15
      WHEN 'hasta_30d'  THEN 15
      WHEN '30_a_60d'   THEN 8
      ELSE 3
    END AS pts_caja
  FROM op_ds od
  JOIN ops o ON o.op_num = od.op_num
  JOIN v_cliente_efectivo ce ON ce.cliente_id = o.cliente_id
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

-- ─── 4. RPC get_clientes_data() ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_clientes_data()
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER AS $$
  SELECT json_agg(row_to_json(t) ORDER BY t.n_ops_activas DESC, t.nombre ASC)
  FROM (
    SELECT
      c.id,
      ci.razon_social                    AS nombre,
      c.tier,
      c.tipo_relacion,
      c.condicion_pago,
      c.complejidad_tipica,
      c.es_manual,
      c.homologado_a,
      ci_canon.razon_social              AS homologado_a_nombre,
      COALESCE(aop.n_ops, 0)::int        AS n_ops_activas
    FROM clientes c
    JOIN clientes_impel ci           ON ci.id_impel = c.cliente_impel_id
    LEFT JOIN clientes c_canon       ON c_canon.id  = c.homologado_a
    LEFT JOIN clientes_impel ci_canon ON ci_canon.id_impel = c_canon.cliente_impel_id
    LEFT JOIN (
      SELECT cliente_id, COUNT(*)::int AS n_ops
      FROM ops WHERE activa = true
      GROUP BY cliente_id
    ) aop ON aop.cliente_id = c.id
  ) t;
$$;

GRANT EXECUTE ON FUNCTION get_clientes_data() TO authenticated;

-- ─── 5. RLS: escritura en clientes para admin y directivos ───────────────────
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY clientes_read_authenticated ON clientes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY clientes_write_admin_directivo ON clientes
  FOR ALL TO authenticated
  USING     (get_my_role() IN ('admin', 'directivo'))
  WITH CHECK(get_my_role() IN ('admin', 'directivo'));
