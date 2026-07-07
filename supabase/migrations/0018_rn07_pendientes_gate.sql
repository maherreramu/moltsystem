-- 0018_rn07_pendientes_gate.sql
-- RN-07: Cierre de OP-D (avance a despacho) requiere todos sus
-- op_d_pendientes en estado 'cerrado'. Enforcement via trigger BEFORE UPDATE.

CREATE OR REPLACE FUNCTION check_pendientes_gate()
RETURNS TRIGGER AS $$
DECLARE
  n_abiertos INTEGER;
BEGIN
  IF NEW.fase_actual = 'despacho' AND OLD.fase_actual != 'despacho' THEN
    SELECT COUNT(*) INTO n_abiertos
    FROM op_d_pendientes
    WHERE opd_padre_id = NEW.id AND estado != 'cerrado';

    IF n_abiertos > 0 THEN
      RAISE EXCEPTION
        'OP-D % tiene % pendiente(s) abierto(s). Ciérralos antes de pasar a Despacho.',
        NEW.ref, n_abiertos;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_op_ds_pendientes_gate
  BEFORE UPDATE ON op_ds
  FOR EACH ROW EXECUTE FUNCTION check_pendientes_gate();
