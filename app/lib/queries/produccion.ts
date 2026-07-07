import { unstable_cache } from "next/cache";
import { createCachedServiceClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/supabase";
import { FASES_ORDEN } from "@/lib/fases";
import type { KanbanData, OPDWithMeta } from "@/lib/queries/kanban";
import type { OPDTabla } from "@/lib/queries/tabla";
import type { GanttMeta, GanttRow, PhasePlan } from "@/lib/queries/gantt";

// ─── Tipos del payload raw de las RPCs ───────────────────────────────────────

type RawOpd = {
  opd_id: string;
  ref: string;
  op_num: string;
  cliente_id: string | null;
  fase_actual: string;
  semaforo: string | null;
  slack: number | null;
  dias_plan_restantes: number | null;
  bloqueada: boolean | null;
  plan_congelado: boolean | null;
  score_efectivo: number | null;
  detalle: string | null;
  cantidad: number;
  prioridad_manual: number | null;
  comercial: string | null;
  fecha_compromiso: string | null;
  cliente_nombre: string;
  pendientes: number;
  subestado_satelite: string | null;
  fecha_promesa_satelites: string | null;
  fecha_recepcion_satelites: string | null;
  recurso_corte: string | null;
  tipo_despacho: string | null;
  colores: string | null;
  motivo_bloqueo: string | null;
  causa_desvio: string | null;
  slack_fase: number | null;
  semaforo_fase: string | null;
  promesa_fase: string | null;
  fecha_ingreso_fase: string | null;
};

type RawPlan = {
  opd_id: string;
  fase: string;
  start_date: string;
  due_date: string;
  dias: number;
};

type RawPrioridadFase = {
  opd_id: string;
  fase: string;
  prioridad: number;
};

export type ProduccionPayload = {
  opds:          RawOpd[];
  plans:         RawPlan[];
  baseline:      RawPlan[];
  festivos:      string[];
  prioridadFase: RawPrioridadFase[];
};

// ─── Caches separados para respetar el límite de 2MB de unstable_cache ────────
// opds (~300KB), plans (~450KB), baseline (~450KB), festivos (<5KB)
// Todos comparten el tag "produccion" para invalidación coordinada.

const _fetchOpds = unstable_cache(
  async (): Promise<RawOpd[]> => {
    const sb = createCachedServiceClient();
    const { data, error } = await sb.rpc("get_opds_data" as never);
    if (error) throw new Error(`get_opds_data: ${(error as { message: string }).message}`);
    return Array.isArray(data) ? (data as RawOpd[]) : [];
  },
  ["produccion-opds"],
  { revalidate: 60, tags: ["produccion"] }
);

const _fetchPlans = unstable_cache(
  async (): Promise<RawPlan[]> => {
    const sb = createCachedServiceClient();
    const { data, error } = await sb.rpc("get_phase_plans_json" as never);
    if (error) throw new Error(`get_phase_plans_json: ${(error as { message: string }).message}`);
    return Array.isArray(data) ? (data as RawPlan[]) : [];
  },
  ["produccion-plans"],
  { revalidate: 120, tags: ["produccion"] }
);

const _fetchBaseline = unstable_cache(
  async (): Promise<RawPlan[]> => {
    const sb = createCachedServiceClient();
    const { data, error } = await sb.rpc("get_phase_plans_baseline_json" as never);
    if (error) throw new Error(`get_phase_plans_baseline_json: ${(error as { message: string }).message}`);
    return Array.isArray(data) ? (data as RawPlan[]) : [];
  },
  ["produccion-baseline"],
  { revalidate: 3600, tags: ["produccion"] } // baseline es inmutable tras freeze_baseline
);

const _fetchFestivos = unstable_cache(
  async (): Promise<string[]> => {
    const sb = createCachedServiceClient();
    const { data, error } = await sb.rpc("get_festivos_data" as never);
    if (error) throw new Error(`get_festivos_data: ${(error as { message: string }).message}`);
    return Array.isArray(data) ? (data as string[]) : [];
  },
  ["festivos-co"],
  { revalidate: 86400 } // festivos no cambian en el año
);

const _fetchPrioridadFase = unstable_cache(
  async (): Promise<RawPrioridadFase[]> => {
    const sb = createCachedServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any).from("op_d_prioridad_fase").select("opd_id,fase,prioridad");
    if (error) throw new Error(`op_d_prioridad_fase: ${(error as { message: string }).message}`);
    return Array.isArray(data) ? (data as RawPrioridadFase[]) : [];
  },
  ["produccion-prioridad-fase"],
  { revalidate: 120, tags: ["produccion"] }
);

