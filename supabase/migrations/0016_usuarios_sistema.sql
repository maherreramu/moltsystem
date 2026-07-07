-- 0016_usuarios_sistema.sql
-- Tabla de roles del sistema iter-1.
-- Roles actuales: admin | directivo
-- Rol futuro (iter-1.5): lider_fase (con fase_asignada NOT NULL)

CREATE TYPE rol_sistema_enum AS ENUM ('admin', 'directivo', 'lider_fase');

CREATE TABLE usuarios_sistema (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  email         TEXT UNIQUE NOT NULL,
  rol           rol_sistema_enum NOT NULL DEFAULT 'directivo',
  -- Solo para lider_fase en iter-1.5
  fase_asignada fase_enum,
  nombre        TEXT,
  activo        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT lider_requiere_fase CHECK (
    (rol = 'lider_fase' AND fase_asignada IS NOT NULL) OR
    (rol != 'lider_fase')
  )
);

CREATE TRIGGER usuarios_sistema_updated_at
  BEFORE UPDATE ON usuarios_sistema
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX idx_usuarios_sistema_user_id ON usuarios_sistema(user_id);

-- Función: rol del usuario actual (usa en Server Actions para validar permisos)
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS rol_sistema_enum AS $$
  SELECT rol FROM usuarios_sistema
  WHERE user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Función: ¿es admin el usuario actual?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM usuarios_sistema
    WHERE user_id = auth.uid() AND rol = 'admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER TABLE usuarios_sistema ENABLE ROW LEVEL SECURITY;

-- Cada usuario ve su propia fila; admin ve todos
CREATE POLICY "users_read_own"
  ON usuarios_sistema FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin());

-- Solo admin puede modificar la tabla
CREATE POLICY "admin_write"
  ON usuarios_sistema FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

GRANT SELECT ON usuarios_sistema  TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin()    TO authenticated;

-- Seed inicial: Mateo como admin
-- user_id se vincula al primer login (ver 0017_link_user_id.sql o manualmente)
INSERT INTO usuarios_sistema (email, rol, nombre)
VALUES ('mateo.herrera@molt.com.co', 'admin', 'Mateo Herrera');
