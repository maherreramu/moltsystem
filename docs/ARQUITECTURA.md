# Arquitectura MoltSistem

**Versión:** 3.1
**Fecha:** 2026-06-01
**Estado:** Iter-1 COMPLETADO — documento autoritativo del sistema en producción

---

## 1. Por qué migramos de ClickUp

El sistema anterior (`dashboard_produccion_molt_clickapp`) usó ClickUp simultáneamente como base de datos, tablero Kanban, Gantt y motor de métricas. Funcionó para el arranque (537 OP-Ds, 52 custom fields), pero los síntomas de techo eran claros:

| Síntoma | Raíz |
|---|---|
| Recalcular pull de 537 OP-Ds toma ~20 min con 5 workers | ~100 req/min rate limit + round-trips HTTP por cálculo |
| No hay historial de eventos (qué pasó, cuándo, quién) | ClickUp no es un event store |
| Agregar un campo = custom field + actualizar config + N scripts | Schema hardcodeado en configs externos |
| El equipo pide tallas, costos, OC, asignación talleres | ClickUp no soporta relaciones complejas |

**La decisión**: invertir la arquitectura. Supabase como sistema de record; ClickUp en modo lectura.

---

## 2. Visión del sistema

```
┌─────────────────────────────────────────────────────────────────┐
│  FUENTES DE DATOS                                               │
│  IMPEL (Excel) · Archivos operacionales · Satélites             │
└──────────────────────┬──────────────────────────────────────────┘
                       │ ETL Python (scripts/20_*.py)
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  SISTEMA DE RECORD — Supabase (Postgres 15)                     │
│                                                                 │
│   Tablas principales: ops, op_ds, phase_plans,                  │
│     phase_plans_baseline, phase_events, op_d_pendientes,        │
│     clientes (+ homologado_a), clientes_impel,                  │
│     categorias_proc, lead_time_recurso,                         │
│     usuarios_sistema, festivos_co                               │
│                                                                 │
│   Vistas: v_slack, v_score (via v_cliente_efectivo),            │
│     v_semaforo_op, v_plan_vs_real, v_pendientes_abiertos,       │
│     v_foco_semanal, v_mi_fase_hoy, v_cliente_efectivo           │
│     v_capacidad_semana_fase (materializada)                     │
│                                                                 │
│   RPCs JSON: get_opds_data(), get_phase_plans_json(),           │
│     get_phase_plans_baseline_json(), get_produccion_data(),      │
│     get_clientes_data(), get_plan_semana(date),                 │
│     get_festivos_data(), get_usuarios_sistema_admin(),          │
│     check_user_access(email)                                    │
│                                                                 │
│   Funciones: recalc_pull(), dias_habiles_entre(),               │
│     restar_dias_habiles(), freeze_baseline()                    │
│                                                                 │
│   Auth: Azure AD SSO (comité) + magic link + email/contraseña   │
│         Control: usuarios_sistema con 4 roles                   │
└──────────────────────┬──────────────────────────────────────────┘
                       │
         ┌─────────────┼──────────────┐
         ▼             ▼              ▼
   App Next.js    Metabase        Claude MCP
   16.2.6         Dashboard       Queries SQL
   (16 páginas)   ejecutivo       via PostgREST
                  (post iter-1)
```

---

## 3. Stack — decisiones tomadas e implementadas

### 3.1 Base de datos: Supabase (Postgres 15)

- Postgres real — cualquier BI, ORM o tool se conecta directo
- Auth nativo con 3 proveedores: Azure AD, magic link, email+contraseña
- SECURITY DEFINER functions para queries críticas que bypasan RLS
- Self-hosteable en VPS existente — sin vendor lock-in
- **Hosting**: cloud free tier (validado para 10-12 usuarios concurrentes dentro del free tier)

### 3.2 Frontend: Next.js 16.2.6 (App Router + Turbopack)

**Nota crítica:** Next.js 16 tiene breaking changes significativos vs versiones anteriores:
- `middleware.ts` → `proxy.ts`, función `middleware` → `proxy`
- `revalidateTag(tag)` requiere segundo argumento en Server Actions → usar `updateTag(tag)` desde Server Actions, `revalidateTag(tag, "max")` en Route Handlers
- `unstable_cache` no permite `cookies()` ni `headers()` — usar `createCachedServiceClient()` con cookie store no-op
- Server Components + Server Actions: service key nunca expuesto al cliente
- Tipos autogenerados desde schema Postgres: `supabase gen types typescript --linked > app/types/supabase.ts`
- Deploy: Docker en VPS (Sprint 7)

