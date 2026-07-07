"use client";

import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import type { GanttRow } from "@/lib/queries/gantt";
import { FASE_LABEL, FASES_ORDEN, SUBESTADO_LABEL, SUBESTADO_SATELITE_ORDEN } from "@/lib/fases";
import type { Enums } from "@/types/supabase";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { reordenarPrioridad } from "@/lib/actions/opd-actions";
import { useViewPrefs } from "@/lib/column-prefs";
import { ColumnPicker, type ColDef } from "@/components/ui/column-picker";
import type { ViewPrefs } from "@/lib/queries/ui-prefs";
import { fmtNum, fmtDia } from "@/lib/format";
import { exportGanttRowsToXlsx } from "@/lib/export/export-gantt-xlsx";

const GANTT_COLS: ColDef[] = [
  { key: "prioridad",               label: "Prioridad" },
  { key: "semaforo",                label: "Semáforo" },
  { key: "ref",                     label: "Ref" },
  { key: "descripcion",             label: "Descripción" },
  { key: "cliente",                 label: "Cliente" },
  { key: "cantidad",                label: "Uds" },
  { key: "fase",                    label: "Fase actual" },
  { key: "slack",                   label: "Slack" },
  { key: "score",                   label: "Score" },
  { key: "fecha_compromiso",        label: "Compromiso" },
  { key: "comercial",               label: "Comercial" },
  { key: "bloqueada",               label: "Bloqueada" },
  { key: "dias_plan_restantes",     label: "Días rest." },
  { key: "pendientes",              label: "Pendientes" },
  { key: "inicio_plan",             label: "Inicio plan" },
  { key: "fin_plan",                label: "Fin plan" },
  { key: "promesa_fase",            label: "Promesa entrega" },
  { key: "fecha_promesa_satelites", label: "Promesa sat. (legacy)" },
  { key: "fecha_recep_satelites",   label: "Recepción real" },
  { key: "recurso_corte",           label: "Recurso" },
  { key: "tipo_despacho",           label: "Despacho" },
  { key: "colores",                 label: "Colores" },
  { key: "motivo_bloqueo",          label: "Bloqueo" },
  { key: "causa_desvio",            label: "Causa desv." },
  { key: "semaforo_fase",           label: "Sem. Fase" },
  { key: "slack_fase",              label: "Slack Fase" },
  { key: "subfase",                 label: "Subfase" },
  { key: "fecha_ingreso",           label: "Ingreso a fase" },
];
const GANTT_DEFAULTS: Record<string, boolean> = {
  prioridad: true, semaforo: true, ref: true, descripcion: false, cliente: false, cantidad: false, fase: false, slack: false, score: false,
  fecha_compromiso: false, comercial: false, bloqueada: false, dias_plan_restantes: false, pendientes: false,
  inicio_plan: false, fin_plan: false, promesa_fase: false, fecha_promesa_satelites: false, fecha_recep_satelites: false,
  recurso_corte: false, tipo_despacho: false, colores: false, motivo_bloqueo: false, causa_desvio: false,
  semaforo_fase: false, slack_fase: false, subfase: false, fecha_ingreso: true,
};

const GANTT_ORDER_DEFAULT = GANTT_COLS.map(c => c.key);

// Static header cells record for gantt-chart
const GANTT_HEADER: Record<string, React.ReactNode> = {
  prioridad:               <span className="text-[9px] font-semibold text-gray-500 w-4 text-right flex-none">#</span>,
  semaforo:                <span className="text-[9px] font-semibold text-gray-500 w-12 text-center flex-none">Semáforo</span>,
  ref:                     <span className="text-[9px] font-semibold text-gray-500 w-16 flex-none">Ref</span>,
  descripcion:             <span className="text-[9px] font-semibold text-gray-500 w-24 flex-none">Descripción</span>,
  cliente:                 <span className="text-[9px] font-semibold text-gray-500 w-20 flex-none">Cliente</span>,
  cantidad:                <span className="text-[9px] font-semibold text-gray-500 w-10 text-right flex-none">Uds</span>,
  fase:                    <span className="text-[9px] font-semibold text-gray-500 w-16 flex-none">Fase</span>,
  slack:                   <span className="text-[9px] font-semibold text-gray-500 w-10 text-right flex-none">Slack</span>,
  score:                   <span className="text-[9px] font-semibold text-gray-500 w-10 text-right flex-none">Score</span>,
  fecha_compromiso:        <span className="text-[9px] font-semibold text-gray-500 w-16 flex-none">Compromiso</span>,
  comercial:               <span className="text-[9px] font-semibold text-gray-500 w-20 flex-none">Comercial</span>,
  bloqueada:               <span className="text-[9px] font-semibold text-gray-500 w-14 text-center flex-none">Bloq.</span>,
  dias_plan_restantes:     <span className="text-[9px] font-semibold text-gray-500 w-10 text-right flex-none">Días r.</span>,
  pendientes:              <span className="text-[9px] font-semibold text-gray-500 w-10 text-center flex-none">Pend.</span>,
  inicio_plan:             <span className="text-[9px] font-semibold text-gray-500 w-16 flex-none">Inicio</span>,
  fin_plan:                <span className="text-[9px] font-semibold text-gray-500 w-16 flex-none">Fin plan</span>,
  promesa_fase:            <span className="text-[9px] font-semibold text-indigo-500 w-16 flex-none">Prom.entrega</span>,
  fecha_promesa_satelites: <span className="text-[9px] font-semibold text-gray-400 w-16 flex-none">Prom.sat.</span>,
  fecha_recep_satelites:   <span className="text-[9px] font-semibold text-gray-500 w-16 flex-none">Recep.real</span>,
  recurso_corte:           <span className="text-[9px] font-semibold text-gray-500 w-14 flex-none">Recurso</span>,
  tipo_despacho:           <span className="text-[9px] font-semibold text-gray-500 w-16 flex-none">Despacho</span>,
  colores:                 <span className="text-[9px] font-semibold text-gray-500 w-20 flex-none">Colores</span>,
  motivo_bloqueo:          <span className="text-[9px] font-semibold text-gray-500 w-20 flex-none">Bloqueo</span>,
  causa_desvio:            <span className="text-[9px] font-semibold text-gray-500 w-20 flex-none">Causa desv.</span>,
  semaforo_fase:           <span className="text-[9px] font-semibold text-gray-500 w-10 text-center flex-none">Sem.F</span>,
  slack_fase:              <span className="text-[9px] font-semibold text-gray-500 w-10 text-right flex-none">Slack F</span>,
  subfase:                 <span className="text-[9px] font-semibold text-purple-500 w-20 flex-none">Subfase</span>,
  fecha_ingreso:           <span className="text-[9px] font-semibold text-gray-500 w-16 flex-none">Ingreso F.</span>,
};


