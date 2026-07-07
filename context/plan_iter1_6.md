# Plan iter-1.6 — 4 requerimientos (semáforo configurable, subestados satélites, WIP, Gantt por fase)

> **Estado:** PLANIFICADO (no implementado). Aprobado en sesión 2026-06-22 con Opus 4.8.
> **Base:** última migración `0048`. Iter-1.5 ya desplegado.
> **Orden recomendado:** A → B → C → D (C es trivial y precede a D). Cada feature es entregable por separado.

---

## Decisiones del usuario (reformulan el alcance original)

1. **Semáforo configurable** — mantener 3 colores (verde/amarillo/rojo) PERO umbrales editables desde configuración (hoy hardcodeados en `v_slack`: ≥3 verde, ≥0 amarillo, <0 rojo). ADEMÁS un **semáforo-luz por fase** *adicional* al semáforo general por OP-D que ya existe. (NO se quieren N colores arbitrarios — se descartó).
2. **Subestados satélites** — `[corte_externo, marcacion, confeccion, paquete_completo]`. El líder de satélites los mueve en **cualquier orden** (sin gate de secuencia); la vista general muestra el subestado actual como dato; el líder asigna **fecha promesa por subestado**.
3. **Vista WIP** — el Gantt-timeline actual pasa a vista de **solo consulta** (panorama por OP-D, plan vigente vs baseline) SIN capacidad de mover prioridad. Se relabela "WIP".
4. **Nueva vista Gantt por fase** — filtrable/conmutable por fase, drag-and-drop de prioridad **por fase**. Incluye OP-Ds activas **en ejecución o previas** a esa fase (`fase_actual <= F`). El ranking por fase ordena la columna del **Kanban** (saltando las OP-Ds que no están en esa fase). Conviven: columna "ranking" automática (`score_efectivo`, módulo calificación clientes, ya existe) + columna "prioridad" manual por fase.

---

## Estado base verificado (sesión de planeación)

- `semaforo_enum=(verde,amarillo,rojo)` fijo — `supabase/migrations/0001_enums.sql:11`.
- Semáforo calculado en `supabase/migrations/0010_vistas.sql` → `v_slack` (líneas 29-35), umbrales 3/0 hardcodeados en `CASE`. Slack = `dias_habiles_entre(hoy, fecha_compromiso) − suma_dias_restantes`.
- Mapa de colores CSS: `app/components/kanban/semaforo-badge.tsx:3-7` (`SemaforoDot`).
- Config admin existente: `/admin/config` → `app/app/(dashboard)/admin/config/page.tsx` (solo lead times); patrón Server Action en `app/lib/actions/lead-time-actions.ts` (`assertIsAdmin()` + `fetch*`/`update*` + `<form action>`).
- Tabla config existente: `lead_time_recurso` (`0003_maestros_mes.sql:65-73`).
- Gantt: `app/components/gantt/gantt-chart.tsx` (525 líneas). Drag-drop `@dnd-kit` (`PointerSensor` 5px, `verticalListSortingStrategy`), `SortableGanttLabel` con handle "≡", optimistic `localRows`, `handleDragEnd` (líneas 166-179) → `arrayMove` + reasignar `prioridad 1..N` → `reordenarPrioridad()`.
- `reordenarPrioridad(items)`: `app/lib/actions/opd-actions.ts:~649-657` — loop `UPDATE op_ds.prioridad_manual`.
- `buildGanttData()`: `app/lib/queries/produccion.ts:176-208`. `GanttRow`/`PhasePlan`/`GanttMeta` en `app/lib/queries/gantt.ts` (GanttRow YA tiene 13 campos: opd_id, ref, op_num, cliente_nombre, semaforo, prioridad_manual, cantidad, score_efectivo, fase_actual, detalle, slack, fases[], baseline[]).
- Tabs de vistas: `app/app/(dashboard)/produccion/produccion-client.tsx` (shadcn `Tabs`, default `kanban`, valores kanban|gantt|tabla|tiempos).
- `phase_promises` (PK `opd_id,fase`) — `0045_phase_promises.sql`. `setPhasePromise(opdId,fase,fecha)` + `assertPuedeEditarFase(sb,actor,fase)` en `opd-actions.ts:~422-449` (admin/directivo cualquier fase; lider_fase solo su `fase_asignada`; visualizacion bloqueado).
- `/mi-fase`: `page.tsx` obtiene `userFase` de `usuarios_sistema.fase_asignada`; `mi-fase-client.tsx` columna "Mi promesa" (input date onBlur, líneas ~629-646; carga promesas líneas ~396-405).
- `usuarios_sistema` (`0016`): `rol rol_sistema_enum` (admin|directivo|lider_fase|visualizacion) + `fase_asignada fase_enum`.
- NO existe vista WIP. NO existe filtro por fase en /produccion (sí implícito en /mi-fase).
- Satélites hoy = "caja negra": `op_ds.fecha_promesa_satelites`, `fecha_recepcion_satelites`, `dias_satelites` (`0004_nucleo.sql:59,80-81`). NO hay subestados.
- `op_d_componentes` (telas/corte, `0033`), `op_d_pendientes` (reprocesos, `0007`) — referencias de patrón sub-estado.

