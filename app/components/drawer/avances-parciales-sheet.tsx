"use client";

import { useEffect, useState, useTransition } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { advancePhaseParcial } from "@/lib/actions/opd-actions";
import type { Enums } from "@/types/supabase";

type OPDRow = {
  opdId: string;
  ref: string;
  cantidadTotal: number;
  cantidadAvanzan: number;
};

const CAUSAS: Enums<"causa_desvio_enum">[] = [
  "reproceso_interno","reproceso_satelite","calidad_mp","mp_tardia",
  "capacidad_corte","capacidad_trazo","capacidad_satelite",
  "capacidad_tiqueteo_empaque","cambio_cliente","documentacion_despacho","otro",
];
const CAUSA_LABEL: Record<string, string> = {
  reproceso_interno:"Reproceso interno", reproceso_satelite:"Reproceso satélite",
  calidad_mp:"Calidad MP", mp_tardia:"MP tardía",
  capacidad_corte:"Cap. corte", capacidad_trazo:"Cap. trazo",
  capacidad_satelite:"Cap. satélite", capacidad_tiqueteo_empaque:"Cap. tiqueteo/empaque",
  cambio_cliente:"Cambio cliente", documentacion_despacho:"Doc. despacho", otro:"Otro",
};

export function AvancesParcalesSheet({
  open,
  opdIds,
  onClose,
}: {
  open: boolean;
  opdIds: string[];
  onClose: () => void;
}) {
  const [rows, setRows] = useState<OPDRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [motivo, setMotivo] = useState<Enums<"causa_desvio_enum">>("reproceso_interno");
  const [obs, setObs] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  useEffect(() => {
    if (!open || !opdIds.length) { queueMicrotask(() => setRows([])); return; }
    queueMicrotask(() => setLoading(true));
    const sb = createClient();
    sb.from("op_ds").select("id,ref,cantidad").in("id", opdIds)
      .order("ref", { ascending: true })
      .then(({ data: opds }) => {
        const built: OPDRow[] = (opds ?? []).map((o: { id: string; ref: string; cantidad: number }) => ({
          opdId: o.id,
          ref: o.ref,
          cantidadTotal: o.cantidad,
          cantidadAvanzan: o.cantidad, // default: todas avanzan
        }));
        setRows(built);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, opdIds.join(",")]);

  function updateAvanzan(idx: number, val: number) {
    setRows(prev => {
      const next = [...prev];
      const r = next[idx];
      const clamped = Math.min(Math.max(0, val), r.cantidadTotal);
      next[idx] = { ...r, cantidadAvanzan: clamped };
      return next;
    });
  }

  // Detectar si hay avances parciales (al menos uno no avanza todas)
  const hayParcial = rows.some(r => r.cantidadAvanzan < r.cantidadTotal && r.cantidadAvanzan > 0);

  function submit() {
    const validos = rows.filter(r => r.cantidadAvanzan > 0 && r.cantidadAvanzan < r.cantidadTotal);
    if (!validos.length) { setMsg("❌ Sin avances parciales para enviar"); return; }

    start(async () => {
      let ok = 0;
      const errores = [];
      for (const row of validos) {
        const cantidadConNovedad = row.cantidadTotal - row.cantidadAvanzan;
        const res = await advancePhaseParcial(row.opdId, cantidadConNovedad, motivo, obs || undefined);
        if (res.error) {
          errores.push({ ref: row.ref, error: res.error });
        } else {
          ok++;
        }
      }
      if (errores.length) {
        const lista = errores.map(e => `${e.ref}: ${e.error}`).join(" · ");
        setMsg(`✓ ${ok} avanzadas · ❌ ${errores.length} sin avanzar: ${lista}`);
      } else {
        setMsg(`✓ ${ok} OP-Ds procesadas`);
      }
      setTimeout(() => { setMsg(null); onClose(); }, 2000);
    });
  }

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent className="w-[540px] sm:w-[600px] flex flex-col gap-0 overflow-hidden">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
          <SheetTitle className="text-base font-semibold">
            Avances parciales · {opdIds.length} OP-D{opdIds.length !== 1 ? "s" : ""}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading ? (
            <p className="text-sm text-gray-400">Cargando OP-Ds…</p>
          ) : (
            rows.map((row, idx) => {
              const cantidadConNovedad = row.cantidadTotal - row.cantidadAvanzan;
              const esParcial = row.cantidadAvanzan < row.cantidadTotal && row.cantidadAvanzan > 0;
              return (
                <div key={row.opdId} className={`border rounded-lg p-3 space-y-2 ${esParcial ? "border-yellow-300 bg-yellow-50" : "border-gray-200 bg-gray-50"}`}>
                  <p className="text-xs font-semibold text-gray-800 font-mono">{row.ref}</p>
                  <p className="text-[10px] text-gray-600">
                    Total: <strong>{row.cantidadTotal} uds</strong>
                  </p>
                  <div className="flex items-center gap-2 bg-white rounded p-2 border border-gray-200">
                    <label className="text-xs text-gray-700 flex-none">Avanzan:</label>
                    <input
                      type="number"
                      min={0}
                      max={row.cantidadTotal}
                      value={row.cantidadAvanzan}
                      onChange={e => updateAvanzan(idx, parseInt(e.target.value) || 0)}
                      className="w-20 text-xs border border-gray-300 rounded px-2 py-1 text-center font-semibold"
                    />
                    <span className="text-xs text-gray-500">/{row.cantidadTotal}</span>
                    {cantidadConNovedad > 0 && (
                      <span className="ml-auto text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded font-medium">
                        {cantidadConNovedad} con novedad
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <SheetFooter className="px-6 py-4 border-t border-gray-100 flex-col gap-2">
          {hayParcial && (
            <div className="flex flex-col gap-2 w-full">
              <div className="flex items-center gap-2 w-full">
                <label className="text-xs text-gray-600 flex-none">Motivo:</label>
                <select
                  value={motivo}
                  onChange={e => setMotivo(e.target.value as Enums<"causa_desvio_enum">)}
                  className="flex-1 h-7 rounded border border-gray-300 px-2 text-xs"
                >
                  {CAUSAS.map(c => (
                    <option key={c} value={c}>{CAUSA_LABEL[c]}</option>
                  ))}
                </select>
              </div>
              <textarea
                value={obs}
                onChange={e => setObs(e.target.value)}
                placeholder="Observaciones (opcional)…"
                rows={2}
                className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-yellow-400"
              />
            </div>
          )}
          {msg && <p className="text-xs text-center text-gray-600 w-full">{msg}</p>}
          <div className="flex gap-2 w-full">
            <button onClick={onClose} disabled={isPending}
              className="flex-1 h-8 rounded border border-gray-300 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50">
              Cancelar
            </button>
            <button onClick={submit} disabled={isPending || loading}
              className="flex-1 h-8 rounded bg-yellow-600 text-white text-xs font-semibold hover:bg-yellow-700 disabled:opacity-50">
              {isPending ? "Procesando…" : "Confirmar avances"}
            </button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
