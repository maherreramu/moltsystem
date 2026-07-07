"use client";
import React from "react";
import { fmtNum } from "@/lib/format";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  getFilteredRowModel, flexRender,
  type ColumnDef, type SortingState,
} from "@tanstack/react-table";
import type { OPAgregada } from "./page";
import { FASE_LABEL } from "@/lib/fases";
import { SemaforoDot } from "@/components/kanban/semaforo-badge";
import { OPDDetailDrawer } from "@/components/drawer/opd-detail-drawer";
import { useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/types/supabase";
import { reasignarClienteOp } from "@/lib/actions/clientes-actions";

const IMPEL_BASE = "https://www.impeltechnology.com/prod1/m/main.jsp?pageId=14155196&id=";

function ImpelLink({ id, label }: { id: string | null; label?: string }) {
  if (!id) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <a href={`${IMPEL_BASE}${id}`} target="_blank" rel="noopener noreferrer"
      aria-label={`Abrir ${label ?? id} en IMPEL`}
      onClick={e => e.stopPropagation()}
      className="inline-flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-800 hover:underline">
      {label ?? id} ↗
    </a>
  );
}

type OPDRow = {
  id: string;
  ref: string;
  detalle: string | null;
  cantidad: number;
  fase_actual: Enums<"fase_enum">;
  semaforo: Enums<"semaforo_enum"> | null;
  slack: number | null;
  bloqueada: boolean;
  score_efectivo: number | null;
  pendientes: number;
  impel_id: string | null;
  link_impel: string | null;
};

