-- 0044_fase_cierre_uso.sql
-- Compuerta de cierre: no puede avanzar a cierre si la OP-D no está en despacho.
-- Al entrar a cierre se marca activa=false para sacarla del tablero operativo.

-- ─── Gate: solo desde despacho se puede pasar a cierre ───────────────────────
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_op_ds_cierre_gate
  BEFORE UPDATE ON op_ds
  FOR EACH ROW EXECUTE FUNCTION check_cierre_gate();

-- ─── Al cerrar, marcar activa=false ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_inactivar_al_cerrar()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.fase_actual = 'cierre' AND OLD.fase_actual <> 'cierre' THEN
    NEW.activa := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_op_ds_auto_inactivar
  BEFORE UPDATE ON op_ds
  FOR EACH ROW EXECUTE FUNCTION auto_inactivar_al_cerrar();

-- ─── Tipo de evento para cierre ──────────────────────────────────────────────
ALTER TYPE phase_event_tipo_enum ADD VALUE IF NOT EXISTS 'op_cierre' AFTER 'pendiente_status_change';
