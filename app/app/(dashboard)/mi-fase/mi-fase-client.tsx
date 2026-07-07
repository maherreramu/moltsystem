"use client";
import { fmtNum } from "@/lib/format";

import React, { useState, useTransition, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { RegistrarCorteSheet } from "@/components/drawer/registrar-corte-sheet";
import { AvancesParcalesSheet } from "@/components/drawer/avances-parciales-sheet";
import type { Enums } from "@/types/supabase";
import { createClient } from "@/lib/supabase/client";
import type { OPDMiFase, PendienteMiFase } from "@/lib/queries/mi-fase";
import { FASE_LABEL, FASES_ORDEN, saltoDestinosPermitidos } from "@/lib/fases";
import type { LiderJump } from "@/lib/actions/phase-jumps-actions";
import { SemaforoDot } from "@/components/kanban/semaforo-badge";
import { OPDDetailDrawer } from "@/components/drawer/opd-detail-drawer";
import {
  advancePhase, blockOpd, dailyCheck, advancePendienteFase, closePendiente,
  advancePhaseBatch, dailyCheckBatch, blockOpdBatch, unblockBatch, replanBatchOpds,
  saltarFaseBatch, revertPhaseBatch, setPhasePromise, setPhasePromiseBatch,
  setFechaCompromiso,
  togglePaqueteCompleto, togglePaqueteCompletoBatch, setUdsRecibidasEmpaque,
  setSubestadoSatelite, setSubfasePromesaSatelite
} from "@/lib/actions/opd-actions";
import { SUBESTADO_SATELITE_ORDEN, SUBESTADO_LABEL } from "@/lib/fases";
import { useColumnPrefs } from "@/lib/column-prefs";
import { ColumnPicker, type ColDef } from "@/components/ui/column-picker";
import { MiFaseImportExport } from "@/components/mi-fase/mi-fase-import-export";

// Toggleable columns (visibility prefs)
const MI_FASE_DEFAULTS: Record<string, boolean> = {
  score_efectivo: true, slack: true, semaforo_fase: true, slack_fase: true,
  cantidad: true, detalle: true, promesa_fase: true, promesa_subfase: true,
  pendientes: true, progreso_corte: true, subfase: false, prioridad_fase: false,
  paquete_completo: true, uds_recibidas_empaque: true,
};

// All data columns for the picker (non-toggleable = hideable:false)
const MI_FASE_ALL_COLS: ColDef[] = [
  { key: "ref",                label: "Ref",              hideable: false },
  { key: "cliente",            label: "Cliente",          hideable: false },
  { key: "detalle",            label: "Detalle",          hideable: true  },
  { key: "fase_actual",        label: "Fase",             hideable: false },
  { key: "semaforo",           label: "Semáforo",         hideable: false },
  { key: "slack",              label: "Slack",            hideable: true  },
  { key: "semaforo_fase",      label: "Sem. Fase",        hideable: true  },
  { key: "slack_fase",         label: "Slack Fase",       hideable: true  },
  { key: "score_efectivo",     label: "Score",            hideable: true  },
  { key: "cantidad",           label: "Uds (Fase/Tot)",   hideable: true  },
  { key: "fecha_fin_planeada", label: "Fin plan",         hideable: false },
  { key: "promesa_fase",       label: "Promesa entrega",  hideable: true  },
  { key: "promesa_subfase",    label: "Promesa subfase",  hideable: true  },
  { key: "fecha_compromiso",   label: "Compromiso",       hideable: false },
  { key: "pendientes",         label: "Pendientes",       hideable: true  },
  { key: "progreso_corte",     label: "Progreso corte",   hideable: true  },
  { key: "subfase",            label: "Subfase",          hideable: true  },
  { key: "prioridad_fase",    label: "Prioridad",        hideable: true  },
  { key: "paquete_completo",  label: "P. Completo",      hideable: true  },
  { key: "uds_recibidas_empaque", label: "Uds Recibidas", hideable: true  },
];

// Columnas que los líderes de fase no deben ver (revelan el compromiso comercial)
const COLS_OCULTAS_LIDER = new Set(["fecha_compromiso", "semaforo", "slack", "score_efectivo"]);

const MI_FASE_ORDER_DEFAULT = MI_FASE_ALL_COLS.map(c => c.key);
type BooleanFilterMode = "todos" | "incluir" | "excluir";

const MOTIVOS_BLOQUEO: Enums<"motivo_bloqueo_enum">[] = [
  "mp_no_llego","fase_0_incompleta","pendiente_cliente",
  "capacidad_satelite","reproceso","otro",
];
const MOTIVO_SHORT: Record<string, string> = {
  mp_no_llego:"MP no llegó", fase_0_incompleta:"F0 incompleta",
  pendiente_cliente:"Pendiente cliente", capacidad_satelite:"Cap. satélite",
  reproceso:"Reproceso", otro:"Otro",
};

function FechaCompromisoCellMiFase({ opd }: { opd: OPDMiFase }) {
  const [editing, setEditing] = useState(false);
  const [isPending, start] = useTransition();

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    const val = e.target.value;
    setEditing(false);
    if (!val || val === opd.fecha_compromiso) return;
    start(() => { void setFechaCompromiso(opd.op_num, val); });
  }

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        defaultValue={opd.fecha_compromiso ?? ""}
        onBlur={handleBlur}
        onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); if (e.key === "Enter") e.currentTarget.blur(); }}
        onClick={(e) => e.stopPropagation()}
        className="h-6 w-28 rounded border border-blue-400 bg-white px-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        disabled={isPending}
      />
    );
  }

  const v = opd.fecha_compromiso;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className={`text-xs tabular-nums px-1 py-0.5 rounded hover:bg-blue-50 hover:text-blue-700 border border-transparent hover:border-blue-200 transition-colors ${v ? "text-gray-700" : "text-gray-300"} ${isPending ? "opacity-50" : ""}`}
      title="Click para editar compromiso comercial"
    >
      {v ?? "—"}
    </button>
  );
}

