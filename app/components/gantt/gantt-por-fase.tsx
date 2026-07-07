"use client";

import React, { useState, useMemo, useRef, useCallback, useEffect, useTransition } from "react";
import type { GanttRow } from "@/lib/queries/gantt";
import { FASE_LABEL, FASES_ORDEN } from "@/lib/fases";
import type { Enums } from "@/types/supabase";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { reordenarPrioridadFase } from "@/lib/actions/opd-actions";
import { createClient } from "@/lib/supabase/client";
import { fmtNum, fmtDia } from "@/lib/format";
import { exportGanttRowsToXlsx } from "@/lib/export/export-gantt-xlsx";
import { useViewPrefs } from "@/lib/column-prefs";
import { SUBESTADO_LABEL, SUBESTADO_SATELITE_ORDEN } from "@/lib/fases";
import { ColumnPicker, type ColDef } from "@/components/ui/column-picker";
import type { ViewPrefs } from "@/lib/queries/ui-prefs";

const FASE_COLOR: Record<Enums<"fase_enum">, string> = {
  fase_0:    "#94a3b8", compras:   "#60a5fa", trazo:     "#34d399",
  corte:     "#fbbf24", tiqueteo:  "#f97316", satelites: "#a78bfa",
  empaque:   "#f472b6", despacho:  "#6ee7b7", cierre:    "#6b7280",
};
const SEM_COLOR: Record<Enums<"semaforo_enum">, string> = {
  verde: "#22c55e", amarillo: "#eab308", rojo: "#ef4444",
};

type ZoomLevel = "anual" | "trimestral" | "mensual" | "semanal";
const ZOOM_BASE: Record<ZoomLevel, number> = { anual: 4, trimestral: 12, mensual: 36, semanal: 120 };
const ZOOM_LABELS: Record<ZoomLevel, string> = { anual: "Año", trimestral: "Trimestre", mensual: "Mes", semanal: "Semana" };
const ZOOM_ORDER: ZoomLevel[] = ["anual", "trimestral", "mensual", "semanal"];

const GPFASE_COLS: ColDef[] = [
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
];
const GPFASE_DEFAULTS: Record<string, boolean> = {
  prioridad: true, semaforo: true, ref: true, descripcion: false, cliente: false, cantidad: false, fase: false, slack: false, score: true,
  fecha_compromiso: false, comercial: false, bloqueada: false, dias_plan_restantes: false, pendientes: false,
  inicio_plan: false, fin_plan: false, promesa_fase: false, fecha_promesa_satelites: false, fecha_recep_satelites: false,
  recurso_corte: false, tipo_despacho: false, colores: false, motivo_bloqueo: false, causa_desvio: false,
  semaforo_fase: false, slack_fase: false, subfase: false,
};

const GPFASE_ORDER_DEFAULT = GPFASE_COLS.map(c => c.key);

// Static header cells record
const GPFASE_HEADER: Record<string, React.ReactNode> = {
  prioridad:               <span className="text-[9px] font-semibold text-indigo-500 w-9 text-center flex-none">#F</span>,
  semaforo:                <span className="text-[9px] font-semibold text-gray-500 w-5 text-center flex-none">Sem.</span>,
  ref:                     <span className="text-[9px] font-semibold text-gray-500 flex-1">Ref</span>,
  descripcion:             <span className="text-[9px] font-semibold text-gray-500 w-24 flex-none">Descr.</span>,
  cliente:                 <span className="text-[9px] font-semibold text-gray-500 w-20 flex-none">Cliente</span>,
  cantidad:                <span className="text-[9px] font-semibold text-gray-500 w-10 text-right flex-none">Uds</span>,
  fase:                    <span className="text-[9px] font-semibold text-gray-500 w-16 flex-none">Fase</span>,
  slack:                   <span className="text-[9px] font-semibold text-gray-500 w-10 text-right flex-none">Slack</span>,
  score:                   <span className="text-[9px] font-semibold text-gray-400 w-8 text-right flex-none">Score</span>,
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
};

const ROW_H      = 28;
const HEADER_H   = 40;
const MS_DAY     = 86_400_000;
const MAX_LABEL_W = 480;

function tsOf(s: string) { return new Date(s).getTime(); }

