-- 0029_op_ds_rename_descripcion_detalle.sql
-- Elimina op_ds.descripcion (redundante con detalle, mismo origen IMPEL).
-- Desde ahora el único campo de descripción de OP-D es detalle, alineado con IMPEL.

ALTER TABLE op_ds DROP COLUMN IF EXISTS descripcion;
