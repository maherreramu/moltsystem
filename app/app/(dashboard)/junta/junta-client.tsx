"use client";

import { useState } from "react";
import { OPDDetailDrawer } from "@/components/drawer/opd-detail-drawer";
import { SemaforoDot } from "@/components/kanban/semaforo-badge";
import { FASE_LABEL } from "@/lib/fases";
import type { OPDCola } from "@/lib/queries/cola";
import type { OPDFoco } from "@/lib/queries/plan-semana";
import type { Pendiente } from "@/lib/queries/pendientes";
import type { CapacidadGrid } from "@/lib/queries/capacidad";
import type { Enums } from "@/types/supabase";

type Bloqueo = { id: string; ref: string; op_num: string; motivo_bloqueo: string | null; fase_actual: string; updated_at: string | null };

type Props = {
  cola: OPDCola[];
  foco: OPDFoco[];
  pendientes: Pendiente[];
  capacidad: CapacidadGrid;
  bloqueos: Bloqueo[];
};

const CARGA_BG: Record<Enums<"semaforo_enum">, string> = {
  verde: "bg-green-100 text-green-800", amarillo: "bg-yellow-100 text-yellow-800",
  rojo: "bg-red-100 text-red-800",
};

export function JuntaClient({ cola, foco, pendientes, capacidad, bloqueos }: Props) {
  const [sel, setSel] = useState<string | null>(null);

  const hoy = new Date();
  const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - (hoy.getDay() === 0 ? 6 : hoy.getDay() - 1));
  const semanaLabel = lunes.toLocaleDateString("es-CO", { day:"numeric", month:"long", year:"numeric" });

  const nVencidos = pendientes.filter(p => p.urgencia === "vencido").length;
  const nUrgentes = pendientes.filter(p => p.urgencia === "urgente").length;

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Junta del lunes</h1>
            <p className="text-sm text-gray-500">Semana del {semanaLabel}</p>
          </div>
          <div className="flex gap-3 text-center">
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              <p className="text-2xl font-bold text-red-700">{nVencidos}</p>
              <p className="text-xs text-red-600">Pend. vencidos</p>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2">
              <p className="text-2xl font-bold text-orange-700">{nUrgentes}</p>
              <p className="text-xs text-orange-600">Pend. urgentes</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              <p className="text-2xl font-bold text-red-700">{bloqueos.length}</p>
              <p className="text-xs text-red-600">Bloqueadas</p>
            </div>
          </div>
        </div>

        {/* Grid 2 columnas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Cola top 20 */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              🎯 Top 20 cola priorizada
              <span className="text-xs font-normal text-gray-400">por score</span>
            </h2>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-600 w-6">#</th>
                    <th className="px-3 py-2 text-left text-gray-600">Ref</th>
                    <th className="px-3 py-2 text-left text-gray-600">Fase</th>
                    <th className="px-3 py-2 text-right text-gray-600">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cola.map((o, i) => (
                    <tr key={o.opd_id} onClick={() => setSel(o.opd_id)}
                      className="hover:bg-gray-50 cursor-pointer">
                      <td className="px-3 py-1.5 text-gray-400">{i+1}</td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <SemaforoDot semaforo={o.semaforo} />
                          <span className="font-mono font-semibold">{o.ref}</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-gray-600">{FASE_LABEL[o.fase_actual]}</td>
                      <td className="px-3 py-1.5 text-right font-bold text-gray-900">{o.score_efectivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Plan de la semana agrupado */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-700">📅 Plan semana — {foco.length} OP-Ds</h2>
            {foco.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">Sin OP-Ds con fases en esta semana</p>
            ) : (
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {foco.slice(0, 15).map(o => (
                  <div key={`${o.opd_id}-${o.fase_objetivo}`} onClick={() => setSel(o.opd_id)}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <SemaforoDot semaforo={o.semaforo} />
                    <span className="font-mono text-xs font-semibold w-20 flex-none">{o.ref}</span>
                    <span className="text-xs text-gray-500 flex-1 truncate">{o.cliente}</span>
                    <span className="text-[10px] text-gray-400 flex-none">{FASE_LABEL[o.fase_objetivo]}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Bloqueos activos */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-700">🔒 Bloqueos activos</h2>
            {bloqueos.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center border border-gray-200 rounded-lg">Sin bloqueos activos ✓</p>
            ) : (
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                {bloqueos.map(b => (
                  <div key={b.id} onClick={() => setSel(b.id)}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <span className="font-mono text-xs font-semibold w-20 flex-none">{b.ref}</span>
                    <span className="text-xs text-gray-600 flex-1">{FASE_LABEL[b.fase_actual as Enums<"fase_enum">]}</span>
                    <span className="text-[10px] text-orange-600 flex-none">{b.motivo_bloqueo?.replace(/_/g," ")}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Capacidad — próximas 4 semanas */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-700">⚡ Capacidad próximas 4 semanas</h2>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-2 py-1.5 text-left text-gray-600 sticky left-0 bg-gray-50 min-w-[70px]">Semana</th>
                    {["compras","trazo","corte","tiqueteo","satelites","empaque"].map(f => (
                      <th key={f} className="px-2 py-1.5 text-center text-gray-600 min-w-[55px]">
                        {FASE_LABEL[f as Enums<"fase_enum">]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {capacidad.semanas.slice(0, 4).map(sem => (
                    <tr key={sem} className="hover:bg-gray-50">
                      <td className="px-2 py-1 font-mono sticky left-0 bg-white border-r border-gray-100 text-gray-600">
                        {sem.replace("-W"," W")}
                      </td>
                      {["compras","trazo","corte","tiqueteo","satelites","empaque"].map(fase => {
                        const cell = capacidad.data[sem]?.[fase as Enums<"fase_enum">];
                        return (
                          <td key={fase} className="px-2 py-1 text-center">
                            {cell ? (
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${CARGA_BG[cell.color_carga]}`}>
                                {cell.op_ds_simultaneas}
                              </span>
                            ) : <span className="text-gray-200">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      <OPDDetailDrawer opdId={sel} onClose={() => setSel(null)} />
    </>
  );
}