type PrioridadFaseRow = { opd_id: string; prioridad: number | null };

// Shared cell content component — used by both SortableRow and StaticRow
function GpfLabelCells({
  row, prioridad, colVis, order, faseSel, onSavePrioridad,
}: {
  row: GanttRow;
  prioridad: number | null;
  colVis: Record<string, boolean>;
  order: string[];
  faseSel: Enums<"fase_enum">;
  onSavePrioridad: (opdId: string, prioridad: number) => void;
}) {
  const [val, setVal] = useState(prioridad?.toString() ?? "");
  const [, startTransition] = useTransition();

  useEffect(() => { queueMicrotask(() => setVal(prioridad?.toString() ?? "")); }, [prioridad]);

  function onBlur() {
    const n = parseInt(val);
    if (!isNaN(n)) {
      startTransition(() => { onSavePrioridad(row.opd_id, n); });
    } else {
      setVal(prioridad?.toString() ?? "");
    }
  }

  const inicioPlan = row.fases.find(f => f.fase === faseSel)?.start_date ?? null;
  const finPlan    = row.fases.find(f => f.fase === faseSel)?.due_date ?? null;

  const cells: Partial<Record<string, React.ReactNode>> = {};

  if (colVis.prioridad !== false) cells.prioridad = (
    <input
      type="number"
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={onBlur}
      onKeyDown={e => e.key === "Enter" && e.currentTarget.blur()}
      onClick={e => e.stopPropagation()}
      title="Prioridad por fase (1 = máxima)"
      className="w-9 h-5 text-[9px] border border-gray-300 rounded text-center text-indigo-600 font-mono flex-none"
      placeholder="—"
    />
  );
  if (colVis.semaforo !== false) cells.semaforo = (
    <span className="w-5 flex-none flex justify-center">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: row.semaforo ? SEM_COLOR[row.semaforo] : "#ccc" }} />
    </span>
  );
  if (colVis.ref !== false) cells.ref = (
    <span className="font-mono text-[11px] font-semibold truncate text-gray-800 flex-1 min-w-0"
      title={`${row.ref} · ${row.cliente_nombre}`}>{row.ref}</span>
  );
  if (colVis.descripcion !== false) cells.descripcion = (
    <span className="text-[10px] text-gray-500 truncate w-24 flex-none" title={row.detalle ?? ""}>{row.detalle ?? "—"}</span>
  );
  if (colVis.cliente !== false) cells.cliente = (
    <span className="text-[10px] text-gray-500 truncate w-20 flex-none" title={row.cliente_nombre}>{row.cliente_nombre}</span>
  );
  if (colVis.cantidad !== false) cells.cantidad = (
    <span className="text-[10px] text-gray-500 font-mono w-10 text-right flex-none" title="Cantidad">{fmtNum(row.cantidad)}</span>
  );
  if (colVis.fase !== false) cells.fase = (
    <span className="text-[10px] text-gray-500 truncate w-16 flex-none" title="Fase actual">{FASE_LABEL[row.fase_actual]}</span>
  );
  if (colVis.slack !== false) cells.slack = (
    <span className="text-[10px] font-mono font-medium w-10 text-right flex-none" title="Slack">
      {row.slack != null ? (
        <span className={row.slack >= 3 ? "text-green-600" : row.slack >= 0 ? "text-yellow-600" : "text-red-600"}>
          {row.slack >= 0 ? `+${row.slack}d` : `${row.slack}d`}
        </span>
      ) : "—"}
    </span>
  );
  if (colVis.score !== false) cells.score = (
    <span className="text-[9px] text-gray-400 font-mono flex-none w-8 text-right select-none" title="Score">{row.score_efectivo ?? "—"}</span>
  );
  if (colVis.fecha_compromiso !== false) cells.fecha_compromiso = (
    <span className="text-[10px] text-gray-500 font-mono w-16 flex-none truncate" title="Fecha compromiso">
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
    <span className="text-[10px] font-mono text-gray-500 w-10 text-right flex-none" title="Días plan restantes">{row.dias_plan_restantes ?? "—"}</span>
  );
  if (colVis.pendientes !== false) cells.pendientes = (
    <span className="w-10 flex-none flex justify-center" title="Pendientes abiertos">
      {row.pendientes > 0
        ? <span className="text-[9px] bg-orange-100 text-orange-700 px-1 rounded">{row.pendientes}</span>
        : <span className="text-[9px] text-gray-300">—</span>}
    </span>
  );
  if (colVis.inicio_plan !== false) cells.inicio_plan = (
    <span className="text-[10px] text-gray-500 font-mono w-16 flex-none truncate" title="Inicio plan fase">
      {inicioPlan ? fmtDia(new Date(inicioPlan + "T00:00:00")) : "—"}
    </span>
  );
  if (colVis.fin_plan !== false) cells.fin_plan = (
    <span className="text-[10px] text-gray-500 font-mono w-16 flex-none truncate" title="Fin plan fase">
      {finPlan ? fmtDia(new Date(finPlan + "T00:00:00")) : "—"}
    </span>
  );
  if (colVis.promesa_fase !== false) cells.promesa_fase = (
    <span className="text-[10px] text-indigo-600 font-mono w-16 flex-none truncate" title="Promesa entrega de la fase actual">
      {row.promesa_fase ? fmtDia(new Date(row.promesa_fase + "T00:00:00")) : "—"}
    </span>
  );
  if (colVis.fecha_promesa_satelites !== false) cells.fecha_promesa_satelites = (
    <span className="text-[10px] text-gray-400 font-mono w-16 flex-none truncate" title="Promesa satélites (legacy)">
      {row.fecha_promesa_satelites ? fmtDia(new Date(row.fecha_promesa_satelites + "T00:00:00")) : "—"}
    </span>
  );
  if (colVis.fecha_recep_satelites !== false) cells.fecha_recep_satelites = (
    <span className="text-[10px] text-gray-500 font-mono w-16 flex-none truncate" title="Recepción real satélites">
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
    <span className="text-[10px] font-mono font-medium w-10 text-right flex-none" title="Slack de fase">
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

  return (
    <>
      {order.map(k => cells[k] != null ? <React.Fragment key={k}>{cells[k]}</React.Fragment> : null)}
    </>
  );
}