**Librerías realmente usadas:**

| Pieza | Librería | Nota |
|---|---|---|
| UI base | shadcn/ui + Tailwind | Componentes base (Sheet, Tabs, etc.) |
| Kanban | `@dnd-kit/core` v6.3.1 | Drag-and-drop; `suppressHydrationWarning` en DraggableCard |
| Gantt | **Implementación custom** | Dos paneles sincronizados via refs; zoom 4 niveles; no se usó wx-react-gantt |
| Tablas | `@tanstack/react-table` v8.21.3 | Filtros, sort en /ops, /clientes, /cola |
| Fechas | `lib/format.ts` custom | `fmtNum()`, `fmtRangoSemana()`, `getLunesDeOffset()` — evita `toLocaleString()` hydration mismatch |
| Formularios | Inline con `useState` + `useTransition` | react-hook-form/zod no se usó |
| Cache + polling | `unstable_cache` + Supabase Realtime | SWR no se usó; Realtime reemplaza polling |
| Errores | Sentry (pendiente Sprint 0.9) | DSN configurado, no activado aún |

### 3.3 Analítica ejecutiva: Metabase (post iter-1)

- Self-hosted en Docker en VPS (~1GB RAM)
- Conecta directo a Postgres sin configuración extra
- **Implementación:** Sprint post-iter-1, no bloqueante para go-live

### 3.4 ETL: Python (scripts heredados adaptados)

- `scripts/20_load_to_supabase.py`: carga inicial desde IMPEL Excel — 8 pasos:
  1. Lectura IMPEL + fase_map (filtro de muestras incluido)
  2. Upsert `categorias_proc` (nombres limpios, sin guion trailing)
  3. Upsert `clientes_impel` + `clientes` (`ignore_duplicates=True` — no pisa caracterización manual)
  4. Upsert `ops` (incluye `fecha_creacion_impel` desde columna IMPEL)
  5. Upsert `op_ds` — **sin enviar `dias_*`**; trigger `apply_lead_times_estandar` los asigna desde `lead_time_recurso['estandar']`
  6. Upsert `phase_plans` (dias=0) + `recalc_pull()` por OP-D
  7. `freeze_baseline()` para OP-Ds ya en producción
  8. Eventos `op_arrival`
- `scripts/21_sync_incremental.py`: sync diario IMPEL → Supabase (pendiente activar en producción)
- Numeración scripts nuevos: `20_` en adelante
- `utils/supabase_client.py` cliente único — carga `.env.local` automáticamente

### 3.5 Infra

| Componente | Dónde | Estado |
|---|---|---|
| Supabase | Cloud free tier | Operativo |
| Next.js (dev) | `localhost:3000` | Operativo |
| Next.js (prod) | Docker en VPS existente | **Pendiente Sprint 7** |
| CI/CD | GitHub Actions | `deploy-vps.yml` pendiente Sprint 7 |
| Reverse proxy | nginx + Let's Encrypt | Pendiente Sprint 7, dominio `produccion.molt.com.co` |
| Metabase | Docker en VPS | Post iter-1 |

---

## 4. Modelo de datos

Relaciones principales:

```
clientes_impel ──1:1──► clientes ──1:N──► ops ──1:N──► op_ds ──N:1──► categorias_proc
                (homologado_a → clientes)           │
                                      ┌─────────────┼──────────────────┐
                                      ▼             ▼                  ▼
                                phase_plans   phase_plans_baseline  phase_events
                                (mutable)      (inmutable, F0)       (append-only)
                                      │
                                      └──► op_d_pendientes

lead_time_recurso ──trigger BEFORE INSERT──► op_ds.dias_*
usuarios_sistema ── auth.users (user_id)
```

**Columnas clave de `op_ds` (post iter-1.1):**
- `detalle` — descripción larga desde IMPEL (col "Detalle"); antes llamada `descripcion`
- `productos` — tipo/nombre de prenda desde IMPEL (col "Productos")
- `categoria_proc_id UUID FK` → `categorias_proc` — categoría de proceso normalizada
- `dias_*` — asignados automáticamente por trigger `apply_lead_times_estandar()` en INSERT; editables manualmente por OP-D

**Columnas clave de `ops` (post iter-1.1):**
- `fecha_creacion_impel DATE` — fecha de creación de la OP en IMPEL (col "Fecha Creación")

