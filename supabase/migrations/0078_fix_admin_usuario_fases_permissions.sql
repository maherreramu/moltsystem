-- 0078_fix_admin_usuario_fases_permissions.sql
-- Fix admin user phase assignment edits:
-- - usuario_fases_asignadas needs service_role grants for server-side reads/writes.
-- - admin_upsert_usuario must run as SECURITY DEFINER because it edits RLS-protected
--   admin tables, but it still validates that the caller is an active admin.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.usuario_fases_asignadas TO service_role;

CREATE OR REPLACE FUNCTION public.admin_upsert_usuario(
  p_email TEXT,
  p_nombre TEXT,
  p_rol rol_sistema_enum,
  p_fases JSONB,
  p_activo BOOLEAN,
  p_auth_user_id UUID,
  p_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  f RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM usuarios_sistema
    WHERE user_id = auth.uid()
      AND rol = 'admin'
      AND activo = true
  ) THEN
    RAISE EXCEPTION 'Solo el administrador puede gestionar usuarios';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO usuarios_sistema (email, nombre, rol, activo, user_id)
    VALUES (p_email, p_nombre, p_rol, p_activo, p_auth_user_id)
    RETURNING id INTO v_user_id;
  ELSE
    UPDATE usuarios_sistema
    SET email = p_email,
        nombre = p_nombre,
        rol = p_rol,
        activo = p_activo,
        user_id = COALESCE(p_auth_user_id, user_id)
    WHERE id = p_id
    RETURNING id INTO v_user_id;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  DELETE FROM usuario_fases_asignadas WHERE usuario_id = v_user_id;

  IF p_fases IS NOT NULL THEN
    FOR f IN SELECT * FROM jsonb_to_recordset(p_fases) AS x(fase TEXT, solo_lectura BOOLEAN)
    LOOP
      INSERT INTO usuario_fases_asignadas (usuario_id, fase, solo_lectura)
      VALUES (v_user_id, f.fase::fase_enum, COALESCE(f.solo_lectura, false));
    END LOOP;
  END IF;

  IF p_rol = 'lider_fase' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM usuario_fases_asignadas
      WHERE usuario_id = v_user_id
        AND solo_lectura = false
    ) THEN
      RAISE EXCEPTION 'Un lider_fase debe tener al menos una fase operativa asignada';
    END IF;
  END IF;

  RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_usuario(TEXT, TEXT, rol_sistema_enum, JSONB, BOOLEAN, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_usuario(TEXT, TEXT, rol_sistema_enum, JSONB, BOOLEAN, UUID, UUID) TO authenticated;