const FASE_COLOR: Record<Enums<"fase_enum">, string> = {
  fase_0:    "#94a3b8", compras:   "#60a5fa", trazo:     "#34d399",
  corte:     "#fbbf24", tiqueteo:  "#f97316", satelites: "#a78bfa",
  empaque:   "#f472b6", despacho:  "#6ee7b7", cierre:    "#6b7280",
};
const SEM_COLOR: Record<Enums<"semaforo_enum">, string> = {
  verde: "#22c55e", amarillo: "#eab308", rojo: "#ef4444",
};

type ZoomLevel = "anual" | "trimestral" | "mensual" | "semanal";
type FilterMode = "todos" | "incluir" | "excluir";
const ZOOM_BASE: Record<ZoomLevel, number> = {
  anual: 4, trimestral: 12, mensual: 36, semanal: 120,
};
const ZOOM_LABELS: Record<ZoomLevel, string> = {
  anual: "Año", trimestral: "Trimestre", mensual: "Mes", semanal: "Semana",
};
const ZOOM_ORDER: ZoomLevel[] = ["anual", "trimestral", "mensual", "semanal"];

const ROW_H      = 28;
const LABEL_W    = 130;
const HEADER_H   = 40;
const MAX_LABEL_W = 480;
const MS_DAY   = 86_400_000;
const BUFFER   = 20;

function tsOf(s: string) { return new Date(s).getTime(); }

