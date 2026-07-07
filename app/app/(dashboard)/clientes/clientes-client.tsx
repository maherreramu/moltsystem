"use client";

import { useState, useMemo, useTransition } from "react";
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  getFilteredRowModel, flexRender,
  type ColumnDef, type SortingState,
} from "@tanstack/react-table";
import type { ClienteRow } from "@/lib/queries/clientes";
import {
  updateClienteCampo, homologarCliente,
  crearClienteManual, reasignarClienteOp,
} from "@/lib/actions/clientes-actions";
import {
  TIER_PTS, RELACION_PTS, PAGO_PTS, COMPLEJIDAD_PTS,
  TIER_LABEL, RELACION_LABEL, PAGO_LABEL, COMPLEJIDAD_LABEL,
} from "@/lib/score-pesos";

// ─── Helpers ────────────────────────────────────────────────────────────────

function pts(n: number) {
  return <span className="text-[9px] text-gray-400 ml-0.5">({n}pts)</span>;
}

function SelectField<T extends Record<string, number>>({
  clienteId, campo, value, options, labels, pesos, disabled,
}: {
  clienteId: string;
  campo: "tier" | "tipo_relacion" | "condicion_pago" | "complejidad_tipica";
  value: string;
  options: string[];
  labels: Record<string, string>;
  pesos: T;
  disabled: boolean;
}) {
  const [isPending, start] = useTransition();
  const [local, setLocal]  = useState(value);
  const [err, setErr]      = useState<string | null>(null);

  function onChange(v: string) {
    setLocal(v);
    start(async () => {
      const r = await updateClienteCampo(clienteId, campo, v);
      if (r && "error" in r) { setErr(r.error as string); setLocal(value); }
      else setErr(null);
    });
  }

  return (
    <div>
      <select
        value={local}
        onChange={e => onChange(e.target.value)}
        disabled={disabled || isPending}
        className="text-xs border border-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50 w-full max-w-[200px]"
      >
        {options.map(o => (
          <option key={o} value={o}>
            {labels[o]} ({pesos[o]}pts)
          </option>
        ))}
      </select>
      {err && <p className="text-[9px] text-red-600 mt-0.5">{err}</p>}
    </div>
  );
}

function HomologarCell({ row, allClientes }: { row: ClienteRow; allClientes: ClienteRow[] }) {
  const [open, setOpen]       = useState(false);
  const [search, setSearch]   = useState("");
  const [isPending, start]    = useTransition();
  const [err, setErr]         = useState<string | null>(null);

  // Candidatos: no self, no homologados (solo canónicos), no manuales con pocas ops
  const candidatos = allClientes.filter(c =>
    c.id !== row.id && !c.homologado_a
  );
  const filtrados = search
    ? candidatos.filter(c => c.nombre.toLowerCase().includes(search.toLowerCase()))
    : candidatos;

  function asignar(id: string | null) {
    start(async () => {
      const r = await homologarCliente(row.id, id);
      if (r && "error" in r) setErr(r.error as string);
      else { setOpen(false); setSearch(""); setErr(null); }
    });
  }

  if (row.homologado_a) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
          ↳ {row.homologado_a_nombre}
        </span>
        <button
          onClick={() => asignar(null)}
          disabled={isPending}
          className="text-[10px] text-gray-400 hover:text-red-600 disabled:opacity-40"
          title="Quitar homologación">
          ✕
        </button>
      </div>
    );
  }

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      className="text-[10px] text-gray-400 hover:text-blue-700 border border-dashed border-gray-200 hover:border-blue-300 rounded px-2 py-0.5 transition-colors">
      + homologar
    </button>
  );

  return (
    <div className="space-y-1 min-w-[200px]">
      <input
        autoFocus
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Buscar cliente…"
        className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      <div className="max-h-32 overflow-y-auto border border-gray-200 rounded bg-white">
        {filtrados.slice(0, 20).map(c => (
          <button key={c.id}
            onClick={() => asignar(c.id)}
            disabled={isPending}
            className="block w-full text-left px-2 py-1 text-xs hover:bg-blue-50 disabled:opacity-40 truncate">
            {c.nombre}
            {c.n_ops_activas > 0 && (
              <span className="ml-1 text-[9px] text-blue-600">{c.n_ops_activas} OPs</span>
            )}
          </button>
        ))}
        {filtrados.length === 0 && (
          <p className="px-2 py-2 text-xs text-gray-400">Sin resultados</p>
        )}
        {filtrados.length > 20 && (
          <p className="px-2 py-1 text-[10px] text-gray-400">+{filtrados.length - 20} más — refina la búsqueda</p>
        )}
      </div>
      {err && <p className="text-[9px] text-red-600">{err}</p>}
      <button onClick={() => { setOpen(false); setSearch(""); }}
        className="text-[10px] text-gray-400 hover:text-gray-700">Cancelar</button>
    </div>
  );
}

