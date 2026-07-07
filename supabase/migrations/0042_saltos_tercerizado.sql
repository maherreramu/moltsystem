-- 0042_saltos_tercerizado.sql
-- Agrega flag tercerizado a phase_plans para trazabilidad de fases saltadas
-- por rutas de tercerización: compras→satélites (paquete completo) y trazo→satélites (corte externo).

ALTER TABLE phase_plans
  ADD COLUMN IF NOT EXISTS tercerizado BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN phase_plans.tercerizado IS
  'true cuando la fase fue saltada por tercerización (corte externo, paquete completo, etc.)';
