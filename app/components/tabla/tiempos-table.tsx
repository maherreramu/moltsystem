"use client";
import { useState, useMemo, useTransition, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  getFilteredRowModel, getPaginationRowModel, getGroupedRowModel,
  getExpandedRowModel, flexRender,
  type ColumnDef, type SortingState, type GroupingState,
  type RowSelectionState, type ExpandedState,
} from "@tanstack/react-table";
import type { OPDTabla, DiasFase } from "@/lib/queries/tabla";
import { FASE_LABEL, FASES_ORDEN } from "@/lib/fases";
import { SemaforoDot } from "@/components/kanban/semaforo-badge";
import { replanOpdsMixed } from "@/lib/actions/opd-actions";
import { updateCellInBuffer, applyBatchToBuffer, bufferToChanges, type EditBuffer, type BatchRow } from "@/lib/tiempos-utils";
import type { Enums } from "@/types/supabase";

const DIAS_LABEL: Record<DiasFase, string> = {
  dias_fase_0:    "F0",
  dias_compras:   "Cmp",
  dias_trazo:     "Trz",
  dias_corte:     "Crt",
  dias_tiqueteo:  "Tiq",
  dias_satelites: "Sat",
  dias_empaque:   "Emp",
  dias_despacho:  "Dsp",
};

const DIAS_ORDEN: DiasFase[] = [
  "dias_fase_0","dias_compras","dias_trazo","dias_corte",
  "dias_tiqueteo","dias_satelites","dias_empaque","dias_despacho",
];