function SortableRow({
  row, bg, prioridad, colVis, order, faseSel, onSavePrioridad, onClick,
}: {
  row: GanttRow;
  bg: string;
  prioridad: number | null;
  colVis: Record<string, boolean>;
  order: string[];
  faseSel: Enums<"fase_enum">;
  onSavePrioridad: (opdId: string, prioridad: number) => void;
  onClick: () => void;
}) {
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
      <GpfLabelCells row={row} prioridad={prioridad} colVis={colVis} order={order} faseSel={faseSel} onSavePrioridad={onSavePrioridad} />
    </div>
  );
}

function StaticRow({
  row, bg, prioridad, colVis, order, faseSel, onSavePrioridad, onClick,
}: {
  row: GanttRow;
  bg: string;
  prioridad: number | null;
  colVis: Record<string, boolean>;
  order: string[];
  faseSel: Enums<"fase_enum">;
  onSavePrioridad: (opdId: string, prioridad: number) => void;
  onClick: () => void;
}) {
  return (
    <div
      style={{ height: ROW_H, background: bg }}
      className="flex items-center gap-1.5 px-1.5 border-b border-gray-100 hover:bg-blue-50 cursor-pointer"
      onClick={onClick}>
      <GpfLabelCells row={row} prioridad={prioridad} colVis={colVis} order={order} faseSel={faseSel} onSavePrioridad={onSavePrioridad} />
    </div>
  );
}

const FASES_OPERATIVAS: Enums<"fase_enum">[] = FASES_ORDEN.filter(
  f => f !== "cierre"
);

type Props = {
  allRows: GanttRow[];
  festivos: string[];
  onSelectOpd: (id: string) => void;
  initialPrefs?: ViewPrefs;
  onSavePrefs?: (viewKey: string, patch: Partial<ViewPrefs>) => void;
};

