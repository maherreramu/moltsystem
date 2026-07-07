"use client";
import { fmtNum, fmtDia } from "@/lib/format";
import { useState, useMemo, useTransition, useEffect, createContext, useContext } from "react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  getFilteredRowModel, getPaginationRowModel, getGroupedRowModel,
  getExpandedRowModel, getFacetedRowModel, getFacetedUniqueValues,
  flexRender, type ColumnDef, type SortingState, type GroupingState,
  type RowSelectionState, type ExpandedState, type VisibilityState,
} from "@tanstack/react-table";
import type { OPDTabla, DiasFase } from "@/lib/queries/tabla";
import { FASE_LABEL, FASES_ORDEN, SUBESTADO_LABEL } from "@/lib/fases";
import { SemaforoDot } from "@/components/kanban/semaforo-badge";
import { replanBatchOpds, reordenarPrioridad, setFechaCompromiso, setFechaCompromisoMultiple, setPhasePromise } from "@/lib/actions/opd-actions";
import type { Enums } from "@/types/supabase";
import { useColumnPrefs } from "@/lib/column-prefs";
import { ColumnPicker, type ColDef } from "@/components/ui/column-picker";

// Columns the user can hide/show (visibility prefs)
const TOGGLEABLE_COLS: ColDef[] = [
  { key: "categoria",          label: "Categoría" },
  { key: "recurso_corte",      label: "Recurso corte" },
  { key: "slack",              label: "Slack" },
  { key: "semaforo_fase",      label: "Sem. Fase" },
  { key: "slack_fase",         label: "Slack Fase" },
  { key: "score_efectivo",     label: "Score" },
  { key: "cantidad",           label: "Uds" },
  { key: "dias_sat",           label: "Días sat." },
  { key: "dias_corte",         label: "Días corte" },
  { key: "plan_congelado",     label: "Plan ❄" },
  { key: "promesa_fase",       label: "Promesa entrega" },
  { key: "fin_plan",           label: "Fin plan" },
  { key: "subfase",            label: "Subfase" },
  { key: "fecha_ingreso",      label: "Ingreso a fase" },
];

const COL_DEFAULTS: Record<string, boolean> = {
  ...Object.fromEntries(TOGGLEABLE_COLS.map(c => [c.key, true])),
  semaforo_fase: false,
  slack_fase: false,
  subfase: false,
  fecha_ingreso: true,
};

// All reorderable columns in default order (excludes 'select' which is always pinned left)
const ALL_ORDER_DEFAULT = [
  "prioridad_manual", "ref", "cliente_nombre", "categoria", "recurso_corte",
  "fase_actual", "semaforo", "slack", "semaforo_fase", "slack_fase",
  "score_efectivo", "cantidad", "dias_sat", "dias_corte", "plan_congelado",
  "promesa_fase", "fin_plan", "subfase", "fecha_ingreso", "fecha_compromiso",
];

// All columns shown in the picker (non-toggleable = hideable:false)
const ALL_PICKER_COLS: ColDef[] = [
  { key: "prioridad_manual", label: "Prioridad",      hideable: false },
  { key: "ref",              label: "Ref",             hideable: false },
  { key: "cliente_nombre",   label: "Cliente",         hideable: false },
  { key: "categoria",        label: "Categoría",       hideable: true  },
  { key: "recurso_corte",    label: "Recurso corte",   hideable: true  },
  { key: "fase_actual",      label: "Fase",            hideable: false },
  { key: "semaforo",         label: "Semáforo",        hideable: false },
  { key: "slack",            label: "Slack",           hideable: true  },
  { key: "semaforo_fase",    label: "Sem. Fase",       hideable: true  },
  { key: "slack_fase",       label: "Slack Fase",      hideable: true  },
  { key: "score_efectivo",   label: "Score",           hideable: true  },
  { key: "cantidad",         label: "Uds",             hideable: true  },
  { key: "dias_sat",         label: "Días sat.",       hideable: true  },
  { key: "dias_corte",       label: "Días corte",      hideable: true  },
  { key: "plan_congelado",   label: "Plan ❄",          hideable: true  },
  { key: "promesa_fase",     label: "Promesa entrega", hideable: true  },
  { key: "fin_plan",         label: "Fin plan",        hideable: true  },
  { key: "subfase",          label: "Subfase",         hideable: true  },
  { key: "fecha_ingreso",    label: "Ingreso a fase",  hideable: true  },
  { key: "fecha_compromiso", label: "Compromiso",      hideable: false },
];

