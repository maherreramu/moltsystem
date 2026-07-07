-- 0014_rls_read_authenticated.sql
-- Políticas de lectura para usuarios autenticados — iter-1.
-- Todos los usuarios autenticados pueden leer todos los datos de producción.
-- Acceso granular por rol/fase se implementa en iter-1.5.

ALTER TABLE clientes_impel       ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sedes_cliente        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE op_ds                ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_plans          ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_plans_baseline ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE op_d_pendientes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_time_recurso    ENABLE ROW LEVEL SECURITY;
ALTER TABLE festivos_co          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_clientes_impel"    ON clientes_impel     FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_clientes"          ON clientes           FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_sedes"             ON sedes_cliente      FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_ops"               ON ops                FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_op_ds"             ON op_ds              FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_phase_plans"       ON phase_plans        FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_baseline"          ON phase_plans_baseline FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_events"            ON phase_events       FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_pendientes"        ON op_d_pendientes    FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_lead_time"         ON lead_time_recurso  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_festivos"          ON festivos_co        FOR SELECT TO authenticated USING (true);
