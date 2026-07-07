-- 0062_user_ui_prefs.sql
-- Preferencias de UI por usuario (visibilidad/orden de columnas + sort de filas).
-- Una fila por usuario, JSONB con clave por vista ("gantt", "gantt-por-fase", etc.)
-- para extender a otras vistas sin cambiar el esquema.

CREATE TABLE user_ui_prefs (
  user_id    UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  prefs      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER user_ui_prefs_updated_at
  BEFORE UPDATE ON user_ui_prefs
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE user_ui_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_prefs"
  ON user_ui_prefs FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON user_ui_prefs TO authenticated;

-- RPC: merge atómico de un fragmento de prefs para una vista.
-- Hace INSERT ... ON CONFLICT para crear la fila la primera vez,
-- y luego merge superficial del objeto de la vista.
CREATE OR REPLACE FUNCTION save_ui_pref(p_view_key text, p_patch jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_ui_prefs (user_id, prefs)
    VALUES (auth.uid(), jsonb_build_object(p_view_key, p_patch))
  ON CONFLICT (user_id) DO UPDATE
    SET prefs = user_ui_prefs.prefs || jsonb_build_object(
          p_view_key,
          COALESCE(user_ui_prefs.prefs -> p_view_key, '{}'::jsonb) || p_patch
        ),
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION save_ui_pref(text, jsonb) TO authenticated;
