-- 0033_componentes_corte.sql
-- Checklist de telas/componentes por OP-D + compuerta de corte (RN-13).
--
-- En confección una prenda se compone de N telas que se cortan por separado.
-- La OP-D no puede avanzar de corte a tiqueteo hasta que todas sus telas estén
-- cortadas. El BOM de telas lo cura compras (manual en la app o ETL desde
-- PRODUCCION.xlsx hoja COMPRAS: REFERENCIA INSUMO COMPRADO con ES TELA=true).
--
-- Semilla del bom_efectivo_linea de iter-2 — acoplada por FK sin tocar lo existente.

-- Nuevo tipo de evento (no se usa dentro de esta migración → seguro en transacción)
ALTER TYPE phase_event_tipo_enum ADD VALUE IF NOT EXISTS 'componentes_asignados';

-- ─── Tabla de componentes (telas) ────────────────────────────────────────────
CREATE TABLE op_d_componentes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opd_id      UUID NOT NULL REFERENCES op_ds ON DELETE CASCADE,
  nombre_tela TEXT NOT NULL,            -- nombre real curado (REFERENCIA INSUMO COMPRADO, o fallback INSUMO)
  ref_impel   TEXT,                     -- referencia genérica original (trazabilidad de homologación)
  rol         TEXT,                     -- principal | contraste | forro | entretela | rib | reflectivo (libre)
  es_manual   BOOLEAN NOT NULL DEFAULT false,  -- true si se ingresó/editó en la app → el ETL NO lo pisa
  cortado     BOOLEAN NOT NULL DEFAULT false,
  cortado_at  TIMESTAMPTZ,
  cortado_por TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (opd_id, nombre_tela)          -- idempotencia para el upsert del ETL
);

CREATE INDEX idx_componentes_opd ON op_d_componentes(opd_id);
CREATE INDEX idx_componentes_pendientes ON op_d_componentes(opd_id) WHERE cortado = false;

CREATE TRIGGER trg_componentes_updated_at
  BEFORE UPDATE ON op_d_componentes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON op_d_componentes TO authenticated;

-- ─── Pendiente atribuible a una tela ─────────────────────────────────────────
-- Da el beneficio de la "subtarjeta por tela" sin crear una jerarquía paralela.
ALTER TABLE op_d_pendientes
  ADD COLUMN componente_id UUID REFERENCES op_d_componentes;

-- ─── RN-13: compuerta de corte ───────────────────────────────────────────────
-- Espejo de check_f0_gate (0009_triggers.sql). Solo bloquea si la OP-D tiene
-- componentes definidos con cortado=false (las prendas mono-tela no se bloquean).
CREATE OR REPLACE FUNCTION check_corte_gate()
RETURNS TRIGGER AS $$
DECLARE
  v_faltantes INTEGER;
BEGIN
  IF OLD.fase_actual = 'corte' AND NEW.fase_actual = 'tiqueteo' THEN
    SELECT COUNT(*) INTO v_faltantes
    FROM op_d_componentes
    WHERE opd_id = NEW.id AND cortado = false;

    IF v_faltantes > 0 THEN
      RAISE EXCEPTION
        'OP-D % no puede avanzar a Tiqueteo: % tela(s) sin cortar.',
        NEW.ref, v_faltantes;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_op_ds_corte_gate
  BEFORE UPDATE ON op_ds
  FOR EACH ROW EXECUTE FUNCTION check_corte_gate();
