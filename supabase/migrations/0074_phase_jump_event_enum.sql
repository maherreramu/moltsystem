-- 0074_phase_jump_event_enum.sql
-- Ensure phase_jump exists for deployments where 0069_phase_jumps_config
-- was already applied before jump events were introduced.

ALTER TYPE phase_event_tipo_enum ADD VALUE IF NOT EXISTS 'phase_jump';
