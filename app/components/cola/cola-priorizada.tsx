"use client";

import { useState } from "react";
import type { OPDCola } from "@/lib/queries/cola";
import { FASE_LABEL } from "@/lib/fases";
import { SemaforoDot } from "@/components/kanban/semaforo-badge";
import type { Enums } from "@/types/supabase";

type Props = { data: OPDCola[]; onSelectOpd: (id: string) => void };

const CRITERIOS = [
  { key: "pts_urgencia",    label: "Urgencia",     max: 35, color: "#ef4444" },
  { key: "pts_contractual", label: "Contractual",  max: 20, color: "#f97316" },
  { key: "pts_estrategico", label: "Estratégico",  max: 20, color: "#8b5cf6" },
  { key: "pts_complejidad", label: "Complejidad",  max: 5,  color: "#06b6d4" },
  { key: "pts_velocidad",   label: "Velocidad",    max: 5,  color: "#14b8a6" },
  { key: "pts_caja",        label: "Caja",         max: 15, color: "#22c55e" },
] as const;

function ScoreBar({ opd }: { opd: OPDCola }) {
  return (
    <div className="flex gap-0.5 h-4 w-32 rounded-sm overflow-hidden" title="Breakdown del score">
      {CRITERIOS.map(({ key, max, color }) => {
        const val = opd[key] as number;
        const pct = (val / max) * 100;
        return (
          <div key={key} className="flex-1 relative group">
            <div className="h-full bg-gray-100 rounded-[1px]">
              <div className="h-full rounded-[1px] transition-all"
                style={{ width: `${pct}%`, background: color, opacity: 0.8 }} />
            </div>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block
              bg-gray-900 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-50 pointer-events-none">
              {CRITERIOS.find(c => c.key === key)?.label}: {val}/{max}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ColaPriorizada({ data, onSelectOpd }: Props) {
  const [search, setSearch] = useState("");
  const [semFiltro, setSemFiltro] = useState<Enums<"semaforo_enum"> | "todos">("todos");

  const filtrado = data.filter((o) => {
    if (semFiltro !== "todos" && o.semaforo !== semFiltro) return false;
    if (search) {
      const q = search.toLowerCase();
      return o.ref.toLowerCase().includes(q) || o.cliente_nombre.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar ref o cliente…"
          className="h-8 rounded-md border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 w-52" />
        <div className="flex gap-1">
          {(["todos","rojo","amarillo","verde"] as const).map(s => (
            <button key={s} onClick={() => setSemFiltro(s)}
              className={`px-3 py-1 text-xs rounded-md border transition-colors ${semFiltro === s ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
              {s === "todos" ? "Todos" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-auto">{filtrado.length} OP-Ds</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">#</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">Ref</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">Cliente</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">Fase</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">🚦</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">Slack</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">Score</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 w-40">Breakdown</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtrado.map((opd, i) => (
              <tr key={opd.opd_id} onClick={() => onSelectOpd(opd.opd_id)}
                className="hover:bg-gray-50 cursor-pointer transition-colors">
                <td className="px-3 py-2 text-xs text-gray-400">{i + 1}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-semibold">{opd.ref}</span>
                    {opd.score_override != null && (
                      <span className="text-[9px] bg-purple-100 text-purple-700 px-1 rounded">override</span>
                    )}
                    {opd.bloqueada && <span className="text-[9px]">🔒</span>}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-gray-600 max-w-[160px] truncate">{opd.cliente_nombre}</td>
                <td className="px-3 py-2 text-xs">{FASE_LABEL[opd.fase_actual]}</td>
                <td className="px-3 py-2"><SemaforoDot semaforo={opd.semaforo} /></td>
                <td className="px-3 py-2">
                  {opd.slack_dias != null ? (
                    <span className={`text-xs font-medium ${opd.slack_dias >= 3 ? "text-green-700" : opd.slack_dias >= 0 ? "text-yellow-700" : "text-red-700"}`}>
                      {opd.slack_dias >= 0 ? `+${opd.slack_dias}d` : `${opd.slack_dias}d`}
                    </span>
                  ) : "—"}
                </td>
                <td className="px-3 py-2">
                  <span className="text-sm font-bold text-gray-900">{opd.score_efectivo}</span>
                </td>
                <td className="px-3 py-2"><ScoreBar opd={opd} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
