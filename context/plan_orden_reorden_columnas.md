# Plan — Ordenar y reordenar columnas en vistas de producción

> **Estado:** PLANEADO (no implementado). Documento de handoff para continuar en otra sesión.
> Creado 2026-06-24. Plan aprobado por el usuario.

## Context

El usuario reporta dos necesidades en las vistas de `/produccion` y `/mi-fase`:

1. **Ordenar por columna ("sort") aún no funciona** en WIP y Gantt-por-fase.
   - **WIP** (`gantt-chart.tsx`, `readOnly`): el dropdown de orden *sí* existe (commit b15bfcbe) y no está bloqueado por `readOnly` — debe funcionar; se verifica/repara.
   - **Gantt por fase** (`gantt-por-fase.tsx`): **no tiene ningún UI de orden** — solo drag + prioridad manual. Esta es la brecha real.

2. **Reordenar (mover) columnas** en WIP, Gantt-por-fase, Tabla de Mi Fase y Tabla de /produccion. Hoy `useColumnPrefs` solo maneja *visibilidad*, no orden. Decisión del usuario: reordenar **arrastrando dentro del picker "Columnas"** (consistente en las 4 vistas, incluido el Gantt de dos paneles).

Resultado esperado: en las 4 vistas el usuario puede (a) ordenar las filas por la columna que elija y (b) arrastrar para reordenar las columnas, con persistencia en localStorage por vista.

---

## Parte A — Sorting

### A1. Gantt por fase: agregar dropdown de orden (`app/components/gantt/gantt-por-fase.tsx`)
Replicar el patrón ya existente en `gantt-chart.tsx`:
- Estado `gpfSortCol` (default `"prioridad"`) + `gpfSortDir` (`"asc"|"desc"`).
- En el `rows` useMemo (línea ~394): si `gpfSortCol !== "prioridad"`, aplicar un comparador (mismas claves que gantt-chart: `semaforo, semaforo_fase, score_efectivo, slack, slack_fase, cliente_nombre, ref, fase_actual, fecha_compromiso, cantidad, dias_plan_restantes`) con manejo de nulls al final.
- Toolbar (junto al `ColumnPicker`, línea ~529): `<select>` de columna + botón `↑/↓` (visible solo cuando `gpfSortCol !== "prioridad"`).
- `dragEnabled = gpfSortCol === "prioridad"`: cuando se ordena por columna, deshabilitar el drag (render de filas sin `useSortable`/handle). Ver A3 sobre el wrapper de fila.

### A2. WIP gantt: verificar/reparar (`app/components/gantt/gantt-chart.tsx`)
El dropdown ya existe en el toolbar y el `rows` useMemo (líneas ~338-369) ordena sin depender de `readOnly`. Verificar end-to-end que al elegir columna se reordenan **ambos paneles** (labels + timeline). Si falla, corregir; lo más probable es que ya funcione y el usuario lo confundió con Gantt-por-fase.

### A3. Wrapper de fila sortable/estática en Gantt-por-fase
`useSortable` es un hook → no puede llamarse condicionalmente. Extraer las celdas de `SortableRow` a `GpfLabelCells` (ver B3) y crear dos wrappers: `SortableRow` (con hook + handle) y `StaticRow` (sin hook). Renderizar uno u otro según `dragEnabled`.

---

## Parte B — Reordenar columnas (infra compartida + 4 vistas)

### Patrón general (aplica a las 4 vistas)
Cada vista define un **registro de columnas** ordenable: para cada `key` un `{ label, hideable, render de header, render de celda }`. El header y el cuerpo se renderizan **iterando `order`** (filtrado por visibilidad), en vez de la secuencia hardcodeada actual. Columnas estructurales que NO se reordenan (checkbox de selección, handle `≡` de drag, columna "Acciones") se renderizan fuera del loop, fijas en los extremos.

