-- 0066_cron_archivar_cierre.sql
-- Programa la ejecución diaria de archivar_cerrados_viejos() a las 3 AM UTC.
-- Inactiva OP-Ds que llevan más de 30 días en fase 'cierre'.

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'archivar-cerrados-30d',
  '0 3 * * *',
  $$ SELECT archivar_cerrados_viejos(); $$
);
