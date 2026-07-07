-- 0001_enums.sql — Todos los tipos enum del sistema iter-1
-- El orden de declaración de fase_enum = orden del flujo productivo.
-- Las comparaciones de fases en SQL usan el enum directamente (>, <, =).
-- NUNCA castear a ::text — el orden alfabético no coincide con el productivo.

CREATE TYPE fase_enum AS ENUM (
  'fase_0', 'compras', 'trazo', 'corte',
  'tiqueteo', 'satelites', 'empaque', 'despacho'
);

CREATE TYPE semaforo_enum AS ENUM ('verde', 'amarillo', 'rojo');

CREATE TYPE cliente_tier_enum AS ENUM ('tier_1', 'tier_2', 'estandar');

CREATE TYPE tipo_relacion_enum AS ENUM (
  'contrato_con_penalizacion',
  'contrato_sin_penalizacion',
  'recurrente',
  'unico'
);

CREATE TYPE condicion_pago_enum AS ENUM (
  'anticipado',
  'hasta_30d',
  '30_a_60d',
  'mas_de_60d'
);

CREATE TYPE esquema_facturacion_enum AS ENUM (
  'directa', 'con_oc_cliente', 'resumen_y_oc'
);

CREATE TYPE canal_cliente_enum AS ENUM ('colombia', 'panama_internacional');

CREATE TYPE complejidad_enum AS ENUM ('alta', 'media', 'baja');

CREATE TYPE recurso_corte_enum AS ENUM ('morgan', 'manual', 'externo');

CREATE TYPE tipo_empaque_enum AS ENUM ('estandar', 'personalizado', 'exportacion');

CREATE TYPE tipo_despacho_enum AS ENUM (
  'estandar', 'cross_docking', 'personalizado', 'exportacion'
);

CREATE TYPE motivo_bloqueo_enum AS ENUM (
  'mp_no_llego', 'fase_0_incompleta', 'pendiente_cliente',
  'capacidad_satelite', 'reproceso', 'otro'
);

CREATE TYPE causa_desvio_enum AS ENUM (
  'mp_tardia', 'calidad_mp', 'bloqueo_f0',
  'capacidad_corte', 'capacidad_trazo', 'capacidad_satelite',
  'capacidad_tiqueteo_empaque',
  'reproceso_interno', 'reproceso_satelite',
  'cambio_cliente', 'documentacion_despacho', 'otro'
);

CREATE TYPE pendiente_estado_enum AS ENUM (
  'pendiente', 'en_subsanacion', 'cerrado'
);

CREATE TYPE phase_event_tipo_enum AS ENUM (
  'op_arrival', 'f0_checkbox_update', 'baseline_freeze',
  'phase_advance', 'phase_revert', 'phase_advance_parcial',
  'block', 'unblock', 'replan', 'daily_check',
  'satellite_promise_set', 'satellite_received',
  'score_update', 'resource_change', 'pendiente_created',
  'pendiente_status_change'
);