### B1. Extender `useColumnPrefs` (`app/lib/column-prefs.ts`)
- Nuevo parámetro opcional `defaultOrder?: string[]` (si se omite, `Object.keys(defaults)`).
- Nueva clave de localStorage **separada** `col-order:{viewKey}` (no toca `col-prefs:{viewKey}` → sin migración).
- Al cargar, **reconciliar** el orden guardado con `defaultOrder`: conservar el orden guardado, **anexar** claves nuevas que no estén, y **descartar** claves que ya no existan (robusto ante cambios futuros de columnas).
- Devolver además `order: string[]`, `move(from: number, to: number)` y que `reset()` también limpie `col-order:{viewKey}`.

### B2. `ColumnPicker` arrastrable (`app/components/ui/column-picker.tsx`)
- `ColDef` pasa a `{ key; label; hideable?: boolean }` (default `hideable: true`).
- Nuevas props: `order: string[]`, `onReorder: (from, to) => void`.
- Renderizar la lista en el orden de `order` (`order.map(k => cols.find(c => c.key === k))`).
- Envolver la lista en `DndContext` + `SortableContext` (`@dnd-kit/sortable`, ya instalado) con un handle (ícono grip) por item.
- Items con `hideable === false`: sin checkbox (o checkbox deshabilitado marcado), pero **sí** arrastrables.

### B3. Vistas Gantt — registro de celdas (`gantt-chart.tsx` y `gantt-por-fase.tsx`)
Las dos vistas tienen su **propia** cadena de `if (colVis.X)` hardcodeada (con anchos en `labelW` y clases por columna distintas entre sí — preservarlas exactamente). Para cada una:
- Crear `COL_DEF: Record<key, { w: number; headerCls: string; header: ReactNode; cell: (row) => ReactNode }>` capturando el ancho y las clases tal cual están hoy.
- `labelW` = base + suma de `w` de las columnas **visibles** (independiente del orden).
- Header: `order.filter(visible).map(key => <span className={def.headerCls}>{def.header}</span>)`.
- Cuerpo (`GanttLabelCells` / `GpfLabelCells`): `order.filter(visible).map(key => def.cell(row))`.
- En Gantt-por-fase la columna `prioridad` es un `<input>` editable y `ref` usa `flex-1` — manejar como casos especiales dentro del registro.
- `GANTT_COLS` / `GPFASE_COLS` ya listan las 26 columnas (todas `hideable`), así que `order` cubre todo; el único elemento fijo es el handle `≡`.

### B4. Tabla de Mi Fase (`app/app/(dashboard)/mi-fase/mi-fase-client.tsx`)
Hoy: array de tuplas para headers (líneas ~643-676) + celdas `<td>` dispersas (líneas ~680-804), con columnas siempre-visibles (`ref, cliente, fase, semaforo, fin plan, compromiso`) intercaladas con las toggleables.
- Construir un registro completo `MI_FASE_COL_DEF: Record<key, { label; hideable; renderCell(o) }>` que incluya **todas** las columnas de datos (asignar keys a las que hoy tienen `visKey=null`, p. ej. `ref, cliente, fase_actual, semaforo, fecha_fin_planeada, fecha_compromiso`).
- Pinnear fuera del loop: checkbox de selección (izquierda) y "Acciones" (derecha).
- `order` cubre las columnas de datos; las no-toggleables van con `hideable:false` en el picker (reordenables, no ocultables).
- Header y `<td>` se generan iterando `order`. Conservar casos especiales: `promesa_fase` editable, `userFase==="satelites"` (columna "Subestado sat."), `pendientes`.
- El `sortIndicator`/`toggleSort` existentes se conectan al header generado.

