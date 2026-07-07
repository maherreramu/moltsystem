import { createServiceClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/supabase";

export type DiasFase =
  | "dias_fase_0" | "dias_compras" | "dias_trazo" | "dias_corte"
  | "dias_tiqueteo" | "dias_satelites" | "dias_empaque" | "dias_despacho";

export type OPDTabla = {
  opd_id: string;
  ref: string;
  op_num: string;
  detalle: string | null;
  cantidad: number;
  fase_actual: Enums<"fase_enum">;
  semaforo: Enums<"semaforo_enum"> | null;
  slack: number | null;
  score_efectivo: number | null;
  bloqueada: boolean;
  cliente_nombre: string;
  comercial: string | null;
  categoria: string | null;
  recurso_corte: Enums<"recurso_corte_enum">;
  plan_congelado: boolean;
  fecha_compromiso: string | null;
  fecha_promesa_satelites: string | null;
  promesa_fase: string | null;
  fin_plan: string | null;
  prioridad_manual: number | null;
  subestado_satelite: string | null;
  slack_fase: number | null;
  semaforo_fase: Enums<"semaforo_enum"> | null;
  fecha_ingreso_fase: string | null;
  dias: Record<DiasFase, number>;
};

export async function fetchTablaData(): Promise<OPDTabla[]> {
  const supabase = await createServiceClient();

  const [{ data: slack }, { data: scores }, { data: opds }, { data: ops }, { data: clientes }, { data: clientesImpel }, { data: categorias }, { data: phasePromises }, { data: phasePlans }] =
    await Promise.all([
      supabase.from("v_slack").select("opd_id,ref,op_num,fase_actual,semaforo,slack,bloqueada,cliente_id"),
      supabase.from("v_score").select("opd_id,score_efectivo"),
      supabase.from("op_ds").select("id,detalle,cantidad,categoria_proc_id,recurso_corte,plan_congelado,fecha_promesa_satelites,dias_fase_0,dias_compras,dias_trazo,dias_corte,dias_tiqueteo,dias_satelites,dias_empaque,dias_despacho").eq("activa", true),
      supabase.from("ops").select("op_num,comercial,cliente_id,fecha_compromiso"),
      supabase.from("clientes").select("id,cliente_impel_id"),
      supabase.from("clientes_impel").select("id_impel,razon_social"),
      supabase.from("categorias_proc").select("id,nombre"),
      supabase.from("phase_promises").select("opd_id,fase,fecha_promesa"),
      supabase.from("phase_plans").select("opd_id,fase,due_date"),
    ]);

  const scoreMap = new Map((scores ?? []).map((s) => [s.opd_id, s.score_efectivo]));
  const categoriaMap = new Map((categorias ?? []).map((c) => [c.id, c.nombre]));
  const opdMeta = new Map((opds ?? []).map((o) => [o.id, o]));
  const opsMeta = new Map((ops ?? []).map((o) => [o.op_num, { comercial: o.comercial, cliente_id: o.cliente_id, fecha_compromiso: o.fecha_compromiso ?? null }]));
  const clienteIdToImpel = new Map((clientes ?? []).map((c) => [c.id, c.cliente_impel_id]));
  const impelToNombre = new Map((clientesImpel ?? []).map((c) => [c.id_impel, c.razon_social]));
  const promesaFaseMap = new Map((phasePromises ?? []).map((p) => [`${p.opd_id}:${p.fase}`, p.fecha_promesa]));
  const finPlanMap = new Map((phasePlans ?? []).map((p) => [`${p.opd_id}:${p.fase}`, p.due_date]));

  return (slack ?? [])
    .filter((s) => s.opd_id && s.ref && s.op_num)
    .map((s) => {
    const op = opsMeta.get(s.op_num!);
    const impelId = op?.cliente_id ? clienteIdToImpel.get(op.cliente_id) : null;
    const meta = opdMeta.get(s.opd_id!);
    return {
      opd_id: s.opd_id!,
      ref: s.ref!,
      op_num: s.op_num!,
      detalle: meta?.detalle ?? null,
      cantidad: meta?.cantidad ?? 0,
      fase_actual: s.fase_actual as Enums<"fase_enum">,
      semaforo: s.semaforo as Enums<"semaforo_enum"> | null,
      slack: s.slack,
      score_efectivo: scoreMap.get(s.opd_id) ?? null,
      bloqueada: s.bloqueada ?? false,
      cliente_nombre: impelId ? (impelToNombre.get(impelId) ?? "—") : "—",
      comercial: op?.comercial ?? null,
      categoria: meta?.categoria_proc_id ? (categoriaMap.get(meta.categoria_proc_id) ?? null) : null,
      recurso_corte: (meta?.recurso_corte ?? "morgan") as Enums<"recurso_corte_enum">,
      plan_congelado: meta?.plan_congelado ?? false,
      fecha_compromiso: op?.fecha_compromiso ?? null,
      fecha_promesa_satelites: meta?.fecha_promesa_satelites ?? null,
      promesa_fase: promesaFaseMap.get(`${s.opd_id}:${s.fase_actual}`) ?? null,
      fin_plan: finPlanMap.get(`${s.opd_id}:${s.fase_actual}`) ?? null,
      dias: {
        dias_fase_0:    meta?.dias_fase_0    ?? 5,
        dias_compras:   meta?.dias_compras   ?? 5,
        dias_trazo:     meta?.dias_trazo     ?? 3,
        dias_corte:     meta?.dias_corte     ?? 4,
        dias_tiqueteo:  meta?.dias_tiqueteo  ?? 2,
        dias_satelites: meta?.dias_satelites ?? 15,
        dias_empaque:   meta?.dias_empaque   ?? 4,
        dias_despacho:  meta?.dias_despacho  ?? 1,
      },
      prioridad_manual: null,
      subestado_satelite: null,
      slack_fase: null,
      semaforo_fase: null,
      fecha_ingreso_fase: null,
    };
  });
}
