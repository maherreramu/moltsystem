"use client";
import { fmtNum, fmtDia } from "@/lib/format";

import { useEffect, useState, useTransition } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { FASE_LABEL, FASES_ORDEN, saltoDestinosPermitidos } from "@/lib/fases";
import { SemaforoDot } from "@/components/kanban/semaforo-badge";
import { Lock } from "lucide-react";
import type { Enums } from "@/types/supabase";
import {
  advancePhase, advancePhaseParcial, revertPhase, blockOpd, unblockOpd, updateF0Checkbox,
  scoreOverride, replanOpd, closePendiente,
  setComponentes, registrarCorte, registrarTiqueteo, updateEstadoImpel, addObservacion,
  setFechaCompromiso, saltarFase, setPhasePromise, replanOpFull,
  type EstadoImpel,
} from "@/lib/actions/opd-actions";

const ESTADOS_IMPEL: EstadoImpel[] = [
  "Pendiente Inicio Producción",
  "En Producción",
  "En Producción - Reproceso",
];

type Event = { id: string; tipo: string; actor: string; ts: string; fase: string | null; payload: Record<string,unknown> | null };
type PhaseRow = { fase: Enums<"fase_enum">; dias: number; start_date: string; due_date: string };
type Pendiente = { id: string; fase_origen: string; motivo: string; cantidad_afectada: number; estado: string; urgencia?: string };
type Componente = { id: string; nombre_tela: string; rol: string | null; es_manual: boolean; cortado: boolean; cantidad_objetivo: number; cantidad_cortada: number; cantidad_tiqueteada: number };

type OPDDetail = {
  ref: string; op_num: string; detalle: string | null; cantidad: number;
  fase_actual: Enums<"fase_enum">; bloqueada: boolean;
  motivo_bloqueo: Enums<"motivo_bloqueo_enum"> | null;
  score_override: number | null; score_motivo: string | null;
  f0_ficha_tec: boolean; f0_patronaje: boolean; f0_muestra: boolean;
  f0_aprobacion: boolean; f0_tela_avios: boolean; f0_op_creada: boolean;
  dias_fase_0: number; dias_compras: number; dias_trazo: number; dias_corte: number;
  dias_tiqueteo: number; dias_satelites: number; dias_empaque: number; dias_despacho: number;
  fecha_promesa_satelites: string | null; fecha_recepcion_satelites: string | null;
};

const EVENTO_LABEL: Record<string, string> = {
  op_arrival:"Llegó al sistema", baseline_freeze:"Baseline congelado",
  phase_advance:"Avance de fase", phase_advance_parcial:"Avance parcial",
  block:"Bloqueada", unblock:"Desbloqueada", replan:"Replanificación",
  f0_checkbox_update:"Actualización F0", daily_check:"Check diario",
  satellite_promise_set:"Promesa satélite", satellite_received:"Satélite recibido",
  score_update:"Score actualizado", pendiente_created:"Pendiente creado",
  pendiente_status_change:"Pendiente actualizado",
  observacion_tecnica:"Observación técnica",
};

const F0_CAMPOS: [keyof OPDDetail, string][] = [
  ["f0_ficha_tec","Ficha técnica"],["f0_patronaje","Patronaje"],["f0_muestra","Muestra"],
  ["f0_aprobacion","Aprobación cliente"],["f0_tela_avios","Tela y avíos"],["f0_op_creada","OP en IMPEL"],
];

const MOTIVO_BLOQUEO: Enums<"motivo_bloqueo_enum">[] = [
  "mp_no_llego","fase_0_incompleta","pendiente_cliente","capacidad_satelite","reproceso","otro",
];

