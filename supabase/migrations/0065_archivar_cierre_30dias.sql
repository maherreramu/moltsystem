-- 0065_archivar_cierre_30dias.sql
-- Las OP-Ds en fase 'cierre' se inactivan automáticamente a los 30 días.
--
-- 1. Columna cerrado_at: timestamp del momento en que la OP-D pasa a cierre.
-- 2. Trigger: registra cerrado_at al transicionar a cierre.
-- 3. Función archivar_cerrados_viejos(): inactiva las que llevan >30 días en cierre.
--    Invocar diariamente desde Supabase Dashboard → Database → Cron Jobs.

-- ─── 1. Columna ───────────────────────────────────────────────────────────────
ALTER TABLE op_ds ADD COLUMN IF NOT EXISTS cerrado_at TIMESTAMPTZ;

-- Retroactivo: las OP-Ds ya en cierre usan created_at del último phase_event de cierre
UPDATE op_ds od
SET cerrado_at = (
  SELECT MAX(pe.ts)
  FROM phase_events pe
  WHERE pe.opd_id = od.id
    AND pe.payload->>'hacia' = 'cierre'
)
WHERE od.fase_actual = 'cierre'
  AND od.cerrado_at IS NULL;

-- ─── 2. Trigger: registrar cerrado_at al pasar a cierre ───────────────────────
CREATE OR REPLACE FUNCTION registrar_cerrado_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.fase_actual = 'cierre' AND (OLD.fase_actual IS DISTINCT FROM NEW.fase_actual) THEN
    NEW.cerrado_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

DROP TRIGGER IF EXISTS tg_op_ds_registrar_cerrado_at ON op_ds;
CREATE TRIGGER tg_op_ds_registrar_cerrado_at
  BEFORE UPDATE ON op_ds
  FOR EACH ROW EXECUTE FUNCTION registrar_cerrado_at();

-- ─── 3. Función de archivado ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION archivar_cerrados_viejos()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INT;
BEGIN
  UPDATE op_ds
  SET activa = false
  WHERE fase_actual = 'cierre'
    AND activa = true
    AND cerrado_at < now() - INTERVAL '30 days';

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION archivar_cerrados_viejos() TO authenticated;