type Props = {
  data: OPDTabla[];
  onSelectOpd: (opd: OPDTabla) => void;
  puedeEditarCompromiso?: boolean;
};

const DIAS_CAMPO: Record<Enums<"fase_enum">, DiasFase> = {
  fase_0:    "dias_fase_0",
  compras:   "dias_compras",
  trazo:     "dias_trazo",
  corte:     "dias_corte",
  tiqueteo:  "dias_tiqueteo",
  satelites: "dias_satelites",
  empaque:   "dias_empaque",
  despacho:  "dias_despacho",
  cierre:    "dias_despacho", // terminal: activa=false, never shown in table
};

const RECURSO_LABEL: Record<string, string> = {
  morgan:   "Morgan",
  manual:   "Manual",
  externo:  "Externo",
};

const AGRUPAR_OPTS = [
  { value: "",               label: "(sin agrupar)" },
  { value: "cliente_nombre", label: "Cliente" },
  { value: "categoria",      label: "Categoría" },
  { value: "recurso_corte",  label: "Recurso de corte" },
  { value: "detalle",        label: "Detalle" },
] as const;

// ─── DnD & Reorder Components ────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RowContext = createContext<{ attributes: any; listeners: any } | null>(null);

function PrioridadCell({ row }: { row: OPDTabla }) {
  const ctx = useContext(RowContext);
  const [val, setVal] = useState(row.prioridad_manual?.toString() ?? "");
  const [isPending, startTransition] = useTransition();

  const [prevPrioridad, setPrevPrioridad] = useState(row.prioridad_manual);
  if (row.prioridad_manual !== prevPrioridad) {
    setPrevPrioridad(row.prioridad_manual);
    setVal(row.prioridad_manual?.toString() ?? "");
  }

  function onBlur() {
    if (val === (row.prioridad_manual?.toString() ?? "")) return;
    const n = parseInt(val);
    if (!isNaN(n)) {
      startTransition(() => {
        reordenarPrioridad([{ opdId: row.opd_id, prioridad: n }]);
      });
    } else if (val === "") {
      // Clear manual priority if empty?
      // reordenarPrioridad doesn't support clearing directly right now, but let's ignore or treat as no-op.
      setVal(row.prioridad_manual?.toString() ?? "");
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <span {...ctx?.attributes} {...ctx?.listeners} className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing text-base flex-none select-none" title="Arrastrar para reordenar" onClick={e => e.stopPropagation()}>≡</span>
      <input type="number" value={val} onChange={e => setVal(e.target.value)} onBlur={onBlur} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} className="w-10 h-6 text-[10px] border border-gray-300 rounded text-center text-indigo-700 font-mono" onClick={e => e.stopPropagation()} disabled={isPending} />
    </div>
  );
}

function PromesaFaseCell({ row }: { row: OPDTabla }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    const val = e.target.value;
    setEditing(false);
    if (!val || val === row.promesa_fase) return;
    startTransition(() => { setPhasePromise(row.opd_id, row.fase_actual, val); });
  }

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        defaultValue={row.promesa_fase ?? ""}
        onBlur={handleBlur}
        onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); if (e.key === "Enter") e.currentTarget.blur(); }}
        onClick={(e) => e.stopPropagation()}
        className="h-6 w-32 rounded border border-indigo-400 bg-white px-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
        disabled={isPending}
      />
    );
  }

  const v = row.promesa_fase;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className={`text-xs tabular-nums px-1 py-0.5 rounded hover:bg-indigo-50 hover:text-indigo-700 border border-transparent hover:border-indigo-200 transition-colors ${v ? "text-gray-700" : "text-gray-300"} ${isPending ? "opacity-50" : ""}`}
      title="Click para editar promesa de entrega de esta fase"
    >
      {v ?? "—"}
    </button>
  );
}

