-- 0002_maestros_impel.sql — Espejo de datos maestros de IMPEL (solo lectura)
-- Estas tablas son populate-only via ETL. Nunca se editan desde la app.

CREATE TABLE clientes_impel (
  id_impel         TEXT PRIMARY KEY,
  nit              TEXT,
  razon_social     TEXT NOT NULL,
  nombre_comercial TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sku_modelo_impel (
  id_impel          TEXT PRIMARY KEY,
  referencia        TEXT NOT NULL,
  nombre            TEXT,
  ficha_tecnica_url TEXT,
  patron_cad_url    TEXT,
  estado            TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sku_impel (
  id_impel       TEXT PRIMARY KEY,
  sku_modelo_id  TEXT REFERENCES sku_modelo_impel,
  talla          TEXT,
  color          TEXT,
  codigo_barras  TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);
