-- 0015_grant_views_authenticated.sql
-- GRANT SELECT en vistas y tablas para rol authenticated.
-- Las vistas necesitan grant explícito además de las políticas RLS.

GRANT SELECT ON v_slack                 TO authenticated;
GRANT SELECT ON v_score                 TO authenticated;
GRANT SELECT ON v_semaforo_op           TO authenticated;
GRANT SELECT ON v_plan_vs_real          TO authenticated;
GRANT SELECT ON v_pendientes_abiertos   TO authenticated;
GRANT SELECT ON v_foco_semanal          TO authenticated;
GRANT SELECT ON v_mi_fase_hoy           TO authenticated;
GRANT SELECT ON v_capacidad_semana_fase TO authenticated;

GRANT SELECT ON clientes_impel, clientes, sedes_cliente                           TO authenticated;
GRANT SELECT ON ops, op_ds                                                         TO authenticated;
GRANT SELECT ON phase_plans, phase_plans_baseline, phase_events, op_d_pendientes  TO authenticated;
GRANT SELECT ON lead_time_recurso, festivos_co                                     TO authenticated;

GRANT EXECUTE ON FUNCTION dias_habiles_entre(date, date)       TO authenticated;
GRANT EXECUTE ON FUNCTION restar_dias_habiles(date, integer)   TO authenticated;
GRANT EXECUTE ON FUNCTION sumar_dias_habiles(date, integer)    TO authenticated;
