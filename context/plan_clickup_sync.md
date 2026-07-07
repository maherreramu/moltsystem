# Plan: migración/sincronización de estado ClickUp → MoltSystem (Supabase)

## Contexto

ClickUp fue la "base de datos" operativa de Molt antes de MoltSystem. Los líderes mantuvieron
ahí el estado real de producción (fase actual, fechas del plan por fase, detalle, novedades,
días por fase). Supabase ya tiene 179 op_ds cargadas vía el ETL de IMPEL, pero su estado de
fase vino de la carga inicial heurística (`21_heuristica_fases.py`), **no** del trabajo real de
los líderes (0 eventos `phase_advance`, solo 2 actores). El objetivo es traer el estado real
desde ClickUp hacia las OP-Ds existentes en Supabase, y **bufferizar** el estado de las OP-Ds
que aún no existen en Supabase para aplicarlo después de que el ETL normal las cargue.

### Hallazgos de la exploración (MCP ClickUp)
- Workspace: 1 space "Produccion Molt". Lista relevante: **"Producción Activa"** (`901713964089`).
  Las otras dos (OPs Activas — duplicada y toda en fase_0; Pipeline Comercial — comercial) se ignoran.
- En "Producción Activa": **tareas padre = OP-Ds** (status = fase real, ~41 custom fields) +
  **8 subtareas `fase-plan`** por OP-D (Fase 0…Despacho), cada una con `due_date` = fecha
  planeada de esa fase → `phase_plans`.
- **Llave de cruce = `ref` (`op_num-seq`)**, NO `impel_id` (ClickUp y Supabase salieron de
  snapshots IMPEL distintos: el `impel_id` no coincide). `ref` se deriva de "Referencia / prenda"
  (`6798-1-camisa overol` → `6798-1`) y/o del nombre (`… · OP-6798 · …`).
- Solape de OPs: Supabase 6747–6817; ClickUp 6747–6832 → varias OP-Ds de ClickUp **no existen**
  en Supabase (6798, 6818–6832, etc.).
- Gotchas de tipos ClickUp: checkbox = `'true'`/`null` (nunca `false`); dropdown `value` =
  orderindex → resolver con `type_config.options`; números y fechas son strings (fechas epoch ms);
  campo **"Días Calidad + Empaque" → `dias_empaque`**, "Días Satélites" → `dias_satelites`;
  Score/Slack/Semáforo vienen vacíos (Supabase los calcula en vistas — no se migran).

### Decisiones
- **Alcance**: OP-Ds que ya existen en Supabase → sincronizar ahora. OP-Ds que NO existen →
  guardar su estado en un **buffer local temporal** (`data/state/clickup_pending.json`) para
  aplicarlo tras la carga por el ETL IMPEL previsto.
- **Campos a sincronizar**: (1) fase_actual + historial, (2) detalle + fechas + novedades,
  (3) días por fase. **NO** se sincronizan F0/bloqueo/flags desde ClickUp.
- **phase_plans**: importar las fechas de las subtareas de ClickUp (respeta la replanificación
  manual de los líderes); no se llama `recalc_pull`.

---

## Arquitectura

Script Python consumiendo la **REST API de ClickUp** (no MCP — demasiado lento para bulk).
`GET /list/{list_id}/task?include_closed=true&subtasks=true&page=N` devuelve `custom_fields`,
`parent`, `status`, `due_date` inline — sin N+1. Reutiliza `utils/supabase_client.py` y el
patrón de `scripts/20_*` (`--dry-run`/`--apply`).

**Nuevo cliente**: `utils/clickup_client.py` — token vía `CLICKUP_API_TOKEN` en `.env.local`.
Header `Authorization`. Documentar en `.env.example` y `CLAUDE.md`.

---

## Mapeo ClickUp → Supabase

| ClickUp | Supabase | Notas |
|---|---|---|
| status (`"3 corte"`…) | `op_ds.fase_actual` | mapa fijo (ver abajo) |
| custom "Detalle" | `op_ds.detalle` | texto plano (no usar `description`, viene vacío) |
| custom "Colores" | `op_ds.colores` | |
| custom "Comercial" (dropdown) | `ops.comercial` | resolver opción; vive en `ops`, no `op_ds` |
| "Fecha compromiso cliente" | `ops.fecha_compromiso` | epoch ms → date |
| "Fecha compromiso original" | `ops.fecha_compromiso_original` | |
| "Fecha promesa satélites" | `op_ds.fecha_promesa_satelites` | |
| "Fecha recepción satélites" | `op_ds.fecha_recepcion_satelites` | |
| "Novedades" | `phase_events` tipo `daily_check` (nota) | se registra como evento, no columna |
| "Días Fase 0/Compras/Trazo/Corte/Tiqueteo/Satélites/Calidad+Empaque/Despacho" | `op_ds.dias_fase_0..dias_despacho` | UPDATE directo (trigger lead-time es BEFORE INSERT, no UPDATE → seguro) |
| 8 subtareas `fase-plan` `due_date` | `phase_plans.due_date` por fase | `start_date` encadenado (ver abajo) |

### Mapa de fases (status ClickUp → `fase_enum`)
```
"fase 0 — sin planear"  → fase_0
"1 compras"             → compras
"2 trazo"               → trazo
"3 corte"               → corte
"4 tiqueteo"            → tiqueteo
"5 satelites"           → satelites
"6 empaque"             → empaque
"7 despacho"            → despacho
```

