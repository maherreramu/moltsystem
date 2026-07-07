-- 0040_drop_f0_gate.sql
-- Elimina la compuerta obligatoria de F0. Los checkboxes siguen existiendo
-- como campos de seguimiento pero ya no bloquean el avance a Compras.
-- El trigger auto_freeze_baseline sigue activo: el baseline se crea igual
-- al pasar de fase_0 a compras, con el estado actual de los checkboxes.

DROP TRIGGER IF EXISTS tg_op_ds_f0_gate ON op_ds;
DROP FUNCTION IF EXISTS check_f0_gate();
