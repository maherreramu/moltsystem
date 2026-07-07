-- 0035b_corte_columnas.sql
-- Columnas de cantidad, backfill, constraints, trigger derivado, drop RN-13, índice.

-- 2) Nuevas columnas de cantidad en op_d_componentes
ALTER TABLE op_d_componentes
  ADD COLUMN IF NOT EXISTS cantidad_objetivo   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cantidad_cortada    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cantidad_tiqueteada INT NOT NULL DEFAULT 0;

-- 3) Backfill: objetivo = cantidad de la OP-D; cortada según el boolean previo
UPDATE op_d_componentes c
SET cantidad_objetivo    = od.cantidad,
    cantidad_cortada     = CASE WHEN c.cortado THEN od.cantidad ELSE 0 END,
    cantidad_tiqueteada  = 0
FROM op_ds od
WHERE od.id = c.opd_id;

-- 4) Constraints de coherencia (DESPUÉS del backfill para no fallar con filas legacy)
ALTER TABLE op_d_componentes
  ADD CONSTRAINT chk_cortada_lte_objetivo   CHECK (cantidad_cortada    <= cantidad_objetivo),
  ADD CONSTRAINT chk_tiqueteada_lte_cortada CHECK (cantidad_tiqueteada <= cantidad_cortada);

-- 5) cortado pasa a ser DERIVADO de las cantidades (INSERT y UPDATE)
CREATE OR REPLACE FUNCTION sync_cortado_from_cantidad()
RETURNS TRIGGER AS $$
BEGIN
  NEW.cortado := (NEW.cantidad_objetivo > 0 AND NEW.cantidad_cortada >= NEW.cantidad_objetivo);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_cortado ON op_d_componentes;
CREATE TRIGGER trg_sync_cortado
  BEFORE INSERT OR UPDATE ON op_d_componentes
  FOR EACH ROW EXECUTE FUNCTION sync_cortado_from_cantidad();

-- 6) Eliminar compuerta dura RN-13 (reemplazada por lógica de aplicación)
DROP TRIGGER IF EXISTS tg_op_ds_corte_gate ON op_ds;
DROP FUNCTION IF EXISTS check_corte_gate();

-- 7) Índice de soporte para convergencia / progreso
CREATE INDEX IF NOT EXISTS idx_componentes_cantidades
  ON op_d_componentes (opd_id, cantidad_objetivo, cantidad_cortada, cantidad_tiqueteada);
