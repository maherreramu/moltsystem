-- 0071_multi_fase_lider.sql
-- 1. Crear tabla puente
CREATE TABLE usuario_fases_asignadas (
  usuario_id  UUID NOT NULL REFERENCES usuarios_sistema(id) ON DELETE CASCADE,
  fase        fase_enum NOT NULL,
  solo_lectura BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (usuario_id, fase)
);

-- 2. Migrar datos existentes → fases operativas
INSERT INTO usuario_fases_asignadas (usuario_id, fase, solo_lectura)
SELECT id, fase_asignada, false
FROM usuarios_sistema
WHERE fase_asignada IS NOT NULL;

-- 3. Fases de lectura para líderes de satélites existentes
-- Esto migra la visibilidad (trazo, corte, tiqueteo) que actualmente estaba
-- hardcodeada en el código frontend hacia la base de datos.
INSERT INTO usuario_fases_asignadas (usuario_id, fase, solo_lectura)
SELECT id, f.fase, true
FROM usuarios_sistema
CROSS JOIN (VALUES ('trazo'::fase_enum), ('corte'::fase_enum), ('tiqueteo'::fase_enum)) AS f(fase)
WHERE fase_asignada = 'satelites' AND rol = 'lider_fase'
ON CONFLICT DO NOTHING;

-- 4. Eliminar constraint y columna vieja
ALTER TABLE usuarios_sistema DROP CONSTRAINT IF EXISTS lider_requiere_fase;
ALTER TABLE usuarios_sistema DROP COLUMN fase_asignada;

-- 5. Constraint trigger: lider_fase debe tener ≥1 fase operativa
CREATE OR REPLACE FUNCTION tg_lider_requiere_fase()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.rol = 'lider_fase' THEN
    IF NOT EXISTS (
      SELECT 1 FROM usuario_fases_asignadas
      WHERE usuario_id = NEW.id AND solo_lectura = false
    ) THEN
      RAISE EXCEPTION 'Un lider_fase debe tener al menos una fase operativa asignada';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER tr_lider_requiere_fase
AFTER INSERT OR UPDATE ON usuarios_sistema
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION tg_lider_requiere_fase();

-- 6. RLS
ALTER TABLE usuario_fases_asignadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_fases" ON usuario_fases_asignadas FOR SELECT TO authenticated
  USING (usuario_id = (SELECT id FROM usuarios_sistema WHERE user_id = auth.uid()) OR EXISTS (SELECT 1 FROM usuarios_sistema WHERE user_id = auth.uid() AND rol = 'admin'));
CREATE POLICY "admin_write_fases" ON usuario_fases_asignadas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM usuarios_sistema WHERE user_id = auth.uid() AND rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM usuarios_sistema WHERE user_id = auth.uid() AND rol = 'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON usuario_fases_asignadas TO authenticated;

-- 7. Actualizar get_usuarios_sistema_admin()
CREATE OR REPLACE FUNCTION get_usuarios_sistema_admin()
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_agg(row_to_json(t) ORDER BY t.created_at)
  FROM (
    SELECT u.id, u.user_id, u.email, u.nombre, u.rol, u.activo, u.created_at, u.updated_at, (u.user_id IS NOT NULL) AS vinculado,
      COALESCE(
        (SELECT json_agg(json_build_object('fase', ufa.fase, 'solo_lectura', ufa.solo_lectura))
         FROM usuario_fases_asignadas ufa WHERE ufa.usuario_id = u.id), '[]'::json
      ) AS fases_asignadas
    FROM usuarios_sistema u
  ) t;
$$;
