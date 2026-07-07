"use client";

import { useState } from "react";
import type { Pendiente } from "@/lib/queries/pendientes";
import { FASE_LABEL } from "@/lib/fases";

type Props = { data: Pendiente[]; onSelectOpd: (id: string) => void };

const URGENCIA_STYLE = {
  vencido: "bg-red-100 text-red-800 border-red-200",
  urgente: "bg-orange-100 text-orange-800 border-orange-200",
  en_curso: "bg-gray-100 text-gray-700 border-gray-200",
};

const MOTIVO_LABEL: Record<string, string> = {
  mp_tardia: "MP tardía", calidad_mp: "Calidad MP", bloqueo_f0: "Bloqueo F0",
  capacidad_corte: "Cap. corte", capacidad_trazo: "Cap. trazo",
  capacidad_satelite: "Cap. satélite", capacidad_tiqueteo_empaque: "Cap. tiqueteo/empaque",
  reproceso_interno: "Reproceso interno", reproceso_satelite: "Reproceso satélite",
  cambio_cliente: "Cambio cliente", documentacion_despacho: "Doc. despacho", otro: "Otro",
};

export function PendientesList({ data, onSelectOpd }: Props) {
  const [filtroUrgencia, setFiltroUrgencia] = useState<"todos"|"vencido"|"urgente"|"en_curso">("todos");
  const [search, setSearch] = useState("");

  const filtrado = data.filter((p) => {
    if (filtroUrgencia !== "todos" && p.urgencia !== filtroUrgencia) return false;
    if (search) return p.opd_ref.toLowerCase().includes(search.toLowerCase());
    return true;
  });

  const nVencidos = data.filter(p => p.urgencia === "vencido").length;
  const nUrgentes = data.filter(p => p.urgencia === "urgente").length;

  return (
    <div className="space-y-3">
      {/* Resumen */}
      <div className="flex gap-3">
        {([
          {
            key: "vencido",
            label: "Vencidos",
            n: nVencidos,
            activeStyle: "bg-red-50 text-red-800 border-red-300",
            idleStyle: nVencidos > 0 ? "bg-red-50 text-red-700 border-red-200" : "bg-white text-gray-500 border-gray-200",
            numColor: nVencidos > 0 ? "text-red-700" : "text-gray-400",
          },
          {
            key: "urgente",
            label: "Urgentes (≤3d)",
            n: nUrgentes,
            activeStyle: "bg-orange-50 text-orange-800 border-orange-300",
            idleStyle: nUrgentes > 0 ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-white text-gray-500 border-gray-200",
            numColor: nUrgentes > 0 ? "text-orange-700" : "text-gray-400",
          },
          {
            key: "en_curso",
            label: "En curso",
            n: data.length - nVencidos - nUrgentes,
            activeStyle: "bg-gray-50 text-gray-800 border-gray-300",
            idleStyle: "bg-white text-gray-500 border-gray-200",
            numColor: "text-gray-700",
          },
        ] as const).map(({ key, label, n, activeStyle, idleStyle, numColor }) => (
          <div key={key}
            onClick={() => setFiltroUrgencia(filtroUrgencia === key ? "todos" : key)}
            className={`flex-1 rounded-lg border px-4 py-3 cursor-pointer transition-all ${filtroUrgencia === key ? activeStyle + " ring-2 ring-offset-1 ring-gray-400" : idleStyle + " hover:opacity-80"}`}>
            <p className={`text-2xl font-bold ${numColor}`}>{n}</p>
            <p className="text-xs">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar ref…"
          className="h-8 rounded-md border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 w-40" />
        <span className="text-xs text-gray-400 ml-auto">{filtrado.length} pendientes</span>
      </div>

      <div className="space-y-2">
        {filtrado.map((p) => (
          <div key={p.id} onClick={() => onSelectOpd(p.opd_padre_id)}
            className="bg-white border border-gray-200 rounded-lg px-4 py-3 cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-xs font-semibold w-20 flex-none">{p.opd_ref}</span>
              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium ${URGENCIA_STYLE[p.urgencia]}`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-none ${p.urgencia === "vencido" ? "bg-red-500" : p.urgencia === "urgente" ? "bg-yellow-400" : "bg-gray-400"}`} />
                {p.urgencia === "vencido" ? "Vencido" : p.urgencia === "urgente" ? "Urgente" : "En curso"}
              </span>
              <span className="text-xs text-gray-600">{MOTIVO_LABEL[p.motivo] ?? p.motivo}</span>
              <span className="text-xs text-gray-500">{FASE_LABEL[p.fase_origen]} → {FASE_LABEL[p.fase_actual]}</span>
              <span className="text-xs font-medium text-gray-700 ml-auto">{p.cantidad_afectada} / {p.cantidad_total_opd} uds</span>
            </div>
            {p.fecha_compromiso_subsanacion && (
              <p className="text-[10px] text-gray-400 mt-1">
                Subsanar: {p.fecha_compromiso_subsanacion} · {p.dias_abierto}d abierto
                {p.responsable && ` · ${p.responsable}`}
              </p>
            )}
            {p.notas && <p className="text-[10px] text-gray-500 mt-0.5 truncate">{p.notas}</p>}
          </div>
        ))}
        {filtrado.length === 0 && (
          <p className="text-center py-8 text-gray-400 text-sm">Sin pendientes {filtroUrgencia !== "todos" ? `"${filtroUrgencia}"` : ""}</p>
        )}
      </div>
    </div>
  );
}