export function GanttPorFase({ allRows, festivos, onSelectOpd, initialPrefs, onSavePrefs }: Props) {
  const [faseSel, setFaseSel] = useState<Enums<"fase_enum">>("corte");
  const [subfaseSel, setSubfaseSel] = useState<"todas" | string>("todas");
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("trimestral");
  const [zoomFactor, setZoomFactor] = useState(1);
  const [showBaseline, setShowB] = useState(true);
  const [search, setSearch] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [prioridadMap, setPrioridadMap] = useState<Map<string, number>>(new Map());
  const [localRows, setLocalRows] = useState<GanttRow[]>([]);
  const [stableNow] = useState(() => Date.now());

  const { visibility: colVis, toggle: toggleCol, reset: resetCols, order: colOrder, move: moveCol, sortCol: gpfSortCol, sortDir: gpfSortDir, setSort: setGpfSort } =
    useViewPrefs("gantt-por-fase", GPFASE_DEFAULTS, GPFASE_ORDER_DEFAULT, { sortCol: "prioridad", sortDir: "asc" }, initialPrefs, onSavePrefs ?? (() => {}));

  const dragEnabled = gpfSortCol === "prioridad";

  const labelW = useMemo(() => {
    let w = dragEnabled ? 24 : 8;
    if (colVis.prioridad               !== false) w += 44;
    if (colVis.semaforo                !== false) w += 28;
    if (colVis.ref                     !== false) w += 64;
    if (colVis.descripcion             !== false) w += 100;
    if (colVis.cliente                 !== false) w += 88;
    if (colVis.cantidad                !== false) w += 48;
    if (colVis.fase                    !== false) w += 72;
    if (colVis.slack                   !== false) w += 48;
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
  }, [colVis, dragEnabled]);

  const leftRef  = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncing  = useRef(false);

  const pxPerDay = ZOOM_BASE[zoomLevel] * zoomFactor;

  const filteredRows = useMemo(() => {
    let rows = allRows.filter(r => r.fase_actual === faseSel);
    if (faseSel === "satelites" && subfaseSel !== "todas") {
      rows = rows.filter(r => r.subestado_satelite === subfaseSel);
    }
    return rows;
  }, [allRows, faseSel, subfaseSel]);

  useEffect(() => {
    const opdIds = filteredRows.map(r => r.opd_id);
    if (!opdIds.length) {
      queueMicrotask(() => {
        setPrioridadMap(new Map());
        setLocalRows(filteredRows);
      });
      return;
    }
    const sb = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sb as any).from("op_d_prioridad_fase")
      .select("opd_id,prioridad")
      .eq("fase", faseSel)
      .in("opd_id", opdIds)
      .then(({ data }: { data: PrioridadFaseRow[] | null }) => {
        const m = new Map((data ?? []).filter(r => r.prioridad != null).map(r => [r.opd_id, r.prioridad!]));
        setPrioridadMap(m);
        const sorted = [...filteredRows].sort((a, b) => {
          const pa = m.get(a.opd_id), pb = m.get(b.opd_id);
          if (pa != null && pb != null) return pa - pb;
          if (pa != null) return -1;
          if (pb != null) return 1;
          return (b.score_efectivo ?? 0) - (a.score_efectivo ?? 0);
        });
        setLocalRows(sorted);
      });
  }, [faseSel, filteredRows]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleSavePrioridad(opdId: string, prioridad: number) {
    setLocalRows(prev => {
      const curIdx = prev.findIndex(r => r.opd_id === opdId);
      if (curIdx < 0) return prev;
      const target = Math.min(Math.max(prioridad, 1), prev.length) - 1;
      const next = arrayMove(prev, curIdx, target);
      const items = next.map((r, i) => ({ opdId: r.opd_id, prioridad: i + 1 }));
      setPrioridadMap(new Map(items.map(it => [it.opdId, it.prioridad])));
      reordenarPrioridadFase(faseSel, items);
      return next;
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLocalRows(prev => {
      const oldIdx = prev.findIndex(r => r.opd_id === active.id);
      const newIdx = prev.findIndex(r => r.opd_id === over.id);
      if (oldIdx < 0 || newIdx < 0) return prev;
      const next = arrayMove(prev, oldIdx, newIdx);
      const items = next.map((r, i) => ({ opdId: r.opd_id, prioridad: i + 1 }));
      const newMap = new Map(items.map(it => [it.opdId, it.prioridad]));
      setPrioridadMap(newMap);
      reordenarPrioridadFase(faseSel, items);
      return next;
    });
  }

  const rows = useMemo(() => {
    const filtered = search
      ? localRows.filter(r =>
          r.ref.toLowerCase().includes(search.toLowerCase()) ||
          r.cliente_nombre.toLowerCase().includes(search.toLowerCase()))
      : localRows;
    if (gpfSortCol === "prioridad") return filtered;
    const dir = gpfSortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let av: string | number | null, bv: string | number | null;
      switch (gpfSortCol) {
        case "semaforo":            av = a.semaforo;            bv = b.semaforo; break;
        case "semaforo_fase":       av = a.semaforo_fase;       bv = b.semaforo_fase; break;
        case "score_efectivo":      av = a.score_efectivo;      bv = b.score_efectivo; break;
        case "slack":               av = a.slack;               bv = b.slack; break;
        case "slack_fase":          av = a.slack_fase;          bv = b.slack_fase; break;
        case "cliente_nombre":      av = a.cliente_nombre;      bv = b.cliente_nombre; break;
        case "ref":                 av = a.ref;                 bv = b.ref; break;
        case "fase_actual":         av = a.fase_actual;         bv = b.fase_actual; break;
        case "fecha_compromiso":    av = a.fecha_compromiso;    bv = b.fecha_compromiso; break;
        case "cantidad":            av = a.cantidad;            bv = b.cantidad; break;
        case "dias_plan_restantes": av = a.dias_plan_restantes; bv = b.dias_plan_restantes; break;
        default: return 0;
      }
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }, [localRows, search, gpfSortCol, gpfSortDir]);

  const festivosSet = useMemo(() => new Set(festivos), [festivos]);

  const { minTs, maxTs } = useMemo(() => {
    let mn = Infinity, mx = -Infinity;
    for (const r of rows) {
      for (const p of [...r.fases, ...r.baseline]) {
        const s = tsOf(p.start_date), d = tsOf(p.due_date);
        if (s < mn) mn = s; if (d > mx) mx = d;
      }
    }
    if (!isFinite(mn)) { mn = stableNow; mx = stableNow + 30 * MS_DAY; }
    return { minTs: mn - 14 * MS_DAY, maxTs: mx + 14 * MS_DAY };
  }, [rows, stableNow]);

  const totalDays = Math.ceil((maxTs - minTs) / MS_DAY);
  const timelineW = Math.max(totalDays * pxPerDay, 1200);
  const hoy       = stableNow;

  const xOf = useCallback(
    (t: number) => ((t - minTs) / MS_DAY) * pxPerDay,
    [minTs, pxPerDay]
  );

  const diasNoHabiles = useMemo(() => {
    if (pxPerDay < 20) return [];
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

  const botMarcas = useMemo(() => {
    const bot: { label: string; x: number }[] = [];
    if (pxPerDay <= 8) {
      const q = new Date(minTs); q.setDate(1); q.setMonth(Math.floor(q.getMonth() / 3) * 3);
      while (q.getTime() <= maxTs + 40 * MS_DAY) {
        bot.push({ label: `Q${Math.floor(q.getMonth() / 3) + 1}`, x: xOf(q.getTime()) });
        q.setMonth(q.getMonth() + 3);
      }
    } else {
      const m = new Date(minTs); m.setDate(1);
      while (m.getTime() <= maxTs + 40 * MS_DAY) {
        bot.push({ label: m.toLocaleDateString("es-CO", { month: "short" }), x: xOf(m.getTime()) });
        m.setMonth(m.getMonth() + 1);
      }
    }
    return bot;
  }, [minTs, maxTs, pxPerDay, xOf]);

  const onScrollLeft = useCallback(() => {
    if (syncing.current) return;
    syncing.current = true;
    const st = leftRef.current?.scrollTop ?? 0;
    if (rightRef.current) rightRef.current.scrollTop = st;
    setScrollTop(st);
    requestAnimationFrame(() => { syncing.current = false; });
  }, []);

  const onScrollRight = useCallback(() => {
    if (syncing.current) return;
    syncing.current = true;
    const st = rightRef.current?.scrollTop ?? 0;
    if (leftRef.current) leftRef.current.scrollTop = st;
    setScrollTop(st);
    requestAnimationFrame(() => { syncing.current = false; });
  }, []);

  void scrollTop;

  const irAHoy = useCallback(() => {
    const x = xOf(hoy);
    rightRef.current?.scrollTo({ left: Math.max(0, x - 200), behavior: "smooth" });
  }, [xOf, hoy]);

  function onWheel(e: React.WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoomFactor(prev => Math.max(0.2, Math.min(10, prev * (e.deltaY < 0 ? 1.15 : 0.87))));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Selector de fase */}
        <select
          value={faseSel}
          onChange={e => { setFaseSel(e.target.value as Enums<"fase_enum">); setSubfaseSel("todas"); }}
          className="h-8 rounded-md border border-gray-300 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
        >
          {FASES_OPERATIVAS.map(f => (
            <option key={f} value={f}>{FASE_LABEL[f]}</option>
          ))}
        </select>

        {faseSel === "satelites" && (
          <select
            value={subfaseSel}
            onChange={e => setSubfaseSel(e.target.value)}
            className="h-8 rounded-md border border-purple-300 px-2 text-xs text-purple-700 bg-white"
            title="Filtrar por subfase"
          >
            <option value="todas">Subfase: todas</option>
            {SUBESTADO_SATELITE_ORDEN.map(s => (
              <option key={s} value={s}>{SUBESTADO_LABEL[s]}</option>
            ))}
          </select>
        )}

        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar ref o cliente…"
          className="h-8 rounded-md border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 w-44" />

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

        <div className="ml-auto flex items-center gap-2">
          {/* Sort controls */}
          <div className="flex items-center gap-1">
            <select
              value={gpfSortCol}
              onChange={e => setGpfSort(e.target.value, gpfSortDir)}
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
            {gpfSortCol !== "prioridad" && (
              <button
                onClick={() => setGpfSort(gpfSortCol, gpfSortDir === "asc" ? "desc" : "asc")}
                className="h-7 px-2 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                title={gpfSortDir === "asc" ? "Ascendente — clic para invertir" : "Descendente — clic para invertir"}
              >
                {gpfSortDir === "asc" ? "↑" : "↓"}
              </button>
            )}
          </div>
          <ColumnPicker cols={GPFASE_COLS} visibility={colVis} onToggle={toggleCol} onReset={resetCols} order={colOrder} onReorder={moveCol} />
          <button
            onClick={() => exportGanttRowsToXlsx({
              rows,
              order: colOrder,
              colVis,
              cols: GPFASE_COLS,
              faseForPlan: faseSel,
              prioridadResolver: r => prioridadMap.get(r.opd_id) ?? null,
              filenameBase: `gantt-${faseSel}`,
              sheetName: FASE_LABEL[faseSel],
            })}
            className="h-7 px-2 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
            title="Exportar a Excel las filas visibles"
          >
            ↓ Excel
          </button>
          <span className="text-xs text-gray-400">{rows.length} OP-Ds en {FASE_LABEL[faseSel]}</span>
        </div>
      </div>
      <p className="text-[10px] text-gray-400">
        Muestra OP-Ds activas exactamente en {FASE_LABEL[faseSel]}.
        {dragEnabled ? " Arrastra o edita el número para asignar prioridad (1 = máxima)." : ""}
        Ctrl + scroll para zoom.
      </p>

      {/* Leyenda */}
      <div className="flex gap-3 flex-wrap">
        {(Object.entries(FASE_COLOR) as [Enums<"fase_enum">, string][]).map(([f, c]) => (
          <span key={f} className={`flex items-center gap-1 text-[10px] ${f === faseSel ? "text-gray-800 font-semibold" : "text-gray-500"}`}>
            <span className="w-3 h-2 rounded-sm inline-block" style={{ background: c, opacity: f === faseSel ? 1 : 0.5 }} />
            {FASE_LABEL[f]}
          </span>
        ))}
      </div>

      {/* Dos paneles sincronizados */}
      <div className="flex border border-gray-200 rounded-lg overflow-hidden" style={{ height: "70vh" }}
        onWheel={onWheel}>

        {/* Panel izquierdo — scroll vertical + horizontal cuando hay muchas columnas */}
        <div ref={leftRef} onScroll={onScrollLeft}
          className="flex-none overflow-y-scroll overflow-x-auto border-r border-gray-200 bg-white"
          style={{ width: Math.min(labelW, MAX_LABEL_W), height: "100%" }}>

          <div style={{ minWidth: labelW }}>
          <div className="sticky top-0 z-10 bg-gray-100 border-b border-gray-300 flex items-end px-1.5 pb-1 gap-1.5"
            style={{ height: HEADER_H }}>
            {dragEnabled && <span className="w-4 flex-none" />}
            {colOrder.map(k => colVis[k] !== false && GPFASE_HEADER[k]
              ? <React.Fragment key={k}>{GPFASE_HEADER[k]}</React.Fragment>
              : null)}
          </div>

          {dragEnabled ? (
            <SortableContext items={rows.map(r => r.opd_id)} strategy={verticalListSortingStrategy}>
              {rows.map((row, idx) => {
                const bg = idx % 2 ? "#f9fafb" : "#ffffff";
                return (
                  <SortableRow
                    key={row.opd_id}
                    row={row}
                    bg={bg}
                    prioridad={prioridadMap.get(row.opd_id) ?? null}
                    colVis={colVis}
                    order={colOrder}
                    faseSel={faseSel}
                    onSavePrioridad={handleSavePrioridad}
                    onClick={() => onSelectOpd(row.opd_id)}
                  />
                );
              })}
            </SortableContext>
          ) : (
            rows.map((row, idx) => {
              const bg = idx % 2 ? "#f9fafb" : "#ffffff";
              return (
                <StaticRow
                  key={row.opd_id}
                  row={row}
                  bg={bg}
                  prioridad={prioridadMap.get(row.opd_id) ?? null}
                  colVis={colVis}
                  order={colOrder}
                  faseSel={faseSel}
                  onSavePrioridad={handleSavePrioridad}
                  onClick={() => onSelectOpd(row.opd_id)}
                />
              );
            })
          )}
          </div>{/* /minWidth wrapper */}
        </div>

        {/* Panel derecho — timeline */}
        <div ref={rightRef} onScroll={onScrollRight}
          className="flex-1 overflow-auto"
          style={{ touchAction: "pan-x pan-y", height: "100%" }}>

          <div style={{ width: timelineW, minWidth: timelineW }}>
            {/* Header */}
            <div className="sticky top-0 z-10 select-none bg-gray-50" style={{ height: HEADER_H }}>
              <div className="relative bg-gray-50 border-b border-gray-200" style={{ height: HEADER_H, width: timelineW }}>
                {botMarcas.map((m, i) => (
                  <React.Fragment key={i}>
                    <div className="absolute inset-y-0 w-px bg-gray-200" style={{ left: m.x }} />
                    <span className="absolute text-[9px] text-gray-500 truncate pointer-events-none"
                      style={{ left: m.x + 2, top: 2, maxWidth: 80 }}>{m.label}</span>
                  </React.Fragment>
                ))}
                <div className="absolute inset-y-0 w-0.5 bg-red-500" style={{ left: xOf(hoy) }} />
              </div>
            </div>

            {rows.map((row, idx) => {
              const bg = idx % 2 ? "#f9fafb" : "#ffffff";
              return (
                <div key={row.opd_id}
                  className="relative border-b border-gray-100 cursor-pointer hover:bg-blue-50"
                  style={{ height: ROW_H, background: bg, width: timelineW }}
                  onClick={() => onSelectOpd(row.opd_id)}>

                  {diasNoHabiles.map((d, j) => (
                    <div key={j} className="absolute inset-y-0 pointer-events-none"
                      style={{ left: d.x, width: d.w, background: "rgba(0,0,0,0.04)" }} />
                  ))}

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
                    const isSelected = p.fase === faseSel;
                    return (
                      <div key={`p-${p.fase}`} className="absolute rounded-sm pointer-events-none"
                        title={`${FASE_LABEL[p.fase]}: ${p.start_date} → ${p.due_date}`}
                        style={{ left: x, width: w, top: isSelected ? "8%" : "16%", height: isSelected ? "84%" : "68%",
                          background: FASE_COLOR[p.fase], opacity: isSelected ? 1 : 0.5 }} />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </div>
    </DndContext>
  );
}
