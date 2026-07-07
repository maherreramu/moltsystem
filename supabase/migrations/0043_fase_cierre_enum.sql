-- 0043_fase_cierre_enum.sql
-- AISLADA: ADD VALUE de enum no puede usarse en la misma transacción que lo referencia.
-- Agrega 'cierre' al final del flujo productivo.

ALTER TYPE fase_enum ADD VALUE IF NOT EXISTS 'cierre' AFTER 'despacho';
