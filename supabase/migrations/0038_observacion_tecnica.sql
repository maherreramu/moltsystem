-- Agrega el tipo 'observacion_tecnica' al enum de eventos.
-- Las observaciones técnicas se almacenan en phase_events (append-only)
-- con payload = { texto: "..." } y fase = fase_actual de la OP-D.
ALTER TYPE phase_event_tipo_enum ADD VALUE IF NOT EXISTS 'observacion_tecnica';