**Tablas de configuración:**
- `categorias_proc` — catálogo de categorías de proceso (UUID PK, nombre UNIQUE, activa). Editable: se pueden agregar categorías manuales y reasignar OP-Ds.
- `lead_time_recurso` — tiempos estándar por fase y tipo de recurso (`estandar`, `morgan`, `importado`, etc.). La fila `recurso='estandar'` es la fuente de verdad para nuevas OP-Ds. Editable desde `/admin/config` (solo admin).

**Reglas clave:**
- `phase_events` es append-only — sin UPDATE ni DELETE. Tipos: `phase_advance`, `phase_advance_parcial`, `phase_revert`, `block`, `unblock`, `replan`, `f0_checkbox_update`, `daily_check`, `score_update`, `baseline_freeze`, `satellite_promise_set`, `satellite_received`, `pendiente_avance`, `pendiente_cerrado`
- `phase_plans_baseline` se crea una vez al cerrar F0 (`freeze_baseline`) y nunca se modifica
- Métricas derivadas (score, slack, semáforo) solo en vistas SQL — nunca en tablas
- `v_score` lee a través de `v_cliente_efectivo` para respetar homologaciones
- `clientes.homologado_a` es un alias no destructivo (1 nivel máx); el score del alias usa los atributos del canónico
- `op_ds.dias_*` no los envía el ETL — los asigna el trigger `apply_lead_times_estandar` (BEFORE INSERT) desde `lead_time_recurso`. Cambios en la tabla se reflejan automáticamente en la próxima carga IMPEL sin tocar código.

Ver `context/03_modelo_iter1.md` para el modelo completo con todos los campos.

---

## 5. Estrategia de migración (Strangler Fig) — Estado actual

| Fase | Estado |
|---|---|
| **Fase 1** — Backend + datos (Sprints 1-2): schema, funciones, vistas, ETL | ✅ COMPLETADO |
| **Fase 2** — Frontend read-only (Sprints 3-4): Kanban, Gantt, Tabla | ✅ COMPLETADO |
| **Fase 3** — Vistas operativas + acciones (Sprints 5-6): Mi fase, Cola, Plan semana, Server Actions | ✅ COMPLETADO |
| **Fase 4** — Cut-over y go-live (Sprint 7): VPS deploy, líderes en producción | 🔄 PENDIENTE |

---

## 6. Límite iter-1 / iter-2+

### Iter-1 entrega (COMPLETADO — 2026-06-01)

- ✅ Kanban 8 fases con drag-and-drop, semáforo y score
- ✅ Gantt custom (plan pull + baseline overlay, zoom 4 niveles, Realtime)
- ✅ Cola priorizada (5 criterios PPT 28-may-2026)
- ✅ Registro de avances, bloqueos, reprocesos y pendientes con observaciones
- ✅ Vistas por líder ("Mi fase hoy") con pendientes activos y ciclo de vida
- ✅ Plan de semana con navegador de semanas pasadas/futuras
- ✅ Vista de OPs con sub-tabla de OP-Ds, links IMPEL, reasignación de cliente
- ✅ Caracterización de clientes (tier, tipo_relacion, condicion_pago, complejidad)
- ✅ Homologación de clientes (alias no destructivo)
- ✅ Gestión de usuarios: 4 roles, autorización explícita, usuarios externos
- ✅ Log global de actividad (/actividad)
- ✅ Junta del lunes (/junta)
- ✅ Cache compartido + Realtime propagación < 2s entre usuarios
- ⏳ Sentry (Sprint 0.9 pendiente)
- ⏳ VPS deploy (Sprint 7 pendiente)

### Iter-2+ requiere (MES detallado)

El modelo completo de iter-2+ está en `context/05_modelo_datos_borrador_v3_1.md`. Prerequisito: modelo de datos de compañía codificado (SKUs maestros, BOMs estructurados, inventario codificado, catálogo de proveedores).

---

## 7. Decisiones resueltas

| Decisión | Resolución |
|---|---|
| Hosting Supabase | Cloud free tier — dentro de límites con 10-12 usuarios |
| Hosting frontend | Docker en VPS (Sprint 7 pendiente) |
| Auth | Azure AD SSO + magic link + email/contraseña. Acceso controlado via `usuarios_sistema` |
| Gantt | Implementación custom en React (dos paneles sincronizados, sin biblioteca externa) |
| Días hábiles | Tabla `festivos_co` en Postgres — función `dias_habiles_entre()` |
| Sync ClickUp | ClickUp congelado desde Sprint 2. ETL es unidireccional IMPEL → Supabase |
| Realtime | Implementado en iter-1 vía Supabase Realtime (op_ds, op_d_pendientes) |
| Redis | Diferido — innecesario con una instancia Next.js. Ver §8.6 |
| Metabase | Post iter-1 — no bloqueante para go-live |
| RLS granular por fase | Iter-1.5 — hoy rol `visualizacion` bloquea escrituras en Server Actions |
| Caracterización clientes | `/clientes` implementado en iter-1 (antes era iter-1.5 RF-05) |

