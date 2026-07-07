-- 0028_op_ds_productos_categoria.sql
-- Agrega columnas de clasificación de producto provenientes de IMPEL (Todas Orden de Producción Det.xlsx).
-- productos     → columna "Productos" de IMPEL (nombre/tipo de prenda)
-- categoria_proc → columna "Categoría Proc" de IMPEL (categoría de proceso productivo)

ALTER TABLE op_ds
  ADD COLUMN IF NOT EXISTS productos      TEXT,
  ADD COLUMN IF NOT EXISTS categoria_proc TEXT;

COMMENT ON COLUMN op_ds.productos      IS 'Nombre/tipo de prenda desde IMPEL (col "Productos")';
COMMENT ON COLUMN op_ds.categoria_proc IS 'Categoría de proceso productivo desde IMPEL (col "Categoría Proc")';
