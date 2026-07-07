-- 0022_realtime_publication.sql
-- Habilita Supabase Realtime para las tablas que disparan refresco de UI.
-- RLS SELECT para authenticated ya existe (0014_rls_read_authenticated.sql),
-- requisito para que postgres_changes entregue eventos al cliente.

ALTER PUBLICATION supabase_realtime ADD TABLE op_ds;
ALTER PUBLICATION supabase_realtime ADD TABLE op_d_pendientes;
