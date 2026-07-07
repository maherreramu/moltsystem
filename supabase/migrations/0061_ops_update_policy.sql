-- 0061_ops_update_policy.sql
-- ops tenía RLS habilitado pero solo política SELECT (auth_read_ops).
-- setFechaCompromiso / setFechaCompromisoMultiple / updateEstadoImpel corren como
-- rol 'authenticated' (createServiceClient adjunta el JWT del usuario vía cookies),
-- por lo que el UPDATE era filtrado a 0 filas por RLS pese al GRANT de fix_ops_permisos.
-- Espeja el patrón de auth_update_op_ds (migración 0017).

CREATE POLICY "auth_update_ops"
  ON ops FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
