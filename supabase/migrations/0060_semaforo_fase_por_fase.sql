-- 0060: semaforo_config — poblar umbrales individuales por fase
-- Cada fase tiene su propio umbral de semáforo. Los valores default son (5, 2)
-- como punto de partida; el admin los ajusta según la duración real de cada fase.
INSERT INTO semaforo_config (scope, fase, umbral_verde, umbral_amarillo)
VALUES
  ('fase', 'compras',    5, 2),
  ('fase', 'trazo',      5, 2),
  ('fase', 'corte',      5, 2),
  ('fase', 'tiqueteo',   5, 2),
  ('fase', 'satelites',  5, 2),
  ('fase', 'empaque',    5, 2),
  ('fase', 'despacho',   5, 2)
ON CONFLICT (scope, fase) DO NOTHING;
