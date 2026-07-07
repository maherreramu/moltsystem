-- 0003_maestros_mes.sql — Maestros editables del MES
-- clientes extiende clientes_impel con atributos operativos y de score.
-- lead_time_recurso: tiempos estándar configurables sin cambiar código.
-- festivos_co: base para dias_habiles_entre() — se actualiza cada año.

-- ─── Trigger helper updated_at ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── Clientes (capa operativa, extiende clientes_impel 1:1) ──────────────────
CREATE TABLE clientes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_impel_id     TEXT UNIQUE NOT NULL REFERENCES clientes_impel,

  -- Atributos para score (PPT 28-may-2026)
  tier                 cliente_tier_enum    NOT NULL DEFAULT 'estandar',
  tipo_relacion        tipo_relacion_enum   NOT NULL DEFAULT 'unico',
  condicion_pago       condicion_pago_enum  NOT NULL DEFAULT 'mas_de_60d',

  -- Atributos operativos
  esquema_facturacion  esquema_facturacion_enum NOT NULL DEFAULT 'directa',
  stock_administrado   BOOLEAN NOT NULL DEFAULT false,
  canal                canal_cliente_enum   NOT NULL DEFAULT 'colombia',
  complejidad_tipica   complejidad_enum     NOT NULL DEFAULT 'media',

  notas                TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_clientes_impel_id ON clientes(cliente_impel_id);

CREATE TRIGGER clientes_updated_at
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─── Sedes del cliente (cross-docking, envío personalizado) ──────────────────
CREATE TABLE sedes_cliente (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id                    UUID NOT NULL REFERENCES clientes ON DELETE CASCADE,
  nombre_sede                   TEXT NOT NULL,
  ciudad                        TEXT NOT NULL,
  direccion                     TEXT,
  operador_logistico_preferido  TEXT,
  contacto                      TEXT,
  activa                        BOOLEAN NOT NULL DEFAULT true,
  created_at                    TIMESTAMPTZ DEFAULT now(),
  updated_at                    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sedes_cliente_id ON sedes_cliente(cliente_id);

CREATE TRIGGER sedes_cliente_updated_at
  BEFORE UPDATE ON sedes_cliente
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─── Lead times por fase y recurso ───────────────────────────────────────────
-- Fuente de verdad de los tiempos estándar. Editable por la junta.
-- Valores cargados en seed inicial según heurísticas de Santiago (Sprint 0.7).
CREATE TABLE lead_time_recurso (
  fase        fase_enum NOT NULL,
  recurso     TEXT      NOT NULL,
  dias_default SMALLINT NOT NULL,
  condiciones TEXT,
  activo      BOOLEAN   NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (fase, recurso)
);

-- Seed: heurísticas iniciales (ajustar con Santiago antes del go-live)
INSERT INTO lead_time_recurso (fase, recurso, dias_default, condiciones) VALUES
  ('fase_0',    'estandar',    5,  'Caso base'),
  ('fase_0',    'complejo',    10, 'Primera vez / cliente exigente / prenda compleja'),
  ('compras',   'estandar',    5,  'MP local disponible'),
  ('compras',   'importado',   15, 'MP importada China / tela especial / avíos con lead time'),
  ('trazo',     'estandar',    3,  'Molde base disponible'),
  ('trazo',     'complejo',    7,  '>20 referencias / patronaje complejo / sin molde base'),
  ('corte',     'externo',     4,  'Taller externo sin cola — obligatorio si deadline ≤22d'),
  ('corte',     'manual',      4,  '<50 uds, tela delicada, urgencias pequeñas, muestras'),
  ('corte',     'morgan',      13, 'Máquina Morgan con cola — cantidad ≥50 uds, tela compatible'),
  ('tiqueteo',  'estandar',    2,  'Caso base'),
  ('tiqueteo',  'volumen',     3,  '>3,000 uds con muchas referencias'),
  ('satelites', 'estandar',    15, 'Confección estándar'),
  ('satelites', 'sastreria',   22, 'Sastrería especializada (ej. Avianca)'),
  ('empaque',   'estandar',    4,  'Empaque estándar'),
  ('empaque',   'personalizado', 10, 'Kit por colaborador / stock administrado / exportación'),
  ('despacho',  'estandar',    1,  'Bogotá'),
  ('despacho',  'cross_docking', 2, 'N sedes Colombia'),
  ('despacho',  'personalizado', 3, 'Kit por colaborador'),
  ('despacho',  'exportacion', 7,  'Panamá / internacional');

-- ─── Festivos colombianos ─────────────────────────────────────────────────────
CREATE TABLE festivos_co (
  fecha       DATE PRIMARY KEY,
  descripcion TEXT
);

-- Festivos Colombia 2026
INSERT INTO festivos_co (fecha, descripcion) VALUES
  ('2026-01-01', 'Año Nuevo'),
  ('2026-01-12', 'Reyes Magos'),
  ('2026-03-23', 'San José'),
  ('2026-04-02', 'Jueves Santo'),
  ('2026-04-03', 'Viernes Santo'),
  ('2026-05-01', 'Día del Trabajo'),
  ('2026-05-18', 'Ascensión del Señor'),
  ('2026-06-08', 'Corpus Christi'),
  ('2026-06-15', 'Sagrado Corazón'),
  ('2026-06-29', 'San Pedro y San Pablo'),
  ('2026-07-20', 'Independencia de Colombia'),
  ('2026-08-07', 'Batalla de Boyacá'),
  ('2026-08-17', 'Asunción de la Virgen'),
  ('2026-10-12', 'Día de la Raza'),
  ('2026-11-02', 'Todos los Santos'),
  ('2026-11-16', 'Independencia de Cartagena'),
  ('2026-12-08', 'Inmaculada Concepción'),
  ('2026-12-25', 'Navidad');

-- Festivos Colombia 2027
-- Necesarios para OP-Ds con fecha_compromiso en 2027 (ciclos de 90-120d)
INSERT INTO festivos_co (fecha, descripcion) VALUES
  ('2027-01-01', 'Año Nuevo'),
  ('2027-01-11', 'Reyes Magos'),
  ('2027-03-22', 'San José'),
  ('2027-03-25', 'Jueves Santo'),
  ('2027-03-26', 'Viernes Santo'),
  ('2027-05-01', 'Día del Trabajo'),
  ('2027-05-10', 'Ascensión del Señor'),
  ('2027-05-31', 'Corpus Christi'),
  ('2027-06-07', 'Sagrado Corazón'),
  ('2027-07-05', 'San Pedro y San Pablo'),
  ('2027-07-20', 'Independencia de Colombia'),
  ('2027-08-07', 'Batalla de Boyacá'),
  ('2027-08-16', 'Asunción de la Virgen'),
  ('2027-10-18', 'Día de la Raza'),
  ('2027-11-01', 'Todos los Santos'),
  ('2027-11-15', 'Independencia de Cartagena'),
  ('2027-12-08', 'Inmaculada Concepción'),
  ('2027-12-25', 'Navidad');