---

## Feature A — Semáforo configurable + luz por fase

### A1. Migración `0049_semaforo_config.sql`
```sql
CREATE TABLE semaforo_config (
  scope   TEXT NOT NULL DEFAULT 'general',   -- 'general' | 'fase'
  fase    fase_enum,                          -- NULL si scope='general'
  umbral_verde    SMALLINT NOT NULL DEFAULT 3,   -- slack >= => verde
  umbral_amarillo SMALLINT NOT NULL DEFAULT 0,   -- slack >= => amarillo, si no rojo
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (scope, fase)
);
INSERT INTO semaforo_config(scope,fase,umbral_verde,umbral_amarillo)
  VALUES ('general', NULL, 3, 0);   -- regla base
```
- Función `semaforo_de(slack INT, fase fase_enum) RETURNS semaforo_enum` `SECURITY DEFINER SET search_path=public`: lee override por fase si existe, si no usa la regla `general`; aplica verde/amarillo/rojo.

### A2. Migración `0050_semaforo_por_fase.sql`
- **General:** `CREATE OR REPLACE VIEW v_slack` reemplazando el `CASE` hardcodeado por `semaforo_de(slack, NULL)`. ⚠ Basar el `CREATE OR REPLACE` en la definición **vigente** de `v_slack` (verificar con MCP `execute_sql`, no solo 0010 — pudo redefinirse en migraciones posteriores).
- **Luz por fase:** vista `v_semaforo_fase(opd_id, fase, slack_fase, semaforo_fase)`:
  - `slack_fase = dias_habiles_entre(CURRENT_DATE, COALESCE(promesa.fecha_promesa, pp.due_date))` para cada fase aún no terminada (`fase >= fase_actual`), uniendo `phase_plans` (pp) y `phase_promises` (promesa).
  - `semaforo_fase = semaforo_de(slack_fase, fase)` (usa override por fase).
  - ⚠ **Confirmar fórmula exacta de `slack_fase`** (hoy-vs-plan vs promesa-vs-plan) con un caso real antes de cablear UI.

### A3. Backend — `app/lib/actions/semaforo-actions.ts` (nuevo)
- Espeja `lead-time-actions.ts`: `fetchSemaforoConfig()` + `upsertSemaforoRegla(scope, fase|null, umbralVerde, umbralAmarillo)` con `assertIsAdmin()`. Validar `umbral_verde > umbral_amarillo`.

### A4. UI config — extender `app/app/(dashboard)/admin/config/page.tsx`
- Sección "Reglas de semáforo": fila "General" + una fila por fase (override opcional), inputs verde/amarillo, mismo patrón `<form action={server action}>` que lead times.

### A5. UI consumo luz por fase
- Exponer `v_semaforo_fase` en payload (`app/lib/queries/produccion.ts`); mostrar punto de color por fase en drawer tab Plan (junto a cada promesa) y en la vista Feature D. Reusar `SemaforoDot`. NO tocar `semaforo-badge.tsx` (colores fijos).

---

## Feature B — Subestados de satélites

### B1. Migración `0051_satelite_subestado.sql`
```sql
CREATE TYPE satelite_subestado_enum AS ENUM ('corte_externo','marcacion','confeccion','paquete_completo');
ALTER TABLE op_ds ADD COLUMN subestado_satelite satelite_subestado_enum DEFAULT NULL;
CREATE TABLE satelite_subfase_promesa (
  opd_id UUID NOT NULL REFERENCES op_ds(id) ON DELETE CASCADE,
  subestado satelite_subestado_enum NOT NULL,
  fecha_promesa DATE NOT NULL,
  set_by TEXT NOT NULL, set_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (opd_id, subestado)
);
ALTER TYPE phase_event_tipo_enum ADD VALUE 'satelite_subestado_change';
```
(NO reusar `phase_promises` porque su PK es `(opd_id,fase)`; movimiento libre = solo update + evento, sin gate de orden.)

### B2. Backend — `app/lib/actions/opd-actions.ts`
- `setSubestadoSatelite(opdId, subestado)`: `assertPuedeEditarFase(sb, actor, 'satelites')`, update `op_ds.subestado_satelite`, evento `satelite_subestado_change`, `updateTag("produccion")`.
- `setSubfasePromesaSatelite(opdId, subestado, fecha)`: mismo guard, upsert en `satelite_subfase_promesa` (`onConflict: "opd_id,subestado"`).

### B3. Frontend líder satélites — `mi-fase-client.tsx`
- Cuando `userFase==='satelites'`: por fila, selector de subestado (4, orden libre) + input date de promesa por subestado (patrón onBlur de "Mi promesa", ~líneas 629-646).