// ─── Contenido visual de la fila izquierda (sin handle) ──────────────────────
function GanttLabelCells({ row, colVis, order }: { row: GanttRow; colVis: Record<string, boolean>; order: string[] }) {
  const inicioPlan = row.fases.find(f => f.fase === row.fase_actual)?.start_date ?? null;
  const finPlan    = row.fases.find(f => f.fase === row.fase_actual)?.due_date ?? null;

  const cells: Partial<Record<string, React.ReactNode>> = {};

  if (colVis.prioridad !== false) cells.prioridad = (
    <span className="text-[9px] text-indigo-400 font-mono flex-none w-4 text-right select-none" title="Prioridad manual">
      {row.prioridad_manual ?? "-"}
    </span>
  );
  if (colVis.semaforo !== false) cells.semaforo = (
    <span className="w-12 flex-none flex justify-center">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: row.semaforo ? SEM_COLOR[row.semaforo] : "#ccc" }} title="Semáforo" />
    </span>
  );
  if (colVis.ref !== false) cells.ref = (
    <span className="font-mono text-[11px] font-semibold truncate text-gray-800 w-16 flex-none"
      title={`${row.ref} · ${row.cliente_nombre}`}>{row.ref}</span>
  );
  if (colVis.descripcion !== false) cells.descripcion = (
    <span className="text-[10px] text-gray-500 truncate w-24 flex-none" title={row.detalle ?? ""}>{row.detalle ?? "—"}</span>
  );
  if (colVis.cliente !== false) cells.cliente = (
    <span className="text-[10px] text-gray-600 truncate w-20 flex-none" title={row.cliente_nombre}>{row.cliente_nombre}</span>
  );
  if (colVis.cantidad !== false) cells.cantidad = (
    <span className="text-[10px] text-gray-600 font-mono truncate w-10 text-right flex-none" title="Cantidad">{fmtNum(row.cantidad)}</span>
  );
  if (colVis.fase !== false) cells.fase = (
    <span className="text-[10px] text-gray-600 truncate w-16 flex-none" title="Fase actual">{FASE_LABEL[row.fase_actual]}</span>
  );
  if (colVis.slack !== false) cells.slack = (
    <span className="text-[10px] font-mono font-medium truncate w-10 text-right flex-none" title="Slack">
      {row.slack != null ? (
        <span className={row.slack >= 3 ? "text-green-600" : row.slack >= 0 ? "text-yellow-600" : "text-red-600"}>
          {row.slack >= 0 ? `+${row.slack}d` : `${row.slack}d`}
        </span>
      ) : "—"}
    </span>
  );
  if (colVis.score !== false) cells.score = (
    <span className="text-[10px] font-bold text-gray-700 truncate w-10 text-right flex-none" title="Score efectivo">{row.score_efectivo ?? "-"}</span>
  );
  if (colVis.fecha_compromiso !== false) cells.fecha_compromiso = (
    <span className="text-[10px] text-gray-600 font-mono w-16 flex-none truncate" title="Fecha compromiso">
      {row.fecha_compromiso ? fmtDia(new Date(row.fecha_compromiso + "T00:00:00")) : "—"}
    </span>
  );
  if (colVis.comercial !== false) cells.comercial = (
    <span className="text-[10px] text-gray-500 truncate w-20 flex-none" title="Comercial">{row.comercial ?? "—"}</span>
  );
  if (colVis.bloqueada !== false) cells.bloqueada = (
    <span className="w-14 flex-none flex justify-center" title="Bloqueada">
      {row.bloqueada
        ? <span className="text-[9px] bg-red-100 text-red-700 px-1 rounded">Bloq.</span>
        : <span className="text-[9px] text-gray-300">—</span>}
    </span>
  );
  if (colVis.dias_plan_restantes !== false) cells.dias_plan_restantes = (
    <span className="text-[10px] font-mono text-gray-600 w-10 text-right flex-none" title="Días plan restantes">{row.dias_plan_restantes ?? "—"}</span>
  );
  if (colVis.pendientes !== false) cells.pendientes = (
    <span className="w-10 flex-none flex justify-center" title="Pendientes abiertos">
      {row.pendientes > 0
        ? <span className="text-[9px] bg-orange-100 text-orange-700 px-1 rounded">{row.pendientes}</span>
        : <span className="text-[9px] text-gray-300">—</span>}
    </span>
  );
  if (colVis.inicio_plan !== false) cells.inicio_plan = (
    <span className="text-[10px] text-gray-600 font-mono w-16 flex-none truncate" title="Inicio plan fase actual">
      {inicioPlan ? fmtDia(new Date(inicioPlan + "T00:00:00")) : "—"}
    </span>
  );
  if (colVis.fin_plan !== false) cells.fin_plan = (
    <span className="text-[10px] text-gray-600 font-mono w-16 flex-none truncate" title="Fin plan fase actual">
      {finPlan ? fmtDia(new Date(finPlan + "T00:00:00")) : "—"}
    </span>
  );
  if (colVis.promesa_fase !== false) cells.promesa_fase = (
    <span className="text-[10px] text-indigo-600 font-mono w-16 flex-none truncate" title="Promesa entrega de la fase actual">
      {row.promesa_fase ? fmtDia(new Date(row.promesa_fase + "T00:00:00")) : "—"}
    </span>
  );
  if (colVis.fecha_promesa_satelites !== false) cells.fecha_promesa_satelites = (
    <span className="text-[10px] text-gray-400 font-mono w-16 flex-none truncate" title="Promesa satélites (legacy — ver Promesa entrega)">
      {row.fecha_promesa_satelites ? fmtDia(new Date(row.fecha_promesa_satelites + "T00:00:00")) : "—"}
    </span>
  );
  if (colVis.fecha_recep_satelites !== false) cells.fecha_recep_satelites = (
    <span className="text-[10px] text-gray-600 font-mono w-16 flex-none truncate" title="Recepción real satélites">
      {row.fecha_recepcion_satelites ? fmtDia(new Date(row.fecha_recepcion_satelites + "T00:00:00")) : "—"}
    </span>
  );
  if (colVis.recurso_corte !== false) cells.recurso_corte = (
    <span className="text-[10px] text-gray-500 truncate w-14 flex-none" title="Recurso de corte">{row.recurso_corte ?? "—"}</span>
  );
  if (colVis.tipo_despacho !== false) cells.tipo_despacho = (
    <span className="text-[10px] text-gray-500 truncate w-16 flex-none" title="Tipo de despacho">{row.tipo_despacho ?? "—"}</span>
  );
  if (colVis.colores !== false) cells.colores = (
    <span className="text-[10px] text-gray-500 truncate w-20 flex-none" title="Colores">{row.colores ?? "—"}</span>
  );
  if (colVis.motivo_bloqueo !== false) cells.motivo_bloqueo = (
    <span className="text-[10px] text-gray-500 truncate w-20 flex-none" title="Motivo de bloqueo">{row.motivo_bloqueo ?? "—"}</span>
  );
  if (colVis.causa_desvio !== false) cells.causa_desvio = (
    <span className="text-[10px] text-gray-500 truncate w-20 flex-none" title="Causa de desvío">{row.causa_desvio ?? "—"}</span>
  );
  if (colVis.semaforo_fase !== false) cells.semaforo_fase = (
    <span className="w-10 flex-none flex justify-center" title="Semáforo de fase">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: row.semaforo_fase ? SEM_COLOR[row.semaforo_fase] : "#ccc" }} />
    </span>
  );
  if (colVis.slack_fase !== false) cells.slack_fase = (
    <span className="text-[10px] font-mono font-medium truncate w-10 text-right flex-none" title="Slack de fase">
      {row.slack_fase != null ? (
        <span className={row.slack_fase >= 3 ? "text-green-600" : row.slack_fase >= 0 ? "text-yellow-600" : "text-red-600"}>
          {row.slack_fase >= 0 ? `+${row.slack_fase}d` : `${row.slack_fase}d`}
        </span>
      ) : "—"}
    </span>
  );
  if (colVis.subfase !== false) cells.subfase = (
    <span className="text-[10px] text-purple-600 truncate w-20 flex-none" title="Subfase satélites">
      {row.fase_actual === "satelites" && row.subestado_satelite
        ? SUBESTADO_LABEL[row.subestado_satelite]
        : "—"}
    </span>
  );
  if (colVis.fecha_ingreso !== false) cells.fecha_ingreso = (
    <span className="text-[10px] text-gray-600 font-mono w-16 flex-none truncate" title="Fecha de ingreso a la fase actual">
      {row.fecha_ingreso_fase ? fmtDia(new Date(row.fecha_ingreso_fase + "T00:00:00")) : "—"}
    </span>
  );

  return (
    <>
      {order.map(k => cells[k] != null ? <React.Fragment key={k}>{cells[k]}</React.Fragment> : null)}
    </>
  );
}

