-- 0027_rol_visualizacion.sql
-- Agrega rol 'visualizacion' (solo lectura) y función para verificar acceso
-- desde el middleware sin depender de user_id (que puede estar null en primer login).

ALTER TYPE rol_sistema_enum ADD VALUE IF NOT EXISTS 'visualizacion';

-- Función usada por el middleware y auth/callback para verificar si un email
-- tiene acceso activo al sistema. SECURITY DEFINER permite llamarla con cualquier
-- rol (incluso anon antes del check de usuarios_sistema).
CREATE OR REPLACE FUNCTION check_user_access(p_email text)
RETURNS TABLE(activo boolean, rol rol_sistema_enum)
LANGUAGE sql
STABLE
SECURITY DEFINER AS $$
  SELECT activo, rol
  FROM usuarios_sistema
  WHERE email = p_email
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION check_user_access(text) TO authenticated;
GRANT EXECUTE ON FUNCTION check_user_access(text) TO anon;

-- Función de admin: lista usuarios del sistema con info de último login
-- (user_id permite cruzar con auth, pero auth.users solo es accesible con service role;
--  aquí devolvemos lo que tenemos sin cruzar con auth.users).
CREATE OR REPLACE FUNCTION get_usuarios_sistema_admin()
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER AS $$
  SELECT json_agg(row_to_json(t) ORDER BY t.created_at)
  FROM (
    SELECT id, user_id, email, nombre, rol, activo, fase_asignada,
           created_at, updated_at,
           (user_id IS NOT NULL) AS vinculado
    FROM usuarios_sistema
  ) t;
$$;

GRANT EXECUTE ON FUNCTION get_usuarios_sistema_admin() TO authenticated;
