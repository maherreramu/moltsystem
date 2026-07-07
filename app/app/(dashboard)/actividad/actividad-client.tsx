"use client";

import { useState, useMemo } from "react";
import { OPDDetailDrawer } from "@/components/drawer/opd-detail-drawer";
import { FASE_LABEL } from "@/lib/fases";
import type { EventoLog } from "./page";
import type { Enums } from "@/types/supabase";

const TIPO_LABEL: Record<string, string> = {
  phase_advance:          "Avance de fase",
  phase_advance_parcial:  "Avance parcial",
  phase_revert:           "Reversión de fase",
  baseline_freeze:        "Baseline congelado",
  block:                  "Bloqueada",
  unblock:                "Desbloqueada",
  replan:                 "Replanificación",
  f0_checkbox_update:     "Checkbox F0",
  daily_check:            "Check diario",
  satellite_promise_set:  "Promesa satélite",
  satellite_received:     "Satélite recibido",
  observacion_tecnica:    "Observación técnica",
  score_update:           "Score override",
  resource_change:        "Cambio recurso",
  pendiente_created:      "Pendiente creado",
  pendiente_status_change:"Pendiente cerrado",
};

const TIPO_COLOR: Record<string, string> = {
  phase_advance:         "bg-green-100 text-green-800",
  phase_advance_parcial: "bg-yellow-100 text-yellow-800",
  block:                 "bg-red-100 text-red-800",
  unblock:               "bg-green-50 text-green-700",
  replan:                "bg-blue-100 text-blue-800",
  baseline_freeze:       "bg-purple-100 text-purple-800",
  score_update:          "bg-purple-50 text-purple-700",
  f0_checkbox_update:    "bg-gray-100 text-gray-700",
  satellite_promise_set: "bg-indigo-50 text-indigo-700",
  satellite_received:    "bg-indigo-100 text-indigo-800",
  observacion_tecnica:   "bg-amber-50 text-amber-700",
  pendiente_created:     "bg-orange-100 text-orange-800",
  pendiente_status_change:"bg-green-50 text-green-700",
};

const TIPOS_FILTRO = [
  "todos",
  "phase_advance", "phase_advance_parcial",
  "block", "unblock",
  "replan",
  "f0_checkbox_update",
  "score_update",
  "pendiente_created", "pendiente_status_change",
  "satellite_promise_set", "satellite_received",
  "observacion_tecnica",
] as const;

function describir(e: EventoLog): string {
  const p = e.payload ?? {};
  switch (e.tipo) {
    case "phase_advance":
      return `${FASE_LABEL[(p.fase_from as Enums<"fase_enum">) ?? "fase_0"]} → ${FASE_LABEL[(p.fase_to as Enums<"fase_enum">) ?? "compras"]}`;
    case "phase_advance_parcial":
      return `${FASE_LABEL[(p.fase_from as Enums<"fase_enum">) ?? "fase_0"]} → ${FASE_LABEL[(p.fase_to as Enums<"fase_enum">) ?? "compras"]} · ${p.cantidad_pendiente} uds pendientes`;
    case "block":
      return `Motivo: ${String(p.motivo ?? "").replace(/_/g, " ")}`;
    case "unblock":
      return `Resolución: ${p.resolucion ?? ""}`;
    case "replan":
      return Object.entries(p).map(([k, v]) => `${k.replace("dias_","")}: ${v}d`).join(" · ");
    case "f0_checkbox_update":
      return `${String(p.campo ?? "").replace("f0_","").replace(/_/g," ")}: ${p.valor ? "✓" : "✗"}`;
    case "score_update":
      return `Score → ${p.score_override ?? "calculado"}${p.motivo ? ` (${p.motivo})` : ""}`;
    case "satellite_promise_set": {
      const d = p.delta_dias as number | null;
      const delta = d != null ? (d > 0 ? ` (+${d}d ↑ reprograma)` : ` (${d}d ↓ acelera)`) : "";
      return `Promesa: ${p.fecha_anterior != null ? `${p.fecha_anterior} → ` : ""}${p.fecha}${delta}`;
    }
    case "satellite_received":
      return `Recibido: ${p.fecha}`;
    case "observacion_tecnica":
      return String(p.texto ?? "");
    case "baseline_freeze":
      return "Plan congelado como baseline";
    case "pendiente_created":
      return `${p.cantidad_pendiente ?? ""} uds · ${String(p.motivo ?? "").replace(/_/g," ")}`;
    default:
      return JSON.stringify(p).slice(0, 60);
  }
}

