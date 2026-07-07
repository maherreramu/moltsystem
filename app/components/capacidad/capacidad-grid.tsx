"use client";
import { fmtNum, fmtRangoSemana } from "@/lib/format";

import type { CapacidadGrid } from "@/lib/queries/capacidad";
import { FASE_LABEL, FASES_ORDEN } from "@/lib/fases";
import type { Enums } from "@/types/supabase";

type Props = { data: CapacidadGrid };

const CARGA_BG: Record<Enums<"semaforo_enum">, string> = {
  verde:    "bg-green-100 text-green-800",
  amarillo: "bg-yellow-100 text-yellow-800",
  rojo:     "bg-red-100 text-red-800",
};

// Semana actual: compara por fecha ISO del lunes para no depender del formato label
function getLunesActualISO(): string {
  const hoy   = new Date();
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - (hoy.getDay() === 0 ? 6 : hoy.getDay() - 1));
  lunes.setHours(0, 0, 0, 0);
  return `${lunes.getFullYear()}-${String(lunes.getMonth() + 1).padStart(2, "0")}-${String(lunes.getDate()).padStart(2, "0")}`;
}

export function CapacidadGrid({ data }: Props) {
  const lunesActual = getLunesActualISO();

  // Mapa semana_label → fecha ISO del lunes (semanas y semana_fechas son paralelos)
  const labelAFecha = new Map(
    data.semanas.map((label, i) => [label, data.semana_fechas[i] ?? ""])
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-100 rounded-sm inline-block border border-green-200" /> ≤10 OP-Ds</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-100 rounded-sm inline-block border border-yellow-200" /> 11-20</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-100 rounded-sm inline-block border border-red-200" /> &gt;20</span>
        <span className="ml-auto">{data.semanas.length} semanas × {FASES_ORDEN.length} fases</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600 sticky left-0 bg-gray-50 z-10 min-w-[80px]">Semana</th>
              {FASES_ORDEN.map((f) => (
                <th key={f} className="px-2 py-2 text-center font-medium text-gray-600 min-w-[70px]">
                  {FASE_LABEL[f]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.semanas.map((sem) => {
              const fechaLunes = labelAFecha.get(sem) ?? "";
              const esActual   = fechaLunes === lunesActual;
              return (
                <tr key={sem} className={esActual ? "bg-blue-50/30" : "hover:bg-gray-50/50"}>
                  <td className={`px-3 py-1.5 sticky left-0 z-10 border-r border-gray-200 min-w-[160px] ${esActual ? "bg-blue-50" : "bg-white"}`}>
                    <div className={`text-xs font-semibold ${esActual ? "text-blue-800" : "text-gray-700"}`}>
                      {fechaLunes ? fmtRangoSemana(fechaLunes) : sem.replace("-W", " W")}
                      {esActual && <span className="ml-1 text-[9px] text-blue-500">← hoy</span>}
                    </div>
                    <div className="text-[10px] text-gray-400 font-mono">{sem.replace("-W", " W")}</div>
                  </td>
                  {FASES_ORDEN.map((fase) => {
                    const cell = data.data[sem]?.[fase];
                    if (!cell) return <td key={fase} className="px-2 py-1.5 text-center text-gray-300">—</td>;
                    return (
                      <td key={fase} className="px-2 py-1.5 text-center">
                        <span className={`inline-flex flex-col items-center gap-0.5 px-2 py-1 rounded ${CARGA_BG[cell.color_carga]}`}>
                          <span className="font-semibold text-sm leading-none">{cell.op_ds_simultaneas}</span>
                          <span className="text-[9px] opacity-70">{fmtNum(cell.unidades_totales)} uds</span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