// ─── Formulario crear cliente manual ────────────────────────────────────────

function CrearClienteForm({ onClose }: { onClose: () => void }) {
  const [nombre, setNombre]         = useState("");
  const [tier, setTier]             = useState("estandar");
  const [relacion, setRelacion]     = useState("unico");
  const [pago, setPago]             = useState("mas_de_60d");
  const [complejidad, setComplex]   = useState("media");
  const [isPending, start]          = useTransition();
  const [err, setErr]               = useState<string | null>(null);

  function submit() {
    if (!nombre.trim()) { setErr("El nombre es obligatorio"); return; }
    start(async () => {
      const r = await crearClienteManual({
        nombre, tier, tipo_relacion: relacion,
        condicion_pago: pago, complejidad_tipica: complejidad,
      });
      if (r && "error" in r) setErr(r.error as string);
      else { onClose(); }
    });
  }

  const selectCls = "text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-400 w-full";

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
      <p className="text-sm font-semibold text-gray-800">Nuevo cliente manual</p>
      <input value={nombre} onChange={e => setNombre(e.target.value)}
        placeholder="Nombre del cliente"
        className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400" />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Tier</label>
          <select value={tier} onChange={e => setTier(e.target.value)} className={selectCls}>
            {Object.keys(TIER_PTS).map(o => <option key={o} value={o}>{TIER_LABEL[o]} ({TIER_PTS[o]}pts)</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Relación</label>
          <select value={relacion} onChange={e => setRelacion(e.target.value)} className={selectCls}>
            {Object.keys(RELACION_PTS).map(o => <option key={o} value={o}>{RELACION_LABEL[o]} ({RELACION_PTS[o]}pts)</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Condición pago</label>
          <select value={pago} onChange={e => setPago(e.target.value)} className={selectCls}>
            {Object.keys(PAGO_PTS).map(o => <option key={o} value={o}>{PAGO_LABEL[o]} ({PAGO_PTS[o]}pts)</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Complejidad</label>
          <select value={complejidad} onChange={e => setComplex(e.target.value)} className={selectCls}>
            {Object.keys(COMPLEJIDAD_PTS).map(o => <option key={o} value={o}>{COMPLEJIDAD_LABEL[o]} ({COMPLEJIDAD_PTS[o]}pts)</option>)}
          </select>
        </div>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={isPending}
          className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50">
          Crear cliente
        </button>
        <button onClick={onClose}
          className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50">
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Tabla principal ─────────────────────────────────────────────────────────

export function ClientesClient({ data }: { data: ClienteRow[] }) {
  const [soloActivos, setSoloActivos] = useState(true);
  const [globalFilter, setFilter]    = useState("");
  const [sorting, setSorting]        = useState<SortingState>([{ id: "n_ops_activas", desc: true }]);
  const [mostrarForm, setForm]        = useState(false);

  const filtered = useMemo(
    () => soloActivos ? data.filter(c => c.n_ops_activas > 0) : data,
    [data, soloActivos]
  );

  const columns = useMemo<ColumnDef<ClienteRow>[]>(() => [
    {
      accessorKey: "nombre",
      header: "Cliente",
      size: 220,
      cell: ({ row }) => (
        <div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-gray-800">{row.original.nombre}</span>
            {row.original.es_manual && (
              <span className="text-[9px] bg-purple-100 text-purple-700 px-1 rounded">manual</span>
            )}
          </div>
          {row.original.homologado_a && (
            <p className="text-[10px] text-blue-600 mt-0.5">
              ↳ alias de {row.original.homologado_a_nombre}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "n_ops_activas",
      header: "OPs",
      size: 55,
      cell: ({ getValue }) => {
        const n = getValue() as number;
        return n > 0
          ? <span className="text-xs font-semibold text-blue-700">{n}</span>
          : <span className="text-xs text-gray-300">—</span>;
      },
    },
    {
      accessorKey: "tier",
      header: `Tier (estratégico, hasta ${Math.max(...Object.values(TIER_PTS))}pts)`,
      size: 200,
      cell: ({ row }) => (
        <SelectField
          clienteId={row.original.id}
          campo="tier"
          value={row.original.tier}
          options={Object.keys(TIER_PTS)}
          labels={TIER_LABEL}
          pesos={TIER_PTS}
          disabled={!!row.original.homologado_a}
        />
      ),
    },
    {
      accessorKey: "tipo_relacion",
      header: `Contractual (hasta ${Math.max(...Object.values(RELACION_PTS))}pts)`,
      size: 210,
      cell: ({ row }) => (
        <SelectField
          clienteId={row.original.id}
          campo="tipo_relacion"
          value={row.original.tipo_relacion}
          options={Object.keys(RELACION_PTS)}
          labels={RELACION_LABEL}
          pesos={RELACION_PTS}
          disabled={!!row.original.homologado_a}
        />
      ),
    },
    {
      accessorKey: "condicion_pago",
      header: `Caja (hasta ${Math.max(...Object.values(PAGO_PTS))}pts)`,
      size: 175,
      cell: ({ row }) => (
        <SelectField
          clienteId={row.original.id}
          campo="condicion_pago"
          value={row.original.condicion_pago}
          options={Object.keys(PAGO_PTS)}
          labels={PAGO_LABEL}
          pesos={PAGO_PTS}
          disabled={!!row.original.homologado_a}
        />
      ),
    },
    {
      accessorKey: "complejidad_tipica",
      header: `Complejidad (hasta ${Math.max(...Object.values(COMPLEJIDAD_PTS))}pts)`,
      size: 165,
      cell: ({ row }) => (
        <SelectField
          clienteId={row.original.id}
          campo="complejidad_tipica"
          value={row.original.complejidad_tipica}
          options={Object.keys(COMPLEJIDAD_PTS)}
          labels={COMPLEJIDAD_LABEL}
          pesos={COMPLEJIDAD_PTS}
          disabled={!!row.original.homologado_a}
        />
      ),
    },
    {
      id: "score_base",
      header: "Score base",
      size: 100,
      cell: ({ row }) => {
        const r = row.original;
        if (r.homologado_a) return <span className="text-xs text-blue-500">↳ alias</span>;
        const total =
          (TIER_PTS[r.tier] ?? 4) +
          (RELACION_PTS[r.tipo_relacion] ?? 0) +
          (PAGO_PTS[r.condicion_pago] ?? 3) +
          (COMPLEJIDAD_PTS[r.complejidad_tipica] ?? 3);
        const max = 20 + 20 + 15 + 5;
        const pct = Math.round((total / max) * 100);
        const esMinimo = total <= 10;
        const color = total >= 40 ? "text-green-700" : total >= 20 ? "text-yellow-700" : "text-red-600";
        const barColor = total >= 40 ? "bg-green-500" : total >= 20 ? "bg-yellow-400" : "bg-red-400";
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-semibold tabular-nums ${color}`}>
                {total}/{max}
              </span>
              {esMinimo && (
                <span className="text-[9px] text-orange-600 border border-orange-200 bg-orange-50 px-1 rounded">
                  sin datos
                </span>
              )}
            </div>
            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      id: "homologacion",
      header: "Homologación",
      size: 200,
      cell: ({ row }) => <HomologarCell row={row.original} allClientes={data} />,
    },
  ], [data]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const nCaracterizados = data.filter(c =>
    !c.homologado_a &&
    (c.tier !== "estandar" || c.tipo_relacion !== "unico" ||
     c.condicion_pago !== "mas_de_60d" || c.complejidad_tipica !== "media")
  ).length;
  const nConOps = data.filter(c => c.n_ops_activas > 0).length;

  return (
    <div className="space-y-3">
      {/* Resumen */}
      <div className="flex gap-3 flex-wrap text-xs text-gray-600">
        <span className="bg-blue-50 border border-blue-200 rounded px-2 py-1">
          <strong>{nConOps}</strong> con OPs activas
        </span>
        <span className={`border rounded px-2 py-1 ${nCaracterizados > 0 ? "bg-green-50 border-green-200" : "bg-orange-50 border-orange-200"}`}>
          <strong>{nCaracterizados}</strong> caracterizados
        </span>
        <span className="bg-gray-50 border border-gray-200 rounded px-2 py-1">
          <strong>{data.length}</strong> total
        </span>
        <span className="text-xs text-gray-500 self-center ml-2">
          Score base = Tier + Contractual + Caja + Complejidad (máx 60pts). Urgencia y Volumen se calculan por OP.
        </span>
      </div>

      {/* Controles */}
      <div className="flex items-center gap-3 flex-wrap">
        <input value={globalFilter} onChange={e => setFilter(e.target.value)}
          placeholder="Buscar cliente…"
          className="h-8 rounded-md border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 w-52" />
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={soloActivos}
            onChange={e => setSoloActivos(e.target.checked)} className="rounded" />
          Solo con OPs activas ({nConOps})
        </label>
        <button onClick={() => setForm(v => !v)}
          className="ml-auto px-3 py-1.5 text-xs bg-gray-900 text-white rounded hover:bg-gray-800">
          + Crear cliente manual
        </button>
      </div>

      {mostrarForm && <CrearClienteForm onClose={() => setForm(false)} />}

      {/* Tabla */}
      <div className="rounded-lg border border-gray-200 [overflow:clip]">
        <table className="text-xs w-full min-w-max">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-14 z-10">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th key={h.id}
                    style={{ width: h.column.columnDef.size }}
                    onClick={h.column.getToggleSortingHandler()}
                    className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === "asc" ? " ↑" : h.column.getIsSorted() === "desc" ? " ↓" : ""}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-100">
            {table.getRowModel().rows.map(row => {
              const r = row.original;
              const esMinimo = !r.homologado_a && (
                (TIER_PTS[r.tier] ?? 4) +
                (RELACION_PTS[r.tipo_relacion] ?? 0) +
                (PAGO_PTS[r.condicion_pago] ?? 3) +
                (COMPLEJIDAD_PTS[r.complejidad_tipica] ?? 3)
              ) <= 10;
              return (
              <tr key={row.id}
                className={`hover:bg-gray-50/50 transition-colors ${r.homologado_a ? "opacity-70 bg-blue-50/20" : esMinimo ? "bg-orange-50/30" : ""}`}>
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-3 py-2 align-top">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
              );
            })}
          </tbody>
        </table>
        {table.getRowModel().rows.length === 0 && (
          <p className="text-center py-8 text-sm text-gray-400">Sin resultados</p>
        )}
      </div>
      <p className="text-[10px] text-gray-400">
        Los clientes homologados (alias) usan los atributos del cliente canónico para el score. Los selects están deshabilitados en alias.
      </p>
    </div>
  );
}
