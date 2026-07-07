-- 0053: permisos de escritura faltantes en op_d_prioridad_fase (0052 solo otorgó SELECT)
GRANT INSERT, UPDATE, DELETE ON op_d_prioridad_fase TO authenticated;

CREATE POLICY "authenticated write op_d_prioridad_fase"
  ON op_d_prioridad_fase
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
