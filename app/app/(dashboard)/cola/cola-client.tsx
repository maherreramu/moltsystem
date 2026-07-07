"use client";
import { useState, useMemo } from "react";
import { ColaPriorizada } from "@/components/cola/cola-priorizada";
import { OPDDetailDrawer } from "@/components/drawer/opd-detail-drawer";
import type { OPDCola } from "@/lib/queries/cola";
export function ColaClient({ data }: { data: OPDCola[] }) {
  const [sel, setSel] = useState<string | null>(null);
  const [ocultarCierre, setOcultarCierre] = useState(true);
  const datosFiltrados = useMemo(() => ocultarCierre ? data.filter(o => o.fase_actual !== "cierre") : data, [data, ocultarCierre]);
  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Cola priorizada</h1>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer" title="Las OP-Ds en fase Cierre se archivan automáticamente tras 30 días">
              <input type="checkbox" checked={ocultarCierre} onChange={e => setOcultarCierre(e.target.checked)} className="cursor-pointer" />
              Ocultar cierre
            </label>
            <span className="text-sm text-gray-500">{datosFiltrados.length} OP-Ds · ordenadas por score</span>
          </div>
        </div>
        <ColaPriorizada data={datosFiltrados} onSelectOpd={setSel} />
      </div>
      <OPDDetailDrawer opdId={sel} onClose={() => setSel(null)} />
    </>
  );
}