---

## 8. Capa de caching y tiempo real (parche iter-1 — 2026-06-01)

Hallazgo durante pruebas: `/produccion` disparaba **19 requests HTTP a Supabase por render**. Con 10-12 usuarios concurrentes esto presionaba el free tier. Implementado como parche, sin infraestructura nueva.

### 8.1 Consolidación de queries (migraciones 0020-0024)

| Migración | Cambio |
|---|---|
| `0020_fix_v_score_n1` | Elimina N+1 en `v_score`: subconsulta correlacionada → CTE `opds_por_op` pre-agregado |
| `0021_produccion_rpc` | `get_produccion_data()` — payload unificado (referencia; producción usa 0023) |
| `0022_realtime_publication` | Habilita Supabase Realtime en `op_ds` y `op_d_pendientes` |
| `0023_opds_rpc` | `get_opds_data()` — solo metadata de OP-Ds activas (<2MB para Next.js cache) |
| `0024_festivos_rpc_and_grants` | `get_festivos_data()` SECURITY DEFINER + GRANTs a `anon` y `service_role` |

### 8.2 Cache compartido entre usuarios (`unstable_cache` + tags)

```
app/lib/queries/produccion.ts — 4 caches independientes, tag "produccion":
  _fetchOpds()     → get_opds_data()                TTL 60s
  _fetchPlans()    → get_phase_plans_json()          TTL 120s
  _fetchBaseline() → get_phase_plans_baseline_json() TTL 3600s (inmutable post F0)
  _fetchFestivos() → get_festivos_data()             TTL 86400s

app/lib/queries/clientes.ts — tag "clientes":
  fetchClientesData() → get_clientes_data()          TTL 120s
```

`createCachedServiceClient()` en `lib/supabase/server.ts`: usa `@supabase/ssr` con cookie store no-op. El service key autentica por API key, no por sesión — seguro en `unstable_cache`.

Cada Server Action en `opd-actions.ts` y `clientes-actions.ts` llama `updateTag("produccion")` tras mutar datos (Next.js 16: dentro de Server Actions usar `updateTag`, en Route Handlers usar `revalidateTag(tag, "max")`).

### 8.3 Propagación multi-usuario (Supabase Realtime)

```
Usuario A avanza fase → UPDATE op_ds en Supabase
  → updateTag("produccion")         ← cache invalidado para todos
  → Supabase Realtime broadcast     ← WebSocket a todos los clientes
    → router.refresh() (debounce 800ms) en Usuario B, C, D...
      → Next.js: cache inválido → 4 queries a Supabase → re-cache 60s
```

Listeners activos en: `produccion-client.tsx` y `mi-fase-client.tsx`.

**Costo free tier:**
- Conexiones: 10-12 activas vs 200 incluidas → 94% de margen
- Mensajes/mes: ~193k vs 2M incluidos → 90% de margen

### 8.4 Endpoint de invalidación para el ETL

`POST /api/revalidate` con header `x-revalidate-secret`. Variable `REVALIDATE_SECRET` en `.env.local`. Llamado por `scripts/21_sync_incremental.py` tras cada sync.

### 8.5 Impacto

| Métrica | Antes | Después |
|---|---|---|
| HTTP requests a Supabase por render `/produccion` | 19 | 4 (cacheados) |
| N+1 en `v_score` | 537 subqueries/render | 1 scan total |
| Tiempo propagación entre usuarios | 30s (ISR TTL) | <2s (Realtime) |
| Infraestructura adicional | — | 0 |

### 8.6 Decisión registrada: Redis diferido

Redis se agrega en iter-1.5 **solo si**: 2+ instancias Next.js tras balanceador, o ETL corre 3+ veces/día con invalidación granular por entidad vía `pg_notify`.

---

## 9. Autenticación, autorización y roles

### 9.1 Métodos de acceso

