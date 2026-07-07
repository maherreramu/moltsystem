-- 0048_higiene_iter15.sql
-- Higiene de seguridad sobre objetos creados en iter-1.5:
-- 1. SET search_path en check_cierre_gate y auto_inactivar_al_cerrar (WARN advisor).
-- 2. Elimina policies RLS always-true de escritura en phase_promises.
--    Los writes legítimos van por service role (bypassa RLS); la autorización
--    fina vive en assertPuedeEditarFase() del Server Action.

-- ─── 1. search_path en triggers de cierre ────────────────────────────────────

CREATE OR REPLACE FUNCTION check_cierre_gate()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.fase_actual = 'cierre' AND OLD.fase_actual <> 'despacho' THEN
    RAISE EXCEPTION
      'OP-D % solo puede cerrarse desde la fase Despacho (fase actual: %)',
      NEW.ref, OLD.fase_actual;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

CREATE OR REPLACE FUNCTION auto_inactivar_al_cerrar()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.fase_actual = 'cierre' AND OLD.fase_actual <> 'cierre' THEN
    NEW.activa := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- ─── 2. Eliminar policies RLS always-true de escritura en phase_promises ─────

DROP POLICY IF EXISTS "authenticated insert phase_promises" ON phase_promises;
DROP POLICY IF EXISTS "authenticated update phase_promises" ON phase_promises;