export function OPDDetailDrawer({ opdId, semaforo, onClose, puedeEditarCompromiso = false, ocultarCompromiso = false, userRol = null, fasesOperativasDrawer = [], liderJumpsDrawer = [] }: { opdId: string | null; semaforo?: Enums<"semaforo_enum"> | null; onClose: () => void; puedeEditarCompromiso?: boolean; ocultarCompromiso?: boolean; userRol?: string | null; fasesOperativasDrawer?: Enums<"fase_enum">[]; liderJumpsDrawer?: import("@/lib/actions/phase-jumps-actions").LiderJump[] }) {
  const [detail, setDetail]     = useState<OPDDetail | null>(null);
  const [events, setEvents]     = useState<Event[]>([]);
  const [plans, setPlans]       = useState<PhaseRow[]>([]);
  const [baseline, setBaseline] = useState<PhaseRow[]>([]);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [componentes, setComponentesState] = useState<Componente[]>([]);
  const [estadoImpel, setEstadoImpel] = useState<EstadoImpel | null>(null);
  const [fechaCompromiso, setFechaCompromisoState] = useState<string | null>(null);
  const [promesas, setPromesas] = useState<Map<string, string>>(new Map());
  const [semFase, setSemFase]   = useState<Map<string, Enums<"semaforo_enum">>>(new Map());
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState<"detalle"|"plan"|"telas"|"eventos"|"pendientes">("detalle");
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg]           = useState<string | null>(null);

  useEffect(() => {
    if (!opdId) {
      queueMicrotask(() => {
        setDetail(null);
        setEvents([]);
        setPlans([]);
        setBaseline([]);
        setPendientes([]);
        setComponentesState([]);
        setPromesas(new Map());
        setSemFase(new Map());
      });
      return;
    }
    queueMicrotask(() => setLoading(true));
    const sb = createClient();
    sb.from("op_d_componentes").select("id,nombre_tela,rol,es_manual,cortado,cantidad_objetivo,cantidad_cortada,cantidad_tiqueteada").eq("opd_id", opdId).order("nombre_tela", { ascending: true })
      .then(({ data }) => setComponentesState((data ?? []) as Componente[]));
    Promise.all([
      sb.from("op_ds").select("ref,op_num,detalle,cantidad,fase_actual,bloqueada,motivo_bloqueo,score_override,score_motivo,f0_ficha_tec,f0_patronaje,f0_muestra,f0_aprobacion,f0_tela_avios,f0_op_creada,dias_fase_0,dias_compras,dias_trazo,dias_corte,dias_tiqueteo,dias_satelites,dias_empaque,dias_despacho,fecha_promesa_satelites,fecha_recepcion_satelites").eq("id",opdId).single(),
      sb.from("phase_events").select("id,tipo,actor,ts,fase,payload").eq("opd_id",opdId).order("ts",{ascending:false}).limit(50),
      sb.from("phase_plans").select("fase,dias,start_date,due_date").eq("opd_id",opdId),
      sb.from("phase_plans_baseline").select("fase,dias,start_date,due_date").eq("opd_id",opdId),
      sb.from("op_d_pendientes").select("id,fase_origen,motivo,cantidad_afectada,estado").eq("opd_padre_id",opdId).neq("estado","cerrado"),
      sb.from("phase_promises").select("fase,fecha_promesa").eq("opd_id",opdId),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).from("v_semaforo_fase").select("fase,semaforo_fase").eq("opd_id",opdId),
    ]).then(([d,ev,pp,bl,pend,proms,sfase]) => {
      setDetail(d.data as OPDDetail | null);
      setEvents(ev.data as Event[] ?? []);
      setPlans(pp.data as PhaseRow[] ?? []);
      setBaseline(bl.data as PhaseRow[] ?? []);
      setPendientes(pend.data as Pendiente[] ?? []);
      setPromesas(new Map((proms.data ?? []).map((r: {fase: string; fecha_promesa: string}) => [r.fase, r.fecha_promesa])));
      setSemFase(new Map(((sfase as {data: {fase: string; semaforo_fase: Enums<"semaforo_enum">}[] | null}).data ?? []).map(r => [r.fase, r.semaforo_fase])));
      setLoading(false);
      const opNum = (d.data as OPDDetail | null)?.op_num;
      if (opNum) {
        sb.from("ops").select("estado_impel,fecha_compromiso").eq("op_num", opNum).single()
          .then(({ data }) => {
            setEstadoImpel((data?.estado_impel ?? null) as EstadoImpel | null);
            setFechaCompromisoState((data?.fecha_compromiso ?? null) as string | null);
          });
      }
    });
  }, [opdId]);

  function showMsg(text: string) { setMsg(text); setTimeout(() => setMsg(null), 3000); }

  function action(fn: () => Promise<{ok?: boolean; error?: string}>) {
    startTransition(async () => {
      const res = await fn();
      if (res.error) showMsg(`error:${res.error}`);
      else { showMsg("ok:Guardado"); setLoading(true); setDetail(null); }
    });
  }

  const msgIsError = msg?.startsWith("error:");
  const msgText = msg?.replace(/^(error:|ok:)/, "") ?? null;

  // Re-cargar detalle cuando cambia tras una acción
  useEffect(() => {
    if (!loading || !opdId) return;
    const sb = createClient();
    sb.from("op_ds").select("ref,op_num,detalle,cantidad,fase_actual,bloqueada,motivo_bloqueo,score_override,score_motivo,f0_ficha_tec,f0_patronaje,f0_muestra,f0_aprobacion,f0_tela_avios,f0_op_creada,dias_fase_0,dias_compras,dias_trazo,dias_corte,dias_tiqueteo,dias_satelites,dias_empaque,dias_despacho,fecha_promesa_satelites,fecha_recepcion_satelites").eq("id",opdId).single()
      .then(({data}) => {
        setDetail(data as OPDDetail | null);
        setLoading(false);
        const opNum = (data as OPDDetail | null)?.op_num;
        if (opNum) {
          sb.from("ops").select("estado_impel,fecha_compromiso").eq("op_num", opNum).single()
            .then(({ data: od }) => {
              setEstadoImpel((od?.estado_impel ?? null) as EstadoImpel | null);
              setFechaCompromisoState((od?.fecha_compromiso ?? null) as string | null);
            });
        }
      });
    sb.from("op_d_componentes").select("id,nombre_tela,rol,es_manual,cortado,cantidad_objetivo,cantidad_cortada,cantidad_tiqueteada").eq("opd_id", opdId).order("nombre_tela", { ascending: true })
      .then(({ data }) => setComponentesState((data ?? []) as Componente[]));
  }, [loading, opdId]);

  const fasesRestantes = detail
    ? FASES_ORDEN.slice(FASES_ORDEN.indexOf(detail.fase_actual) + 1)
    : [];
  const f0Completo = detail
    ? [detail.f0_ficha_tec,detail.f0_patronaje,detail.f0_muestra,detail.f0_aprobacion,detail.f0_tela_avios,detail.f0_op_creada].every(Boolean)
    : false;

  return (
    <Sheet open={!!opdId} onOpenChange={o => !o && onClose()}>
      <SheetContent className="w-[480px] sm:w-[540px] flex flex-col overflow-hidden p-0">
        {loading || !detail ? (
          <div className="px-5 pt-5 space-y-3 motion-safe:animate-pulse flex-1">
            <div className="h-5 bg-gray-100 rounded w-36" />
            <div className="h-3 bg-gray-100 rounded w-52 mt-1" />
            <div className="h-3 bg-gray-100 rounded w-40" />
            <div className="flex gap-2 mt-5">
              {[0,1,2,3].map(i => <div key={i} className="h-7 bg-gray-100 rounded w-16" />)}
            </div>
            <div className="space-y-2 mt-4">
              {[0,1,2,3,4].map(i => <div key={i} className="h-4 bg-gray-100 rounded" style={{ width: `${85 - i * 8}%` }} />)}
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <SheetHeader className="px-5 pt-5 pb-3 border-b border-gray-200 flex-none">
              <SheetTitle className="flex items-center gap-2 text-base">
                <span className="font-mono">{detail.ref}</span>
                <SemaforoDot semaforo={semaforo ?? null} />
                {detail.bloqueada && (
                  <span title={detail.motivo_bloqueo ?? "Bloqueada"} className="flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                    <Lock className="w-3 h-3" />
                    {detail.motivo_bloqueo ? detail.motivo_bloqueo.replace(/_/g, " ") : "Bloqueada"}
                  </span>
                )}
                {detail.score_override != null && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">override</span>}
              </SheetTitle>
              <p className="text-sm text-gray-500 truncate" title={detail.detalle ?? undefined}>{detail.detalle ?? "Sin descripción"}</p>
              <p className="text-xs text-gray-400">OP {detail.op_num} · {fmtNum(detail.cantidad)} uds · <strong>{FASE_LABEL[detail.fase_actual]}</strong></p>
            </SheetHeader>

            {/* Mensaje flash */}
            {msg && msgText && (
              <div className={`mx-5 mt-2 px-3 py-1.5 rounded text-xs flex-none border ${
                msgIsError
                  ? "bg-red-50 text-red-700 border-red-200"
                  : "bg-green-50 text-green-700 border-green-200"
              }`}>
                {msgText}
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-gray-200 px-5 flex-none">
              {(["detalle","plan","telas","eventos","pendientes"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${tab === t ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                  {t === "pendientes" && pendientes.length > 0 && (
                    <span className="ml-1 bg-orange-100 text-orange-700 px-1 rounded text-[10px]">{pendientes.length}</span>
                  )}
                  {t === "telas" && componentes.length > 0 && (
                    <span className={`ml-1 px-1 rounded text-[10px] ${componentes.every(c => c.cortado) ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                      {componentes.filter(c => c.cortado).length}/{componentes.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Contenido scrolleable */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* ── Detalle ─────────────────────────────────────── */}
              {tab === "detalle" && (
                <>
                  {/* Estado en IMPEL */}
                  <section>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Estado en IMPEL</h3>
                    <div className="flex items-center gap-2">
                      <select
                        value={estadoImpel ?? ""}
                        onChange={e => {
                          const v = e.target.value as EstadoImpel;
                          setEstadoImpel(v);
                          action(() => updateEstadoImpel(detail!.op_num, v));
                        }}
                        className="h-7 flex-1 rounded border border-gray-300 px-2 text-xs bg-white"
                      >
                        <option value="" disabled>— sin dato —</option>
                        {ESTADOS_IMPEL.map(e => <option key={e} value={e}>{e}</option>)}
                      </select>
                    </div>
                    <p className="mt-1 text-[10px] text-gray-400">Recordatorio — el ETL lo actualiza automáticamente en cada sync IMPEL.</p>
                  </section>

                  {/* Fecha compromiso */}
                  {!ocultarCompromiso && <section>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Fecha compromiso</h3>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        key={fechaCompromiso ?? ""}
                        defaultValue={fechaCompromiso ?? ""}
                        disabled={!puedeEditarCompromiso}
                        onBlur={e => {
                          if (!puedeEditarCompromiso) return;
                          const v = e.target.value;
                          if (v && v !== fechaCompromiso) {
                            setFechaCompromisoState(v);
                            action(() => setFechaCompromiso(detail!.op_num, v));
                          }
                        }}
                        className={`text-xs border rounded px-2 py-1 flex-1 ${puedeEditarCompromiso ? "border-gray-300" : "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"}`}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-gray-400">
                      {puedeEditarCompromiso
                        ? "Cambia la fecha de compromiso de toda la OP y recalcula el plan."
                        : "Solo admin y directivos pueden modificar la fecha de compromiso."}
                    </p>
                  </section>}

                  {/* Acciones principales */}
                  <section>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Acciones</h3>

                    {/* Alerta: pendientes bloquean el cierre */}
                    {pendientes.length > 0 && fasesRestantes[0] === "despacho" && (
                      <div className="mb-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded text-[11px] text-orange-800 flex items-start gap-1.5">
                        <Lock className="w-3 h-3 flex-none mt-0.5" />
                        <span>{pendientes.length} pendiente(s) abierto(s) — deben cerrarse antes de pasar a Despacho.
                        Usa el tab <strong>Pendientes</strong> para cerrarlos.</span>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {/* Avanzar fase completo */}
                      {fasesRestantes.length > 0 && (detail.fase_actual !== "fase_0" || f0Completo) && (
                        <AvanceCompletoForm
                          opdId={opdId!}
                          faseDest={fasesRestantes[0]}
                          isPending={isPending}
                          onAction={action}
                        />
                      )}
                      {/* Bloquear / desbloquear */}
                      {!detail.bloqueada ? (
                        <BloquearForm opdId={opdId!} isPending={isPending} onAction={action} />
                      ) : (
                        <button disabled={isPending}
                          onClick={() => action(() => unblockOpd(opdId!, "Resuelto"))}
                          className="px-3 py-1.5 text-xs border border-green-300 text-green-700 rounded hover:bg-green-50 disabled:opacity-50">
                          Desbloquear
                        </button>
                      )}
                    </div>
                    {detail.fase_actual === "fase_0" && !f0Completo && (
                      <p className="mt-1.5 text-[10px] text-orange-600">
                        Completa los 6 checkboxes de F0 para habilitar el avance a Compras
                      </p>
                    )}

                    {/* Salto de Fase flexible */}
                    {detail.fase_actual !== "despacho" && detail.fase_actual !== "cierre" && (
                      <SaltoFase opdId={opdId!} faseActual={detail.fase_actual} isPending={isPending} onAction={action} userRol={userRol} fasesOperativas={fasesOperativasDrawer} liderJumps={liderJumpsDrawer} />
                    )}

                    {/* Revertir fase — solo admin, requiere motivo */}
                    {detail.fase_actual !== "fase_0" && (
                      <RevertirFaseForm
                        opdId={opdId!}
                        faseActual={detail.fase_actual}
                        isPending={isPending}
                        onAction={action}
                      />
                    )}

                    {/* Avance parcial — genera pendiente */}
                    {fasesRestantes.length > 0 && detail.fase_actual !== "fase_0" && (
                      <AvanceParcialForm
                        opdId={opdId!}
                        cantidadTotal={detail.cantidad}
                        faseDest={fasesRestantes[0]}
                        isPending={isPending}
                        onAction={action}
                      />
                    )}
                  </section>

                  {/* Checkboxes F0 */}
                  <section>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Fase 0</h3>
                    <div className="grid grid-cols-2 gap-1.5">
                      {F0_CAMPOS.map(([campo, label]) => (
                        <label key={campo} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox"
                            checked={!!detail[campo]}
                            onChange={e => action(() => updateF0Checkbox(opdId!, campo as "f0_ficha_tec", e.target.checked))}
                            className="rounded" />
                          <span className="text-xs text-gray-700">{label}</span>
                        </label>
                      ))}
                    </div>
                  </section>

                  {/* Fechas satélites */}
                  {(detail.fase_actual === "satelites" || promesas.has("satelites") || !!detail.fecha_recepcion_satelites) && (
                    <section>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Satélites</h3>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-600 w-28">Promesa entrega</span>
                          <input type="date"
                            key={`sat-prom-${promesas.get("satelites") ?? ""}`}
                            defaultValue={promesas.get("satelites") ?? ""}
                            onBlur={e => {
                              const v = e.target.value;
                              if (v && v !== promesas.get("satelites")) {
                                setPromesas(prev => new Map(prev).set("satelites", v));
                                action(() => setPhasePromise(opdId!, "satelites", v));
                              }
                            }}
                            className="text-xs border border-gray-300 rounded px-2 py-1 flex-1" />
                        </div>
                        {/* Historial de cambios de promesa */}
                        {events.filter(e => e.tipo === "satellite_promise_set" && e.fase === "satelites" && e.payload?.fecha_anterior != null).slice(0, 5).map(e => {
                          const d = e.payload!.delta_dias as number;
                          return (
                            <div key={e.id} className="flex items-center gap-1.5 text-xs text-gray-500 pl-1">
                              <span className="text-gray-400">{String(e.payload!.fecha_anterior)} → {String(e.payload!.fecha)}</span>
                              <span className={d > 0 ? "text-red-500 font-medium" : "text-green-600 font-medium"}>
                                {d > 0 ? `+${d}d ↑` : `${d}d ↓`}
                              </span>
                              <span className="text-gray-400">· {e.actor.split("@")[0]}</span>
                            </div>
                          );
                        })}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-600 w-28">Recepción real</span>
                          <span className="text-xs text-gray-700 tabular-nums">
                            {detail.fecha_recepcion_satelites
                              ? fmtDia(new Date(detail.fecha_recepcion_satelites + "T00:00:00"))
                              : <span className="text-gray-400 italic">se registra al avanzar fase</span>}
                          </span>
                        </div>
                      </div>
                    </section>
                  )}

                  {/* Observaciones técnicas */}
                  <section>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Observaciones técnicas</h3>
                    <div className="space-y-1 mb-2 max-h-36 overflow-y-auto">
                      {events.filter(e => e.tipo === "observacion_tecnica").length === 0 && (
                        <p className="text-xs text-gray-400 italic">Sin observaciones.</p>
                      )}
                      {events.filter(e => e.tipo === "observacion_tecnica").map(e => (
                        <div key={e.id} className="bg-amber-50 border border-amber-200 rounded p-2 text-xs">
                          <p className="text-gray-800 whitespace-pre-wrap">{String(e.payload?.texto ?? "")}</p>
                          <p className="text-gray-400 mt-0.5">{e.actor.split("@")[0]} · {fmtDia(new Date(e.ts))}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      <textarea id={`obs-${opdId}`} rows={2} placeholder="Ej: taller confirmó entrega el viernes..."
                        className="text-xs border border-gray-300 rounded px-2 py-1 flex-1 resize-none" />
                      <button
                        onClick={() => {
                          const el = document.getElementById(`obs-${opdId}`) as HTMLTextAreaElement;
                          const txt = el.value;
                          if (!txt.trim()) return;
                          action(() => addObservacion(opdId!, txt, detail.fase_actual));
                          el.value = "";
                        }}
                        className="text-xs bg-amber-500 text-white px-2 rounded hover:bg-amber-600 self-end pb-1">
                        ＋
                      </button>
                    </div>
                  </section>

                  {/* Score override */}
                  {!ocultarCompromiso && <section>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Score override</h3>
                    <div className="flex items-center gap-2">
                      <input type="number" min={0} max={100}
                        defaultValue={detail.score_override ?? ""}
                        placeholder="0–100 (vacío = calculado)"
                        className="text-xs border border-gray-300 rounded px-2 py-1 w-36"
                        id={`score-${opdId}`} />
                      <input type="text" placeholder="Motivo"
                        defaultValue={detail.score_motivo ?? ""}
                        className="text-xs border border-gray-300 rounded px-2 py-1 flex-1"
                        id={`motivo-${opdId}`} />
                      <button
                        onClick={() => {
                          const s = (document.getElementById(`score-${opdId}`) as HTMLInputElement).value;
                          const m = (document.getElementById(`motivo-${opdId}`) as HTMLInputElement).value;
                          action(() => scoreOverride(opdId!, s ? parseInt(s) : null, m));
                        }}
                        className="px-2 py-1 text-xs bg-gray-900 text-white rounded hover:bg-gray-800">
                        Aplicar
                      </button>
                    </div>
                  </section>}
                </>
              )}

              {/* ── Plan ──────────────────────────────────────────── */}
              {tab === "plan" && (
                <>
                  <section>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Días por fase (replanificar)</h3>
                    <div className="space-y-1.5">
                      {(["dias_fase_0","dias_compras","dias_trazo","dias_corte","dias_tiqueteo","dias_satelites","dias_empaque","dias_despacho"] as const).map(campo => {
                        const fase = campo.replace("dias_","") as Enums<"fase_enum">;
                        return (
                          <div key={campo} className="flex items-center gap-2">
                            <span className="text-xs text-gray-600 w-20">{FASE_LABEL[fase]}</span>
                            <input type="number" min={1} max={60}
                              defaultValue={detail[campo] as number}
                              id={`dias-${campo}-${opdId}`}
                              className="text-xs border border-gray-300 rounded px-2 py-1 w-16 text-center" />
                            <span className="text-xs text-gray-400">días</span>
                            {(() => {
                              const bl = baseline.find(b => b.fase === fase);
                              const pp = plans.find(p => p.fase === fase);
                              return bl && pp ? (
                                <span className="text-[10px] text-gray-400 ml-auto">
                                  plan: {pp.start_date}→{pp.due_date}
                                  {bl.due_date !== pp.due_date && <span className="text-orange-500 ml-1">↔base:{bl.due_date}</span>}
                                </span>
                              ) : null;
                            })()}
                          </div>
                        );
                      })}
                    </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => {
                            const cambios: Record<string,number> = {};
                            (["dias_fase_0","dias_compras","dias_trazo","dias_corte","dias_tiqueteo","dias_satelites","dias_empaque","dias_despacho"] as const).forEach(c => {
                              const el = document.getElementById(`dias-${c}-${opdId}`) as HTMLInputElement;
                              if (el) cambios[c] = parseInt(el.value);
                            });
                            action(() => replanOpd(opdId!, cambios));
                          }}
                          className="px-4 py-1.5 text-xs bg-gray-900 text-white rounded hover:bg-gray-800">
                          Recalcular plan
                        </button>
                        <button
                          onClick={() => {
                            const cambios: Record<string,number> = {};
                            (["dias_fase_0","dias_compras","dias_trazo","dias_corte","dias_tiqueteo","dias_satelites","dias_empaque","dias_despacho"] as const).forEach(c => {
                              const el = document.getElementById(`dias-${c}-${opdId}`) as HTMLInputElement;
                              if (el) cambios[c] = parseInt(el.value);
                            });
                            action(() => replanOpFull(detail.op_num, cambios));
                          }}
                          className="px-4 py-1.5 text-xs border border-gray-900 text-gray-900 rounded hover:bg-gray-100">
                          Aplicar a toda la OP
                        </button>
                      </div>
                    </section>

                  {/* Promesas por fase */}
                  <section>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Promesas por fase</h3>
                    <p className="text-[10px] text-gray-400 mb-2">El líder de cada fase puede registrar su fecha de entrega comprometida.</p>
                    <div className="space-y-2">
                      {(["compras","trazo","corte","tiqueteo","satelites","empaque","despacho"] as const).map(fase => {
                        const historial = events.filter(e =>
                          e.tipo === "satellite_promise_set" &&
                          e.fase === fase &&
                          e.payload?.fecha_anterior != null
                        ).slice(0, 5);
                        return (
                          <div key={fase} className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-600 w-20">{FASE_LABEL[fase]}</span>
                              {semFase.has(fase) && (
                                <SemaforoDot semaforo={semFase.get(fase) ?? null} />
                              )}
                              <input
                                type="date"
                                key={`prom-${fase}-${promesas.get(fase) ?? ""}`}
                                defaultValue={promesas.get(fase) ?? ""}
                                onBlur={e => {
                                  const v = e.target.value;
                                  if (v && v !== promesas.get(fase)) {
                                    setPromesas(prev => new Map(prev).set(fase, v));
                                    action(() => setPhasePromise(opdId!, fase, v));
                                  }
                                }}
                                className="text-xs border border-gray-300 rounded px-2 py-1 flex-1"
                              />
                            </div>
                            {historial.map(e => {
                              const d = e.payload!.delta_dias as number;
                              return (
                                <div key={e.id} className="flex items-center gap-1.5 text-[10px] text-gray-500 pl-24">
                                  <span className="text-gray-400">{String(e.payload!.fecha_anterior)} → {String(e.payload!.fecha)}</span>
                                  <span className={d > 0 ? "text-red-500 font-medium" : "text-green-600 font-medium"}>
                                    {d > 0 ? `+${d}d ↑` : `${d}d ↓`}
                                  </span>
                                  <span className="text-gray-400">· {e.actor.split("@")[0]} · {fmtDia(new Date(e.ts))}</span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </>
              )}

              {/* ── Telas ─────────────────────────────────────────── */}
              {tab === "telas" && (
                <TelasTab
                  opdId={opdId!}
                  componentes={componentes}
                  faseActual={detail.fase_actual}
                  isPending={isPending}
                  onAction={action}
                  onRegistrar={(componenteId, cantidad) => {
                    const reg = [{ componenteId, cantidad }];
                    const fn = detail.fase_actual === "tiqueteo" ? registrarTiqueteo : registrarCorte;
                    action(async () => {
                      const r = await fn(reg, null, []);
                      return r.errores.length ? { error: r.errores[0].error } : { ok: true };
                    });
                  }}
                />
              )}

              {/* ── Eventos ───────────────────────────────────────── */}
              {tab === "eventos" && (
                <div className="space-y-2">
                  {events.map(ev => (
                    <div key={ev.id} className="flex gap-2">
                      <div className="flex flex-col items-center">
                        <span className="w-2 h-2 rounded-full bg-gray-300 flex-none mt-1" />
                        <span className="w-px flex-1 bg-gray-100" />
                      </div>
                      <div className="pb-2">
                        <p className="text-xs font-medium text-gray-800">
                          {EVENTO_LABEL[ev.tipo] ?? ev.tipo}
                          {ev.fase ? ` · ${FASE_LABEL[ev.fase as Enums<"fase_enum">]}` : ""}
                        </p>
                        <p className="text-[10px] text-gray-400">{new Date(ev.ts).toLocaleString("es-CO")} · {ev.actor}</p>
                        {typeof ev.payload?.observaciones === "string" && (
                          <p className="text-[10px] text-gray-600 mt-0.5 italic">
                            &ldquo;{ev.payload.observaciones}&rdquo;
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  {events.length === 0 && <p className="text-xs text-gray-400">Sin eventos</p>}
                </div>
              )}

              {/* ── Pendientes ────────────────────────────────────── */}
              {tab === "pendientes" && (
                <div className="space-y-2">
                  {pendientes.map(p => (
                    <div key={p.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-800">
                          {p.motivo.replace(/_/g," ")} · {p.cantidad_afectada} uds
                        </span>
                        <button onClick={() => action(() => closePendiente(p.id))}
                          className="text-[10px] px-2 py-0.5 bg-green-600 text-white rounded hover:bg-green-700">
                          Cerrar
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">
                        Origen: {FASE_LABEL[p.fase_origen as Enums<"fase_enum">]} · {p.estado}
                      </p>
                    </div>
                  ))}
                  {pendientes.length === 0 && <p className="text-xs text-gray-400">Sin pendientes abiertos</p>}
                </div>
              )}

            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Salto de Fase (Tercerización flexible) ──────────────────────────────────
function SaltoFase({ opdId, faseActual, isPending, onAction, userRol = null, fasesOperativas = [], liderJumps = [] }: {
  opdId: string;
  faseActual: Enums<"fase_enum">;
  isPending: boolean;
  onAction: (fn: () => Promise<{ok?: boolean; error?: string}>) => void;
  userRol?: string | null;
  fasesOperativas?: Enums<"fase_enum">[];
  liderJumps?: import("@/lib/actions/phase-jumps-actions").LiderJump[];
}) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");

  const destinosPosibles = saltoDestinosPermitidos(userRol, fasesOperativas, [faseActual], liderJumps);

  const [faseDestino, setFaseDestino] = useState<Enums<"fase_enum">>(destinosPosibles[0]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={isPending || destinosPosibles.length === 0}
        className="px-3 py-1.5 text-xs border border-violet-300 text-violet-700 rounded hover:bg-violet-50 disabled:opacity-50"
      >
        ⤴ Salto de fase
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-3 py-2 bg-violet-50 border border-violet-200 rounded">
      <div className="flex items-center gap-2">
        <span className="text-xs text-violet-800 font-medium whitespace-nowrap">Saltar a:</span>
        <select
          value={faseDestino}
          onChange={e => setFaseDestino(e.target.value as Enums<"fase_enum">)}
          className="text-xs border border-violet-300 rounded px-2 py-1 flex-1"
        >
          {destinosPosibles.map(f => (
            <option key={f} value={f}>{FASE_LABEL[f]}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          placeholder="Motivo (ej: paquete completo, corte externo…)"
          className="text-xs border border-violet-300 rounded px-2 py-1 flex-1 min-w-40"
        />
        <button
          disabled={isPending || !motivo.trim() || !faseDestino}
          onClick={() => { onAction(() => saltarFase(opdId, faseDestino, motivo)); setOpen(false); }}
          className="px-3 py-1.5 text-xs bg-violet-600 text-white rounded hover:bg-violet-700 disabled:opacity-50"
        >
          Confirmar salto
        </button>
        <button onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-700">Cancelar</button>
      </div>
    </div>
  );
}

// ─── Input inline para registrar delta ───────────────────────────────────────
function InlineRegistrar({ max, disabled, onConfirm }: { max: number; disabled: boolean; onConfirm: (n: number) => void }) {
  const [val, setVal] = useState(max);
  return (
    <div className="flex items-center gap-1.5">
      <input type="number" min={1} max={max} value={val}
        onChange={e => setVal(Math.min(max, Math.max(1, parseInt(e.target.value) || 1)))}
        className="h-6 w-20 text-xs border border-gray-300 rounded px-2 text-center" />
      <button disabled={disabled || val <= 0} onClick={() => onConfirm(val)}
        className="h-6 px-2 text-[10px] bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-40">
        ✓ Registrar
      </button>
    </div>
  );
}

// ─── Tab Telas (checklist de corte + asignación) ─────────────────────────────
function TelasTab({ opdId, componentes, faseActual, isPending, onAction, onRegistrar }: {
  opdId: string;
  componentes: Componente[];
  faseActual: Enums<"fase_enum">;
  isPending: boolean;
  onAction: (fn: () => Promise<{ok?: boolean; error?: string}>) => void;
  onRegistrar: (componenteId: string, cantidad: number) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");

  const total = componentes.length;
  const cortados = componentes.filter(c => c.cortado).length;
  const enCorte = faseActual === "corte";
  const faltan = total - cortados;

  function abrirEditor() {
    setTexto(componentes.map(c => c.nombre_tela).join("\n"));
    setEditando(true);
  }

  function guardar() {
    const items = texto.split("\n").map(l => l.trim()).filter(Boolean).map(nombre_tela => ({ nombre_tela }));
    onAction(() => setComponentes(opdId, items));
    setEditando(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-500 uppercase">
          Telas / componentes {total > 0 && <span className="ml-1 normal-case font-normal text-gray-400">({cortados}/{total} cortadas)</span>}
        </h3>
        {!editando && (
          <button onClick={abrirEditor}
            className="text-[10px] px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 text-gray-600">
            {total > 0 ? "Editar lista" : "Asignar telas"}
          </button>
        )}
      </div>

      {/* Gate hint en corte */}
      {enCorte && total > 0 && (
        <div className={`text-[11px] px-2 py-1.5 rounded border ${faltan > 0 ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-green-50 border-green-200 text-green-700"}`}>
          {faltan > 0
            ? `Faltan ${faltan} tela(s) por cortar — no se puede avanzar a Tiqueteo.`
            : "Todas las telas cortadas — la OP-D puede avanzar a Tiqueteo."}
        </div>
      )}

      {/* Editor por pegado */}
      {editando ? (
        <div className="space-y-2">
          <p className="text-[10px] text-gray-500">Una tela por línea (pega desde el cuadro de compras). Se marcan como manuales y el ETL no las pisa.</p>
          <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={6}
            placeholder={"Drill antifluido azul\nForro tafetán\nRib cuello"}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 font-mono" />
          <div className="flex gap-2">
            <button disabled={isPending} onClick={guardar}
              className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50">
              Guardar telas
            </button>
            <button onClick={() => setEditando(false)}
              className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      ) : total === 0 ? (
        <p className="text-xs text-gray-400">Sin telas asignadas. Úsalas para verificar el corte completo antes de avanzar.</p>
      ) : (
        <ul className="space-y-2">
          {componentes.map(c => {
            const enCorteOTiq = faseActual === "corte" || faseActual === "tiqueteo";
            const hechaActual = faseActual === "tiqueteo" ? c.cantidad_tiqueteada : c.cantidad_cortada;
            const tope = faseActual === "tiqueteo" ? c.cantidad_cortada : c.cantidad_objetivo;
            const pendiente = Math.max(0, tope - hechaActual);
            const completa = tope > 0 && hechaActual >= tope;
            const pct = tope > 0 ? Math.round((hechaActual / tope) * 100) : 0;
            return (
              <li key={c.id} className="border border-gray-100 rounded p-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className={`text-xs flex-1 ${completa ? "text-gray-400" : "text-gray-800"}`}>
                    {c.nombre_tela}
                    {c.rol && <span className="ml-1 text-[10px] text-gray-400">· {c.rol}</span>}
                  </span>
                  <span className="text-[10px] text-gray-400">{hechaActual}/{tope > 0 ? tope : c.cantidad_objetivo}</span>
                  {c.es_manual && <span className="text-[9px] text-gray-300" title="Asignada manualmente">✎</span>}
                </div>
                {enCorteOTiq && c.cantidad_objetivo > 0 && (
                  <>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${completa ? "bg-green-500" : "bg-blue-400"}`}
                        style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    {completa ? (
                      <p className="text-[10px] text-green-600">✓ Completa</p>
                    ) : (
                      <InlineRegistrar
                        max={pendiente}
                        disabled={isPending}
                        onConfirm={delta => onRegistrar(c.id, delta)}
                      />
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Formulario revertir fase ─────────────────────────────────────────────────
function RevertirFaseForm({ opdId, faseActual, isPending, onAction }: {
  opdId: string;
  faseActual: Enums<"fase_enum">;
  isPending: boolean;
  onAction: (fn: () => Promise<{ok?: boolean; error?: string}>) => void;
}) {
  const [open, setOpen]   = useState(false);
  const [motivo, setMot]  = useState("");
  const idx = FASES_ORDEN.indexOf(faseActual);
  const faseAnterior = idx > 0 ? FASES_ORDEN[idx - 1] : null;

  if (!faseAnterior) return null;
  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50">
      ← Revertir a {FASE_LABEL[faseAnterior]}
    </button>
  );

  return (
    <div className="mt-2 w-full border border-red-200 rounded-lg p-3 bg-red-50 space-y-2">
      <p className="text-xs font-medium text-red-800">
        Revertir: {FASE_LABEL[faseActual]} → {FASE_LABEL[faseAnterior]}
      </p>
      <p className="text-[10px] text-red-600">
        Acción de admin. Queda registrada en el historial con motivo y actor.
      </p>
      <input type="text" value={motivo} onChange={e => setMot(e.target.value)}
        placeholder="Motivo obligatorio…"
        className="w-full text-xs border border-gray-300 rounded px-2 py-1" />
      <div className="flex gap-2">
        <button disabled={isPending || !motivo.trim()}
          onClick={() => { onAction(() => revertPhase(opdId, motivo)); setOpen(false); }}
          className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">
          Confirmar reversión
        </button>
        <button onClick={() => setOpen(false)}
          className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50">
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Formulario de avance parcial ─────────────────────────────────────────────
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

function AvanceParcialForm({ opdId, cantidadTotal, faseDest, isPending, onAction }: {
  opdId: string;
  cantidadTotal: number;
  faseDest: Enums<"fase_enum">;
  isPending: boolean;
  onAction: (fn: () => Promise<{ok?: boolean; error?: string}>) => void;
}) {
  const [open, setOpen]     = useState(false);
  const [cantidad, setCant] = useState(1);
  const [motivo, setMotivo] = useState<Enums<"causa_desvio_enum">>("reproceso_interno");
  const [obs, setObs]       = useState("");

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="px-3 py-1.5 text-xs border border-orange-300 text-orange-700 rounded hover:bg-orange-50">
      → {FASE_LABEL[faseDest]} (parcial)
    </button>
  );

  return (
    <div className="mt-2 w-full border border-orange-200 rounded-lg p-3 bg-orange-50 space-y-2">
      <p className="text-xs font-medium text-orange-800">Avance parcial → {FASE_LABEL[faseDest]}</p>
      <p className="text-[10px] text-orange-600">
        Las unidades con novedad quedan como pendiente. La OP-D avanza con las unidades restantes.
        No podrá cerrar (Despacho) hasta que el pendiente se cierre.
      </p>
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-700 flex-none">Uds con novedad:</label>
        <input type="number" min={1} max={cantidadTotal - 1}
          value={cantidad} onChange={e => setCant(parseInt(e.target.value) || 1)}
          className="w-20 text-xs border border-gray-300 rounded px-2 py-1 text-center" />
        <span className="text-[10px] text-gray-400">de {cantidadTotal}</span>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-700 flex-none">Causa:</label>
        <select value={motivo} onChange={e => setMotivo(e.target.value as Enums<"causa_desvio_enum">)}
          className="flex-1 text-xs border border-gray-300 rounded px-2 py-1">
          {CAUSAS.map(c => <option key={c} value={c}>{CAUSA_LABEL[c]}</option>)}
        </select>
      </div>
      <textarea value={obs} onChange={e => setObs(e.target.value)}
        placeholder="Observaciones (opcional) — descripción detallada del desvío, acciones tomadas, etc."
        rows={3}
        className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-orange-400" />
      <div className="flex gap-2">
        <button disabled={isPending}
          onClick={() => { onAction(() => advancePhaseParcial(opdId, cantidad, motivo, obs || undefined)); setOpen(false); }}
          className="px-3 py-1.5 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50">
          Confirmar avance parcial
        </button>
        <button onClick={() => { setOpen(false); setObs(""); }}
          className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50">
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Formulario avance completo (con observaciones opcionales) ────────────────
function AvanceCompletoForm({ opdId, faseDest, isPending, onAction }: {
  opdId: string;
  faseDest: Enums<"fase_enum">;
  isPending: boolean;
  onAction: (fn: () => Promise<{ok?: boolean; error?: string}>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [obs, setObs]   = useState("");

  if (!open) return (
    <button disabled={isPending}
      onClick={() => setOpen(true)}
      className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50">
      → {FASE_LABEL[faseDest]}
    </button>
  );

  return (
    <div className="mt-2 w-full border border-gray-300 rounded-lg p-3 bg-gray-50 space-y-2">
      <p className="text-xs font-medium text-gray-800">Avanzar → {FASE_LABEL[faseDest]}</p>
      <textarea value={obs} onChange={e => setObs(e.target.value)}
        placeholder="Observaciones (opcional) — novedades, condiciones de entrega, etc."
        rows={2}
        className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-gray-400" />
      <div className="flex gap-2">
        <button disabled={isPending}
          onClick={() => { onAction(() => advancePhase(opdId, obs || undefined)); setOpen(false); setObs(""); }}
          className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50">
          Confirmar avance
        </button>
        <button onClick={() => { setOpen(false); setObs(""); }}
          className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50">
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Formulario bloquear (selección de motivo + observaciones) ────────────────
const MOTIVO_BLOQUEO_LABEL: Record<string, string> = {
  mp_no_llego:"MP no llegó", fase_0_incompleta:"F0 incompleta",
  pendiente_cliente:"Pendiente cliente", capacidad_satelite:"Cap. satélite",
  reproceso:"Reproceso", otro:"Otro",
};

function BloquearForm({ opdId, isPending, onAction }: {
  opdId: string;
  isPending: boolean;
  onAction: (fn: () => Promise<{ok?: boolean; error?: string}>) => void;
}) {
  const [step, setStep]   = useState<"closed"|"motivo"|"obs">("closed");
  const [motivo, setMot]  = useState<Enums<"motivo_bloqueo_enum"> | null>(null);
  const [obs, setObs]     = useState("");

  if (step === "closed") return (
    <button onClick={() => setStep("motivo")}
      className="px-3 py-1.5 text-xs border border-orange-300 text-orange-700 rounded hover:bg-orange-50">
      Bloquear
    </button>
  );

  function reset() { setStep("closed"); setMot(null); setObs(""); }

  if (step === "motivo") return (
    <div className="mt-2 w-full border border-orange-200 rounded-lg p-3 bg-orange-50 space-y-1.5">
      <p className="text-xs font-medium text-orange-800">Selecciona el motivo de bloqueo:</p>
      <div className="grid grid-cols-2 gap-1">
        {MOTIVO_BLOQUEO.map(m => (
          <button key={m}
            onClick={() => { setMot(m); setStep("obs"); }}
            className="px-2 py-1.5 text-xs text-left border border-orange-200 rounded hover:bg-orange-100 text-gray-700">
            {MOTIVO_BLOQUEO_LABEL[m]}
          </button>
        ))}
      </div>
      <button onClick={reset}
        className="text-[10px] text-gray-500 hover:text-gray-700">Cancelar</button>
    </div>
  );

  // step === "obs"
  return (
    <div className="mt-2 w-full border border-orange-200 rounded-lg p-3 bg-orange-50 space-y-2">
      <p className="text-xs font-medium text-orange-800">
        Bloquear: <span className="font-normal">{motivo ? MOTIVO_BLOQUEO_LABEL[motivo] : ""}</span>
      </p>
      <textarea value={obs} onChange={e => setObs(e.target.value)}
        placeholder="Observaciones (opcional) — describe la situación, quién está involucrado, próximos pasos…"
        rows={3}
        className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-orange-400" />
      <div className="flex gap-2">
        <button disabled={isPending || !motivo}
          onClick={() => { onAction(() => blockOpd(opdId, motivo!, obs || undefined)); reset(); }}
          className="px-3 py-1.5 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50">
          Confirmar bloqueo
        </button>
        <button onClick={reset}
          className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50">
          Cancelar
        </button>
      </div>
    </div>
  );
}
