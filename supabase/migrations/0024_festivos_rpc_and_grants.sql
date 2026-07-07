-- 0024_festivos_rpc_and_grants.sql
-- festivos_co es dato de referencia público (festivos colombianos).
-- 1) GRANT SELECT a service_role y anon para queries directas.
-- 2) get_festivos_data() SECURITY DEFINER — consistente con el patrón de RPCs
--    usadas en produccion.ts; evita depender del rol del caller.

GRANT SELECT ON TABLE festivos_co TO service_role;
GRANT SELECT ON TABLE festivos_co TO anon;

CREATE OR REPLACE FUNCTION get_festivos_data()
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER AS $$
  SELECT json_agg(fecha ORDER BY fecha) FROM festivos_co;
$$;

GRANT EXECUTE ON FUNCTION get_festivos_data() TO authenticated;
GRANT EXECUTE ON FUNCTION get_festivos_data() TO anon;