function AccionesRapidas({ opd, onDetalle, operable = true }: { opd: OPDMiFase; onDetalle: () => void; operable?: boolean }) {
  const [isPending, start] = useTransition();
  const [msg, setMsg]      = useState<string | null>(null);
  const [bloqOpen, setBloq] = useState(false);

  const idx         = FASES_ORDEN.indexOf(opd.fase_actual);
  const faseSig     = idx >= 0 && idx < FASES_ORDEN.length - 1 ? FASES_ORDEN[idx + 1] : null;

  const telasIncompletas = opd.fase_actual === "corte"
    && opd.componentes_total > 0
    && opd.componentes_cortados < opd.componentes_total;

  function run(fn: () => Promise<{ ok?: boolean | number; error?: string }>) {
    start(async () => {
      const r = await fn();
      if (r.error) { setMsg(`❌ ${r.error}`); setTimeout(() => setMsg(null), 3000); }
      else          { setMsg("✓"); setTimeout(() => setMsg(null), 1500); }
    });
  }

  if (!operable) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-gray-400 px-1" title="Solo lectura — fase fuera de tu responsabilidad">👁</span>
        <button onClick={onDetalle}
          title="Ver detalle completo"
          className="px-2 py-1 text-[10px] text-gray-400 hover:text-gray-700 border border-transparent hover:border-gray-200 rounded">
          ···
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {msg && <span className="text-[10px] text-gray-600 px-1">{msg}</span>}

      <button disabled={isPending}
        onClick={() => run(() => dailyCheck(opd.opd_id))}
        title="Sin novedad"
        className="px-2 py-1 text-[10px] border border-gray-200 text-gray-500 rounded hover:bg-gray-50 disabled:opacity-40">
        ✓
      </button>

      {opd.fase_actual === "corte" && opd.componentes_total > 0 && (
        <span title="Telas cortadas / total"
          className={`px-1.5 py-1 text-[10px] rounded ${telasIncompletas ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
          🧵 {opd.componentes_cortados}/{opd.componentes_total}
        </span>
      )}

      {faseSig && !opd.bloqueada && (
        <button disabled={isPending || telasIncompletas}
          onClick={() => run(() => advancePhase(opd.opd_id))}
          title={telasIncompletas ? "Faltan telas por cortar" : `Avanzar a ${FASE_LABEL[faseSig]}`}
          className="px-2 py-1 text-[10px] bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-40">
          → {FASE_LABEL[faseSig]}
        </button>
      )}

      {!opd.bloqueada && (
        <div className="relative">
          <button disabled={isPending}
            onClick={() => setBloq(v => !v)}
            title="Bloquear"
            className="px-2 py-1 text-[10px] border border-orange-200 text-orange-600 rounded hover:bg-orange-50 disabled:opacity-40">
            Bloq.
          </button>
          {bloqOpen && (
            <div className="absolute top-7 right-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-1 min-w-[150px]">
              {MOTIVOS_BLOQUEO.map(m => (
                <button key={m}
                  onClick={() => { setBloq(false); run(() => blockOpd(opd.opd_id, m)); }}
                  className="block w-full text-left px-3 py-1.5 text-[10px] hover:bg-gray-50 rounded">
                  {MOTIVO_SHORT[m]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <button onClick={onDetalle}
        title="Ver detalle completo"
        className="px-2 py-1 text-[10px] text-gray-400 hover:text-gray-700 border border-transparent hover:border-gray-200 rounded">
        ···
      </button>
    </div>
  );
}

// ─── Fila de pendiente con acciones ─────────────────────────────────────────
const MOTIVO_LABEL: Record<string, string> = {
  mp_tardia: "MP tardía", calidad_mp: "Calidad MP", bloqueo_f0: "Bloqueo F0",
  capacidad_corte: "Cap. corte", capacidad_trazo: "Cap. trazo",
  capacidad_satelite: "Cap. satélite", capacidad_tiqueteo_empaque: "Cap. tiqueteo/empaque",
  reproceso_interno: "Reproceso interno", reproceso_satelite: "Reproceso satélite",
  cambio_cliente: "Cambio cliente", documentacion_despacho: "Doc. despacho", otro: "Otro",
};

function AccionesPendiente({ p, onDetalle, operable = true }: { p: PendienteMiFase; onDetalle: () => void; operable?: boolean }) {
  const [isPending, start] = useTransition();
  const [msg, setMsg]      = useState<string | null>(null);

  const faseSig = p.puede_avanzar
    ? FASES_ORDEN[FASES_ORDEN.indexOf(p.fase_actual) + 1]
    : null;

  function run(fn: () => Promise<{ ok?: boolean | number; error?: string }>) {
    start(async () => {
      const r = await fn();
      if (r.error) { setMsg(`❌ ${r.error}`); setTimeout(() => setMsg(null), 3000); }
      else          { setMsg("✓");            setTimeout(() => setMsg(null), 1500); }
    });
  }

  if (!operable) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-gray-400 px-1" title="Solo lectura — fase fuera de tu responsabilidad">👁</span>
        <button onClick={onDetalle}
          title="Ver detalle completo"
          className="px-2 py-1 text-[10px] text-gray-400 hover:text-gray-600 border border-transparent hover:border-gray-200 rounded">
          ···
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {msg && <span className="text-[10px] text-gray-500 px-1">{msg}</span>}
      {faseSig && (
        <button disabled={isPending}
          onClick={() => run(() => advancePendienteFase(p.id))}
          title={`Mover a ${FASE_LABEL[faseSig]}`}
          className="px-2 py-1 text-[10px] bg-gray-800 text-white rounded hover:bg-gray-700 disabled:opacity-40">
          → {FASE_LABEL[faseSig]}
        </button>
      )}
      <button disabled={isPending}
        onClick={() => run(() => closePendiente(p.id))}
        title="Cerrar pendiente (resuelto)"
        className="px-2 py-1 text-[10px] border border-green-300 text-green-700 rounded hover:bg-green-50 disabled:opacity-40">
        ✓ Cerrar
      </button>
      <button onClick={onDetalle}
        title="Ver detalle completo"
        className="px-2 py-1 text-[10px] text-gray-400 hover:text-gray-600 border border-transparent hover:border-gray-200 rounded">
        ···
      </button>
    </div>
  );
}

// ─── Barra de acciones en lote ───────────────────────────────────────────────
type BloqMode = "none" | "bloquear" | "desbloquear" | "replan" | "registrar_corte" | "registrar_tiqueteo" | "avances_parciales";

function BarraLote({ ids, fasesSel, onClear, rol, fasesOperativas, liderJumps }: { ids: string[]; fasesSel: Set<string>; onClear: () => void; rol: string | null; fasesOperativas: Enums<"fase_enum">[]; liderJumps: LiderJump[] }) {
  const [isPending, start] = useTransition();
  const [msg, setMsg]      = useState<string | null>(null);
  const [mode, setMode]    = useState<BloqMode>("none");
  const [motivoBloq, setMotivoBloq] = useState<Enums<"motivo_bloqueo_enum">>("mp_no_llego");
  const [notaBloq, setNotaBloq]     = useState("");
  const [notaDesbloq, setNotaDesbloq] = useState("");
  const [diasReplan, setDiasReplan] = useState(0);
  const [faseReplan, setFaseReplan] = useState<Enums<"fase_enum">>("corte");

  const soloCorte     = fasesSel.size === 1 && fasesSel.has("corte");
  const soloTiqueteo  = fasesSel.size === 1 && fasesSel.has("tiqueteo");
  const soloCompras   = fasesSel.size === 1 && fasesSel.has("compras");

  // Salto de fase gobernado por rol
  const origenesSel = [...fasesSel] as Enums<"fase_enum">[];
  const destinosPosibles = saltoDestinosPermitidos(rol, fasesOperativas, origenesSel, liderJumps);
  const puedenSaltar = destinosPosibles.length > 0;

  const [saltoMode, setSaltoMode] = useState(false);
  const [faseSalto, setFaseSalto] = useState<Enums<"fase_enum">>(destinosPosibles[0] ?? "satelites");
  const [motivoSalto, setMotivoSalto] = useState("");

  const [motivoDevol, setMotivoDevol] = useState("");
  const [devolMode, setDevolMode]     = useState(false);
  const puedenDevolver = fasesSel.size >= 1 && [...fasesSel].every(f => f !== "fase_0");

  const [promesaMode, setPromesaMode] = useState(false);
  const [fechaPromesaLote, setFechaPromesaLote] = useState("");
  // La promesa masiva se aplica sobre la fase actual en común, o la primera si son varias,
  // pero el usuario solo debe ver esto si tiene permisos operativos.
  const puedenPrometer = fasesSel.size === 1 && (rol !== "lider_fase" || fasesOperativas.includes([...fasesSel][0] as Enums<"fase_enum">));
  const fasePromesa = [...fasesSel][0] as Enums<"fase_enum">;

  function run(fn: () => Promise<{ ok?: boolean | number; errores?: { ref: string; error: string }[]; error?: string }>) {
    start(async () => {
      try {
        const r = await fn();
        if (r.error) {
          setMsg(`❌ ${r.error}`);
        } else if (r.errores && r.errores.length > 0) {
          const lista = r.errores.map(e => `${e.ref}: ${e.error}`).join(" · ");
          setMsg(`✓ ${r.ok} avanzadas · ❌ ${r.errores.length} sin avanzar: ${lista}`);
        } else {
          setMsg(`✓ Aplicado a ${r.ok ?? ids.length}`);
          setMode("none");
          onClear();
        }
      } catch (e) {
        setMsg(`❌ ${e instanceof Error ? e.message : "Error inesperado"}`);
      }
      setTimeout(() => setMsg(null), 5000);
    });
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-950 text-white border-t border-gray-700 px-4 py-3 flex flex-col-reverse gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm">{ids.length} OP-D{ids.length !== 1 ? "s" : ""} seleccionada{ids.length !== 1 ? "s" : ""}</span>
        {msg && <span className="text-xs text-yellow-300 ml-2 max-w-xl truncate">{msg}</span>}
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <button disabled={isPending}
            onClick={() => run(() => advancePhaseBatch(ids))}
            className="h-7 px-3 rounded bg-white text-gray-900 text-xs font-semibold hover:bg-gray-100 disabled:opacity-50">
            → Avanzar fase
          </button>
          <button disabled={isPending}
            onClick={() => run(() => dailyCheckBatch(ids))}
            className="h-7 px-3 rounded border border-gray-600 text-xs hover:bg-gray-800 disabled:opacity-50">
            ✓ Sin novedad
          </button>
          <button disabled={isPending}
            onClick={() => setMode(mode === "bloquear" ? "none" : "bloquear")}
            className={`h-7 px-3 rounded border text-xs disabled:opacity-50 ${mode === "bloquear" ? "border-orange-400 text-orange-300" : "border-gray-600 hover:bg-gray-800"}`}>
            Bloquear
          </button>
          <button disabled={isPending}
            onClick={() => setMode(mode === "desbloquear" ? "none" : "desbloquear")}
            className={`h-7 px-3 rounded border text-xs disabled:opacity-50 ${mode === "desbloquear" ? "border-green-400 text-green-300" : "border-gray-600 hover:bg-gray-800"}`}>
            Desbloquear
          </button>
          <button disabled={isPending}
            onClick={() => setMode(mode === "replan" ? "none" : "replan")}
            className={`h-7 px-3 rounded border text-xs disabled:opacity-50 ${mode === "replan" ? "border-blue-400 text-blue-300" : "border-gray-600 hover:bg-gray-800"}`}>
            Replanificar
          </button>
          {soloCorte && (
            <button disabled={isPending}
              onClick={() => setMode(mode === "registrar_corte" ? "none" : "registrar_corte")}
              className={`h-7 px-3 rounded border text-xs disabled:opacity-50 ${mode === "registrar_corte" ? "border-cyan-400 text-cyan-300" : "border-gray-600 hover:bg-gray-800"}`}>
              ✂ Registrar corte
            </button>
          )}
          {soloTiqueteo && (
            <button disabled={isPending}
              onClick={() => setMode(mode === "registrar_tiqueteo" ? "none" : "registrar_tiqueteo")}
              className={`h-7 px-3 rounded border text-xs disabled:opacity-50 ${mode === "registrar_tiqueteo" ? "border-cyan-400 text-cyan-300" : "border-gray-600 hover:bg-gray-800"}`}>
              🏷 Registrar tiqueteo
            </button>
          )}
          {soloCompras && (
            <>
              <button disabled={isPending}
                onClick={() => run(() => togglePaqueteCompletoBatch(ids, true))}
                className="h-7 px-3 rounded border border-indigo-600 text-indigo-300 text-xs hover:bg-gray-800 disabled:opacity-50">
                + Paquete completo
              </button>
              <button disabled={isPending}
                onClick={() => run(() => togglePaqueteCompletoBatch(ids, false))}
                className="h-7 px-3 rounded border border-gray-600 text-xs hover:bg-gray-800 disabled:opacity-50">
                - Paquete completo
              </button>
            </>
          )}
          <button disabled={isPending}
            onClick={() => setMode(mode === "avances_parciales" ? "none" : "avances_parciales")}
            className={`h-7 px-3 rounded border text-xs disabled:opacity-50 ${mode === "avances_parciales" ? "border-yellow-400 text-yellow-300" : "border-gray-600 hover:bg-gray-800"}`}>
            ⚡ Avances parciales
          </button>
          {puedenSaltar && (
            <button disabled={isPending}
              onClick={() => setSaltoMode(!saltoMode)}
              className={`h-7 px-3 rounded border text-xs disabled:opacity-50 ${saltoMode ? "border-violet-400 text-violet-300" : "border-gray-600 hover:bg-gray-800"}`}>
              ⤴ Salto de fase
            </button>
          )}
          {puedenDevolver && (
            <button disabled={isPending}
              onClick={() => setDevolMode(!devolMode)}
              className={`h-7 px-3 rounded border text-xs disabled:opacity-50 ${devolMode ? "border-amber-400 text-amber-300" : "border-gray-600 hover:bg-gray-800"}`}>
              ↩ Devolver fase
            </button>
          )}
          {puedenPrometer && (
            <button disabled={isPending}
              onClick={() => setPromesaMode(!promesaMode)}
              className={`h-7 px-3 rounded border text-xs disabled:opacity-50 ${promesaMode ? "border-pink-400 text-pink-300" : "border-gray-600 hover:bg-gray-800"}`}>
              Promesa masiva
            </button>
          )}
          <button onClick={onClear} className="h-7 px-2 rounded text-xs text-gray-400 hover:text-white">
            Limpiar ✕
          </button>
        </div>
      </div>

      {mode === "bloquear" && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-700">
          <select value={motivoBloq} onChange={e => setMotivoBloq(e.target.value as Enums<"motivo_bloqueo_enum">)}
            className="h-7 rounded border border-gray-600 bg-gray-800 px-2 text-xs">
            {MOTIVOS_BLOQUEO.map(m => <option key={m} value={m}>{MOTIVO_SHORT[m]}</option>)}
          </select>
          <input value={notaBloq} onChange={e => setNotaBloq(e.target.value)}
            placeholder="Nota compartida (opcional)"
            className="h-7 rounded border border-gray-600 bg-gray-800 px-2 text-xs w-56" />
          <button disabled={isPending}
            onClick={() => run(() => blockOpdBatch(ids, motivoBloq, notaBloq || undefined))}
            className="h-7 px-3 rounded bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 disabled:opacity-50">
            Aplicar bloqueo a {ids.length}
          </button>
        </div>
      )}

      {mode === "desbloquear" && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-700">
          <input value={notaDesbloq} onChange={e => setNotaDesbloq(e.target.value)}
            placeholder="Resolución / nota (opcional)"
            className="h-7 rounded border border-gray-600 bg-gray-800 px-2 text-xs w-64" />
          <button disabled={isPending}
            onClick={() => run(() => unblockBatch(ids, notaDesbloq || "desbloqueo en lote"))}
            className="h-7 px-3 rounded bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50">
            Desbloquear {ids.length}
          </button>
        </div>
      )}

      {mode === "replan" && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-700">
          <select value={faseReplan} onChange={e => setFaseReplan(e.target.value as Enums<"fase_enum">)}
            className="h-7 rounded border border-gray-600 bg-gray-800 px-2 text-xs">
            {FASES_ORDEN.map(f => <option key={f} value={f}>{FASE_LABEL[f]}</option>)}
          </select>
          <input type="number" min={0} max={60} value={diasReplan}
            onChange={e => setDiasReplan(Math.max(0, parseInt(e.target.value) || 0))}
            className="h-7 w-16 rounded border border-gray-600 bg-gray-800 px-2 text-xs text-center" />
          <span className="text-xs text-gray-400">días</span>
          <button disabled={isPending}
            onClick={() => run(() => replanBatchOpds(ids, { [`dias_${faseReplan}`]: diasReplan } as Parameters<typeof replanBatchOpds>[1]))}
            className="h-7 px-3 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
            Aplicar a {ids.length}
          </button>
        </div>
      )}

      {saltoMode && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-700">
          <span className="text-xs text-gray-400">Saltar a:</span>
          <select
            value={faseSalto}
            onChange={e => setFaseSalto(e.target.value as Enums<"fase_enum">)}
            className="h-7 rounded border border-gray-600 bg-gray-800 px-2 text-xs"
          >
            {destinosPosibles.map(f => <option key={f} value={f}>{FASE_LABEL[f]}</option>)}
          </select>
          <input value={motivoSalto} onChange={e => setMotivoSalto(e.target.value)}
            placeholder="Motivo (ej: paquete completo, corte externo…)"
            className="h-7 rounded border border-gray-600 bg-gray-800 px-2 text-xs w-64" />
          <button disabled={isPending || !motivoSalto.trim() || !faseSalto}
            onClick={() => run(() => saltarFaseBatch(ids, faseSalto, motivoSalto))}
            className="h-7 px-3 rounded bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-50">
            Confirmar salto ({ids.length})
          </button>
        </div>
      )}

      {devolMode && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-700">
          <span className="text-xs text-gray-400">Devolver a la fase previa</span>
          <input value={motivoDevol} onChange={e => setMotivoDevol(e.target.value)}
            placeholder="Motivo (ej: retrabajo, corrección…)"
            className="h-7 rounded border border-gray-600 bg-gray-800 px-2 text-xs w-64" />
          <button disabled={isPending || !motivoDevol.trim()}
            onClick={() => run(() => revertPhaseBatch(ids, motivoDevol))}
            className="h-7 px-3 rounded bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-50">
            Devolver {ids.length}
          </button>
        </div>
      )}

      {promesaMode && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-700">
          <span className="text-xs text-gray-400">Promesa para {FASE_LABEL[fasePromesa]}:</span>
          <input
            type="date"
            value={fechaPromesaLote}
            onChange={e => setFechaPromesaLote(e.target.value)}
            className="h-7 rounded border border-gray-600 bg-gray-800 px-2 text-xs" />
          <button disabled={isPending || !fechaPromesaLote}
            onClick={() => run(() => setPhasePromiseBatch(ids, fasePromesa, fechaPromesaLote))}
            className="h-7 px-3 rounded bg-pink-600 text-white text-xs font-semibold hover:bg-pink-700 disabled:opacity-50">
            Aplicar promesa a {ids.length} OP-Ds
          </button>
        </div>
      )}

      <RegistrarCorteSheet
        open={mode === "registrar_corte" || mode === "registrar_tiqueteo"}
        opdIds={ids}
        fase={mode === "registrar_tiqueteo" ? "tiqueteo" : "corte"}
        onClose={() => { setMode("none"); onClear(); }}
      />

      <AvancesParcalesSheet
        open={mode === "avances_parciales"}
        opdIds={ids}
        onClose={() => { setMode("none"); onClear(); }}
      />
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────
export function MiFaseClient({ data, pendientes, fasesOperativas = [], esLider = false, rol = null, liderJumps = [] }: { data: OPDMiFase[]; pendientes: PendienteMiFase[]; fasesOperativas?: Enums<"fase_enum">[]; esLider?: boolean; rol?: string | null; liderJumps?: LiderJump[] }) {
  const [faseSel, setFaseSel]     = useState<Enums<"fase_enum"> | "todas">("todas");
  const [subfaseSel, setSubfaseSel] = useState<"todas" | string>("todas");
  const [search, setSearch]       = useState("");
  const [semaforo, setSemaforo]   = useState<Enums<"semaforo_enum"> | "todas">("todas");
  const [soloBloq, setSoloBloq]     = useState(false);
  const [conPend, setConPend]       = useState(false);
  const [paqueteFilter, setPaqueteFilter] = useState<BooleanFilterMode>("todos");
  const [ocultarCierre, setOcultarCierre] = useState(true);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [sel, setSel]             = useState<string | null>(null);
  const [sortCol, setSortCol]     = useState<string>(esLider ? "slack_fase" : "score_efectivo");
  const [sortDir, setSortDir]     = useState<"asc" | "desc">("desc");
  const { visibility: colVis, toggle: toggleCol, reset: resetCols, order: colOrder, move: moveCol } = useColumnPrefs("mi-fase", MI_FASE_DEFAULTS, MI_FASE_ORDER_DEFAULT);
  const visibleColOrder = esLider ? colOrder.filter(k => !COLS_OCULTAS_LIDER.has(k)) : colOrder;
  // El líder solo opera sobre sus fases operativas; las demás fases visibles son de solo lectura.
  const esOperable = (fase: Enums<"fase_enum">) => !esLider || fasesOperativas.includes(fase);
  const [promesas, setPromesas] = useState<Map<string, string>>(new Map());
  // subestado satélite: Map<opdId, subestado>
  const [subestados, setSubestados] = useState<Map<string, string>>(new Map());
  // promesas por subestado: Map<opdId, Map<subestado, fecha>>
  const [subpromesas, setSubpromesas] = useState<Map<string, Map<string, string>>>(new Map());
  const router    = useRouter();
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cargar promesas por fase para las OP-Ds visibles
  useEffect(() => {
    if (data.length === 0) return;
    const supabase = createClient();
    const opdIds = data.map(o => o.opd_id);
    // Cargamos (opd_id, fase, fecha_promesa) y mapeamos a la fase_actual de cada fila
    supabase.from("phase_promises").select("opd_id,fase,fecha_promesa").in("opd_id", opdIds)
      .then(({ data: rows }) => {
        if (!rows) return;
        const byOpd = new Map<string, string>();
        for (const o of data) {
          const r = rows.find(x => x.opd_id === o.opd_id && x.fase === o.fase_actual);
          if (r) byOpd.set(o.opd_id, r.fecha_promesa);
        }
        setPromesas(byOpd);
      });

    // Cargar subestados satélite y sus promesas
    if (data.some(o => o.fase_actual === "satelites")) {
      const subestadoMap = new Map(
        data.filter(o => o.subestado_satelite).map(o => [o.opd_id, o.subestado_satelite!])
      );
      queueMicrotask(() => setSubestados(subestadoMap));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("satelite_subfase_promesa")
        .select("opd_id,subestado,fecha_promesa")
        .in("opd_id", opdIds)
        .then(({ data: spRows }: { data: {opd_id: string; subestado: string; fecha_promesa: string}[] | null }) => {
          const m = new Map<string, Map<string, string>>();
          for (const row of spRows ?? []) {
            if (!m.has(row.opd_id)) m.set(row.opd_id, new Map());
            m.get(row.opd_id)!.set(row.subestado, row.fecha_promesa);
          }
          setSubpromesas(m);
        });
    }
  }, [fasesOperativas, data]);

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel("mi-fase-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "op_ds" }, () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => router.refresh(), 800);
      })
      .subscribe();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(ch);
    };
  }, [router]);

  const filtrado = useMemo(() => {
    const q = search.toLowerCase().trim();
    return data.filter(o => {
      if (ocultarCierre && o.fase_actual === "cierre") return false;
      if (faseSel !== "todas" && o.fase_actual !== faseSel) return false;
      if (subfaseSel !== "todas") {
        if (o.fase_actual !== "satelites") return false;
        if (o.subestado_satelite !== subfaseSel) return false;
      }
      if (semaforo !== "todas" && o.semaforo !== semaforo) return false;
      if (soloBloq && !o.bloqueada) return false;
      if (conPend && o.pendientes_abiertos === 0) return false;
      if (paqueteFilter !== "todos") {
        if (o.fase_actual !== "compras") return false;
        if (paqueteFilter === "incluir" && !o.paquete_completo) return false;
        if (paqueteFilter === "excluir" && o.paquete_completo) return false;
      }
      if (q) {
        const hay = (s: string | null) => (s ?? "").toLowerCase().includes(q);
        if (!hay(o.ref) && !hay(o.cliente) && !hay(o.detalle)) return false;
      }
      return true;
    });
  }, [data, faseSel, subfaseSel, search, semaforo, soloBloq, conPend, paqueteFilter, ocultarCierre]);

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }

  function sortIndicator(col: string) {
    if (sortCol !== col) return <span className="text-gray-300 ml-0.5">↕</span>;
    return <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtrado].sort((a, b) => {
      let av: string | number | null, bv: string | number | null;
      switch (sortCol) {
        case "ref":                     av = a.ref; bv = b.ref; break;
        case "cliente":                 av = a.cliente; bv = b.cliente; break;
        case "paquete_completo":        av = a.paquete_completo ? 1 : 0; bv = b.paquete_completo ? 1 : 0; break;
        case "fase_actual":             av = a.fase_actual; bv = b.fase_actual; break;
        case "semaforo":                av = a.semaforo; bv = b.semaforo; break;
        case "semaforo_fase":           av = a.semaforo_fase; bv = b.semaforo_fase; break;
        case "slack":                   av = a.slack; bv = b.slack; break;
        case "slack_fase":              av = a.slack_fase; bv = b.slack_fase; break;
        case "score_efectivo":          av = a.score_efectivo; bv = b.score_efectivo; break;
        case "cantidad":                av = a.cantidad; bv = b.cantidad; break;
        case "fecha_fin_planeada":      av = a.fecha_fin_planeada; bv = b.fecha_fin_planeada; break;
        case "fecha_compromiso":        av = a.fecha_compromiso; bv = b.fecha_compromiso; break;
        case "pendientes_abiertos":     av = a.pendientes_abiertos; bv = b.pendientes_abiertos; break;
        case "fecha_promesa_satelites": av = a.fecha_promesa_satelites; bv = b.fecha_promesa_satelites; break;
        default: return 0;
      }
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }, [filtrado, sortCol, sortDir]);

  const fasesConDatos = FASES_ORDEN.filter(f => (!ocultarCierre || f !== "cierre") && data.some(o => o.fase_actual === f));

  const pendientesFiltrados = faseSel === "todas"
    ? pendientes
    : pendientes.filter(p => p.fase_actual === faseSel);
  const [pendColapsado, setPendColapsado] = useState(false);

  // Selección — solo filas operables (un líder no puede accionar en lote fases ajenas)
  const allVisibleIds = filtrado.filter(o => esOperable(o.fase_actual)).map(o => o.opd_id);
  const allSelected   = allVisibleIds.length > 0 && allVisibleIds.every(id => selected.has(id));
  const someSelected  = !allSelected && allVisibleIds.some(id => selected.has(id));
  const selectedIds   = [...selected].filter(id => allVisibleIds.includes(id));

  function toggleAll() {
    if (allSelected) {
      setSelected(prev => { const s = new Set(prev); allVisibleIds.forEach(id => s.delete(id)); return s; });
    } else {
      setSelected(prev => { const s = new Set(prev); allVisibleIds.forEach(id => s.add(id)); return s; });
    }
  }

  function toggleOne(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  function buildOpDCells(o: OPDMiFase): Partial<Record<string, React.ReactNode>> {
    const operable = esOperable(o.fase_actual);
    return {
      ref: (
        <td key="ref" className="px-3 py-2">
          <div className="flex items-center gap-1">
            <span className="font-mono text-xs font-semibold">{o.ref}</span>
            {o.bloqueada && <span className="w-2 h-2 rounded-full bg-red-400 inline-block" title="Bloqueada" />}
          </div>
        </td>
      ),
      cliente: <td key="cliente" className="px-3 py-2 text-xs text-gray-600 max-w-[130px] truncate">{o.cliente}</td>,
      detalle: colVis.detalle !== false ? (
        <td key="detalle" className="px-3 py-2 text-xs text-gray-500 max-w-[200px] truncate" title={o.detalle ?? ""}>{o.detalle ?? "—"}</td>
      ) : null,
      fase_actual: <td key="fase_actual" className="px-3 py-2 text-xs">{FASE_LABEL[o.fase_actual]}</td>,
      semaforo: <td key="semaforo" className="px-3 py-2"><SemaforoDot semaforo={o.semaforo} /></td>,
      slack: colVis.slack !== false ? (
        <td key="slack" className="px-3 py-2">
          {o.slack != null ? (
            <span className={`text-xs font-medium ${o.slack >= 3 ? "text-green-700" : o.slack >= 0 ? "text-yellow-700" : "text-red-700"}`}>
              {o.slack >= 0 ? `+${o.slack}d` : `${o.slack}d`}
            </span>
          ) : "—"}
        </td>
      ) : null,
      semaforo_fase: colVis.semaforo_fase !== false ? (
        <td key="semaforo_fase" className="px-3 py-2"><SemaforoDot semaforo={o.semaforo_fase} size="sm" /></td>
      ) : null,
      slack_fase: colVis.slack_fase !== false ? (
        <td key="slack_fase" className="px-3 py-2">
          {o.slack_fase != null ? (
            <span className={`text-xs font-medium ${o.slack_fase >= 3 ? "text-green-700" : o.slack_fase >= 0 ? "text-yellow-700" : "text-red-700"}`}>
              {o.slack_fase >= 0 ? `+${o.slack_fase}d` : `${o.slack_fase}d`}
            </span>
          ) : "—"}
        </td>
      ) : null,
      score_efectivo: colVis.score_efectivo !== false ? (
        <td key="score_efectivo" className="px-3 py-2 text-xs font-bold">{o.score_efectivo ?? "—"}</td>
      ) : null,
      cantidad: colVis.cantidad !== false ? (
        <td key="cantidad" className="px-3 py-2 text-xs text-gray-600 tabular-nums">
          {o.uds_en_fase !== o.cantidad ? (
            <span title={`Unidades en fase actual: ${o.uds_en_fase}\nUnidades totales OP-D: ${o.cantidad}`}>
              <span className="font-semibold text-gray-800">{fmtNum(o.uds_en_fase)}</span> <span className="text-[10px] text-gray-400">/ {fmtNum(o.cantidad)}</span>
            </span>
          ) : (
            fmtNum(o.cantidad)
          )}
        </td>
      ) : null,
      fecha_fin_planeada: <td key="fecha_fin_planeada" className="px-3 py-2 text-xs text-gray-500">{o.fecha_fin_planeada ?? "—"}</td>,
      promesa_fase: colVis.promesa_fase !== false ? (
        o.fase_actual === "satelites" ? (
          <td key="promesa_fase" className="px-2 py-1 min-w-[160px]">
            <select
              value={subestados.get(o.opd_id) ?? ""}
              onChange={e => {
                const v = e.target.value;
                setSubestados(prev => new Map(prev).set(o.opd_id, v));
                setSubestadoSatelite(o.opd_id, v).catch(() => {});
              }}
              className="text-[11px] border border-purple-300 rounded px-1.5 py-0.5 w-full bg-white"
            >
              <option value="">— subestado —</option>
              {SUBESTADO_SATELITE_ORDEN.map(s => (
                <option key={s} value={s}>{SUBESTADO_LABEL[s]}</option>
              ))}
            </select>
          </td>
        ) : !operable ? (
          <td key="promesa_fase" className="px-3 py-2 text-[11px] text-gray-500 tabular-nums">
            {promesas.get(o.opd_id) ?? "—"}
          </td>
        ) : (
          <td key="promesa_fase" className="px-2 py-1">
            <input
              type="date"
              key={`prom-${o.opd_id}-${promesas.get(o.opd_id) ?? ""}`}
              defaultValue={promesas.get(o.opd_id) ?? ""}
              onBlur={e => {
                const v = e.target.value;
                if (v && v !== promesas.get(o.opd_id)) {
                  setPromesas(prev => new Map(prev).set(o.opd_id, v));
                  setPhasePromise(o.opd_id, o.fase_actual, v).catch(() => {});
                }
              }}
              className="text-[11px] border border-gray-300 rounded px-1.5 py-0.5 w-32"
              title={`Promesa de ${FASE_LABEL[o.fase_actual]}`}
            />
          </td>
        )
      ) : null,
      promesa_subfase: colVis.promesa_subfase !== false ? (
        o.fase_actual === "satelites" ? (
          <td key="promesa_subfase" className="px-2 py-1">
            <input
              type="date"
              key={`subprom-${o.opd_id}-${subestados.get(o.opd_id) ?? ""}`}
              defaultValue={subpromesas.get(o.opd_id)?.get(subestados.get(o.opd_id) ?? "") ?? ""}
              disabled={!subestados.get(o.opd_id)}
              onBlur={e => {
                const v = e.target.value;
                const sub = subestados.get(o.opd_id) ?? "";
                if (v && sub) {
                  setSubpromesas(prev => {
                    const nm = new Map(prev);
                    if (!nm.has(o.opd_id)) nm.set(o.opd_id, new Map());
                    nm.get(o.opd_id)!.set(sub, v);
                    return nm;
                  });
                  setSubfasePromesaSatelite(o.opd_id, sub, v).catch(() => {});
                }
              }}
              className="text-[11px] border border-gray-300 rounded px-1.5 py-0.5 w-28 disabled:opacity-40 disabled:cursor-not-allowed"
              title={subestados.get(o.opd_id) ? `Promesa para ${SUBESTADO_LABEL[subestados.get(o.opd_id) as Enums<"satelite_subestado_enum">] ?? subestados.get(o.opd_id)}` : "Selecciona un subestado primero"}
            />
          </td>
        ) : (
          <td key="promesa_subfase" className="px-3 py-2 text-xs text-gray-300">—</td>
        )
      ) : null,
      subfase: colVis.subfase !== false ? (
        o.fase_actual === "satelites" ? (
          <td key="subfase" className="px-3 py-2">
            {subestados.get(o.opd_id)
              ? <span className="text-[10px] font-medium bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">{SUBESTADO_LABEL[subestados.get(o.opd_id) as Enums<"satelite_subestado_enum">] ?? subestados.get(o.opd_id)}</span>
              : <span className="text-xs text-gray-300">—</span>}
          </td>
        ) : (
          <td key="subfase" className="px-3 py-2 text-xs text-gray-300">—</td>
        )
      ) : null,
      fecha_compromiso: <td key="fecha_compromiso" className="px-3 py-2 text-xs text-gray-500 tabular-nums">{o.fecha_compromiso ?? "—"}</td>,
      pendientes: colVis.pendientes !== false ? (
        <td key="pendientes" className="px-3 py-2">
          {o.pendientes_abiertos > 0 && (
            <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">{o.pendientes_abiertos}</span>
          )}
        </td>
      ) : null,
      progreso_corte: colVis.progreso_corte !== false ? (
        <td key="progreso_corte" className="px-3 py-2 text-xs text-gray-600 tabular-nums">
          {o.cantidad_objetivo_total > 0
            ? `${fmtNum(o.cantidad_cortada_total)}/${fmtNum(o.cantidad_objetivo_total)}`
            : "—"}
        </td>
      ) : null,
      prioridad_fase: colVis.prioridad_fase !== false ? (
        <td key="prioridad_fase" className="px-3 py-2 text-xs text-gray-600 tabular-nums">
          {o.prioridad_fase != null ? `#${o.prioridad_fase}` : "—"}
        </td>
      ) : null,
      paquete_completo: colVis.paquete_completo !== false ? (
        o.fase_actual === "compras" ? (
          <td key="paquete_completo" className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={o.paquete_completo}
              disabled={!operable}
              onChange={e => {
                const val = e.target.checked;
                togglePaqueteCompleto(o.opd_id, val).catch(() => {});
              }}
              className="cursor-pointer"
            />
          </td>
        ) : (
          <td key="paquete_completo" className="px-3 py-2 text-xs text-gray-300 text-center">—</td>
        )
      ) : null,
      uds_recibidas_empaque: colVis.uds_recibidas_empaque !== false ? (
        o.fase_actual === "empaque" ? (
          <td key="uds_recibidas_empaque" className="px-2 py-1 text-center" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-1 justify-center">
              <input
                type="number"
                min={0}
                defaultValue={o.uds_recibidas_empaque ?? ""}
                disabled={!operable}
                onBlur={e => {
                  const val = e.target.value;
                  const num = val === "" ? null : parseInt(val);
                  if (num !== o.uds_recibidas_empaque) {
                    setUdsRecibidasEmpaque(o.opd_id, num).catch(() => {});
                  }
                }}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                className={`w-16 h-6 text-xs text-center border rounded ${o.uds_recibidas_empaque != null && o.uds_recibidas_empaque < o.uds_en_fase ? "border-red-400 bg-red-50 text-red-900" : "border-gray-300"}`}
              />
              {o.uds_recibidas_empaque != null && o.uds_recibidas_empaque < o.uds_en_fase && (
                <span className="text-red-500 text-[10px] font-bold" title="Menos unidades recibidas que avanzadas">⚠</span>
              )}
            </div>
          </td>
        ) : (
          <td key="uds_recibidas_empaque" className="px-3 py-2 text-xs text-gray-300 text-center">—</td>
        )
      ) : null,
    };
  }

  return (
    <>
      <div className={selectedIds.length > 0 ? "pb-20" : ""}>
        <div className="sticky top-14 z-20 bg-white space-y-2 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">Mi fase hoy</h1>
            <span className="text-sm text-gray-500">{filtrado.length} de {data.length} OP-Ds</span>
          </div>

          {/* Selector de fase — el líder de satélites ve varias fases (las ajenas en solo lectura);
              otros líderes quedan fijados a su única fase */}
          {(!esLider || fasesConDatos.length > 1) && (
            <div className="flex gap-1 flex-wrap">
              <button onClick={() => setFaseSel("todas")}
                className={`px-3 py-1 text-xs rounded-md border transition-colors ${faseSel === "todas" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
                Todas las fases
              </button>
              {fasesConDatos.map(f => (
                <button key={f} onClick={() => setFaseSel(f)}
                  className={`px-3 py-1 text-xs rounded-md border transition-colors ${faseSel === f ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
                  {FASE_LABEL[f]} <span className="text-[10px] opacity-70">({data.filter(o => o.fase_actual === f).length})</span>
                </button>
              ))}
            </div>
          )}

          {/* Barra de filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar ref, cliente, detalle…"
              className="h-8 rounded-md border border-gray-300 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900 w-56"
            />
            <select value={semaforo} onChange={e => setSemaforo(e.target.value as Enums<"semaforo_enum"> | "todas")}
              className="h-8 rounded-md border border-gray-300 px-2 text-xs">
              <option value="todas">● Todos</option>
              <option value="verde">🟢 Verde</option>
              <option value="amarillo">🟡 Amarillo</option>
              <option value="rojo">🔴 Rojo</option>
            </select>
            {(faseSel === "satelites" || (faseSel === "todas" && data.some(o => o.fase_actual === "satelites"))) && (
              <select
                value={subfaseSel}
                onChange={e => setSubfaseSel(e.target.value)}
                className="h-8 rounded-md border border-purple-300 px-2 text-xs text-purple-700 bg-white"
                title="Filtrar por subfase de satélites"
              >
                <option value="todas">Subfase: todas</option>
                {SUBESTADO_SATELITE_ORDEN.map(s => (
                  <option key={s} value={s}>{SUBESTADO_LABEL[s]}</option>
                ))}
              </select>
            )}
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={soloBloq} onChange={e => setSoloBloq(e.target.checked)} className="cursor-pointer" />
              Solo bloqueadas
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={conPend} onChange={e => setConPend(e.target.checked)} className="cursor-pointer" />
              Con pendientes
            </label>
            {(faseSel === "compras" || (faseSel === "todas" && data.some(o => o.fase_actual === "compras"))) && (
              <div className="flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5">
                <span className="text-xs text-indigo-700">Paquete</span>
                <select
                  value={paqueteFilter}
                  onChange={e => setPaqueteFilter(e.target.value as BooleanFilterMode)}
                  className="h-6 rounded border border-indigo-200 bg-white px-1.5 text-xs text-indigo-700"
                  title="Filtrar compras por paquete completo"
                >
                  <option value="todos">Todos</option>
                  <option value="incluir">Incluir completos</option>
                  <option value="excluir">Excluir completos</option>
                </select>
              </div>
            )}
            <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer" title="Las OP-Ds en fase Cierre se archivan automáticamente tras 30 días">
              <input type="checkbox" checked={ocultarCierre} onChange={e => setOcultarCierre(e.target.checked)} className="cursor-pointer" />
              Ocultar cierre
            </label>
            {(search || semaforo !== "todas" || soloBloq || conPend || subfaseSel !== "todas" || paqueteFilter !== "todos") && (
              <button onClick={() => { setSearch(""); setSemaforo("todas"); setSoloBloq(false); setConPend(false); setSubfaseSel("todas"); setPaqueteFilter("todos"); }}
                className="h-8 px-2 text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded-md">
                Limpiar filtros
              </button>
            )}
            <ColumnPicker cols={MI_FASE_ALL_COLS} visibility={colVis} onToggle={toggleCol} onReset={resetCols} order={colOrder} onReorder={moveCol} />
            <MiFaseImportExport data={data} faseActual={faseSel} fasesOperativas={fasesOperativas} promesas={promesas} esLider={esLider} />
          </div>
        </div>

        {/* Barra de acciones en lote */}
        {selectedIds.length > 0 && (
          <BarraLote
            ids={selectedIds}
            fasesSel={new Set(selectedIds.map(id => data.find(o => o.opd_id === id)?.fase_actual).filter(Boolean) as string[])}
            onClear={() => setSelected(new Set())}
            rol={rol}
            fasesOperativas={fasesOperativas}
            liderJumps={liderJumps}
          />
        )}

        {/* Tabla */}
        <div className="rounded-lg border border-gray-200 overflow-auto max-h-[calc(100vh-15rem)] mt-4">
          <table className="w-full min-w-max text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 w-8">
                  <input type="checkbox" checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleAll}
                    className="cursor-pointer"
                    title="Seleccionar todos los visibles"
                  />
                </th>
                {visibleColOrder.map(key => {
                  // Visibility check for toggleable columns
                  const toggleable = MI_FASE_DEFAULTS.hasOwnProperty(key);
                  if (toggleable && colVis[key] === false) return null;

                  // Sort-capable columns map to their data field
                  const SORT_KEY: Record<string, string> = {
                    ref: "ref", cliente: "cliente", fase_actual: "fase_actual",
                    semaforo: "semaforo", slack: "slack", semaforo_fase: "semaforo_fase",
                    slack_fase: "slack_fase", score_efectivo: "score_efectivo",
                    cantidad: "cantidad", fecha_fin_planeada: "fecha_fin_planeada",
                    fecha_compromiso: "fecha_compromiso", pendientes: "pendientes_abiertos",
                    prioridad_fase: "prioridad_fase",
                  };
                  const LABEL: Record<string, string> = {
                    ref: "Ref", cliente: "Cliente", detalle: "Detalle", fase_actual: "Fase",
                    semaforo: "Semáforo", slack: "Slack", semaforo_fase: "Sem.F",
                    slack_fase: "Slack F", score_efectivo: "Score", cantidad: "Uds",
                    fecha_fin_planeada: "Fin plan",
                    promesa_fase: "Promesa entrega", promesa_subfase: "Promesa subfase",
                    fecha_compromiso: "Compromiso", pendientes: "Pend.", progreso_corte: "Progreso",
                    subfase: "Subfase", prioridad_fase: "Prior.",
                    paquete_completo: "P. Completo", uds_recibidas_empaque: "Recibidas",
                  };
                  const label = LABEL[key];
                  if (!label) return null;
                  const sortKey = SORT_KEY[key] ?? null;
                  return (
                    <th key={key}
                      onClick={sortKey ? () => toggleSort(sortKey) : undefined}
                      className={`px-3 py-2 text-left text-xs font-medium text-gray-600 whitespace-nowrap select-none ${sortKey ? "cursor-pointer hover:text-gray-900" : ""}`}>
                      {label}{sortKey && sortIndicator(sortKey)}
                    </th>
                  );
                })}
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 whitespace-nowrap">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map(o => (
                <tr key={o.opd_id} className={`hover:bg-gray-50 transition-colors ${o.bloqueada ? "bg-orange-50/30" : ""} ${selected.has(o.opd_id) ? "bg-blue-50/40" : ""}`}>
                  <td className="px-3 py-2">
                    {esOperable(o.fase_actual) && (
                      <input type="checkbox" checked={selected.has(o.opd_id)}
                        onChange={() => toggleOne(o.opd_id)}
                        onClick={e => e.stopPropagation()}
                        className="cursor-pointer"
                      />
                    )}
                  </td>
                  {visibleColOrder.map(k => buildOpDCells(o)[k] ?? null)}
                  <td className="px-2 py-1.5">
                    <AccionesRapidas opd={o} onDetalle={() => setSel(o.opd_id)} operable={esOperable(o.fase_actual)} />
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={20} className="px-4 py-8 text-center text-sm text-gray-400">
                    Sin resultados para los filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-[10px] text-gray-400 mt-4">
          ✓ sin novedad · → avanzar fase · Bloq. bloquear · ··· ver detalle completo
        </p>

        {/* ── Sección de pendientes activos ── */}
        {pendientesFiltrados.length > 0 && (
          <div className="mt-4 border border-orange-200 rounded-lg overflow-hidden">
            <button type="button"
              onClick={() => setPendColapsado(v => !v)}
              className="w-full flex items-center justify-between bg-orange-50 px-4 py-2.5 hover:bg-orange-100 transition-colors text-left">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] text-orange-400 transition-transform duration-150 ${pendColapsado ? "rotate-0" : "rotate-90"}`}>▶</span>
                <span className="text-sm font-semibold text-orange-800">Pendientes activos en esta fase</span>
                <span className="text-xs bg-orange-200 text-orange-800 px-1.5 py-0.5 rounded-full">{pendientesFiltrados.length}</span>
              </div>
              <span className="text-[10px] text-orange-500">
                Unidades rezagadas que necesitan seguimiento
              </span>
            </button>

            {!pendColapsado && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-max text-sm">
                  <thead className="bg-orange-50/60 border-b border-orange-100">
                    <tr>
                      <th className="px-3 py-2 w-8" />
                      {visibleColOrder.map(key => {
                        const toggleable = MI_FASE_DEFAULTS.hasOwnProperty(key);
                        if (toggleable && colVis[key] === false) return null;
                        const LABEL: Record<string, string> = {
                          ref: "Ref", cliente: "Cliente", detalle: "Detalle", fase_actual: "Fase",
                          semaforo: "Semáforo", slack: "Slack", semaforo_fase: "Sem.F",
                          slack_fase: "Slack F", score_efectivo: "Score", cantidad: "Uds",
                          fecha_fin_planeada: "Fin plan",
                          promesa_fase: "Promesa entrega", promesa_subfase: "Promesa subfase",
                          fecha_compromiso: "Compromiso", pendientes: "Pend.", progreso_corte: "Progreso",
                          subfase: "Subfase", prioridad_fase: "Prior.",
                          paquete_completo: "P. Completo", uds_recibidas_empaque: "Recibidas",
                        };
                        const label = LABEL[key];
                        if (!label) return null;
                        return (
                          <th key={key} className="px-3 py-2 text-left text-xs font-medium text-orange-700 whitespace-nowrap">
                            {label}
                          </th>
                        );
                      })}
                      <th className="px-3 py-2 text-left text-xs font-medium text-orange-700 whitespace-nowrap">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-orange-50">
                    {pendientesFiltrados.map(p => {
                      const padre = data.find(o => o.opd_id === p.opd_padre_id);
                      if (!padre) {
                        // fallback mínimo si el padre no está en data
                        return (
                          <tr key={p.id} className="hover:bg-orange-50/30 transition-colors bg-orange-50/20">
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2">
                              <button onClick={() => setSel(p.opd_padre_id)}
                                className="font-mono text-xs font-semibold text-orange-700 hover:underline">
                                {p.opd_ref}
                              </button>
                            </td>
                            <td colSpan={colOrder.length - 1} className="px-3 py-2 text-xs text-gray-400">
                              <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded-full">
                                {FASE_LABEL[p.fase_origen]} → {FASE_LABEL[p.fase_actual]} · {MOTIVO_LABEL[p.motivo] ?? p.motivo} · {fmtNum(p.cantidad_afectada)} uds · {p.dias_abierto}d
                              </span>
                            </td>
                            <td className="px-2 py-1.5">
                              <AccionesPendiente p={p} onDetalle={() => setSel(p.opd_padre_id)} operable={esOperable(p.fase_actual)} />
                            </td>
                          </tr>
                        );
                      }
                      const cells = buildOpDCells(padre);
                      // Sobreescribir celda ref para añadir badge de pendiente
                      const refCell = (
                        <td key="ref" className="px-3 py-2">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1">
                              <button onClick={() => setSel(p.opd_padre_id)}
                                className="font-mono text-xs font-semibold text-orange-700 hover:underline">
                                {padre.ref}
                              </button>
                              {padre.bloqueada && <span className="w-2 h-2 rounded-full bg-red-400 inline-block" title="Bloqueada" />}
                            </div>
                            <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap">
                              {FASE_LABEL[p.fase_origen]}→{FASE_LABEL[p.fase_actual]} · {MOTIVO_LABEL[p.motivo] ?? p.motivo} · {fmtNum(p.cantidad_afectada)}u · {p.dias_abierto}d
                            </span>
                          </div>
                        </td>
                      );
                      const finalCells: Partial<Record<string, React.ReactNode>> = { ...cells, ref: refCell };
                      return (
                        <tr key={p.id} className="hover:bg-orange-50/40 transition-colors bg-orange-50/20">
                          <td className="px-3 py-2" />
                          {visibleColOrder.map(k => finalCells[k] ?? null)}
                          <td className="px-2 py-1.5">
                            <AccionesPendiente p={p} onDetalle={() => setSel(p.opd_padre_id)} operable={esOperable(p.fase_actual)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <OPDDetailDrawer opdId={sel} onClose={() => setSel(null)} ocultarCompromiso={esLider} userRol={rol} fasesOperativasDrawer={fasesOperativas} liderJumpsDrawer={liderJumps} />
    </>
  );
}