| Método | Para quién |
|---|---|
| Azure AD SSO (Microsoft) | Equipo interno Molt (correos `@molt.com.co`) |
| Magic link (email OTP) | Usuarios internos sin cuenta Microsoft configurada |
| Email + contraseña | Usuarios externos (proveedores, consultores, etc.) |

Cualquier usuario que se autentica con Supabase **sin estar en `usuarios_sistema`** es redirigido a `/acceso-pendiente`. El admin debe autorizarlo explícitamente.

### 9.2 Roles del sistema

| Rol | Lectura | Escritura | Gestión |
|---|---|---|---|
| `admin` | Todo | Todo | Gestión de usuarios, score override |
| `directivo` | Todo | Avances, bloqueos, replan, clientes | — |
| `lider_fase` | Todo | Avances de su fase | — |
| `visualizacion` | Todo | **Ninguna** — Server Actions lanzan error | — |

Enforcement: `getSbChecked()` en `opd-actions.ts` rechaza rol `visualizacion` antes de cualquier mutación. `assertPuedeEditar()` en `clientes-actions.ts` requiere `admin` o `directivo`.

### 9.3 Flujo de autorización

```
Login (cualquier método)
  ↓
Supabase crea/actualiza auth.users
  ↓
auth/callback:
  ├── Email en usuarios_sistema y activo=true?
  │     └── Sí: vincula user_id si es primer login → /produccion
  └── No / inactivo → /acceso-pendiente

Requests posteriores (proxy.ts / middleware):
  ├── Ruta pública (/login, /auth/*, /acceso-pendiente) → pass through
  ├── Sin sesión → /login
  └── check_user_access(email) retorna activo=false → /acceso-pendiente
```

### 9.4 Gestión de usuarios: `/admin/usuarios`

- Solo visible para rol `admin` (link en NavBar)
- Agregar usuarios pre-autorizados por email (se activan en el próximo login)
- Cambiar rol inline con selector
- Activar/desactivar (sin borrar registro)
- Sección "Pendientes de aprobación": usuarios que se autenticaron pero no tienen acceso (`auth.admin.listUsers()` via `createAdminClient()`)

---

## 10. Páginas implementadas en iter-1

| Ruta | Descripción | Nota técnica |
|---|---|---|
| `/produccion` | Kanban + Gantt + Tabla | Cache `unstable_cache` + Realtime |
| `/ops` | OPs agregadas con sub-tabla de OP-Ds | Links IMPEL, reasignación cliente, fechas |
| `/cola` | Cola priorizada por score | Tabla @tanstack/react-table |
| `/plan-semana` | Foco semanal con navegador ±N semanas | RPC `get_plan_semana(date)` |
| `/mi-fase` | Vista por líder con pendientes activos | Realtime, ciclo de vida de pendientes |
| `/pendientes` | Pendientes abiertos con filtros | `v_pendientes_abiertos` |
| `/capacidad` | Grid semana × fase con rango de fechas | Vista materializada |
| `/actividad` | Log global de `phase_events` | ISR 15s |
| `/junta` | Agenda junta lunes (cola + capacidad + foco) | Composición de views |
| `/clientes` | Caracterización + homologación + creación manual | `get_clientes_data()` |
| `/admin/usuarios` | Gestión de usuarios y roles | Solo admin |
| `/admin/config` | Tiempos estándar por fase (lead_time_recurso) | Solo admin |
| `/acceso-pendiente` | Página de espera para usuarios no autorizados | Pública |
| `/login` | Login (Azure AD + magic link + contraseña) | Pública |

---

---

## 11. Migraciones aplicadas post iter-1 (iter-1.1)

| Migración | Cambio |
|---|---|
| `0028` | `op_ds`: agregar columnas `productos TEXT` y `categoria_proc TEXT` (luego reemplazada por FK) |
| `0029` | `op_ds`: eliminar `descripcion` (redundante con `detalle`). Columna canónica: `detalle` |
| `0030` | Nueva tabla `categorias_proc` (UUID PK, nombre UNIQUE). `op_ds.categoria_proc` → `categoria_proc_id UUID FK` |
| `0031` | Sincronizar `lead_time_recurso['estandar']` con días definitivos; agregar fila `corte/estandar` |
| `0032` | Trigger `BEFORE INSERT` en `op_ds`: `apply_lead_times_estandar()` asigna `dias_*` desde `lead_time_recurso` |

RPCs actualizadas: `get_opds_data()` y `get_produccion_data()` usan `od.detalle` (antes `od.descripcion`).

---

*Molt SAS · Arquitectura MoltSistem · v3.1 · 2026-06-01*
