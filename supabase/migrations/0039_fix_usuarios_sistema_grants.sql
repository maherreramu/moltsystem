-- Fix: usuarios_sistema missing INSERT/UPDATE/DELETE grants
-- service_role needs full DML to bypass RLS and perform admin writes
-- authenticated needs INSERT/UPDATE/DELETE so RLS admin_write policy can be enforced

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.usuarios_sistema TO service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.usuarios_sistema TO authenticated;
