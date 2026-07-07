-- 0046_prioridad_manual.sql
-- Prioridad de ejecución manual en op_ds.
-- NULL = sin prioridad explícita (cae al final, ordenado por score).
ALTER TABLE op_ds ADD COLUMN IF NOT EXISTS prioridad_manual INTEGER DEFAULT NULL;