// ─── Sortable left-panel label (drag-and-drop) ───────────────────────────────
function SortableGanttLabel({ row, bg, colVis, order, onClick }: { row: GanttRow; bg: string; colVis: Record<string, boolean>; order: string[]; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.opd_id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, height: ROW_H, background: bg }}
      className="flex items-center gap-1.5 px-1.5 border-b border-gray-100 hover:bg-blue-50"
      onClick={onClick}>
      <span {...attributes} {...listeners}
        className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing text-[13px] flex-none select-none w-4 text-center"
        title="Arrastrar para reordenar" onClick={e => e.stopPropagation()}>
        ≡
      </span>
      <GanttLabelCells row={row} colVis={colVis} order={order} />
    </div>
  );
}

// ─── Static label (read-only, sin drag) ──────────────────────────────────────
function StaticGanttLabel({ row, bg, colVis, order, onClick }: { row: GanttRow; bg: string; colVis: Record<string, boolean>; order: string[]; onClick: () => void }) {
  return (
    <div
      style={{ height: ROW_H, background: bg }}
      className="flex items-center gap-1.5 px-1.5 border-b border-gray-100 hover:bg-blue-50 cursor-pointer"
      onClick={onClick}>
      <GanttLabelCells row={row} colVis={colVis} order={order} />
    </div>
  );
}

type Props = {
  data: GanttRow[];
  festivos: string[];
  onSelectOpd: (id: string) => void;
  readOnly?: boolean;
  initialPrefs?: ViewPrefs;
  onSavePrefs?: (viewKey: string, patch: Partial<ViewPrefs>) => void;
};

