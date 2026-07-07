-- 0031_lead_time_sync_estandar.sql
-- Sincroniza los valores 'estandar' de lead_time_recurso con los días definitivos.
-- Agrega fila estandar para corte (que faltaba) y corrige los desfasados.

INSERT INTO lead_time_recurso (fase, recurso, dias_default, condiciones)
VALUES ('corte', 'estandar', 4, 'Caso base')
ON CONFLICT (fase, recurso) DO NOTHING;

UPDATE lead_time_recurso SET dias_default = 7  WHERE fase = 'compras'   AND recurso = 'estandar';
UPDATE lead_time_recurso SET dias_default = 24 WHERE fase = 'satelites' AND recurso = 'estandar';
UPDATE lead_time_recurso SET dias_default = 5  WHERE fase = 'empaque'   AND recurso = 'estandar';
UPDATE lead_time_recurso SET dias_default = 0  WHERE fase = 'despacho'  AND recurso = 'estandar';

-- Permitir edición desde la UI (solo admin en Server Action, pero el grant es necesario)
GRANT UPDATE ON lead_time_recurso TO authenticated;