// ─── Fetch principal: compone los 5 caches en paralelo ───────────────────────

export async function fetchProduccionData(): Promise<ProduccionPayload> {
  const [opds, plans, baseline, festivos, prioridadFase] = await Promise.all([
    _fetchOpds(),
    _fetchPlans(),
    _fetchBaseline(),
    _fetchFestivos(),
    _fetchPrioridadFase(),
  ]);
  return { opds, plans, baseline, festivos, prioridadFase };
}

// ─── Transformadores ──────────────────────────────────────────────────────────

export function buildKanbanData(payload: ProduccionPayload): KanbanData {
  const columnas = Object.fromEntries(
    FASES_ORDEN.map(f => [f, [] as OPDWithMeta[]])
  ) as Record<Enums<"fase_enum">, OPDWithMeta[]>;

  for (const opd of payload.opds) {
    const fase = opd.fase_actual as Enums<"fase_enum">;
    if (!columnas[fase]) continue;
    columnas[fase].push({
      opd_id:              opd.opd_id,
      ref:                 opd.ref,
      op_num:              opd.op_num,
      cliente_id:          opd.cliente_id,
      fase_actual:         fase,
      semaforo:            opd.semaforo as Enums<"semaforo_enum"> | null,
      slack:               opd.slack,
      dias_plan_restantes: opd.dias_plan_restantes,
      bloqueada:           opd.bloqueada,
      plan_congelado:      opd.plan_congelado,
      score_efectivo:      opd.score_efectivo,
      pendientes:          opd.pendientes,
      cliente_nombre:      opd.cliente_nombre,
      subestado_satelite:  opd.subestado_satelite ?? null,
      slack_fase:          opd.slack_fase ?? null,
      semaforo_fase:       opd.semaforo_fase as Enums<"semaforo_enum"> | null,
    });
  }

  // Prioridad por fase (manual) tiene precedencia sobre score automático
  const prioFaseMap = new Map<string, number>(
    payload.prioridadFase.map(r => [`${r.opd_id}:${r.fase}`, r.prioridad])
  );

  for (const fase of FASES_ORDEN) {
    columnas[fase].sort((a, b) => {
      const pa = prioFaseMap.get(`${a.opd_id}:${fase}`);
      const pb = prioFaseMap.get(`${b.opd_id}:${fase}`);
      if (pa != null && pb != null) return pa - pb;
      if (pa != null) return -1;
      if (pb != null) return 1;
      const sa = a.score_efectivo ?? 0, sb = b.score_efectivo ?? 0;
      if (sb !== sa) return sb - sa;
      return (a.slack ?? 0) - (b.slack ?? 0);
    });
  }

  return {
    columnas,
    totales: Object.fromEntries(
      FASES_ORDEN.map(f => [f, columnas[f].length])
    ) as Record<Enums<"fase_enum">, number>,
  };
}

