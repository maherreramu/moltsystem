-- ops solo tenía SELECT/INSERT para service_role y solo SELECT para authenticated.
-- setFechaCompromiso (y cualquier UPDATE sobre ops desde Server Actions) fallaba
-- con "permission denied for table ops".

GRANT UPDATE, DELETE ON TABLE ops TO service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE ops TO authenticated;
