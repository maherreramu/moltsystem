"use client";

import { useEffect, useState, useTransition } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { registrarCorte, registrarTiqueteo } from "@/lib/actions/opd-actions";
import type { Enums } from "@/types/supabase";

type RowState = {
  componenteId: string;
  opdId: string;
  ref: string;
  cliente: string;
  nombreTela: string;
  rol: string | null;
  objetivo: number;
  hechaActual: number;  // cantidad_cortada (fase corte) o cantidad_tiqueteada (fase tiqueteo)
  tope: number;         // objetivo (corte) o cantidad_cortada (tiqueteo)
  delta: number;
  incluir: boolean;
};

const MOTIVO_LABEL: Record<string, string> = {
  volumen_parcial: "Volumen parcial",
  mp_incompleta: "MP incompleta",
  capacidad_corte: "Cap. corte",
  capacidad_tiqueteo_empaque: "Cap. tiqueteo/empaque",
  otro: "Otro",
};

export function RegistrarCorteSheet({
  open,
  opdIds,
  fase,
  onClose,
}: {
  open: boolean;
  opdIds: string[];
  fase: "corte" | "tiqueteo";
  onClose: () => void;
}) {
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(false);
  const [motivo, setMotivo] = useState<Enums<"causa_desvio_enum">>("volumen_parcial");
  const [avanzarIds, setAvanzarIds] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  useEffect(() => {
    if (!open || !opdIds.length) { queueMicrotask(() => setRows([])); return; }
    queueMicrotask(() => setLoading(true));
    const sb = createClient();
    Promise.all([
      sb.from("op_d_componentes")
        .select("id,opd_id,nombre_tela,rol,cantidad_objetivo,cantidad_cortada,cantidad_tiqueteada")
        .in("opd_id", opdIds)
        .order("nombre_tela", { ascending: true }),
      sb.from("op_ds").select("id,ref,cantidad").in("id", opdIds),
    ]).then(([{ data: comps }, { data: opds }]) => {
      const opdMap = new Map<string, { ref: string; cantidad: number }>(
        (opds ?? []).map((o: { id: string; ref: string; cantidad: number }) => [o.id, { ref: o.ref, cantidad: o.cantidad }])
      );
      const built: RowState[] = (comps ?? []).map((c: {
        id: string; opd_id: string; nombre_tela: string; rol: string | null;
        cantidad_objetivo: number; cantidad_cortada: number; cantidad_tiqueteada: number;
      }) => {
        const opdData = opdMap.get(c.opd_id) ?? { ref: c.opd_id, cantidad: 0 };
        // Fallback a op_ds.cantidad si cantidad_objetivo no fue poblado (telas pre-fix)
        const efectivoObjetivo = c.cantidad_objetivo > 0 ? c.cantidad_objetivo : opdData.cantidad;
        const hechaActual = fase === "corte" ? c.cantidad_cortada : c.cantidad_tiqueteada;
        const tope = fase === "corte" ? efectivoObjetivo : c.cantidad_cortada;
        const pendiente = Math.max(0, tope - hechaActual);
        return {
          componenteId: c.id,
          opdId: c.opd_id,
          ref: opdData.ref,
          cliente: "",
          nombreTela: c.nombre_tela,
          rol: c.rol,
          objetivo: efectivoObjetivo,
          hechaActual,
          tope,
          delta: pendiente,
          incluir: pendiente > 0,
        };
      });
      setRows(built);
      // Default avanzar: OPDs donde todas las telas quedarán completas
      const avanzarDefault = new Set<string>();
      for (const opdId of opdIds) {
        const mias = built.filter(r => r.opdId === opdId);
        const todasCompletas = mias.every(r => r.incluir
          ? r.hechaActual + r.delta >= r.tope
          : r.hechaActual >= r.tope
        );
        if (todasCompletas && mias.length > 0) avanzarDefault.add(opdId);
      }
      setAvanzarIds(avanzarDefault);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, opdIds.join(","), fase]);

  function updateDelta(idx: number, val: number) {
    setRows(prev => {
      const next = [...prev];
      const r = next[idx];
      const clamped = Math.min(Math.max(0, val), r.tope - r.hechaActual);
      next[idx] = { ...r, delta: clamped };
      // recalcular avanzarIds para la OP-D afectada
      const opdId = r.opdId;
      const updated = next.filter(x => x.opdId === opdId);
      const todasCompletas = updated.every(x =>
        x.incluir ? x.hechaActual + x.delta >= x.tope : x.hechaActual >= x.tope
      );
      setAvanzarIds(prev2 => {
        const s = new Set(prev2);
        if (todasCompletas) s.add(opdId); else s.delete(opdId);
        return s;
      });
      return next;
    });
  }

  function toggleIncluir(idx: number) {
    setRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], incluir: !next[idx].incluir };
      return next;
    });
  }

  const hayParcial = rows.some(r => r.incluir && r.delta > 0 && r.hechaActual + r.delta < r.tope);

  // Agrupar por OP-D para mostrar headers
  const porOpd = opdIds.map(opdId => ({
    opdId,
    ref: rows.find(r => r.opdId === opdId)?.ref ?? opdId,
    telas: rows.filter(r => r.opdId === opdId),
  }));

  function submit() {
    const registros = rows
      .filter(r => r.incluir && r.delta > 0)
      .map(r => ({ componenteId: r.componenteId, cantidad: r.delta }));
    if (!registros.length) { setMsg("Sin registros para enviar"); return; }
    const motivoFinal = hayParcial ? motivo : null;
    const avanzar = [...avanzarIds];
    const action = fase === "corte" ? registrarCorte : registrarTiqueteo;
    start(async () => {
      const res = await action(registros, motivoFinal, avanzar);
      const errTxt = res.errores.map(e => `${e.ref}: ${e.error}`).join(" · ");
      setMsg(res.errores.length
        ? `✓ ${res.ok} avanzadas · ❌ ${errTxt}`
        : `✓ Registrado (${registros.length} telas)`
      );
      setTimeout(() => { setMsg(null); onClose(); }, 2000);
    });
  }

  const titulo = fase === "corte" ? "Registrar corte" : "Registrar tiqueteo";

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent className="w-[540px] sm:w-[600px] flex flex-col gap-0 overflow-hidden">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
          <SheetTitle className="text-base font-semibold">
            {titulo} · {opdIds.length} OP-D{opdIds.length !== 1 ? "s" : ""}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {loading ? (
            <p className="text-sm text-gray-400">Cargando telas…</p>
          ) : (
            porOpd.map(({ opdId, ref, telas }) => (
              <div key={opdId} className="space-y-2">
                <p className="text-xs font-semibold text-gray-700 font-mono">{ref}</p>
                {telas.length === 0 ? (
                  <p className="text-xs text-gray-400">Sin telas asignadas.</p>
                ) : (
                  <ul className="space-y-2">
                    {telas.map((r, _) => {
                      const globalIdx = rows.indexOf(r);
                      const hechoNuevo = r.hechaActual + (r.incluir ? r.delta : 0);
                      const pct = r.tope > 0 ? Math.round((hechoNuevo / r.tope) * 100) : 0;
                      const completa = hechoNuevo >= r.tope && r.tope > 0;
                      return (
                        <li key={r.componenteId} className="border border-gray-100 rounded-lg p-2.5 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <input type="checkbox" checked={r.incluir}
                              onChange={() => toggleIncluir(globalIdx)}
                              className="cursor-pointer" />
                            <span className="text-xs font-medium text-gray-800 flex-1">
                              {r.nombreTela}
                              {r.rol && <span className="ml-1 text-[10px] text-gray-400">· {r.rol}</span>}
                            </span>
                            <span className="text-[10px] text-gray-400">{r.hechaActual}/{r.tope}</span>
                          </div>
                          {/* Barra de progreso inline */}
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${completa ? "bg-green-500" : "bg-blue-500"}`}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                          {r.incluir && r.tope > r.hechaActual && (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-500">Delta:</span>
                              <input
                                type="number"
                                min={0}
                                max={r.tope - r.hechaActual}
                                value={r.delta}
                                onChange={e => updateDelta(globalIdx, parseInt(e.target.value) || 0)}
                                className="h-6 w-20 text-xs border border-gray-300 rounded px-2 text-center"
                              />
                              <span className="text-[10px] text-gray-400">
                                → {r.hechaActual + r.delta}/{r.tope}
                              </span>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* Checkbox avanzar esta OP-D */}
                {telas.length > 0 && (
                  <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer pt-1">
                    <input type="checkbox"
                      checked={avanzarIds.has(opdId)}
                      onChange={() => setAvanzarIds(prev => {
                        const s = new Set(prev);
                        s.has(opdId) ? s.delete(opdId) : s.add(opdId);
                        return s;
                      })}
                      className="cursor-pointer" />
                    Avanzar {ref} a {fase === "corte" ? "Tiqueteo" : "Satélites"}
                  </label>
                )}
              </div>
            ))
          )}
        </div>

        <SheetFooter className="px-6 py-4 border-t border-gray-100 flex-col gap-2">
          {hayParcial && (
            <div className="flex items-center gap-2 w-full">
              <span className="text-xs text-gray-600 shrink-0">Motivo parcial:</span>
              <select
                value={motivo}
                onChange={e => setMotivo(e.target.value as Enums<"causa_desvio_enum">)}
                className="h-7 flex-1 rounded border border-gray-300 px-2 text-xs"
              >
                {Object.entries(MOTIVO_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          )}
          {msg && <p className="text-xs text-center text-gray-600 w-full">{msg}</p>}
          <div className="flex gap-2 w-full">
            <button onClick={onClose} disabled={isPending}
              className="flex-1 h-8 rounded border border-gray-300 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50">
              Cancelar
            </button>
            <button onClick={submit} disabled={isPending || loading}
              className="flex-1 h-8 rounded bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 disabled:opacity-50">
              {isPending ? "Guardando…" : `${titulo} →`}
            </button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