function FechaCompromisoCell({ row, puedeEditar }: { row: OPDTabla; puedeEditar: boolean }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const v = row.fecha_compromiso;

  if (!puedeEditar) {
    return <span className={`text-xs tabular-nums px-1 py-0.5 ${v ? "text-gray-700" : "text-gray-300"}`}>{v ?? "—"}</span>;
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    const val = e.target.value;
    setEditing(false);
    if (!val || val === row.fecha_compromiso) return;
    startTransition(async () => { await setFechaCompromiso(row.op_num, val); });
  }

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        defaultValue={row.fecha_compromiso ?? ""}
        onBlur={handleBlur}
        onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); if (e.key === "Enter") e.currentTarget.blur(); }}
        onClick={(e) => e.stopPropagation()}
        className="h-6 w-28 rounded border border-blue-400 bg-white px-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        disabled={isPending}
      />
    );
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className={`text-xs tabular-nums px-1 py-0.5 rounded hover:bg-blue-50 hover:text-blue-700 border border-transparent hover:border-blue-200 transition-colors ${v ? "text-gray-700" : "text-gray-300"} ${isPending ? "opacity-50" : ""}`}
      title="Click para editar compromiso comercial"
    >
      {v ?? "—"}
    </button>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DraggableTableRow({ row, children, onClick, isGroup, isSelected }: { row: { original?: { opd_id: string }, id: string, getVisibleCells: () => any[] }, children: React.ReactNode, onClick: (e: React.MouseEvent) => void, isGroup?: boolean, isSelected?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.original?.opd_id ?? row.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <RowContext.Provider value={{ attributes, listeners }}>
      <tr
        ref={isGroup ? undefined : setNodeRef}
        style={isGroup ? undefined : style}
        onClick={onClick}
        className={`transition-colors ${isGroup ? "bg-gray-50 cursor-pointer hover:bg-gray-100" : "hover:bg-gray-50 cursor-pointer"} ${isSelected ? "bg-blue-50" : ""} ${isDragging ? "bg-blue-100 z-10 relative shadow-lg" : ""}`}
      >
        {children}
      </tr>
    </RowContext.Provider>
  );
}