### B5. Tabla de /produccion (`app/components/tabla/opd-table.tsx`)
La más simple — TanStack soporta orden nativo:
- Agregar estado `columnOrder` sincronizado con `order` de `useColumnPrefs`, pasarlo a `state.columnOrder` y `onColumnOrderChange`.
- Construir `columnOrder` como `[<ids pinned: select>, ...order, <resto por defecto>]` para que la columna de selección quede fija.
- `TOGGLEABLE_COLS` se amplía conceptualmente: el picker maneja el orden; columnas no-toggleables (`ref`, `cliente`, `fase`, etc.) entran como `hideable:false` para poder moverlas sin ocultarlas.
- El sort por header de TanStack ya funciona — no se toca.

---

## Archivos a modificar
- `app/lib/column-prefs.ts` — orden + reconciliación + persistencia (infra).
- `app/components/ui/column-picker.tsx` — drag-reorder + `hideable` (infra).
- `app/components/gantt/gantt-por-fase.tsx` — sort dropdown + registro de columnas + wrapper sortable/estático.
- `app/components/gantt/gantt-chart.tsx` — verificar sort + registro de columnas.
- `app/app/(dashboard)/mi-fase/mi-fase-client.tsx` — registro de columnas (header + celdas) por `order`.
- `app/components/tabla/opd-table.tsx` — `columnOrder` de TanStack ligado a `useColumnPrefs`.

## Orden de implementación sugerido
1. B1 + B2 (infra compartida) → typecheck.
2. B5 (opd-table, la más fácil; valida la infra end-to-end).
3. A1 + A3 (sort de Gantt-por-fase).
4. B3 (registros de las 2 vistas Gantt — el grueso del trabajo y mayor riesgo visual).
5. B4 (mi-fase).
6. A2 (verificación final del sort WIP).

## Riesgos
- **Regresión visual en los Gantt**: la cadena de `if` con anchos por píxel es frágil. Mitigación: copiar `className`/anchos exactos al registro y comparar contra la versión actual columna por columna.
- **Interacción sort + drag**: al ordenar por columna debe desactivarse el drag (ya contemplado con `dragEnabled`).

## Verificación
- `cd app && npm run typecheck` tras cada fase.
- `cd app && npm run dev` y probar manualmente en `/produccion` (pestañas WIP, Gantt por fase, Tabla) y `/mi-fase`:
  1. **Sort**: en cada vista, elegir distintas columnas y direcciones; confirmar que las filas (y en Gantt, ambos paneles) se reordenan.
  2. **Reorder**: abrir "Columnas", arrastrar items, confirmar que el header y las celdas se reordenan al instante.
  3. **Persistencia**: recargar la página y confirmar que orden + visibilidad se mantienen (localStorage `col-order:{viewKey}` y `col-prefs:{viewKey}`).
  4. **Reconciliación**: sin limpiar localStorage, confirmar que no hay columnas faltantes ni duplicadas (defaults nuevos se anexan).
- No se requieren migraciones SQL ni cambios de servidor.

---

## Hallazgos clave de la exploración (referencia rápida para retomar)

- **Tabs en `/produccion`** (`produccion-client.tsx`): Kanban, WIP (`GanttChart readOnly`), Gantt por fase (`GanttPorFase`), Tabla (`OPDTable`), Tiempos (`TiemposTable`).
- **`useColumnPrefs`** (`app/lib/column-prefs.ts`): hoy solo `{ visibility, toggle, reset }`, persiste en `col-prefs:{viewKey}`.
- **`ColumnPicker`** (`app/components/ui/column-picker.tsx`): `ColDef = { key; label }`, solo checkboxes de visibilidad, sin reorder.
- **View keys**: `produccion-tabla`, `mi-fase`, `gantt`, `gantt-por-fase`.
- **@dnd-kit** ya instalado (core 6.3.1, sortable 10.0.0); usado para filas/cards, no para columnas.
- **Las 2 vistas Gantt NO comparten** el render de celdas: `gantt-chart.tsx` tiene `GanttLabelCells` y `gantt-por-fase.tsx` tiene su propio `SortableRow` con cadena de `if` y anchos distintos.
- **opd-table.tsx**: TanStack React Table, soporta `columnOrder` nativo (no cableado aún).