export function buildTablaData(payload: ProduccionPayload): OPDTabla[] {
  return payload.opds.map(opd => ({
    opd_id:         opd.opd_id,
    ref:            opd.ref,
    op_num:         opd.op_num,
    detalle:        opd.detalle,
    cantidad:       opd.cantidad,
    fase_actual:    opd.fase_actual as Enums<"fase_enum">,
    semaforo:       opd.semaforo as Enums<"semaforo_enum"> | null,
    slack:          opd.slack,
    score_efectivo: opd.score_efectivo,
    bloqueada:      opd.bloqueada ?? false,
    cliente_nombre: opd.cliente_nombre,
    comercial:      opd.comercial,
    // Campos de agrupación/lote no disponibles en la RPC cacheada
    categoria:      null,
    recurso_corte:  "morgan" as Enums<"recurso_corte_enum">,
    plan_congelado:            opd.plan_congelado ?? false,
    fecha_compromiso:          opd.fecha_compromiso ?? null,
    fecha_promesa_satelites:   null,
    promesa_fase:              null,
    fin_plan:                  null,
    prioridad_manual:          opd.prioridad_manual ?? null,
    subestado_satelite:        opd.subestado_satelite ?? null,
    slack_fase:                opd.slack_fase ?? null,
    semaforo_fase:             opd.semaforo_fase as Enums<"semaforo_enum"> | null,
    fecha_ingreso_fase:        opd.fecha_ingreso_fase ?? null,
    dias: { dias_fase_0: 5, dias_compras: 5, dias_trazo: 3, dias_corte: 4, dias_tiqueteo: 2, dias_satelites: 15, dias_empaque: 4, dias_despacho: 1 },
  }));
}

export function buildGanttData(payload: ProduccionPayload): GanttMeta {
  const planMap = new Map<string, PhasePlan[]>();
  for (const p of payload.plans) {
    const arr = planMap.get(p.opd_id) ?? [];
    arr.push({ fase: p.fase as Enums<"fase_enum">, start_date: p.start_date, due_date: p.due_date, dias: p.dias });
    planMap.set(p.opd_id, arr);
  }

  const baseMap = new Map<string, PhasePlan[]>();
  for (const p of payload.baseline) {
    const arr = baseMap.get(p.opd_id) ?? [];
    arr.push({ fase: p.fase as Enums<"fase_enum">, start_date: p.start_date, due_date: p.due_date, dias: p.dias });
    baseMap.set(p.opd_id, arr);
  }

  const rows: GanttRow[] = payload.opds.map(opd => ({
    opd_id:                   opd.opd_id,
    ref:                      opd.ref,
    op_num:                   opd.op_num,
    cliente_nombre:           opd.cliente_nombre,
    semaforo:                 opd.semaforo as Enums<"semaforo_enum"> | null,
    prioridad_manual:         opd.prioridad_manual ?? null,
    cantidad:                 opd.cantidad,
    score_efectivo:           opd.score_efectivo,
    fase_actual:              opd.fase_actual as Enums<"fase_enum">,
    detalle:                  opd.detalle,
    slack:                    opd.slack,
    fases:                    planMap.get(opd.opd_id) ?? [],
    baseline:                 baseMap.get(opd.opd_id) ?? [],
    fecha_compromiso:         opd.fecha_compromiso ?? null,
    comercial:                opd.comercial ?? null,
    bloqueada:                opd.bloqueada ?? null,
    dias_plan_restantes:      opd.dias_plan_restantes ?? null,
    pendientes:               opd.pendientes ?? 0,
    fecha_promesa_satelites:  opd.fecha_promesa_satelites ?? null,
    fecha_recepcion_satelites: opd.fecha_recepcion_satelites ?? null,
    recurso_corte:            opd.recurso_corte as Enums<"recurso_corte_enum"> | null,
    tipo_despacho:            opd.tipo_despacho as Enums<"tipo_despacho_enum"> | null,
    colores:                  opd.colores ?? null,
    motivo_bloqueo:           opd.motivo_bloqueo as Enums<"motivo_bloqueo_enum"> | null,
    causa_desvio:             opd.causa_desvio as Enums<"causa_desvio_enum"> | null,
    slack_fase:               opd.slack_fase ?? null,
    semaforo_fase:            opd.semaforo_fase as Enums<"semaforo_enum"> | null,
    promesa_fase:             opd.promesa_fase ?? null,
    subestado_satelite:       opd.subestado_satelite as Enums<"satelite_subestado_enum"> | null,
    fecha_ingreso_fase:       opd.fecha_ingreso_fase ?? null,
  }));

  return { rows, festivos: payload.festivos };
}