export function ActividadClient({ eventos }: { eventos: EventoLog[] }) {
  const [sel, setSel]           = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [tipoFiltro, setTipo]   = useState<string>("todos");
  const [actorFiltro, setActor] = useState<string>("todos");

  const actores = useMemo(() => {
    const set = new Set(eventos.map(e => e.actor));
    return ["todos", ...Array.from(set).sort()];
  }, [eventos]);

  const filtrados = useMemo(() => eventos.filter(e => {
    if (tipoFiltro !== "todos" && e.tipo !== tipoFiltro) return false;
    if (actorFiltro !== "todos" && e.actor !== actorFiltro) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      return e.ref.toLowerCase().includes(q) ||
             e.op_num.toLowerCase().includes(q) ||
             e.actor.toLowerCase().includes(q);
    }
    return true;
  }), [eventos, tipoFiltro, actorFiltro, busqueda]);

  // Agrupar por fecha
  const grupos = useMemo(() => {
    const map = new Map<string, EventoLog[]>();
    for (const e of filtrados) {
      const d = new Date(e.ts);
      const fecha = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      if (!map.has(fecha)) map.set(fecha, []);
      map.get(fecha)!.push(e);
    }
    return Array.from(map.entries());
  }, [filtrados]);

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Actividad</h1>
          <span className="text-sm text-gray-500">{filtrados.length} eventos · últimos 500</span>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-center">
          <input
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar ref, OP, usuario…"
            className="h-8 rounded-md border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 w-56"
          />

          <select value={tipoFiltro} onChange={e => setTipo(e.target.value)}
            className="h-8 rounded-md border border-gray-300 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900">
            {TIPOS_FILTRO.map(t => (
              <option key={t} value={t}>{t === "todos" ? "Todos los tipos" : (TIPO_LABEL[t] ?? t)}</option>
            ))}
          </select>

          <select value={actorFiltro} onChange={e => setActor(e.target.value)}
            className="h-8 rounded-md border border-gray-300 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900">
            {actores.map(a => (
              <option key={a} value={a}>{a === "todos" ? "Todos los usuarios" : a}</option>
            ))}
          </select>

          {(busqueda || tipoFiltro !== "todos" || actorFiltro !== "todos") && (
            <button onClick={() => { setBusqueda(""); setTipo("todos"); setActor("todos"); }}
              className="text-xs text-gray-500 hover:text-gray-800 underline">
              Limpiar filtros
            </button>
          )}
        </div>

        {/* Feed agrupado por fecha */}
        <div className="space-y-6">
          {grupos.length === 0 && (
            <p className="text-center py-12 text-gray-400 text-sm">Sin eventos con los filtros seleccionados</p>
          )}
          {grupos.map(([fecha, evs]) => (
            <div key={fecha}>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-2">
                <span className="flex-1 h-px bg-gray-200" />
                {fecha}
                <span className="flex-1 h-px bg-gray-200" />
              </p>
              <div className="space-y-1">
                {evs.map(e => (
                  <div key={e.id}
                    onClick={() => setSel(e.opd_id)}
                    className="flex items-start gap-3 px-4 py-2.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group">

                    {/* Hora — formato manual para evitar hydration mismatch por locale */}
                    <span className="text-[10px] text-gray-400 w-12 flex-none pt-0.5 tabular-nums">
                      {(() => { const d = new Date(e.ts); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; })()}
                    </span>

                    {/* Badge tipo */}
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-none ${TIPO_COLOR[e.tipo] ?? "bg-gray-100 text-gray-600"}`}>
                      {TIPO_LABEL[e.tipo] ?? e.tipo}
                    </span>

                    {/* Ref + descripción */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-xs font-semibold text-gray-900">{e.ref}</span>
                        {e.fase && (
                          <span className="text-[10px] text-gray-400">· {FASE_LABEL[e.fase as Enums<"fase_enum">]}</span>
                        )}
                        <span className="text-[10px] text-gray-400 ml-auto hidden group-hover:block">
                          ver detalle →
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 truncate">{describir(e)}</p>
                    </div>

                    {/* Actor */}
                    <span className="text-[10px] text-gray-400 flex-none max-w-[140px] truncate">
                      {e.actor.split("@")[0]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <OPDDetailDrawer opdId={sel} onClose={() => setSel(null)} />
    </>
  );
}
