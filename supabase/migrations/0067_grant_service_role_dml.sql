-- 0067: service_role carecía de DML en tablas creadas por migración que solo
-- otorgaron permisos a authenticated. Los Server Actions usan
-- createCachedServiceClient() (rol service_role) → upserts fallaban con
-- "permission denied for table". Afecta: phase_promises (promesa entrega),
-- op_d_componentes (componentes/satélites), user_ui_prefs (prefs UI).
GRANT SELECT, INSERT, UPDATE, DELETE ON phase_promises   TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON op_d_componentes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_ui_prefs    TO service_role;
