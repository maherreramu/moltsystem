# Plan — Gantt por fase: fix prioridad manual + columnas completas

> **Estado:** IMPLEMENTADO 2026-06-22 (commit `f29626dd`). Typecheck limpio.
> **Alcance:** solo capa app, un archivo (`app/components/gantt/gantt-por-fase.tsx`). Sin migraciones.
> **Fecha:** 2026-06-22

---

## Contexto

La ronda anterior (migración `0053` con permisos de escritura en `op_d_prioridad_fase` + filtro
`fase_actual === faseSel` + error handling en `reordenarPrioridadFase`) **ya está desplegada y
verificada** (CI run `27995994297` success, 2026-06-23 01:33 UTC; migración 0053 aplicada vía MCP).

Quedan 3 puntos del feedback del usuario sobre el tab **"Gantt por fase"** (`/produccion`):

### Issue 1 — Columnas incompletas
El column picker del Gantt por fase tiene menos columnas que el de WIP (`gantt-chart.tsx`
`GANTT_COLS`). Falta **Descripción** (detalle). Hay que ampliar la lista para igualar las columnas
de datos del WIP.

### Issue 2 — Filtro (NO requiere cambio de código)
El usuario reportó que "sigue mostrando todas las OP-Ds". **El código ya es correcto y está
desplegado**: `gantt-por-fase.tsx` filtra `r.fase_actual === faseSel` (línea ~189-191). El deploy
con ese filtro (commit `309608fa`) landó a las 01:33 UTC; la captura del usuario es de las ~01:41
UTC. Es casi seguro una **pestaña/caché vieja**. Acción: hard-refresh (Ctrl+Shift+R) tras el nuevo
deploy. Si persiste tras hard-refresh sobre el nuevo deploy, recién ahí investigar la data de
`allRows` (valores reales de `fase_actual`). **No tocar código por esto.**

### Issue 3 — Prioridad manual deja empates (BUG REAL)
Al escribir un número en el input de prioridad, `handleSavePrioridad` (`gantt-por-fase.tsx:220-223`)
solo fija ESE `opd_id` y persiste 1 fila; no reordena ni renumera el resto → quedan empates (la
captura mostró `1, 2, 4, 4`). Debe comportarse como el arrastre: insertar la fila en la posición
pedida y empujar/renumerar todas las filas de la fase 1..N.

---

## Cambio 1 — Prioridad manual: insertar + renumerar todas (issue 3)

**Archivo:** `app/components/gantt/gantt-por-fase.tsx`

Reescribir `handleSavePrioridad` para reusar el patrón de `handleDragEnd` (líneas 225-239):

```typescript
function handleSavePrioridad(opdId: string, prioridad: number) {
  setLocalRows(prev => {
    const curIdx = prev.findIndex(r => r.opd_id === opdId);
    if (curIdx < 0) return prev;
    const target = Math.min(Math.max(prioridad, 1), prev.length) - 1; // clamp [1..N] → idx
    const next = arrayMove(prev, curIdx, target);
    const items = next.map((r, i) => ({ opdId: r.opd_id, prioridad: i + 1 }));
    setPrioridadMap(new Map(items.map(it => [it.opdId, it.prioridad])));
    reordenarPrioridadFase(faseSel, items);
    return next;
  });
}
```

Tras esto cada fila de la fase queda con prioridad explícita 1..N — sin empates ni nulls mezclados.

El input en `SortableRow` (`onBlur`, líneas 72-79) ya llama `onSavePrioridad(row.opd_id, n)`.
Mantenerlo, pero **quitar la guarda `n !== prioridad`** que bloquea reentradas con el mismo número
visible (el clamp + reorder son idempotentes — basta validar `!isNaN(n)`):

```typescript
function onBlur() {
  const n = parseInt(val);
  if (!isNaN(n)) {
    startTransition(() => { onSavePrioridad(row.opd_id, n); });
  } else {
    setVal(prioridad?.toString() ?? "");
  }
}
```

**Notas técnicas:**
- `arrayMove` ya está importado (línea 12).
- `reordenarPrioridadFase(fase, items[])` ya persiste el batch completo (upsert por cada item, con
  error handling correcto tras la ronda anterior).
- Ejemplo: filas `[A=1,B=2,C=3,D=4]`, usuario escribe `1` en D → `curIdx=3, target=0` →
  `arrayMove` → `[D,A,B,C]` → renumera `D=1,A=2,B=3,C=4`. Sin empates.

## Cambio 2 — Igualar columnas con el WIP (issue 1)

**Archivo:** `app/components/gantt/gantt-por-fase.tsx`

1. Añadir `{ key: "descripcion", label: "Descripción" }` a `GPFASE_COLS` (línea 35) y
   `descripcion: false` a `GPFASE_DEFAULTS` (línea 43). `useColumnPrefs` mergea claves nuevas con su
   default (`column-prefs.ts:14` → `{ ...defaults, ...stored }`), así que no rompe prefs guardadas.

2. Renderizar la celda en `SortableRow`, justo después de Ref (mismo patrón que
   `gantt-chart.tsx:82-86`):
   ```tsx
   {colVis.descripcion !== false && (
     <span className="text-[10px] text-gray-500 truncate w-24 flex-none" title={row.detalle ?? ""}>
       {row.detalle ?? "—"}
     </span>
   )}
   ```

3. Agregar la cabecera correspondiente en el header del panel izquierdo (líneas 397-408):
   ```tsx
   {colVis.descripcion !== false && <span className="text-[9px] font-semibold text-gray-500 w-24 flex-none">Descr.</span>}
   ```
   Ubicarla después de "Ref".

4. Sumar su ancho en el cálculo de `labelW` (líneas 171-180): `if (colVis.descripcion !== false) w += 100;` (`w-24` ≈ 96px + gap).

Resultado: el picker ofrece Descripción, Cliente, Uds, Fase actual, Slack, Score, Semáforo (las
mismas columnas de datos del WIP). **Prioridad** (input editable) y **Ref** permanecen siempre
visibles por ser el núcleo de esta vista — no se vuelven toggleables.

---

## Verificación

1. `cd app && npm run typecheck` — limpio.
2. `cd app && npm run build` — limpio.
3. **Empates (issue 3):** Gantt por fase → escribir `1` en una fila que estaba abajo → esa fila sube
   a la cima y el resto se renumera 2,3,4… sin duplicados. Recargar → orden persiste. Ir a Kanban →
   esa columna refleja el orden.
4. **Columnas (issue 1):** abrir el column picker → aparece "Descripción" y las mismas opciones que
   en WIP; activarla muestra el detalle en la fila.
5. **Filtro (issue 2):** hard-refresh (Ctrl+Shift+R); seleccionar "Corte" → solo OP-Ds con
   `fase_actual = corte`. (Sin cambio de código — solo confirmación post-deploy.)
6. Commit `[app] fix: gantt por fase renumera prioridad manual + columna descripción`.
   **Sin push hasta confirmar typecheck + build** (el usuario decide el push).

## Notas

- Sin migraciones nuevas; solo capa app, un archivo (`app/components/gantt/gantt-por-fase.tsx`).
- Archivos de referencia: `app/components/gantt/gantt-chart.tsx` (patrón WIP de columnas),
  `app/lib/column-prefs.ts` (hook de prefs), `app/lib/actions/opd-actions.ts`
  (`reordenarPrioridadFase`, ~línea 686).
