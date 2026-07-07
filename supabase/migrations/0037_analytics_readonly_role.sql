-- 0037_analytics_readonly_role.sql
-- Rol Postgres de solo lectura para acceso analítico externo (Claude web, Metabase, etc.)
-- Sin acceso a: usuarios_sistema, phase_events, auth.*

-- Crear el rol de grupo (sin LOGIN — se hereda por usuarios específicos)
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'moltsystem_analytics') THEN
    CREATE ROLE moltsystem_analytics;
  END IF;
END $$;

-- Acceso al schema public
GRANT USAGE ON SCHEMA public TO moltsystem_analytics;

-- Vistas analíticas (superficies seguras calculadas)
GRANT SELECT ON
  v_slack,
  v_semaforo_op,
  v_score,
  v_plan_vs_real,
  v_pendientes_abiertos,
  v_foco_semanal,
  v_mi_fase_hoy,
  v_capacidad_semana_fase
TO moltsystem_analytics;

-- Tablas operativas (lectura)
GRANT SELECT ON
  ops,
  op_ds,
  clientes,
  clientes_impel,
  sku_modelo_impel,
  sku_impel,
  sedes_cliente,
  phase_plans,
  phase_plans_baseline,
  op_d_componentes,
  lead_time_recurso,
  festivos_co
TO moltsystem_analytics;

-- RPCs de solo lectura (cálculos de días hábiles + payload completo)
GRANT EXECUTE ON FUNCTION
  get_produccion_data(),
  get_festivos_data(),
  dias_habiles_entre(date, date),
  sumar_dias_habiles(date, integer),
  restar_dias_habiles(date, integer)
TO moltsystem_analytics;

-- EXPLÍCITAMENTE SIN ACCESO (default deny aplica, pero se documenta la intención):
-- usuarios_sistema  → contiene user_id FK a auth.users (identidades internas)
-- phase_events      → contiene emails de actores en columna 'actor'
-- auth.*            → schema de autenticación de Supabase

-- Crear usuario de login que hereda el rol
-- NOTA: reemplazar 'CONTRASEÑA_SEGURA_AQUI' con una contraseña real antes de aplicar
-- Este usuario se usa en la connection string del MCP de solo lectura
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'analytics_user') THEN
    CREATE USER analytics_user
      WITH PASSWORD 'CONTRASEÑA_SEGURA_AQUI'
      IN ROLE moltsystem_analytics
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END $$;

-- Asegurar que futuros objetos en public también sean accesibles
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO moltsystem_analytics;
