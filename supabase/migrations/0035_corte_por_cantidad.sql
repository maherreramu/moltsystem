-- 0035_corte_por_cantidad.sql
-- Tracking de cantidad por tela en corte y tiqueteo + convergencia de prendas completas.
-- Reemplaza la compuerta dura RN-13 por enforcement en aplicación (ver opd-actions.ts).

-- 1) Nuevos valores de enum (van primero y solos — ADD VALUE no puede estar en la misma
--    transacción que referencias al valor nuevo en columnas/constraints/triggers)
ALTER TYPE causa_desvio_enum     ADD VALUE IF NOT EXISTS 'volumen_parcial';
ALTER TYPE causa_desvio_enum     ADD VALUE IF NOT EXISTS 'mp_incompleta';
ALTER TYPE phase_event_tipo_enum ADD VALUE IF NOT EXISTS 'avance_corte';
ALTER TYPE phase_event_tipo_enum ADD VALUE IF NOT EXISTS 'avance_tiqueteo';
