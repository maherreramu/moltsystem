-- 0030_categorias_proc.sql
-- Normaliza la categoría de proceso de OP-D a una tabla propia.
-- Los valores vienen de IMPEL (limpios, sin el guion trailing).
-- Se puede añadir categorías manuales y reasignar cualquier OP-D.

CREATE TABLE categorias_proc (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     TEXT NOT NULL UNIQUE,
  activa     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_categorias_proc_updated_at
  BEFORE UPDATE ON categorias_proc
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Reemplazar la columna TEXT por FK
ALTER TABLE op_ds
  DROP COLUMN IF EXISTS categoria_proc,
  ADD  COLUMN categoria_proc_id UUID REFERENCES categorias_proc(id);

GRANT SELECT ON categorias_proc TO authenticated;
GRANT INSERT, UPDATE ON categorias_proc TO authenticated;