function OPDsExpandidas({ opNum, onSelectOpd }: { opNum: string; onSelectOpd: (id: string) => void }) {
  const [opds, setOpds] = useState<OPDRow[] | null>(null);

  useEffect(() => {
    const sb = createClient();
    Promise.all([
      sb.from("op_ds").select("id,ref,detalle,cantidad,fase_actual,bloqueada,impel_id,link_impel").eq("op_num", opNum).eq("activa", true).order("seq"),
      sb.from("v_slack").select("opd_id,semaforo,slack").eq("op_num", opNum),
      sb.from("v_score").select("opd_id,score_efectivo").eq("op_num", opNum),
      sb.from("op_d_pendientes").select("opd_padre_id").neq("estado", "cerrado"),
    ]).then(([{ data: ods }, { data: slacks }, { data: scores }, { data: pend }]) => {
      const slackMap = new Map((slacks ?? []).map(s => [s.opd_id, s]));
      const scoreMap = new Map((scores ?? []).map(s => [s.opd_id, s.score_efectivo]));
      const pendMap  = new Map<string, number>();
      for (const p of pend ?? []) {
        if (p.opd_padre_id) pendMap.set(p.opd_padre_id, (pendMap.get(p.opd_padre_id) ?? 0) + 1);
      }
      setOpds((ods ?? []).map(o => ({
        id:             o.id,
        ref:            o.ref,
        detalle:    o.detalle,
        cantidad:       o.cantidad,
        fase_actual:    o.fase_actual as Enums<"fase_enum">,
        semaforo:       (slackMap.get(o.id)?.semaforo as Enums<"semaforo_enum">) ?? null,
        slack:          slackMap.get(o.id)?.slack ?? null,
        bloqueada:      o.bloqueada,
        score_efectivo: scoreMap.get(o.id) ?? null,
        pendientes:     pendMap.get(o.id) ?? 0,
        impel_id:       o.impel_id ?? null,
        link_impel:     o.link_impel ?? null,
      })));
    });
  }, [opNum]);

  if (!opds) return <p className="text-xs text-gray-400 py-2">Cargando…</p>;
  if (opds.length === 0) return <p className="text-xs text-gray-400 py-2">Sin OP-Ds activas</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-50">
          <tr>
            {["Ref","Descripción","Uds","Fase","Semáforo","Slack","Score","Pend.","IMPEL"].map(h => (
              <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-blue-50">
          {opds.map(o => (
            <tr key={o.id} onClick={() => onSelectOpd(o.id)}
              className="hover:bg-blue-50/60 cursor-pointer transition-colors">
              <td className="px-3 py-1.5">
                <div className="flex items-center gap-1">
                  <span className="font-mono font-semibold text-gray-900">{o.ref}</span>
                  {o.bloqueada && <span className="w-2 h-2 rounded-full bg-red-400 inline-block flex-none" title="Bloqueada" />}
                </div>
              </td>
              <td className="px-3 py-1.5 max-w-[220px]">
                <span className="text-gray-600 line-clamp-1" title={o.detalle ?? ""}>{o.detalle ?? "—"}</span>
              </td>
              <td className="px-3 py-1.5 text-gray-700 tabular-nums">{fmtNum(o.cantidad)}</td>
              <td className="px-3 py-1.5 text-gray-600">{FASE_LABEL[o.fase_actual]}</td>
              <td className="px-3 py-1.5"><SemaforoDot semaforo={o.semaforo} /></td>
              <td className="px-3 py-1.5">
                {o.slack != null ? (
                  <span className={`font-medium tabular-nums ${o.slack >= 3 ? "text-green-700" : o.slack >= 0 ? "text-yellow-700" : "text-red-700"}`}>
                    {o.slack >= 0 ? `+${o.slack}d` : `${o.slack}d`}
                  </span>
                ) : "—"}
              </td>
              <td className="px-3 py-1.5 font-bold text-gray-800">{o.score_efectivo ?? "—"}</td>
              <td className="px-3 py-1.5">
                {o.pendientes > 0 && (
                  <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">{o.pendientes}</span>
                )}
              </td>
              <td className="px-3 py-1.5">
                <ImpelLink id={o.link_impel ?? o.impel_id} label="↗" />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-blue-100 bg-blue-50/30">
            <td colSpan={2} className="px-3 py-1.5 text-[10px] text-gray-500 font-medium">{opds.length} OP-Ds</td>
            <td className="px-3 py-1.5 text-[10px] font-bold text-gray-700 tabular-nums">
              {fmtNum(opds.reduce((s, o) => s + o.cantidad, 0))} uds
            </td>
            <td colSpan={6} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const SEM_DOT: Record<string, string> = {
  verde: "bg-green-500", amarillo: "bg-yellow-400", rojo: "bg-red-500",
};

const FASES_PROD: Enums<"fase_enum">[] = ["compras","trazo","corte","tiqueteo","satelites","empaque","despacho"];

// ─── Picker reasignar cliente de una OP ──────────────────────────────────────
function ReasignarClientePicker({ opNum, nombreActual }: { opNum: string; nombreActual: string }) {
  const [open, setOpen]       = useState(false);
  const [search, setSearch]   = useState("");
  const [clientes, setClientes] = useState<{ id: string; nombre: string }[]>([]);
  const [isPending, start]    = useTransition();
  const [err, setErr]         = useState<string | null>(null);

  function abrirPicker() {
    setOpen(true);
    if (clientes.length === 0) {
      const sb = createClient();
      sb.from("clientes").select("id, cliente_impel_id, clientes_impel(razon_social)")
        .then(({ data }) => {
          setClientes((data ?? []).map((c: { id: string; clientes_impel: { razon_social: string } | null }) => ({
            id: c.id,
            nombre: c.clientes_impel?.razon_social ?? c.id,
          })).sort((a, b) => a.nombre.localeCompare(b.nombre)));
        });
    }
  }

  const filtrados = search
    ? clientes.filter(c => c.nombre.toLowerCase().includes(search.toLowerCase()))
    : clientes;

  function asignar(clienteId: string) {
    start(async () => {
      const r = await reasignarClienteOp(opNum, clienteId);
      if (r && "error" in r) setErr(r.error as string);
      else { setOpen(false); setSearch(""); setErr(null); }
    });
  }

  if (!open) return (
    <button onClick={abrirPicker}
      className="ml-1 text-[10px] text-gray-300 hover:text-blue-600 transition-colors"
      title="Reasignar cliente">
      ✎
    </button>
  );

  return (
    <div className="mt-1 space-y-1 min-w-[200px]">
      <p className="text-[10px] text-gray-500">Actual: <strong>{nombreActual}</strong></p>
      <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Buscar cliente…"
        className="w-full text-xs border border-gray-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
      <div className="max-h-28 overflow-y-auto border border-gray-200 rounded bg-white">
        {filtrados.slice(0, 15).map(c => (
          <button key={c.id} onClick={() => asignar(c.id)} disabled={isPending}
            className="block w-full text-left px-2 py-1 text-xs hover:bg-blue-50 disabled:opacity-40 truncate">
            {c.nombre}
          </button>
        ))}
        {clientes.length === 0 && <p className="px-2 py-2 text-xs text-gray-400">Cargando…</p>}
      </div>
      {err && <p className="text-[9px] text-red-600">{err}</p>}
      <p className="text-[9px] text-orange-600">Afecta todas las OP-Ds de esta OP.</p>
      <button onClick={() => { setOpen(false); setSearch(""); }}
        className="text-[10px] text-gray-400 hover:text-gray-700">Cancelar</button>
    </div>
  );
}

import { setFechaCompromiso } from "@/lib/actions/opd-actions";

function EditarFechaCompromiso({ opNum, fechaActual, puedeEditar }: { opNum: string; fechaActual: string | null; puedeEditar: boolean }) {
  const [isEditing, setIsEditing] = useState(false);
  const [displayDate, setDisplayDate] = useState(fechaActual);
  const [val, setVal] = useState(fechaActual ?? "");
  const [isPending, start] = useTransition();
  const router = useRouter();

  function guardar() {
    if (!val || val === displayDate) return setIsEditing(false);
    start(async () => {
      const res = await setFechaCompromiso(opNum, val);
      if (res?.error) {
        alert("Error al guardar: " + res.error);
        setIsEditing(false);
        return;
      }
      setDisplayDate(val);
      setIsEditing(false);
      router.refresh();
    });
  }

  if (!puedeEditar) {
    const vencida = displayDate && displayDate < new Date().toISOString().slice(0, 10);
    return (
      <span className={`text-xs font-medium ${vencida ? "text-red-600" : "text-gray-700"}`}>
        {displayDate || "—"}
      </span>
    );
  }

  if (!isEditing) {
    const vencida = displayDate && displayDate < new Date().toISOString().slice(0, 10);
    return (
      <div className="flex items-center gap-1 group">
        <span className={`text-xs font-medium ${vencida ? "text-red-600" : "text-gray-700"}`}>
          {displayDate || "—"}
        </span>
        <button onClick={() => setIsEditing(true)}
          className="text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 hover:text-blue-600 transition-opacity"
          title="Editar fecha de compromiso">
          ✎
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input type="date" autoFocus value={val} onChange={e => setVal(e.target.value)}
        disabled={isPending}
        onKeyDown={e => {
          if (e.key === "Enter") guardar();
          if (e.key === "Escape") setIsEditing(false);
        }}
        className="w-24 text-xs border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50" />
      <button onClick={guardar} disabled={isPending} className="text-[10px] text-blue-600 hover:text-blue-800 disabled:opacity-50">✓</button>
      <button onClick={() => setIsEditing(false)} disabled={isPending} className="text-[10px] text-gray-400 hover:text-gray-600 disabled:opacity-50">✕</button>
    </div>
  );
}

export function OpsClient({ ops, puedeEditarCompromiso }: { ops: OPAgregada[]; puedeEditarCompromiso: boolean }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "fecha_compromiso", desc: false }]);
  const [globalFilter, setFilter] = useState("");
  const [semFiltro, setSem] = useState<"todos"|"rojo"|"amarillo"|"verde">("todos");
  const [expandida, setExpandida] = useState<string | null>(null);
  const [opdSel, setOpdSel] = useState<string | null>(null);
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel("ops-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "ops" }, () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => router.refresh(), 800);
      })
      .subscribe();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(ch);
    };
  }, [router]);

  const data = useMemo(() =>
    semFiltro === "todos" ? ops : ops.filter(o => o.semaforo_op === semFiltro),
    [ops, semFiltro]
  );

  const hoy = new Date().toISOString().slice(0, 10);

  const columns = useMemo<ColumnDef<OPAgregada>[]>(() => [
    {
      id: "expand",
      header: "",
      size: 32,
      cell: ({ row }) => (
        <button onClick={e => { e.stopPropagation(); setExpandida(v => v === row.original.op_num ? null : row.original.op_num); }}
          className="text-gray-400 hover:text-gray-700 text-xs w-5">
          {expandida === row.original.op_num ? "▼" : "▶"}
        </button>
      ),
    },
    {
      accessorKey: "op_num",
      header: "OP",
      cell: ({ getValue }) => <span className="font-mono text-xs font-bold">{getValue() as string}</span>,
      size: 70,
    },
    {
      accessorKey: "cliente",
      header: "Cliente",
      cell: ({ row }) => (
        <div>
          <div className="flex items-center gap-0.5">
            <p className="text-xs font-medium truncate max-w-[150px]">{row.original.cliente}</p>
            <ReasignarClientePicker opNum={row.original.op_num} nombreActual={row.original.cliente} />
          </div>
          {row.original.nombre && <p className="text-[10px] text-gray-400 truncate max-w-[160px]">{row.original.nombre}</p>}
        </div>
      ),
    },
    {
      accessorKey: "comercial",
      header: "Comercial",
      cell: ({ getValue }) => <span className="text-xs text-gray-600">{(getValue() as string | null) ?? "—"}</span>,
      size: 90,
    },
    {
      accessorKey: "fecha_creacion_impel",
      header: "Creación IMPEL",
      size: 110,
      cell: ({ getValue }) => (
        <span className="text-xs text-gray-500">{(getValue() as string | null) ?? "—"}</span>
      ),
    },
    {
      accessorKey: "fecha_ingreso_sistema",
      header: "Ingreso sistema",
      size: 110,
      cell: ({ getValue }) => (
        <span className="text-xs text-gray-500">{(getValue() as string | null) ?? "—"}</span>
      ),
    },
    {
      id: "impel_link",
      header: "IMPEL",
      size: 70,
      cell: ({ row }) => <ImpelLink id={row.original.impel_id} label="↗ OP" />,
    },
    {
      accessorKey: "fecha_compromiso",
      header: "Compromiso",
      cell: ({ row }) => (
        <EditarFechaCompromiso opNum={row.original.op_num} fechaActual={row.original.fecha_compromiso} puedeEditar={puedeEditarCompromiso} />
      ),
      size: 100,
    },
    {
      accessorKey: "n_op_ds",
      header: "OP-Ds",
      cell: ({ getValue }) => <span className="text-xs text-center block">{getValue() as number}</span>,
      size: 60,
    },
    {
      accessorKey: "uds_reales",
      header: "Uds",
      cell: ({ getValue }) => <span className="text-xs">{fmtNum(getValue() as number)}</span>,
      size: 70,
    },
    {
      accessorKey: "semaforo_op",
      header: () => <span title="Semáforo de urgencia">●</span>,
      size: 56,
      cell: ({ row }) => {
        const o = row.original;
        return (
          <div className="flex items-center gap-1">
            <span className={`w-2.5 h-2.5 rounded-full flex-none ${SEM_DOT[o.semaforo_op] ?? "bg-gray-300"}`} />
            <span className="text-[10px] text-gray-500">
              {o.rojas > 0 && <span className="text-red-600">{o.rojas}<span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block ml-0.5" /></span>}
              {o.amarillas > 0 && <span className="text-yellow-600 ml-0.5">{o.amarillas}<span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block ml-0.5" /></span>}
            </span>
          </div>
        );
      },
    },
    {
      id: "fases_bar",
      header: "Distribución de fases",
      cell: ({ row }) => {
        const o = row.original;
        const total = o.n_op_ds || 1;
        return (
          <div className="flex h-4 rounded-sm overflow-hidden gap-px w-40">
            {FASES_PROD.map(f => {
              const n = o.fases[f] ?? 0;
              if (n === 0) return null;
              const pct = (n / total) * 100;
              return (
                <div key={f} title={`${FASE_LABEL[f]}: ${n}`}
                  className="h-full"
                  style={{ width: `${pct}%`, background: FASE_COLORS[f] }} />
              );
            })}
          </div>
        );
      },
    },
  ], [expandida, hoy, puedeEditarCompromiso]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const totales = useMemo(() => ({
    ops: data.length,
    opds: data.reduce((s, o) => s + o.n_op_ds, 0),
    uds: data.reduce((s, o) => s + o.uds_reales, 0),
    rojas: data.reduce((s, o) => s + o.rojas, 0),
  }), [data]);

  return (
    <div className="space-y-4">
      {/* Header + KPIs */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <h1 className="text-xl font-bold">Órdenes de Producción</h1>
        <div className="flex gap-3">
          {[
            { label: "OPs activas", val: totales.ops },
            { label: "OP-Ds",       val: totales.opds },
            { label: "Unidades",    val: fmtNum(totales.uds) },
            { label: "OP-Ds 🔴",    val: totales.rojas, red: true },
          ].map(k => (
            <div key={k.label} className="text-center bg-white border border-gray-200 rounded-lg px-4 py-2">
              <p className={`text-xl font-bold ${k.red ? "text-red-600" : "text-gray-900"}`}>{k.val}</p>
              <p className="text-[10px] text-gray-500">{k.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <input value={globalFilter} onChange={e => setFilter(e.target.value)}
          placeholder="Buscar OP, cliente, comercial…"
          className="h-8 rounded-md border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 w-60" />
        <div className="flex gap-1">
          {(["todos","rojo","amarillo","verde"] as const).map(s => (
            <button key={s} onClick={() => setSem(s)}
              className={`px-3 py-1 text-xs rounded-md border transition-colors ${semFiltro === s ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
              {s === "todos" ? "Todos" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-auto">{table.getFilteredRowModel().rows.length} OPs</span>
      </div>

      {/* Tabla */}
      <div className="rounded-lg border border-gray-200 [overflow:clip]">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-14 z-10">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th key={h.id} onClick={h.column.getToggleSortingHandler()}
                    className="px-3 py-2 text-left text-xs font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900 whitespace-nowrap"
                    style={{ width: h.column.getSize() }}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === "asc" ? " ↑" : h.column.getIsSorted() === "desc" ? " ↓" : ""}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <React.Fragment key={row.id}>
                <tr
                  className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${expandida === row.original.op_num ? "bg-blue-50/30" : ""}`}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-3 py-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>

                {/* Fila expandida: todas las OP-Ds de la OP */}
                {expandida === row.original.op_num && (
                  <tr className="border-b border-blue-100">
                    <td colSpan={columns.length} className="px-4 py-3 bg-blue-50/20">
                      <OPDsExpandidas
                        opNum={row.original.op_num}
                        onSelectOpd={setOpdSel}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Leyenda fases */}
      <div className="flex gap-3 flex-wrap">
        {FASES_PROD.map(f => (
          <span key={f} className="flex items-center gap-1 text-[10px] text-gray-500">
            <span className="w-3 h-2 rounded-sm" style={{ background: FASE_COLORS[f] }} />
            {FASE_LABEL[f]}
          </span>
        ))}
      </div>

      <OPDDetailDrawer opdId={opdSel} onClose={() => setOpdSel(null)} />
    </div>
  );
}

const FASE_COLORS: Record<string, string> = {
  compras:   "#60a5fa", trazo:     "#34d399", corte:     "#fbbf24",
  tiqueteo:  "#f97316", satelites: "#a78bfa", empaque:   "#f472b6",
  despacho:  "#6ee7b7", fase_0:    "#94a3b8",
};



