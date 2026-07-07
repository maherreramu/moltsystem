-- Fix: lead_time_recurso nunca tuvo GRANT a service_role → 403 en /admin/config
-- Espejo del patrón de 0067 (phase_promises, op_d_componentes, user_ui_prefs)
GRANT SELECT, UPDATE ON lead_time_recurso TO service_role;