### Cálculo de `start_date` en `phase_plans`
- `start[fase_0] = restar_dias_habiles(due_fase_0, dias_fase_0)`
- `start[i > 0] = due[i-1]` (garantiza `due_date >= start_date`)

---

## Archivos a crear

### `utils/clickup_client.py` (nuevo)
Cliente REST paginado. Lee `CLICKUP_API_TOKEN` del entorno.
```python
# Métodos clave:
# get_list_tasks(list_id) → genera páginas hasta que page vacía
# Retorna tareas con custom_fields, status, due_date, subtasks
```

### `scripts/22_clickup_sync.py` (nuevo)
Flujo principal:
1. Extraer todas las tareas de lista `901713964089` (paginado). Separar:
   - padres (sin tag `fase-plan`, nombre contiene `· OP-`) → OP-Ds
   - subtareas (tag `fase-plan`, campo `parent`) → agrupar por padre
2. Para cada OP-D: derivar `ref` (regex `^(\d+)-(\d+)` de "Referencia / prenda"), resolver
   custom fields (helper dropdown→opción, checkbox→bool, número/fecha→tipos)
3. Cruzar por `ref` contra Supabase (`SELECT id, op_num, ref, fase_actual FROM op_ds`)
4. **Match → sincronizar** (idempotente):
   - `UPDATE op_ds SET detalle, colores, dias_*, fecha_promesa_satelites, fecha_recepcion_satelites, fase_actual`
     - Si `fase_actual > fase_0`: setear los 6 `f0_*=true` para no violar el gate `check_f0_gate` BEFORE UPDATE
   - `UPDATE ops SET comercial, fecha_compromiso, fecha_compromiso_original` (por op_num)
   - **phase_plans**: upsert por PK `(opd_id, fase)` con fechas de ClickUp + `start_date` encadenado
   - **Baseline**: si `fase > fase_0` y no hay baseline → llamar `freeze_baseline(opd_id, 'clickup_migration')`
   - **Historial**: si no existe ya un `phase_advance` con `payload->>'origen' = 'clickup_migration'`
     → insertar UN evento `phase_advance` (actor `clickup_migration`)
   - **Novedades**: si hay texto → insertar `phase_event` tipo `daily_check` con `payload {nota}`
5. **No-match → buffer**: escribir registro completo en `data/state/clickup_pending.json` (clave = ref)
6. `--dry-run` (default): solo reporte. `--apply`: ejecutar.

### `scripts/23_apply_clickup_pending.py` (nuevo)
- Lee `data/state/clickup_pending.json`
- Cruza por `ref` contra Supabase
- Aplica mismo sync que `22_` a las OP-Ds que ahora sí existen
- Elimina del buffer las aplicadas; deja las que aún no aparecen
- `--dry-run`/`--apply`
- Correr **después** de `20_load_to_supabase.py`

### `data/state/clickup_pending.json` (output, git-tracked)
Buffer de OP-Ds no encontradas en Supabase al momento del sync.

---

## Cambios en archivos existentes

### `.env.example`
```bash
# ClickUp sync
CLICKUP_API_TOKEN=pk_xxxx
CLICKUP_LIST_PROD_ACTIVA=901713964089
```

### `CLAUDE.md`
Agregar en la sección "Comandos frecuentes":
```bash
# ClickUp → Supabase sync
uv run python scripts/22_clickup_sync.py --dry-run   # ver reporte sin escribir
uv run python scripts/22_clickup_sync.py --apply     # sincronizar existentes + buffer pendientes
uv run python scripts/23_apply_clickup_pending.py --dry-run  # ver pendientes a aplicar
uv run python scripts/23_apply_clickup_pending.py --apply    # aplicar tras ETL IMPEL
```
Actualizar última migración si aplica y documentar nuevo archivo `data/state/clickup_pending.json`.

---

## Idempotencia y seguridad

- `phase_events` append-only → verificar existencia por `payload->>'origen' = 'clickup_migration'` antes de insertar
- `phase_plans` se reemplaza (upsert por PK); `freeze_baseline` solo si no existe
- Trigger lead-time es BEFORE INSERT → UPDATE de `dias_*` es seguro
- Gate F0: setear `f0_*=true` cuando `fase > fase_0` satisface el constraint
- RN-07/RN-13: no bloquean (sin pendientes ni componentes en estas OP-Ds)
- Default `--dry-run` con reporte antes de cualquier escritura

---

## Verificación end-to-end

1. `uv run python scripts/22_clickup_sync.py --dry-run`
   - Revisar: # match por ref, # pending, ejemplos fase/fechas/días a actualizar
   - Validar contra una OP-D conocida (ej. ref en ambos sistemas) que el mapeo es correcto
2. `--apply` y verificar con Supabase MCP (`execute_sql`):
   - `SELECT fase_actual, count(*) FROM op_ds GROUP BY 1` refleja distribución de ClickUp
   - `phase_plans` de una OP-D = fechas de subtareas ClickUp
   - `phase_events` tiene `phase_advance` con actor `clickup_migration` (sin duplicados al re-correr)
   - Baseline congelada para las avanzadas
3. Verificar buffer: `data/state/clickup_pending.json` contiene OP-Ds 6798/6818–6832
4. Simular flujo previsto: tras ETL IMPEL que cargue nueva OP, correr `23_apply_clickup_pending.py --apply`
   y confirmar que su estado se aplicó y salió del buffer
5. Smoke en app: `/mi-fase` y `/produccion` muestran las fases reales migradas
