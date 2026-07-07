-- 0032_op_ds_lead_time_trigger.sql
-- Trigger BEFORE INSERT en op_ds que aplica automáticamente los días estándar
-- desde lead_time_recurso (recurso='estandar'). El ETL no envía dias_* en el payload;
-- la DB los resuelve en la inserción. Cambios en lead_time_recurso se reflejan
-- en cada nueva OP-D sin tocar el ETL. Las OP-Ds ya cargadas no se alteran.

CREATE OR REPLACE FUNCTION apply_lead_times_estandar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER AS $$
BEGIN
  SELECT COALESCE(dias_default, 5)  INTO NEW.dias_fase_0
    FROM lead_time_recurso WHERE fase = 'fase_0'    AND recurso = 'estandar' AND activo LIMIT 1;
  SELECT COALESCE(dias_default, 7)  INTO NEW.dias_compras
    FROM lead_time_recurso WHERE fase = 'compras'   AND recurso = 'estandar' AND activo LIMIT 1;
  SELECT COALESCE(dias_default, 3)  INTO NEW.dias_trazo
    FROM lead_time_recurso WHERE fase = 'trazo'     AND recurso = 'estandar' AND activo LIMIT 1;
  SELECT COALESCE(dias_default, 4)  INTO NEW.dias_corte
    FROM lead_time_recurso WHERE fase = 'corte'     AND recurso = 'estandar' AND activo LIMIT 1;
  SELECT COALESCE(dias_default, 2)  INTO NEW.dias_tiqueteo
    FROM lead_time_recurso WHERE fase = 'tiqueteo'  AND recurso = 'estandar' AND activo LIMIT 1;
  SELECT COALESCE(dias_default, 24) INTO NEW.dias_satelites
    FROM lead_time_recurso WHERE fase = 'satelites' AND recurso = 'estandar' AND activo LIMIT 1;
  SELECT COALESCE(dias_default, 5)  INTO NEW.dias_empaque
    FROM lead_time_recurso WHERE fase = 'empaque'   AND recurso = 'estandar' AND activo LIMIT 1;
  SELECT COALESCE(dias_default, 0)  INTO NEW.dias_despacho
    FROM lead_time_recurso WHERE fase = 'despacho'  AND recurso = 'estandar' AND activo LIMIT 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_op_ds_apply_lead_times
  BEFORE INSERT ON op_ds
  FOR EACH ROW EXECUTE FUNCTION apply_lead_times_estandar();
