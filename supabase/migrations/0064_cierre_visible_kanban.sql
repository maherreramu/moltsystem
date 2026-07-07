-- 0064_cierre_visible_kanban.sql
-- Hace visible la fase 'cierre' en el Kanban/Tabla/Gantt.
--
-- 1. auto_inactivar_al_cerrar: ya no pone activa=false al pasar a cierre.
--    Cierre es una fase visible; activa=false queda para archivado explícito.
-- 2. check_cierre_gate: solo dispara cuando la fase_actual cambia efectivamente
--    (evita falsos positivos al actualizar otros campos como activa).

-- ─── 1. No auto-inactivar al cerrar ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_inactivar_al_cerrar()
RETURNS TRIGGER AS $$
BEGIN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- ─── 2. Gate solo cuando la fase realmente cambia ─────────────────────────────
CREATE OR REPLACE FUNCTION check_cierre_gate()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.fase_actual = 'cierre'
    AND OLD.fase_actual IS DISTINCT FROM NEW.fase_actual
    AND OLD.fase_actual <> 'despacho'
  THEN
    RAISE EXCEPTION 'OP-D % solo puede cerrarse desde la fase Despacho (fase actual: %)',
      NEW.ref, OLD.fase_actual;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;