const FASE_A_DIAS: Record<Enums<"fase_enum">, DiasFase> = {
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

const AGRUPAR_OPTS = [
  { value: "",               label: "(sin agrupar)" },
  { value: "cliente_nombre", label: "Cliente" },
  { value: "categoria",      label: "Categoría" },
] as const;

type Props = { data: OPDTabla[] };

export function TiemposTable({ data }: Props) {
  const router = useRouter();
  const [sorting, setSorting]       = useState<SortingState>([{ id: "slack", desc: false }]);
  const [grouping, setGrouping]     = useState<GroupingState>([]);
  const [expanded, setExpanded]     = useState<ExpandedState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [filterText, setFilterText] = useState("");
  const [filterCliente, setFilterCliente]   = useState("");
  const [filterCategoria, setFilterCategoria] = useState("");
  const [filterFase, setFilterFase] = useState<Enums<"fase_enum"> | "">("");

  // Buffer de edición pendiente: opd_id → {dias_fase: nuevo_valor}
  const [editedDias, setEditedDias] = useState<EditBuffer>(new Map());

  // Batch edit (sobre selección múltiple → escribe al buffer, no al servidor)
  const [faseLote, setFaseLote] = useState<Enums<"fase_enum">>("satelites");
  const [diasLote, setDiasLote] = useState(15);

  // Submit
  const [motivoSubmit, setMotivoSubmit] = useState("");
  const [confirming, setConfirming]     = useState(false);
  const [isPending, startTransition]    = useTransition();
  const [resultado, setResultado]       = useState<string | null>(null);

  const updateCell = useCallback((opdId: string, campo: DiasFase, newVal: number, originalVal: number) => {
    setEditedDias((prev) => updateCellInBuffer(prev, opdId, campo, newVal, originalVal));
  }, []);

  const columns = useMemo<ColumnDef<OPDTabla>[]>(() => {
    const diasCols: ColumnDef<OPDTabla>[] = DIAS_ORDEN.map((campo) => ({
      id: campo,
      header: DIAS_LABEL[campo],
      accessorFn: (row) => row.dias[campo],
      cell: ({ row, getValue }) => {
        if (row.getIsGrouped()) return null;
        const original = getValue() as number;
        const buffered = editedDias.get(row.original.opd_id)?.[campo];
        const display  = buffered ?? original;
        const isDirty  = buffered !== undefined && buffered !== original;
        return (
          <input
            type="number"
            min={1}
            max={60}
            value={display}
            title={isDirty ? `Original: ${original}d` : undefined}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (isNaN(val) || val < 1) return;
              updateCell(row.original.opd_id, campo, val, original);
            }}
            className={`w-12 text-center text-xs tabular-nums rounded border px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-gray-400
              ${isDirty
                ? "border-amber-400 bg-amber-50 font-semibold text-amber-900"
                : "border-transparent bg-transparent text-gray-500 hover:border-gray-300"
              }`}
          />
        );
      },
      enableGrouping: false,
      size: 58,
    }));

    return [
      {
        id: "select",
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllPageRowsSelected()}
            ref={(el) => { if (el) el.indeterminate = table.getIsSomePageRowsSelected(); }}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            className="cursor-pointer"
            title="Seleccionar todos"
          />
        ),
        cell: ({ row }) => row.getIsGrouped() ? null : (
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
        accessorKey: "ref",
        header: "Ref",
        cell: ({ row }) => row.getIsGrouped() ? null : (
          <span className="font-mono text-xs font-semibold">{row.original.ref}</span>
        ),
        enableGrouping: false,
      },
      {
        accessorKey: "detalle",
        header: "Descripción",
        cell: ({ row, getValue }) => {
          if (row.getIsGrouped()) return null;
          const v = getValue() as string | null;
          return <span className="text-xs text-gray-600 truncate max-w-[160px] block" title={v ?? ""}>{v ?? "—"}</span>;
        },
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
        accessorKey: "fase_actual",
        header: "Fase",
        cell: ({ getValue }) => (
          <span className="text-xs">{FASE_LABEL[getValue() as Enums<"fase_enum">]}</span>
        ),
        enableGrouping: false,
      },
      {
        accessorKey: "semaforo",
        header: "Semáforo",
        cell: ({ getValue }) => <SemaforoDot semaforo={getValue() as Enums<"semaforo_enum"> | null} />,
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
        accessorKey: "fecha_compromiso",
        header: "Compromiso",
        cell: ({ getValue }) => {
          const v = getValue() as string | null;
          return v ? <span className="text-xs tabular-nums text-gray-500">{v}</span> : <span className="text-xs text-gray-300">—</span>;
        },
        enableGrouping: false,
      },
      {
        id: "plan_congelado",
        accessorKey: "plan_congelado",
        header: "❄",
        cell: ({ getValue }) => getValue()
          ? <span title="Plan congelado — los días se actualizarán pero las fechas no recalcularán" className="text-blue-400 text-xs cursor-help">❄</span>
          : null,
        enableSorting: false,
        enableGrouping: false,
        size: 28,
      },
      ...diasCols,
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editedDias, updateCell]);

  const filteredData = useMemo(() => {
    let d = data;
    if (filterCliente)   d = d.filter((r) => r.cliente_nombre === filterCliente);
    if (filterCategoria) d = d.filter((r) => (r.categoria ?? "") === filterCategoria);
    if (filterFase)      d = d.filter((r) => r.fase_actual === filterFase);
    if (filterText) {
      const q = filterText.toLowerCase();
      d = d.filter((r) =>
        r.ref.toLowerCase().includes(q) ||
        r.cliente_nombre.toLowerCase().includes(q)
      );
    }
    return d;
  }, [data, filterCliente, filterCategoria, filterFase, filterText]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, grouping, expanded, rowSelection },
    onSortingChange: setSorting,
    onGroupingChange: setGrouping,
    onExpandedChange: setExpanded,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: (row) => !row.getIsGrouped(),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    initialState: { pagination: { pageSize: 50 } },
    autoResetPageIndex: false,
  });

  const selectedLeafRows = table.getSelectedRowModel().rows.filter((r) => !r.getIsGrouped());
  const selectedIds      = selectedLeafRows.map((r) => r.original.opd_id);
  const congeladasCount  = selectedLeafRows.filter((r) => r.original.plan_congelado).length;
  const dirtyCount       = editedDias.size;

  function handleApplyBatchToBuffer() {
    const campo = FASE_A_DIAS[faseLote];
    const rows: BatchRow[] = selectedLeafRows.map((r) => ({
      opdId: r.original.opd_id,
      originalVal: r.original.dias[campo],
    }));
    setEditedDias((prev) => applyBatchToBuffer(prev, rows, campo, diasLote));
  }

  function handleSubmit() {
    const changes = bufferToChanges(editedDias);
    startTransition(async () => {
      const res = await replanOpdsMixed(changes, motivoSubmit || undefined);
      if ("error" in res) {
        setResultado(`Error: ${res.error}`);
      } else {
        setResultado(`Plan actualizado para ${res.n} OP-D.`);
        setEditedDias(new Map());
        setRowSelection({});
        setMotivoSubmit("");
        router.refresh();
      }
      setConfirming(false);
    });
  }

  const clientesUnicos    = useMemo(() => [...new Set(data.map((r) => r.cliente_nombre))].sort(), [data]);
  const categoriasUnicas  = useMemo(() => [...new Set(data.map((r) => r.categoria ?? "").filter(Boolean))].sort(), [data]);

  const importRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  async function handleExport() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Tiempos");

    const headers = ["Ref", "Descripción", "Cliente", "Categoría", "Fase", "Slack", "Compromiso",
      ...DIAS_ORDEN.map(k => DIAS_LABEL[k])];
    ws.addRow(headers);
    const hr = ws.getRow(1);
    hr.font = { bold: true };
    hr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];

    for (const row of filteredData) {
      const diasVals = DIAS_ORDEN.map(k => {
        const buf = editedDias.get(row.opd_id)?.[k];
        return buf ?? row.dias[k];
      });
      const wsRow = ws.addRow([
        row.ref,
        row.detalle ?? "",
        row.cliente_nombre,
        row.categoria ?? "",
        FASE_LABEL[row.fase_actual],
        row.slack,
        row.fecha_compromiso ?? "",
        ...diasVals,
      ]);
      // Días columns (8–15) light blue so users know they're editable
      for (let c = 8; c <= 15; c++) {
        wsRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F4FD" } };
      }
    }

    ws.columns = [
      { width: 12 }, { width: 30 }, { width: 18 }, { width: 14 },
      { width: 12 }, { width: 7 }, { width: 12 },
      ...DIAS_ORDEN.map(() => ({ width: 7 })),
    ];

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tiempos_opds.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus(null);

    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      if (!ws) throw new Error("El archivo no contiene hojas.");

      // Build ref→OPDTabla map for quick lookup
      const refMap = new Map(data.map(r => [r.ref, r]));

      const newBuffer: EditBuffer = new Map(editedDias);
      let changed = 0;
      const errores: string[] = [];

      ws.eachRow((row, i) => {
        if (i === 1) return;
        const ref = String(row.getCell(1).value ?? "").trim();
        if (!ref) return;
        const original = refMap.get(ref);
        if (!original) { errores.push(`Ref "${ref}" no encontrada`); return; }

        DIAS_ORDEN.forEach((campo, idx) => {
          const raw = row.getCell(8 + idx).value;
          const val = typeof raw === "number" ? raw : Number(raw);
          if (isNaN(val) || val < 1 || val > 60) return;
          const rounded = Math.round(val);
          const orig = original.dias[campo];
          if (rounded !== orig) {
            const entry = newBuffer.get(original.opd_id) ?? {};
            newBuffer.set(original.opd_id, { ...entry, [campo]: rounded });
            changed++;
          }
        });
      });

      if (errores.length) {
        setImportStatus(`Advertencias: ${errores.slice(0, 3).join("; ")}${errores.length > 3 ? ` (+${errores.length - 3} más)` : ""}`);
      }

      if (changed === 0 && !errores.length) {
        setImportStatus("Sin diferencias respecto al plan actual.");
        return;
      }

      setEditedDias(newBuffer);
      if (changed > 0) {
        setImportStatus(`✓ ${changed} celda${changed !== 1 ? "s" : ""} cargada${changed !== 1 ? "s" : ""} al buffer — revisa y aplica abajo.`);
      }
    } catch (err) {
      setImportStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }

  return (
    <div className={`space-y-3 ${dirtyCount > 0 ? "pb-16" : ""}`}>
      {/* Filtros y agrupación */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Buscar ref o cliente…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="h-8 rounded-md border border-gray-300 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900 w-44"
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
          value={filterFase}
          onChange={(e) => setFilterFase(e.target.value as Enums<"fase_enum"> | "")}
          className="h-8 rounded-md border border-gray-300 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">Todas las fases</option>
          {FASES_ORDEN.map((f) => <option key={f} value={f}>{FASE_LABEL[f]}</option>)}
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
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleExport}
            className="h-8 px-3 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50 flex items-center gap-1"
            title="Exportar tabla visible a Excel (.xlsx)"
          >
            ↓ Excel
          </button>
          <label className="h-8 px-3 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50 flex items-center gap-1 cursor-pointer select-none"
            title="Importar desde Excel: las columnas de días (F0–Dsp) se cargan al buffer de edición">
            ↑ Importar
            <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          </label>
          <span className="text-xs text-gray-400">
            {filteredData.length} de {data.length} OP-Ds
            {dirtyCount > 0 && <span className="ml-2 text-amber-600 font-medium">• {dirtyCount} con cambios pendientes</span>}
          </span>
        </div>
      </div>

      {importStatus && (
        <p className={`text-xs px-1 ${importStatus.startsWith("✓") ? "text-green-600" : importStatus.startsWith("Sin") ? "text-gray-500" : "text-red-600"}`}>
          {importStatus}
        </p>
      )}

      {/* Barra de edición en lote sobre selección — escribe al buffer */}
      {selectedIds.length > 0 && (
        <div className="rounded-lg border border-gray-900 bg-gray-950 text-white px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium">
            {selectedIds.length} OP-D seleccionadas
            {congeladasCount > 0 && (
              <span className="ml-1 text-blue-300 text-xs">(❄ {congeladasCount} con plan congelado)</span>
            )}
          </span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <select
              value={faseLote}
              onChange={(e) => setFaseLote(e.target.value as Enums<"fase_enum">)}
              className="h-7 rounded border border-gray-600 bg-gray-800 px-2 text-xs"
            >
              {FASES_ORDEN.map((f) => <option key={f} value={f}>{FASE_LABEL[f]}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={60}
                value={diasLote}
                onChange={(e) => setDiasLote(Math.max(1, parseInt(e.target.value) || 1))}
                className="h-7 w-16 rounded border border-gray-600 bg-gray-800 px-2 text-xs text-center"
              />
              <span className="text-xs text-gray-400">días</span>
            </div>
            <button
              onClick={handleApplyBatchToBuffer}
              className="h-7 px-3 rounded bg-white text-gray-900 text-xs font-semibold hover:bg-gray-100"
            >
              Aplicar a {selectedIds.length} seleccionadas
            </button>
            <button
              onClick={() => setRowSelection({})}
              className="h-7 px-2 rounded border border-gray-600 text-xs text-gray-400 hover:text-white"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Diálogo de confirmación de submit */}
      {confirming && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm space-y-2">
          <p className="font-semibold text-amber-900">Confirmar aplicar cambios de tiempos</p>
          <p className="text-amber-800">
            Se actualizarán los días en <strong>{dirtyCount} OP-D</strong>.
            {congeladasCount > 0 && ` (${congeladasCount} tienen plan congelado — se cambian los días pero no se recalculan las fechas.)`}
            {motivoSubmit && <> Motivo: <em>{motivoSubmit}</em>.</>}
          </p>
          <p className="text-xs text-amber-700">El trigger de pull recalculará automáticamente el plan de las OP-D no congeladas.</p>
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
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

      {/* Tabla */}
      <div className="rounded-lg border border-gray-200 [overflow:clip]">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-14 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined}
                    className={`px-2 py-2 text-left text-xs font-medium text-gray-600 select-none whitespace-nowrap
                      ${h.column.getCanSort() ? "cursor-pointer hover:text-gray-900" : ""}`}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === "asc" ? " ↑" : h.column.getIsSorted() === "desc" ? " ↓" : ""}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-100">
            {table.getRowModel().rows.map((row) => {
              const isGroup  = row.getIsGrouped();
              const isDirtyRow = !isGroup && editedDias.has(row.original.opd_id);
              return (
                <tr
                  key={row.id}
                  onClick={() => { if (isGroup) row.toggleExpanded(); }}
                  className={`transition-colors
                    ${isGroup ? "bg-gray-50 cursor-pointer hover:bg-gray-100" : "hover:bg-gray-50"}
                    ${row.getIsSelected() ? "bg-blue-50" : ""}
                    ${isDirtyRow && !row.getIsSelected() ? "bg-amber-50/30" : ""}
                  `}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-2 py-1.5 text-gray-700">
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
                </tr>
              );
            })}
          </tbody>
        </table>
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

      {/* Barra fija al pie — visible cuando hay cambios pendientes */}
      {dirtyCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-950 text-white border-t border-gray-700 px-6 py-3 flex items-center gap-4 text-sm">
          <span className="font-medium">{dirtyCount} OP-D con cambios pendientes</span>
          <input
            type="text"
            placeholder="Motivo (opcional)"
            value={motivoSubmit}
            onChange={(e) => setMotivoSubmit(e.target.value)}
            className="h-7 w-52 rounded border border-gray-600 bg-gray-800 px-2 text-xs placeholder:text-gray-500"
          />
          <button
            onClick={() => { setConfirming(true); setResultado(null); }}
            disabled={isPending}
            className="h-7 px-4 rounded bg-white text-gray-900 text-xs font-semibold hover:bg-gray-100 disabled:opacity-50"
          >
            Aplicar {dirtyCount} cambios
          </button>
          <button
            onClick={() => { setEditedDias(new Map()); setResultado(null); }}
            className="h-7 px-3 rounded border border-gray-600 text-xs text-gray-400 hover:text-white"
          >
            Descartar
          </button>
          {resultado && <p className="text-xs text-green-400 ml-2">{resultado}</p>}
        </div>
      )}
    </div>
  );
}
