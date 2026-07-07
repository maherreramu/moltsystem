-- 0017_rls_write_authenticated.sql
-- Políticas de escritura para usuarios autenticados — iter-1.
-- Control fino de roles en iter-1.5 via get_my_role().

CREATE POLICY "auth_update_op_ds"
  ON op_ds FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_insert_events"
  ON phase_events FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_insert_pendientes"
  ON op_d_pendientes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_update_pendientes"
  ON op_d_pendientes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

GRANT INSERT, UPDATE ON op_ds           TO authenticated;
GRANT INSERT         ON phase_events    TO authenticated;
GRANT INSERT, UPDATE ON op_d_pendientes TO authenticated;
GRANT EXECUTE ON FUNCTION recalc_pull(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION freeze_baseline(uuid, text) TO authenticated;