### B4. Vista general
- `app/lib/fases.ts`: `SUBESTADO_SATELITE_ORDEN` + `SUBESTADO_LABEL`.
- Kanban (`opd-card.tsx`) y tabla (`opd-table.tsx`): badge con `subestado_satelite` cuando `fase_actual==='satelites'`. Incluir `subestado_satelite` en `get_opds_data()` (RPC `0047` → bump) y en la query de kanban.

---

## Feature C — Vista WIP (Gantt actual, solo consulta) — sin migración

- `produccion-client.tsx`: relabelar `<TabsTrigger value="gantt">Gantt</TabsTrigger>` → `value="wip">WIP`. Pasar prop `readOnly` a `GanttChart`.
- `gantt-chart.tsx`: cuando `readOnly`, NO montar `DndContext`/`SortableContext`/`PointerSensor`; labels como filas estáticas (extraer el contenido visual de `SortableGanttLabel` a un componente plano reutilizado por ambos modos); ocultar handle "≡". Conservar timeline (fases vs baseline), zoom, search, column picker.

---

## Feature D — Nueva vista "Gantt por fase" con prioridad por fase

### D1. Migración `0052_prioridad_fase.sql`
```sql
CREATE TABLE op_d_prioridad_fase (
  opd_id UUID REFERENCES op_ds(id) ON DELETE CASCADE,
  fase fase_enum NOT NULL,
  prioridad INTEGER NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (opd_id, fase)
);
```
Independiente de `op_ds.prioridad_manual` (global, queda para compatibilidad / deprecable). "Ranking" automático = `score_efectivo` (de `v_score`).

### D2. Backend
- `reordenarPrioridadFase(fase, items: {opdId, prioridad}[])` en `opd-actions.ts` (espeja `reordenarPrioridad`): upsert por lote en `op_d_prioridad_fase` (`onConflict: "opd_id,fase"`). Asigna `1..N` en orden recibido (arrayMove → reasignar consecutivos: tope = "1", desplaza abajo; y viceversa).
- Query: nueva función en `produccion.ts` o RPC que para fase F devuelve OP-Ds activas con `fase_actual <= F`, con `score_efectivo` (ranking), `prioridad` (de `op_d_prioridad_fase` para F, NULLS last), plan/baseline para timeline, `semaforo_fase` (A2). Orden inicial: `prioridad ASC NULLS LAST, score_efectivo DESC`.

### D3. Frontend
- Nuevo tab en `produccion-client.tsx`: `value="prioridad">Gantt por fase` con **selector de fase** (patrón `faseSel` de `mi-fase-client.tsx`; default = primera fase operativa).
- Componente `app/components/gantt/gantt-por-fase.tsx` (o variante de `gantt-chart.tsx`): drag-drop `@dnd-kit` (NO readOnly), dos columnas panel izq: **Ranking** (`score_efectivo`, solo lectura) + **Prioridad** (número editable por drag). `handleDragEnd` → `reordenarPrioridadFase(faseSel, items)` (optimistic con `localRows`). Al cambiar fase, recomputar filas.

### D4. Kanban honra prioridad por fase
- `app/lib/queries/kanban.ts`: columna de fase F ordenada por `op_d_prioridad_fase.prioridad` (para `fase=F`, solo OP-Ds con `fase_actual=F` → saltando las que no están en la fase) con `NULLS LAST, score_efectivo DESC` de desempate. LEFT JOIN a `op_d_prioridad_fase`.

---

## Verificación

- **A:** `cd app && npm run typecheck`. Cambiar umbral en `/admin/config`, verificar (MCP `execute_sql`) que `v_slack` reclasifica; verificar `v_semaforo_fase` con OP-D que tenga `phase_promises`. Override por fase: `corte` más estricto, confirmar que solo afecta esa fase.
- **B:** como líder satélites en `/mi-fase`, cambiar subestado y promesa por subestado; verificar `op_ds.subestado_satelite`, fila en `satelite_subfase_promesa`, evento `satelite_subestado_change`. Badge en Kanban/tabla.
- **C:** tab WIP → sin handle "≡", arrastrar no reordena; timeline y zoom intactos.
- **D:** "Gantt por fase" → seleccionar fase, ver OP-Ds en ejecución + previas; arrastrar al tope → toma "1" y desplaza; verificar `op_d_prioridad_fase`; columna de la fase en Kanban respeta el orden y omite OP-Ds no presentes.
- Por feature: `npm run typecheck` + `npm run build`; regenerar tipos (`supabase gen types typescript --local > app/types/supabase.ts`) tras migración con cambios de schema. Commit `[db+app]`; push dispara deploy.

## A confirmar en implementación
- Fórmula exacta de `slack_fase` (A2) — validar con caso real antes de UI.
- Deprecación de `op_ds.prioridad_manual` global y del drag en WIP — se mantiene el dato, se retira solo la UI de arrastre.