export function GanttChart({ data, festivos, onSelectOpd, readOnly = false, initialPrefs, onSavePrefs }: Props) {
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("trimestral");
  const [zoomFactor, setZoomFactor] = useState(1);   // multiplicador continuo sobre el base
  const [showBaseline, setShowB]  = useState(true);
  const [search, setSearch]       = useState("");
  const [subfaseSel, setSubfaseSel] = useState<"todas" | string>("todas");
  const [faseFilterMode, setFaseFilterMode] = useState<FilterMode>("todos");
  const [faseFilterSet, setFaseFilterSet] = useState<Set<Enums<"fase_enum">>>(new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const [localRows, setLocalRows] = useState<GanttRow[]>(() => data);

  const { visibility: colVis, toggle: toggleCol, reset: resetCols, order: colOrder, move: moveCol, sortCol: ganttSortCol, sortDir: ganttSortDir, setSort: setGanttSort } =
    useViewPrefs("gantt", GANTT_DEFAULTS, GANTT_ORDER_DEFAULT, { sortCol: "prioridad", sortDir: "asc" }, initialPrefs, onSavePrefs ?? (() => {}));

  const labelW = useMemo(() => {
    let w = (readOnly || ganttSortCol !== "prioridad") ? 8 : 24;
    if (colVis.prioridad               !== false) w += 20;
    if (colVis.semaforo                !== false) w += 48;
    if (colVis.ref                     !== false) w += 68;
    if (colVis.descripcion             !== false) w += 100;
    if (colVis.cliente                 !== false) w += 84;
    if (colVis.cantidad                !== false) w += 44;
    if (colVis.fase                    !== false) w += 68;
    if (colVis.slack                   !== false) w += 44;
    if (colVis.score                   !== false) w += 44;
    if (colVis.fecha_compromiso        !== false) w += 68;
    if (colVis.comercial               !== false) w += 84;
    if (colVis.bloqueada               !== false) w += 60;
    if (colVis.dias_plan_restantes     !== false) w += 44;
    if (colVis.pendientes              !== false) w += 44;
    if (colVis.inicio_plan             !== false) w += 68;
    if (colVis.fin_plan                !== false) w += 68;
    if (colVis.promesa_fase            !== false) w += 68;
    if (colVis.fecha_promesa_satelites !== false) w += 68;
    if (colVis.fecha_recep_satelites   !== false) w += 68;
    if (colVis.recurso_corte           !== false) w += 60;
    if (colVis.tipo_despacho           !== false) w += 68;
    if (colVis.colores                 !== false) w += 84;
    if (colVis.motivo_bloqueo          !== false) w += 84;
    if (colVis.causa_desvio            !== false) w += 84;
    if (colVis.semaforo_fase           !== false) w += 44;
    if (colVis.slack_fase              !== false) w += 44;
    if (colVis.subfase                 !== false) w += 84;
    return w + 16;
  }, [colVis, readOnly, ganttSortCol]);

  const leftRef   = useRef<HTMLDivElement>(null);
  const rightRef  = useRef<HTMLDivElement>(null);
  const syncing   = useRef(false);
  const [stableNow] = useState(() => Date.now());

  // Sync localRows when server data refreshes (preserve drag order only if prioridad_manual set)
  useEffect(() => { queueMicrotask(() => setLocalRows(data)); }, [data]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const fasesDisponibles = useMemo(
    () => FASES_ORDEN.filter(fase => localRows.some(row => row.fase_actual === fase)),
    [localRows]
  );

  function toggleFaseFilter(fase: Enums<"fase_enum">) {
    setFaseFilterSet(prev => {
      const next = new Set(prev);
      if (next.has(fase)) next.delete(fase);
      else next.add(fase);
      return next;
    });
  }

  function clearFilters() {
    setSearch("");
    setSubfaseSel("todas");
    setFaseFilterMode("todos");
    setFaseFilterSet(new Set());
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLocalRows(prev => {
      const oldIdx = prev.findIndex(r => r.opd_id === active.id);
      const newIdx = prev.findIndex(r => r.opd_id === over.id);
      if (oldIdx < 0 || newIdx < 0) return prev;
      const next = arrayMove(prev, oldIdx, newIdx);
      // Persist: assign prioridad_manual 1..N to all rows in new order
      const items = next.map((r, i) => ({ opdId: r.opd_id, prioridad: i + 1 }));
      reordenarPrioridad(items);
      return next.map((r, i) => ({ ...r, prioridad_manual: i + 1 }));
    });
  }

  const pxPerDay = ZOOM_BASE[zoomLevel] * zoomFactor;

  const rows = useMemo(() => {
    let filtered = search
      ? localRows.filter(r =>
          r.ref.toLowerCase().includes(search.toLowerCase()) ||
          r.cliente_nombre.toLowerCase().includes(search.toLowerCase()))
      : localRows;
    if (subfaseSel !== "todas") {
      filtered = filtered.filter(r => r.fase_actual === "satelites" && r.subestado_satelite === subfaseSel);
    }
    if (faseFilterMode !== "todos" && faseFilterSet.size > 0) {
      filtered = filtered.filter(r => {
        const selected = faseFilterSet.has(r.fase_actual);
        return faseFilterMode === "incluir" ? selected : !selected;
      });
    }
    if (ganttSortCol === "prioridad") return filtered;
    const dir = ganttSortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let av: string | number | null, bv: string | number | null;
      switch (ganttSortCol) {
        case "semaforo":                av = a.semaforo;              bv = b.semaforo; break;
        case "semaforo_fase":           av = a.semaforo_fase;         bv = b.semaforo_fase; break;
        case "score_efectivo":          av = a.score_efectivo;        bv = b.score_efectivo; break;
        case "slack":                   av = a.slack;                 bv = b.slack; break;
        case "slack_fase":              av = a.slack_fase;            bv = b.slack_fase; break;
        case "cliente_nombre":          av = a.cliente_nombre;        bv = b.cliente_nombre; break;
        case "ref":                     av = a.ref;                   bv = b.ref; break;
        case "fase_actual":             av = a.fase_actual;           bv = b.fase_actual; break;
        case "fecha_compromiso":        av = a.fecha_compromiso;      bv = b.fecha_compromiso; break;
        case "cantidad":                av = a.cantidad;              bv = b.cantidad; break;
        case "dias_plan_restantes":     av = a.dias_plan_restantes;   bv = b.dias_plan_restantes; break;
        default: return 0;
      }
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }, [localRows, search, subfaseSel, faseFilterMode, faseFilterSet, ganttSortCol, ganttSortDir]);

  const { minTs, maxTs } = useMemo(() => {
    let mn = Infinity, mx = -Infinity;
    for (const r of data) {
      for (const p of [...r.fases, ...r.baseline]) {
        const s = tsOf(p.start_date), d = tsOf(p.due_date);
        if (s < mn) mn = s; if (d > mx) mx = d;
      }
    }
    if (!isFinite(mn)) { mn = stableNow; mx = stableNow + 30 * MS_DAY; }
    return { minTs: mn - 14 * MS_DAY, maxTs: mx + 14 * MS_DAY };
  }, [data, stableNow]);

  const totalDays = Math.ceil((maxTs - minTs) / MS_DAY);
  const timelineW = Math.max(totalDays * pxPerDay, 1200);
  const hoy       = stableNow;

  const xOf = useCallback(
    (t: number) => ((t - minTs) / MS_DAY) * pxPerDay,
    [minTs, pxPerDay]
  );

  // Festivos y días no hábiles (solo en vistas con resolución de día)
  const festivosSet = useMemo(() => new Set(festivos), [festivos]);
  const diasNoHabiles = useMemo(() => {
    if (pxPerDay < 20) return []; // no renderizar si los días son menores a 20px
    const result: { x: number; w: number }[] = [];
    const d = new Date(minTs); d.setHours(0, 0, 0, 0);
    while (d.getTime() <= maxTs) {
      const dow = d.getDay();
      const iso = d.toISOString().slice(0, 10);
      if (dow === 0 || dow === 6 || festivosSet.has(iso))
        result.push({ x: xOf(d.getTime()), w: pxPerDay });
      d.setDate(d.getDate() + 1);
    }
    return result;
  }, [minTs, maxTs, pxPerDay, xOf, festivosSet]);

  // Marcadores de cabecera según zoom
  const { topMarcas, botMarcas } = useMemo(() => {
    const top: { label: string; x: number }[] = [];
    const bot: { label: string; x: number }[] = [];

    if (pxPerDay <= 8) {
      // Anual: años / trimestres
      const y = new Date(minTs); y.setMonth(0, 1);
      while (y.getTime() <= maxTs + 40 * MS_DAY) {
        top.push({ label: String(y.getFullYear()), x: xOf(y.getTime()) });
        y.setFullYear(y.getFullYear() + 1);
      }
      const q = new Date(minTs); q.setDate(1); q.setMonth(Math.floor(q.getMonth() / 3) * 3);
      while (q.getTime() <= maxTs + 40 * MS_DAY) {
        bot.push({ label: `Q${Math.floor(q.getMonth() / 3) + 1}`, x: xOf(q.getTime()) });
        q.setMonth(q.getMonth() + 3);
      }
    } else if (pxPerDay <= 24) {
      // Trimestral: trimestres / meses
      const q = new Date(minTs); q.setDate(1); q.setMonth(Math.floor(q.getMonth() / 3) * 3);
      while (q.getTime() <= maxTs + 40 * MS_DAY) {
        top.push({ label: `Q${Math.floor(q.getMonth() / 3) + 1} ${q.getFullYear()}`, x: xOf(q.getTime()) });
        q.setMonth(q.getMonth() + 3);
      }
      const m = new Date(minTs); m.setDate(1);
      while (m.getTime() <= maxTs + 40 * MS_DAY) {
        bot.push({ label: m.toLocaleDateString("es-CO", { month: "short" }), x: xOf(m.getTime()) });
        m.setMonth(m.getMonth() + 1);
      }
    } else if (pxPerDay <= 60) {
      // Mensual: meses / semanas
      const m = new Date(minTs); m.setDate(1);
      while (m.getTime() <= maxTs + 40 * MS_DAY) {
        top.push({ label: m.toLocaleDateString("es-CO", { month: "short", year: "2-digit" }), x: xOf(m.getTime()) });
        m.setMonth(m.getMonth() + 1);
      }
      const w = new Date(minTs); w.setHours(0, 0, 0, 0);
      const dow = w.getDay(); w.setDate(w.getDate() - (dow === 0 ? 6 : dow - 1));
      while (w.getTime() <= maxTs + 14 * MS_DAY) {
        bot.push({ label: `${w.getDate()}/${w.getMonth() + 1}`, x: xOf(w.getTime()) });
        w.setDate(w.getDate() + 7);
      }
    } else {
      // Semanal: semanas / días
      const DIAS = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
      const w = new Date(minTs); w.setHours(0, 0, 0, 0);
      const dow = w.getDay(); w.setDate(w.getDate() - (dow === 0 ? 6 : dow - 1));
      while (w.getTime() <= maxTs + 14 * MS_DAY) {
        top.push({ label: `Sem ${w.getDate()}/${w.getMonth() + 1}`, x: xOf(w.getTime()) });
        w.setDate(w.getDate() + 7);
      }
      const d2 = new Date(minTs); d2.setHours(0, 0, 0, 0);
      while (d2.getTime() <= maxTs + 7 * MS_DAY) {
        bot.push({ label: DIAS[d2.getDay()], x: xOf(d2.getTime()) });
        d2.setDate(d2.getDate() + 1);
      }
    }
    return { topMarcas: top, botMarcas: bot };
  }, [minTs, maxTs, pxPerDay, xOf]);

  // Zoom contínuo con Ctrl+scroll o pinch — listener nativo {passive:false}
  // React registra onWheel como pasivo; e.preventDefault() no funciona desde JSX.
  useEffect(() => {
    const el = rightRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();          // cancela zoom de la página
      e.stopPropagation();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoomFactor(prev => Math.max(0.25, Math.min(8, +(prev * delta).toFixed(3))));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // Sincronización de scroll vertical entre paneles
  const onScrollLeft = useCallback(() => {
    if (syncing.current || !rightRef.current || !leftRef.current) return;
    syncing.current = true;
    rightRef.current.scrollTop = leftRef.current.scrollTop;
    setScrollTop(leftRef.current.scrollTop);
    syncing.current = false;
  }, []);

  const onScrollRight = useCallback(() => {
    if (syncing.current || !leftRef.current || !rightRef.current) return;
    syncing.current = true;
    leftRef.current.scrollTop = rightRef.current.scrollTop;
    setScrollTop(rightRef.current.scrollTop);
    syncing.current = false;
  }, []);

  useEffect(() => {
    if (leftRef.current)  leftRef.current.scrollTop  = 0;
    if (rightRef.current) rightRef.current.scrollTop = 0;
    queueMicrotask(() => setScrollTop(0));
  }, [rows.length]);

  function irAHoy() {
    if (rightRef.current) rightRef.current.scrollLeft = xOf(hoy) - 300;
  }

  const dragEnabled = !readOnly && ganttSortCol === "prioridad";

  // Sin virtualización — renderizar todas las filas para diagnosticar
  const firstRow = 0;
  const topSpace = 0;
  const botSpace = 0;
  const visible  = rows;
  // Altura CSS pura — sin cálculos JS que rompen en SSR

  const content = (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar ref o cliente…"
          className="h-8 rounded-md border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 w-48" />

        <select
          value={subfaseSel}
          onChange={e => setSubfaseSel(e.target.value)}
          className="h-8 rounded-md border border-gray-300 px-2 text-xs text-gray-700"
          title="Filtrar por subfase de satélites"
        >
          <option value="todas">Subfase: todas</option>
          {SUBESTADO_SATELITE_ORDEN.map(s => (
            <option key={s} value={s}>{SUBESTADO_LABEL[s]}</option>
          ))}
        </select>

        <div className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-1.5 py-1">
          <span className="text-xs text-gray-500">Fase</span>
          <select
            value={faseFilterMode}
            onChange={e => setFaseFilterMode(e.target.value as FilterMode)}
            className="h-6 rounded border border-gray-200 px-1.5 text-xs text-gray-700"
            title="Filtrar o excluir fases"
          >
            <option value="todos">Todas</option>
            <option value="incluir">Incluir</option>
            <option value="excluir">Excluir</option>
          </select>
          {faseFilterMode !== "todos" && (
            <div className="flex items-center gap-1 flex-wrap">
              {fasesDisponibles.map(fase => (
                <button
                  key={fase}
                  type="button"
                  onClick={() => toggleFaseFilter(fase)}
                  className={`h-6 rounded border px-1.5 text-[10px] transition-colors ${
                    faseFilterSet.has(fase)
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                  title={`${faseFilterMode === "incluir" ? "Incluir" : "Excluir"} ${FASE_LABEL[fase]}`}
                >
                  {FASE_LABEL[fase]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex rounded-md border border-gray-300 overflow-hidden">
          {ZOOM_ORDER.map(z => (
            <button key={z} onClick={() => { setZoomLevel(z); setZoomFactor(1); }}
              className={`px-3 py-1 text-xs font-medium transition-colors ${zoomLevel === z ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
              {ZOOM_LABELS[z]}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={showBaseline} onChange={e => setShowB(e.target.checked)} />
          Baseline
        </label>

        <button onClick={irAHoy}
          className="h-7 px-2 text-xs rounded border border-red-300 text-red-600 hover:bg-red-50">
          Hoy
        </button>

        {/* Indicador de zoom factor */}
        {zoomFactor !== 1 && (
          <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
            {zoomFactor.toFixed(1)}× · <button onClick={() => setZoomFactor(1)} className="underline">reset</button>
          </span>
        )}

        {(search || subfaseSel !== "todas" || faseFilterMode !== "todos") && (
          <button
            onClick={clearFilters}
            className="h-7 px-2 text-xs rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
          >
            Limpiar filtros
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1">
            <select
              value={ganttSortCol}
              onChange={e => setGanttSort(e.target.value, ganttSortDir)}
              className="h-7 rounded-md border border-gray-300 px-2 text-xs text-gray-700"
              title="Ordenar por columna"
            >
              <option value="prioridad">Prioridad (drag)</option>
              <option value="semaforo">Semáforo</option>
              <option value="semaforo_fase">Sem. Fase</option>
              <option value="score_efectivo">Score</option>
              <option value="slack">Slack</option>
              <option value="slack_fase">Slack Fase</option>
              <option value="fase_actual">Fase</option>
              <option value="cliente_nombre">Cliente</option>
              <option value="ref">Ref</option>
              <option value="fecha_compromiso">Compromiso</option>
              <option value="cantidad">Uds</option>
              <option value="dias_plan_restantes">Días rest.</option>
            </select>
            {ganttSortCol !== "prioridad" && (
              <button
                onClick={() => setGanttSort(ganttSortCol, ganttSortDir === "asc" ? "desc" : "asc")}
                className="h-7 px-2 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                title={ganttSortDir === "asc" ? "Ascendente — clic para invertir" : "Descendente — clic para invertir"}
              >
                {ganttSortDir === "asc" ? "↑" : "↓"}
              </button>
            )}
          </div>
          <ColumnPicker cols={GANTT_COLS} visibility={colVis} onToggle={toggleCol} onReset={resetCols} order={colOrder} onReorder={moveCol} />
          <button
            onClick={() => exportGanttRowsToXlsx({
              rows,
              order: colOrder,
              colVis,
              cols: GANTT_COLS,
              prioridadResolver: r => r.prioridad_manual ?? null,
              filenameBase: "wip",
              sheetName: "WIP",
            })}
            className="h-7 px-2 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
            title="Exportar a Excel las filas visibles"
          >
            ↓ Excel
          </button>
          <span className="text-xs text-gray-400">{rows.length} OP-Ds · {pxPerDay.toFixed(1)}px/día</span>
        </div>
      </div>
      <p className="text-[10px] text-gray-400">Ctrl + scroll o pinch en el Gantt para zoom continuo</p>

      {/* Leyenda */}
      <div className="flex gap-3 flex-wrap">
        {(Object.entries(FASE_COLOR) as [Enums<"fase_enum">, string][]).map(([f, c]) => (
          <span key={f} className="flex items-center gap-1 text-[10px] text-gray-500">
            <span className="w-3 h-2 rounded-sm inline-block" style={{ background: c }} />
            {FASE_LABEL[f]}
          </span>
        ))}
      </div>

      {/* ── Dos paneles sincronizados ── */}
      <div className="flex border border-gray-200 rounded-lg overflow-hidden"
        style={{ height: "70vh" }}>

        {/* Panel izquierdo — labels, scroll vertical + horizontal cuando hay muchas columnas */}
        <div ref={leftRef} onScroll={onScrollLeft}
          className="flex-none overflow-y-scroll overflow-x-auto border-r border-gray-200 bg-white"
          style={{ width: Math.min(labelW, MAX_LABEL_W), height: "100%" }}>

          <div style={{ minWidth: labelW }}>
          <div className="sticky top-0 z-10 bg-gray-100 border-b border-gray-300 flex items-end px-1.5 pb-1 gap-1.5"
            style={{ height: HEADER_H }}>
            {dragEnabled && <span className="w-4 flex-none" />}
            {colOrder.map(k => colVis[k] !== false && GANTT_HEADER[k]
              ? <React.Fragment key={k}>{GANTT_HEADER[k]}</React.Fragment>
              : null)}
          </div>

          {topSpace > 0 && <div style={{ height: topSpace }} />}

          {!dragEnabled ? (
            visible.map((row, idx) => {
              const i  = firstRow + idx;
              const bg = i % 2 ? "#f9fafb" : "#ffffff";
              return (
                <StaticGanttLabel
                  key={row.opd_id}
                  row={row}
                  bg={bg}
                  colVis={colVis}
                  order={colOrder}
                  onClick={() => onSelectOpd(row.opd_id)}
                />
              );
            })
          ) : (
            <SortableContext items={visible.map(r => r.opd_id)} strategy={verticalListSortingStrategy}>
              {visible.map((row, idx) => {
                const i  = firstRow + idx;
                const bg = i % 2 ? "#f9fafb" : "#ffffff";
                return (
                  <SortableGanttLabel
                    key={row.opd_id}
                    row={row}
                    bg={bg}
                    colVis={colVis}
                    order={colOrder}
                    onClick={() => onSelectOpd(row.opd_id)}
                  />
                );
              })}
            </SortableContext>
          )}

          {botSpace > 0 && <div style={{ height: botSpace }} />}
          </div>{/* /minWidth wrapper */}
        </div>

        {/* Panel derecho — timeline, scroll horizontal + vertical */}
        <div ref={rightRef} onScroll={onScrollRight}
          className="flex-1 overflow-auto"
          style={{ touchAction: "pan-x pan-y", height: "100%" }}>

          <div style={{ width: timelineW, minWidth: timelineW }}>

            {/* Header sticky */}
            <div className="sticky top-0 z-10 select-none bg-gray-50"
              style={{ height: HEADER_H }}>

              <div className="relative bg-gray-100 border-b border-gray-300"
                style={{ height: HEADER_H / 2, width: timelineW }}>
                {topMarcas.map((m, i) => (
                  <React.Fragment key={i}>
                    <div className="absolute inset-y-0 w-px bg-gray-400" style={{ left: m.x }} />
                    <span className="absolute text-[10px] font-semibold text-gray-700 truncate pointer-events-none"
                      style={{ left: m.x + 4, top: 3, maxWidth: 200 }}>{m.label}</span>
                  </React.Fragment>
                ))}
                <div className="absolute inset-y-0 w-0.5 bg-red-500" style={{ left: xOf(hoy) }} />
              </div>

              <div className="relative bg-gray-50 border-b border-gray-200"
                style={{ height: HEADER_H / 2, width: timelineW }}>
                {botMarcas.map((m, i) => (
                  <React.Fragment key={i}>
                    <div className="absolute inset-y-0 w-px bg-gray-200" style={{ left: m.x }} />
                    <span className="absolute text-[9px] text-gray-500 truncate pointer-events-none"
                      style={{ left: m.x + 2, top: 2, maxWidth: 80 }}>{m.label}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>

            {topSpace > 0 && <div style={{ height: topSpace }} />}

            {visible.map((row, idx) => {
              const i  = firstRow + idx;
              const bg = i % 2 ? "#f9fafb" : "#ffffff";
              return (
                <div key={row.opd_id}
                  className="relative border-b border-gray-100 cursor-pointer hover:bg-blue-50"
                  style={{ height: ROW_H, background: bg, width: timelineW }}
                  onClick={() => onSelectOpd(row.opd_id)}>

                  {diasNoHabiles.map((d, j) => (
                    <div key={j} className="absolute inset-y-0 pointer-events-none"
                      style={{ left: d.x, width: d.w, background: "rgba(0,0,0,0.04)" }} />
                  ))}

                  {botMarcas.map((m, j) => (
                    <div key={j} className="absolute inset-y-0 w-px bg-gray-100 pointer-events-none"
                      style={{ left: m.x }} />
                  ))}

                  <div className="absolute inset-y-0 w-0.5 bg-red-400 opacity-40 pointer-events-none"
                    style={{ left: xOf(hoy) }} />

                  {showBaseline && row.baseline.map(p => {
                    const x = xOf(tsOf(p.start_date));
                    const w = Math.max(xOf(tsOf(p.due_date)) - x, 2);
                    return (
                      <div key={`b-${p.fase}`} className="absolute rounded-sm pointer-events-none"
                        style={{ left: x, width: w, top: "32%", height: "36%",
                          background: FASE_COLOR[p.fase], opacity: 0.25 }} />
                    );
                  })}

                  {row.fases.map(p => {
                    const x = xOf(tsOf(p.start_date));
                    const w = Math.max(xOf(tsOf(p.due_date)) - x, 2);
                    return (
                      <div key={`p-${p.fase}`} className="absolute rounded-sm pointer-events-none"
                        title={`${FASE_LABEL[p.fase]}: ${p.start_date} → ${p.due_date}`}
                        style={{ left: x, width: w, top: "16%", height: "68%",
                          background: FASE_COLOR[p.fase], opacity: 0.85 }} />
                    );
                  })}
                </div>
              );
            })}

            {botSpace > 0 && <div style={{ height: botSpace }} />}
          </div>
        </div>
      </div>

    </div>
  );

  if (!dragEnabled) return content;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      {content}
    </DndContext>
  );
}
