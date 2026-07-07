# MoltSistem

Sistema de planificación y seguimiento de producción de **Molt SAS** — segunda generación.

Reemplaza la arquitectura ClickUp-como-base-de-datos por un stack propio con Supabase (Postgres) como sistema de record, Next.js como frontend operativo, y Metabase como capa analítica ejecutiva (post iter-1).

**Iter-1** entrega gobierno operativo agregado: Kanban + Gantt + seguimiento diario + score de priorización + event store.
**Iter-2+** entrega el MES detallado (trazabilidad por rollo, OS, OC, inventario) — referencia futura, fuera de alcance actual.

---

## Estado del proyecto

Migración strangler en 4 fases (8 sprints). Ver `context/04_plan_implementacion.md`.

| Fase de migración | Sprints | Estado | Hito |
|---|---|---|---|
| **1 — Backend + datos** | 0–2 | ⏳ Pendiente | Supabase con 537 OP-Ds en paridad con ClickUp |
| **2 — Frontend read-only** | 3–4 | ⏳ Pendiente | Comité ve el sistema nuevo con datos reales |
| **3 — Vistas operativas + acciones** | 5–6 | ⏳ Pendiente | Junta del lunes usa el sistema en sombra |
| **4 — Cut-over + go-live** | 7 | ⏳ Pendiente | Líderes operando, ClickUp en modo lectura |

---

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) | Stack, decisiones tomadas, estrategia de migración |
| [`context/00_molt_empresa.md`](context/00_molt_empresa.md) | Contexto de la empresa, equipo, costos |
| [`context/01_flujo_produccion.md`](context/01_flujo_produccion.md) | 8 fases, tiempos estándar, recursos de corte, pull planning |
| [`context/02_rituales.md`](context/02_rituales.md) | Junta lunes, daily, cierre viernes, reglas de operación |
| [`context/03_modelo_iter1.md`](context/03_modelo_iter1.md) | **Modelo de datos iter-1** — entidades, vistas SQL, funciones, reglas |
| [`context/04_plan_implementacion.md`](context/04_plan_implementacion.md) | **Plan de implementación** — 8 sprints, riesgos, cut-over |
| [`context/05_modelo_datos_borrador_v3_1.md`](context/05_modelo_datos_borrador_v3_1.md) | Modelo MES completo — referencia iter-2+ (no se implementa ahora) |
| [`supabase/migrations/`](supabase/migrations/) | Migraciones SQL versionadas |

---

## Stack

| Capa | Tecnología | Rol |
|---|---|---|
| **Base de datos** | Supabase (Postgres 15) | Sistema de record, Auth, Storage |
| **Backend/API** | PostgREST (via Supabase) + Server Actions Next.js | API auto desde schema, mutaciones seguras |
| **Frontend** | Next.js 15 (App Router) + Tailwind + shadcn/ui | App operativa Kanban + Gantt |
| **Kanban** | `@dnd-kit/core` | Drag-and-drop entre fases |
| **Gantt** | `wx-react-gantt` (SVAR MIT) | Cronograma pull + baseline overlay por OP-D |
| **Tablas** | `@tanstack/react-table` | Filtros, sort, virtualización |
| **Analítica** | Metabase (self-hosted) | Dashboard ejecutivo (post iter-1) |
| **ETL** | Python (scripts heredados adaptados) | Ingesta IMPEL + ClickUp → Supabase |
| **Infra** | VPS existente + Vercel (staging) | CI/CD vía GitHub Actions |

---

## Contexto del negocio

Molt SAS fabrica dotación industrial coordinando 96+ talleres satélite. El sistema cubre:
- **537 OP-Ds activas** (referencias/prendas) en las OPs activas
- **8 fases productivas**: `fase_0` → `compras` → `trazo` → `corte` → `tiqueteo` → `satelites` → `empaque` → `despacho`
- **Modelo pull**: todas las fechas calculadas hacia atrás desde la `fecha_compromiso` del cliente, en días hábiles colombianos
- **Equipo**: 4 personas en comité (Miguel, Santiago, Camila, Mateo) + 6 líderes de fase operativos

Ver [`context/00_molt_empresa.md`](context/00_molt_empresa.md) para el contexto completo y [`context/03_modelo_iter1.md`](context/03_modelo_iter1.md) para el propósito de la iteración.

---

## Setup rápido (cuando la arquitectura esté cerrada)

```bash
# 1. Clonar
git clone https://github.com/mateo-herr/MoltSistem
cd MoltSistem

# 2. Variables de entorno
cp .env.example .env.local
# Completar SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, CLICKUP_TOKEN

# 3. Aplicar migraciones
supabase db push

# 4. Carga inicial desde IMPEL + estado ClickUp a Supabase
uv run python scripts/20_load_to_supabase.py --dry-run
uv run python scripts/20_load_to_supabase.py

# 5. App frontend
cd app && npm install && npm run dev
```
