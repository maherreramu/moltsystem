-- 0013_fix_op_num_seq.sql
-- Correcciones de diseño basadas en los campos reales de IMPEL:
--
-- Fuentes:
--   Todas OP.xlsx              → Campo de Identificacion = ID único IMPEL de la OP
--                               Num-OP = número de OP (sin prefijo "OP-")
--   Todas Orden de Producción  → Id. = ID único IMPEL del OP-D (ya en impel_id)
--                               Secuencia = número de secuencia dentro de la OP
--                               Detalle = texto multilinea (preservar \n)
--
-- Cambios:
--   1. ops: agregar impel_id (Campo de Identificacion) + quitar prefijo "OP-" de op_num
--   2. op_ds: agregar seq (Secuencia) + quitar prefijo "OP-" de op_num FK
--   3. op_ds: CHECK ref = op_num || '-' || seq + UNIQUE (op_num, seq)
--   4. descripcion: TEXT ya soporta multilinea — el fix es en el ETL (inserts parametrizados)

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 1. ops — agregar impel_id + normalizar op_num
-- ═══════════════════════════════════════════════════════════════════

-- ID único de IMPEL para la OP (Campo de Identificacion en Todas OP.xlsx)
-- Nullable inicialmente; se rellena en el próximo ETL sync
ALTER TABLE ops ADD COLUMN impel_id TEXT;
CREATE UNIQUE INDEX idx_ops_impel_id ON ops(impel_id) WHERE impel_id IS NOT NULL;

-- Quitar prefijo "OP-" del PK: "OP-6659" → "6659"
-- Requiere soltar FK de op_ds primero
ALTER TABLE op_ds DROP CONSTRAINT op_ds_op_num_fkey;

UPDATE ops SET op_num = REPLACE(op_num, 'OP-', '') WHERE op_num LIKE 'OP-%';
UPDATE op_ds SET op_num = REPLACE(op_num, 'OP-', '') WHERE op_num LIKE 'OP-%';

-- Restaurar FK (ahora con ON UPDATE CASCADE para soportar futuros renames)
ALTER TABLE op_ds
  ADD CONSTRAINT op_ds_op_num_fkey
  FOREIGN KEY (op_num) REFERENCES ops(op_num) ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- 2. op_ds — agregar seq (Secuencia de IMPEL, no calculado)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE op_ds ADD COLUMN seq SMALLINT;

-- Poblar seq desde ref existente: "6659-1" → seq=1
-- (hasta que el próximo ETL lo rellene directamente desde Secuencia)
UPDATE op_ds
SET seq = SPLIT_PART(ref, '-', 2)::SMALLINT
WHERE ref ~ '^[A-Za-z0-9]+-\d+$';

ALTER TABLE op_ds ALTER COLUMN seq SET NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 3. Garantías de consistencia en op_ds
-- ═══════════════════════════════════════════════════════════════════

-- ref siempre debe ser op_num || '-' || seq (clave de negocio derivada)
ALTER TABLE op_ds
  ADD CONSTRAINT ref_equals_op_seq
  CHECK (ref = op_num || '-' || seq::text);

-- Clave natural de negocio: una OP tiene una sola OP-D por secuencia
CREATE UNIQUE INDEX idx_op_ds_op_seq ON op_ds (op_num, seq);

COMMIT;
