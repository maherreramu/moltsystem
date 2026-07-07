ALTER TABLE ops ADD COLUMN IF NOT EXISTS estado_impel TEXT;
COMMENT ON COLUMN ops.estado_impel IS 'Estado de la OP en IMPEL — sincronizado por ETL, editable en app como recordatorio.';