export function OPDTable({ data, onSelectOpd, puedeEditarCompromiso = false }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "score_efectivo", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [grouping, setGrouping] = useState<GroupingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [filterCliente, setFilterCliente] = useState("");
  const [filterCategoria, setFilterCategoria] = useState("");
  const [filterRecurso, setFilterRecurso] = useState("");
  const { visibility: colVis, toggle: toggleCol, reset: resetCols, order: colOrder, move: moveCol } = useColumnPrefs("produccion-tabla", COL_DEFAULTS, ALL_ORDER_DEFAULT);

  // Lote edición — días
  const [faseLote, setFaseLote] = useState<Enums<"fase_enum">>("satelites");
  const [diasLote, setDiasLote] = useState<number>(15);
  const [motivoLote, setMotivoLote] = useState("");
  const [confirming, setConfirming] = useState(false);
  // Lote edición — fecha compromiso
  const [fechaLote, setFechaLote] = useState("");
  const [confirmingFecha, setConfirmingFecha] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<string | null>(null);

  const columns = useMemo<ColumnDef<OPDTabla>[]>(() => [
    {
      id: "select",
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllPageRowsSelected()}
          ref={(el) => {
            if (el) el.indeterminate = table.getIsSomePageRowsSelected();
          }}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
          className="cursor-pointer"
          title="Seleccionar todos los de esta página"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
          className="cursor-pointer"
        />
      ),
      enableSorting: false,
      enableGrouping: false,
      size: 32,
    },
    {
      accessorKey: "prioridad_manual",
      header: "Prio.",
      cell: ({ row }) => row.getIsGrouped() ? null : (
        <PrioridadCell row={row.original} />
      ),
      enableGrouping: false,
      enableSorting: true,
    },
    {
      accessorKey: "ref",
      header: "Ref",
      cell: ({ row }) => row.getIsGrouped() ? null : (
        <span className="font-mono text-xs font-semibold">{row.original.ref}</span>
      ),
      enableGrouping: false,
    },
    {
      accessorKey: "cliente_nombre",
      header: "Cliente",
      cell: ({ row, getValue }) => row.getIsGrouped()
        ? <span className="font-semibold text-xs">{String(getValue())}</span>
        : <span className="text-xs">{String(getValue())}</span>,
    },
    {
      accessorKey: "categoria",
      header: "Categoría",
      cell: ({ row, getValue }) => {
        const v = getValue() as string | null;
        if (row.getIsGrouped()) return <span className="font-semibold text-xs">{v ?? "—"}</span>;
        return <span className="text-xs text-gray-600">{v ?? "—"}</span>;
      },
    },
    {
      accessorKey: "recurso_corte",
      header: "Corte",
      cell: ({ row, getValue }) => {
        const v = RECURSO_LABEL[getValue() as string] ?? getValue();
        if (row.getIsGrouped()) return <span className="font-semibold text-xs">{String(v)}</span>;
        return <span className="text-xs text-gray-500">{String(v)}</span>;
      },
    },
    {
      accessorKey: "fase_actual",
      header: "Fase",
      cell: ({ row, getValue }) => (
        <span className="flex items-center gap-1 text-xs">
          {FASE_LABEL[getValue() as Enums<"fase_enum">]}
          {row.original.fase_actual === "satelites" && row.original.subestado_satelite && (
            <span className="text-[10px] font-medium bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">
              {SUBESTADO_LABEL[row.original.subestado_satelite as keyof typeof SUBESTADO_LABEL]}
            </span>
          )}
        </span>
      ),
      enableGrouping: false,
    },
    {
      accessorKey: "semaforo",
      header: "Semáforo",
      cell: ({ getValue }) => (
        <SemaforoDot semaforo={getValue() as Enums<"semaforo_enum"> | null} />
      ),
      enableSorting: false,
      enableGrouping: false,
    },
    {
      accessorKey: "slack",
      header: "Slack",
      cell: ({ getValue }) => {
        const s = getValue() as number | null;
        if (s == null) return "—";
        return (
          <span className={`text-xs font-medium ${s >= 3 ? "text-green-700" : s >= 0 ? "text-yellow-700" : "text-red-700"}`}>
            {s >= 0 ? `+${s}d` : `${s}d`}
          </span>
        );
      },
      enableGrouping: false,
    },
    {
      accessorKey: "semaforo_fase",
      header: "Sem. F",
      cell: ({ getValue }) => (
        <SemaforoDot semaforo={getValue() as Enums<"semaforo_enum"> | null} size="sm" />
      ),
      enableSorting: false,
      enableGrouping: false,
    },
    {
      accessorKey: "slack_fase",
      header: "Slack F",
      cell: ({ getValue }) => {
        const s = getValue() as number | null;
        if (s == null) return "—";
        return (
          <span className={`text-xs font-medium ${s >= 3 ? "text-green-700" : s >= 0 ? "text-yellow-700" : "text-red-700"}`}>
            {s >= 0 ? `+${s}d` : `${s}d`}
          </span>
        );
      },
      enableGrouping: false,
    },
    {
      id: "subfase",
      header: "Subfase",
      accessorKey: "subestado_satelite",
      cell: ({ row, getValue }) => {
        if (row.getIsGrouped()) return null;
        const v = getValue() as string | null;
        if (!v || row.original.fase_actual !== "satelites") return <span className="text-xs text-gray-300">—</span>;
        return (
          <span className="text-[10px] font-medium bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">
            {SUBESTADO_LABEL[v as keyof typeof SUBESTADO_LABEL] ?? v}
          </span>
        );
      },
      enableGrouping: false,
    },
    {
      accessorKey: "score_efectivo",
      header: "Score",
      cell: ({ getValue }) => {
        const s = getValue() as number | null;
        return s != null ? <span className="text-xs font-medium">{s}</span> : "—";
      },
      enableGrouping: false,
    },
    {
      accessorKey: "cantidad",
      header: "Uds",
      cell: ({ getValue }) => (
        <span className="text-xs text-gray-600">{fmtNum(getValue() as number)}</span>
      ),
      enableGrouping: false,
    },
    {
      id: "dias_sat",
      header: "Sat.",
      accessorFn: (row) => row.dias.dias_satelites,
      cell: ({ row, getValue }) => {
        if (row.getIsGrouped()) return null;
        const v = getValue() as number;
        return <span className="text-xs tabular-nums text-gray-500">{v}d</span>;
      },
      enableGrouping: false,
    },
    {
      id: "dias_corte",
      header: "Corte",
      accessorFn: (row) => row.dias.dias_corte,
      cell: ({ row, getValue }) => {
        if (row.getIsGrouped()) return null;
        const v = getValue() as number;
        return <span className="text-xs tabular-nums text-gray-500">{v}d</span>;
      },
      enableGrouping: false,
    },
    {
      id: "plan_congelado",
      header: "❄",
      accessorKey: "plan_congelado",
      cell: ({ getValue }) => getValue() ? <span title="Plan congelado" className="text-blue-400 text-xs">❄</span> : null,
      enableSorting: false,
      enableGrouping: false,
    },
    {
      id: "promesa_fase",
      header: "Promesa entrega",
      accessorKey: "promesa_fase",
      cell: ({ row }) => row.getIsGrouped() ? null : <PromesaFaseCell row={row.original} />,
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.promesa_fase;
        const b = rowB.original.promesa_fase;
        if (!a && !b) return 0;
        if (!a) return 1;
        if (!b) return -1;
        return a < b ? -1 : a > b ? 1 : 0;
      },
      enableGrouping: false,
    },
    {
      id: "fin_plan",
      header: "Fin plan",
      accessorKey: "fin_plan",
      cell: ({ row, getValue }) => {
        if (row.getIsGrouped()) return null;
        const v = getValue() as string | null;
        return <span className={`text-xs tabular-nums ${v ? "text-gray-600" : "text-gray-300"}`}>{v ?? "—"}</span>;
      },
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.fin_plan;
        const b = rowB.original.fin_plan;
        if (!a && !b) return 0;
        if (!a) return 1;
        if (!b) return -1;
        return a < b ? -1 : a > b ? 1 : 0;
      },
      enableGrouping: false,
    },
    {
      id: "fecha_ingreso",
      header: "Ingreso Fase",
      accessorKey: "fecha_ingreso_fase",
      cell: ({ row }) => row.getIsGrouped() ? null : (
        <span className="text-xs text-gray-600 font-mono" title="Fecha de ingreso a la fase actual">
          {row.original.fecha_ingreso_fase ? fmtDia(new Date(row.original.fecha_ingreso_fase + "T00:00:00")) : "—"}
        </span>
      ),
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.fecha_ingreso_fase;
        const b = rowB.original.fecha_ingreso_fase;
        if (!a && !b) return 0;
        if (!a) return 1;
        if (!b) return -1;
        return a < b ? -1 : a > b ? 1 : 0;
      },
      enableGrouping: false,
    },
    {
      id: "fecha_compromiso",
      header: "Compromiso",
      accessorKey: "fecha_compromiso",
      cell: ({ row }) => row.getIsGrouped() ? null : <FechaCompromisoCell row={row.original} puedeEditar={puedeEditarCompromiso} />,
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.fecha_compromiso;
        const b = rowB.original.fecha_compromiso;
        if (!a && !b) return 0;
        if (!a) return 1;
        if (!b) return -1;
        return a < b ? -1 : a > b ? 1 : 0;
      },
      enableGrouping: false,
    },
  ], []);

  const filteredData = useMemo(() => {
    let d = data;
    if (filterCliente) d = d.filter((r) => r.cliente_nombre === filterCliente);
    if (filterCategoria) d = d.filter((r) => (r.categoria ?? "") === filterCategoria);
    if (filterRecurso) d = d.filter((r) => r.recurso_corte === filterRecurso);
    return d;
  }, [data, filterCliente, filterCategoria, filterRecurso]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting, globalFilter, grouping, expanded, rowSelection,
      columnVisibility: colVis as VisibilityState,
      columnOrder: ["select", ...colOrder],
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onGroupingChange: setGrouping,
    onExpandedChange: setExpanded,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: () => { /* managed via useColumnPrefs */ },
    onColumnOrderChange: () => { /* managed via useColumnPrefs */ },
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    initialState: { pagination: { pageSize: 50 } },
    autoResetPageIndex: false,
  });

  const selectedRows = table.getSelectedRowModel().rows.filter((r) => !r.getIsGrouped());
  const selectedIds = selectedRows.map((r) => r.original.opd_id);
  const congeladasCount = selectedRows.filter((r) => r.original.plan_congelado).length;

  function handleAplicarLote() {
    setConfirming(true);
    setResultado(null);
  }

  function handleConfirmar() {
    const campo = DIAS_CAMPO[faseLote];
    startTransition(async () => {
      const res = await replanBatchOpds(selectedIds, { [campo]: diasLote }, motivoLote || undefined);
      if ("error" in res) {
        setResultado(`Error: ${res.error}`);
      } else {
        setResultado(`Plan actualizado para ${res.n} OP-D.`);
        setRowSelection({});
        setMotivoLote("");
      }
      setConfirming(false);
    });
  }

  const selectedOpNums = useMemo(
    () => [...new Set(selectedRows.map((r) => r.original.op_num))],
    [selectedRows]
  );

  function handleConfirmarFecha() {
    startTransition(async () => {
      const res = await setFechaCompromisoMultiple(selectedOpNums, fechaLote);
      if ("error" in res) {
        setResultado(`Error: ${res.error}`);
      } else {
        setResultado(`Fecha compromiso actualizada para ${res.n} OP.`);
        setRowSelection({});
        setFechaLote("");
      }
      setConfirmingFecha(false);
    });
  }

  const clientesUnicos = useMemo(() => [...new Set(data.map((r) => r.cliente_nombre))].sort(), [data]);
  const categoriasUnicas = useMemo(() => [...new Set(data.map((r) => r.categoria ?? "").filter(Boolean))].sort(), [data]);
  const recursosUnicos = useMemo(() => [...new Set(data.map((r) => r.recurso_corte))].sort(), [data]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const rows = table.getRowModel().rows;
    const oldIdx = rows.findIndex(r => (r.original?.opd_id ?? r.id) === active.id);
    const newIdx = rows.findIndex(r => (r.original?.opd_id ?? r.id) === over.id);
    if (oldIdx < 0 || newIdx < 0) return;

    const next = arrayMove(rows, oldIdx, newIdx);
    const items = next.filter(r => !r.getIsGrouped()).map((r, i) => ({ opdId: r.original.opd_id, prioridad: i + 1 }));

    startTransition(() => {
      reordenarPrioridad(items);
    });
  }

  return (
    <div className="space-y-3">
      {/* Controles de filtro y agrupación */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Buscar ref, detalle…"
          className="h-8 rounded-md border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 w-48"
        />
        <select
          value={filterCliente}
          onChange={(e) => setFilterCliente(e.target.value)}
          className="h-8 rounded-md border border-gray-300 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">Todos los clientes</option>
          {clientesUnicos.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filterCategoria}
          onChange={(e) => setFilterCategoria(e.target.value)}
          className="h-8 rounded-md border border-gray-300 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">Todas las categorías</option>
          {categoriasUnicas.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filterRecurso}
          onChange={(e) => setFilterRecurso(e.target.value)}
          className="h-8 rounded-md border border-gray-300 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">Todos los recursos</option>
          {recursosUnicos.map((r) => <option key={r} value={r}>{RECURSO_LABEL[r] ?? r}</option>)}
        </select>
        <select
          value={grouping[0] ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            setGrouping(v ? [v] : []);
            setExpanded(v ? true : {});
          }}
          className="h-8 rounded-md border border-gray-300 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          {AGRUPAR_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="text-xs text-gray-400 ml-auto">
          {table.getFilteredRowModel().rows.length} de {data.length}
        </span>
        <ColumnPicker cols={ALL_PICKER_COLS} visibility={colVis} onToggle={toggleCol} onReset={resetCols} order={colOrder} onReorder={moveCol} />
      </div>

      {/* Barra de edición en lote — visible solo con selección */}
      {selectedIds.length > 0 && (
        <div className="rounded-lg border border-gray-900 bg-gray-950 text-white px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium">
            {selectedIds.length} OP-D seleccionadas
            {congeladasCount > 0 && (
              <span className="ml-1 text-blue-300 text-xs">(❄ {congeladasCount} con plan congelado — se actualizarán los días pero no las fechas)</span>
            )}
          </span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {/* — Días de fase — */}
            <select
              value={faseLote}
              onChange={(e) => setFaseLote(e.target.value as Enums<"fase_enum">)}
              className="h-7 rounded border border-gray-600 bg-gray-800 px-2 text-xs"
            >
              {FASES_ORDEN.map((f) => (
                <option key={f} value={f}>{FASE_LABEL[f]}</option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={60}
                value={diasLote}
                onChange={(e) => setDiasLote(Math.max(0, parseInt(e.target.value) || 0))}
                className="h-7 w-16 rounded border border-gray-600 bg-gray-800 px-2 text-xs text-center"
              />
              <span className="text-xs text-gray-400">días</span>
            </div>
            <input
              type="text"
              placeholder="Motivo (opcional)"
              value={motivoLote}
              onChange={(e) => setMotivoLote(e.target.value)}
              className="h-7 rounded border border-gray-600 bg-gray-800 px-2 text-xs w-44"
            />
            <button
              onClick={handleAplicarLote}
              disabled={isPending}
              className="h-7 px-3 rounded bg-white text-gray-900 text-xs font-semibold hover:bg-gray-100 disabled:opacity-50"
            >
              Aplicar a {selectedIds.length}
            </button>
            {/* — Separador — */}
            <span className="text-gray-600 text-xs select-none">|</span>
            {/* — Fecha compromiso — */}
            <span className="text-xs text-gray-400">Compromiso:</span>
            <input
              type="date"
              value={fechaLote}
              onChange={(e) => setFechaLote(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="h-7 rounded border border-gray-600 bg-gray-800 px-2 text-xs text-white"
            />
            <button
              onClick={() => fechaLote && setConfirmingFecha(true)}
              disabled={isPending || !fechaLote}
              className="h-7 px-3 rounded bg-orange-500 text-white text-xs font-semibold hover:bg-orange-400 disabled:opacity-40"
            >
              Aplicar fecha a {selectedOpNums.length} OP
            </button>
            <button
              onClick={() => { setRowSelection({}); setResultado(null); }}
              className="h-7 px-2 rounded border border-gray-600 text-xs text-gray-400 hover:text-white"
            >
              Cancelar
            </button>
          </div>
          {resultado && (
            <p className="w-full text-xs mt-1 text-green-400">{resultado}</p>
          )}
        </div>
      )}

      {/* Diálogo de confirmación */}
      {confirming && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm space-y-2">
          <p className="font-semibold text-amber-900">Confirmar replanificación en lote</p>
          <p className="text-amber-800">
            Se fijará <strong>{FASE_LABEL[faseLote]} = {diasLote} días</strong> en {selectedIds.length} OP-D.
            {congeladasCount > 0 && ` (${congeladasCount} tienen plan congelado — se cambian los días pero no se recalculan fechas.)`}
            {motivoLote && <> Motivo: <em>{motivoLote}</em>.</>}
          </p>
          <p className="text-xs text-amber-700">El trigger de pull recalculará automáticamente el plan de las OP-D no congeladas.</p>
          <div className="flex gap-2">
            <button
              onClick={handleConfirmar}
              disabled={isPending}
              className="px-4 py-1.5 bg-gray-900 text-white text-xs rounded hover:bg-gray-700 disabled:opacity-50"
            >
              {isPending ? "Aplicando…" : "Confirmar"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="px-4 py-1.5 border border-gray-300 text-xs rounded hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Diálogo confirmación — fecha compromiso */}
      {confirmingFecha && (
        <div className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-3 text-sm space-y-2">
          <p className="font-semibold text-orange-900">Confirmar cambio de fecha de compromiso</p>
          <p className="text-orange-800">
            Se fijará <strong>fecha compromiso = {fechaLote}</strong> en{" "}
            <strong>{selectedOpNums.length} OP</strong> ({selectedIds.length} OP-D).
            El trigger recalculará el pull automáticamente.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleConfirmarFecha}
              disabled={isPending}
              className="px-4 py-1.5 bg-orange-600 text-white text-xs rounded hover:bg-orange-700 disabled:opacity-50"
            >
              {isPending ? "Aplicando…" : "Confirmar"}
            </button>
            <button
              onClick={() => setConfirmingFecha(false)}
              className="px-4 py-1.5 border border-gray-300 text-xs rounded hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-lg border border-gray-200 [overflow:clip]">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <table className="w-full min-w-max text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-14 z-10">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined}
                      className={`px-3 py-2 text-left text-xs font-medium text-gray-600 select-none ${h.column.getCanSort() ? "cursor-pointer hover:text-gray-900" : ""}`}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getIsSorted() === "asc" ? " ↑" : h.column.getIsSorted() === "desc" ? " ↓" : ""}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-gray-100">
              <SortableContext items={table.getRowModel().rows.map(r => r.original?.opd_id ?? r.id)} strategy={verticalListSortingStrategy}>
                {table.getRowModel().rows.map((row) => {
                  const isGroup = row.getIsGrouped();
                  return (
                    <DraggableTableRow
                      key={row.id}
                      row={row}
                      isGroup={isGroup}
                      isSelected={row.getIsSelected()}
                      onClick={() => {
                        if (isGroup) {
                          row.toggleExpanded();
                        } else {
                          onSelectOpd(row.original);
                        }
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-2 text-gray-700">
                          {isGroup && cell.column.id === (grouping[0] ?? "") ? (
                            <span className="flex items-center gap-1 font-semibold text-xs">
                              <span>{row.getIsExpanded() ? "▾" : "▸"}</span>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              <span className="text-gray-400 font-normal">({row.subRows.length})</span>
                            </span>
                          ) : (
                            flexRender(cell.column.columnDef.cell, cell.getContext())
                          )}
                        </td>
                      ))}
                    </DraggableTableRow>
                  );
                })}
              </SortableContext>
            </tbody>
          </table>
        </DndContext>
      </div>

      {/* Paginación */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex gap-1">
          {[25, 50, 100].map((n) => (
            <button
              key={n}
              onClick={() => table.setPageSize(n)}
              className={`px-2 py-1 rounded ${table.getState().pagination.pageSize === n ? "bg-gray-900 text-white" : "border border-gray-300 hover:bg-gray-50"}`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="px-2 py-1 border border-gray-300 rounded disabled:opacity-30 hover:bg-gray-50">‹</button>
          <span>Pág. {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}</span>
          <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="px-2 py-1 border border-gray-300 rounded disabled:opacity-30 hover:bg-gray-50">›</button>
        </div>
      </div>
    </div>
  );
}
