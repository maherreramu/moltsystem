-- 0077_admin_usuarios_rpc.sql
CREATE OR REPLACE FUNCTION admin_upsert_usuario(
  p_email TEXT,
  p_nombre TEXT,
  p_rol rol_sistema_enum,
  p_fases JSONB,
  p_activo BOOLEAN,
  p_auth_user_id UUID,
  p_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  f RECORD;
BEGIN
  -- Insert or Update user
  IF p_id IS NULL THEN
    INSERT INTO usuarios_sistema (email, nombre, rol, activo, user_id)
    VALUES (p_email, p_nombre, p_rol, p_activo, p_auth_user_id)
    RETURNING id INTO v_user_id;
  ELSE
    UPDATE usuarios_sistema
    SET email = p_email, nombre = p_nombre, rol = p_rol, activo = p_activo, user_id = COALESCE(p_auth_user_id, user_id)
    WHERE id = p_id
    RETURNING id INTO v_user_id;
  END IF;

  -- Delete existing phases
  DELETE FROM usuario_fases_asignadas WHERE usuario_id = v_user_id;

  -- Insert new phases
  IF p_fases IS NOT NULL THEN
    FOR f IN SELECT * FROM jsonb_to_recordset(p_fases) AS x(fase TEXT, solo_lectura BOOLEAN)
    LOOP
      INSERT INTO usuario_fases_asignadas (usuario_id, fase, solo_lectura)
      VALUES (v_user_id, f.fase::fase_enum, f.solo_lectura);
    END LOOP;
  END IF;

  -- Also check condition here in case deletion violated the rules
  IF p_rol = 'lider_fase' THEN
    IF NOT EXISTS (
      SELECT 1 FROM usuario_fases_asignadas
      WHERE usuario_id = v_user_id AND solo_lectura = false
    ) THEN
      RAISE EXCEPTION 'Un lider_fase debe tener al menos una fase operativa asignada';
    END IF;
  END IF;

  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION admin_upsert_usuario(TEXT, TEXT, rol_sistema_enum, JSONB, BOOLEAN, UUID, UUID) TO authenticated;
