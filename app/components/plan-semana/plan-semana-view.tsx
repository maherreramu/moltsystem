"use client";

import { useState, useMemo } from "react";
import type { OPDFoco } from "@/lib/queries/plan-semana";
import { FASE_LABEL, FASES_ORDEN } from "@/lib/fases";
import { SemaforoDot } from "@/components/kanban/semaforo-badge";
import { fmtRangoSemana, getLunesDeOffset } from "@/lib/format";
import type { Enums } from "@/types/supabase";

type Props = {
  data:        OPDFoco[];
  offset:      number;
  isPending:   boolean;
  onSelectOpd: (id: string) => void;
  onNavegar:   (offset: number) => void;
};

export function PlanSemanaView({ data, offset, isPending, onSelectOpd, onNavegar }: Props) {
  const [search, setSearch]       = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Resetear colapso al cambiar de semana
  const lunes = getLunesDeOffset(offset);
  const rango = fmtRangoSemana(lunes);

  const filtrado = search
    ? data.filter(o =>
        o.ref.toLowerCase().includes(search.toLowerCase()) ||
        o.cliente.toLowerCase().includes(search.toLowerCase())
      )
    : data;

  const porFase = useMemo(() =>
    Object.fromEntries(
      FASES_ORDEN.map(f => [f, filtrado.filter(o => o.fase_objetivo === f)])
    ) as Record<Enums<"fase_enum">, OPDFoco[]>,
    [filtrado]
  );

  const fasesConItems = FASES_ORDEN.filter(f => porFase[f].length > 0);
  const todasColapsadas = fasesConItems.length > 0 && fasesConItems.every(f => collapsed.has(f));

  function toggleFase(fase: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(fase)) next.delete(fase); else next.add(fase);
      return next;
    });
  }

  function toggleTodo() {
    if (todasColapsadas) setCollapsed(new Set());
    else setCollapsed(new Set(fasesConItems));
  }

  return (
    <div className="space-y-4">
      {/* Navegador de semana */}
      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
        <button
          onClick={() => onNavegar(offset - 1)}
          disabled={isPending}
          className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40 transition-colors"
          title="Semana anterior">
          ‹
        </button>

        <div className="flex-1 text-center">
          <p className={`text-sm font-semibold ${offset === 0 ? "text-blue-700" : "text-gray-800"}`}>
            {offset === 0 ? "Semana actual" : offset < 0 ? `Hace ${Math.abs(offset)} semana${Math.abs(offset) > 1 ? "s" : ""}` : `En ${offset} semana${offset > 1 ? "s" : ""}`}
          </p>
          <p className="text-xs text-gray-500">{rango}</p>
        </div>

        <button
          onClick={() => onNavegar(offset + 1)}
          disabled={isPending}
          className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40 transition-colors"
          title="Semana siguiente">
          ›
        </button>

        {offset !== 0 && (
          <button
            onClick={() => onNavegar(0)}
            disabled={isPending}
            className="ml-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 transition-colors">
            Hoy
          </button>
        )}

        {isPending && (
          <span className="text-xs text-gray-400 animate-pulse ml-1">cargando…</span>
        )}
      </div>

      {/* Barra de filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar ref o cliente…"
          className="h-8 rounded-md border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 w-52" />

        {fasesConItems.length > 0 && (
          <button onClick={toggleTodo}
            className="h-8 px-3 text-xs border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 transition-colors">
            {todasColapsadas ? "Expandir todo" : "Colapsar todo"}
          </button>
        )}

        <span className="text-xs text-gray-400 ml-auto">{filtrado.length} OP-Ds</span>
      </div>

      {fasesConItems.length === 0 && !isPending && (
        <div className="text-center py-12 text-gray-400 text-sm">
          No hay OP-Ds con fases que solapan esta semana
        </div>
      )}

      <div className="space-y-3">
        {fasesConItems.map(fase => {
          const items  = porFase[fase];
          const nRojas = items.filter(o => o.semaforo === "rojo").length;
          const isOpen = !collapsed.has(fase);

          return (
            <div key={fase} className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => toggleFase(fase)}
                className="w-full flex items-center justify-between bg-gray-50 px-4 py-2 border-b border-gray-200 hover:bg-gray-100 transition-colors text-left">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] text-gray-400 transition-transform duration-150 ${isOpen ? "rotate-90" : "rotate-0"}`}>
                    ▶
                  </span>
                  <span className="text-sm font-semibold text-gray-800">{FASE_LABEL[fase]}</span>
                </div>
                <div className="flex items-center gap-2">
                  {nRojas > 0 && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                      {nRojas} 🔴
                    </span>
                  )}
                  <span className="text-xs text-gray-500">{items.length} OP-Ds</span>
                </div>
              </button>

              {isOpen && (
                <div className="divide-y divide-gray-100">
                  {items.map(opd => (
                    <div key={opd.opd_id} onClick={() => onSelectOpd(opd.opd_id)}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors ${opd.bloqueada ? "opacity-70" : ""}`}>
                      <SemaforoDot semaforo={opd.semaforo} />
                      <span className="font-mono text-xs font-semibold w-20 flex-none">{opd.ref}</span>
                      <span className="text-xs text-gray-600 flex-1 truncate">{opd.cliente}</span>
                      <span className="text-[10px] text-gray-400 flex-none">
                        {opd.start_date} → {opd.due_date}
                      </span>
                      {opd.slack != null && (
                        <span className={`text-xs font-medium flex-none ${
                          opd.slack >= 3 ? "text-green-700" : opd.slack >= 0 ? "text-yellow-700" : "text-red-700"
                        }`}>
                          {opd.slack >= 0 ? `+${opd.slack}d` : `${opd.slack}d`}
                        </span>
                      )}
                      {opd.bloqueada && <span className="text-xs flex-none">🔒</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
