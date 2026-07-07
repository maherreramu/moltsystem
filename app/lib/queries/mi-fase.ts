import { createServiceClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/supabase";
import { FASES_ORDEN } from "@/lib/fases";

export type OPDMiFase = {
  opd_id: string;
  ref: string;
  op_num: string;
  cliente: string;
  cantidad: number;
  detalle: string | null;
  fase_actual: Enums<"fase_enum">;
  semaforo: Enums<"semaforo_enum"> | null;
  slack: number | null;
  score_efectivo: number | null;
  fecha_fin_planeada: string | null;
  bloqueada: boolean;
  motivo_bloqueo: Enums<"motivo_bloqueo_enum"> | null;
  pendientes_abiertos: number;
  componentes_total: number;
  componentes_cortados: number;
  cantidad_objetivo_total: number;
  cantidad_cortada_total: number;
  cantidad_tiqueteada_total: number;
  prendas_completas: number;
  fecha_promesa_satelites: string | null;
  subestado_satelite: Enums<"satelite_subestado_enum"> | null;
  fecha_compromiso: string | null;
  slack_fase: number | null;
  semaforo_fase: Enums<"semaforo_enum"> | null;
  prioridad_fase: number | null;
  paquete_completo: boolean;
  uds_en_fase: number;
  uds_recibidas_empaque: number | null;
  fecha_ingreso_fase: string | null;
};

export type PendienteMiFase = {
  id: string;
  opd_padre_id: string;
  opd_ref: string;
  fase_origen: Enums<"fase_enum">;
  fase_actual: Enums<"fase_enum">;
  motivo: Enums<"causa_desvio_enum">;
  cantidad_afectada: number;
  estado: Enums<"pendiente_estado_enum">;
  fecha_compromiso_subsanacion: string | null;
  responsable: string | null;
  notas: string | null;
  dias_abierto: number;
  puede_avanzar: boolean; // false si ya está en despacho
};

export async function fetchPendientesMiFase(): Promise<PendienteMiFase[]> {
  const sb = await createServiceClient();
  const { data } = await sb
    .from("v_pendientes_abiertos")
    .select("*")
    .order("created_at", { ascending: true });

  return (data ?? [])
    .filter(r => r.id && r.opd_ref)
    .map(r => {
      const faseActual = r.fase_actual as Enums<"fase_enum">;
      const idx = FASES_ORDEN.indexOf(faseActual);
      return {
        id:                           r.id!,
        opd_padre_id:                 r.opd_padre_id ?? "",
        opd_ref:                      r.opd_ref!,
        fase_origen:                  r.fase_origen as Enums<"fase_enum">,
        fase_actual:                  faseActual,
        motivo:                       r.motivo as Enums<"causa_desvio_enum">,
        cantidad_afectada:            r.cantidad_afectada ?? 0,
        estado:                       r.estado as Enums<"pendiente_estado_enum">,
        fecha_compromiso_subsanacion: r.fecha_compromiso_subsanacion ?? null,
        responsable:                  r.responsable ?? null,
        notas:                        r.notas ?? null,
        dias_abierto:                 r.dias_abierto ?? 0,
        puede_avanzar:                idx >= 0 && idx < FASES_ORDEN.length - 1,
      };
    });
}

export async function fetchMiFaseData(fase?: Enums<"fase_enum"> | Enums<"fase_enum">[] | null, ocultarGlobales?: boolean): Promise<OPDMiFase[]> {
  const sb = await createServiceClient();
  let q = sb.from("v_mi_fase_hoy").select("*").order("score_efectivo", { ascending: false });
  if (fase) q = Array.isArray(fase) ? q.in("fase_actual", fase) : q.eq("fase_actual", fase);

  const { data } = await q;
  const rows = (data ?? []).filter((r) => r.opd_id && r.ref);

  // Conteo de telas y cantidades por OP-D — para progreso de corte/tiqueteo.
  const opdIds = rows.map((r) => r.opd_id!);
  type CompAcc = { total: number; cortados: number; obj: number; cort: number; tiq: number; minTiq: number };
  const cortadosMap = new Map<string, CompAcc>();
  if (opdIds.length) {
    const { data: comps } = await sb
      .from("op_d_componentes")
      .select("opd_id,cortado,cantidad_objetivo,cantidad_cortada,cantidad_tiqueteada")
      .in("opd_id", opdIds);
    for (const c of comps ?? []) {
      const acc = cortadosMap.get(c.opd_id) ?? { total: 0, cortados: 0, obj: 0, cort: 0, tiq: 0, minTiq: Infinity };
      acc.total += 1;
      if (c.cortado) acc.cortados += 1;
      acc.obj  += (c.cantidad_objetivo   ?? 0);
      acc.cort += (c.cantidad_cortada    ?? 0);
      acc.tiq  += (c.cantidad_tiqueteada ?? 0);
      if ((c.cantidad_objetivo ?? 0) > 0) acc.minTiq = Math.min(acc.minTiq, c.cantidad_tiqueteada ?? 0);
      cortadosMap.set(c.opd_id, acc);
    }
  }

  return rows.map((r) => {
    const comp = cortadosMap.get(r.opd_id!) ?? { total: 0, cortados: 0, obj: 0, cort: 0, tiq: 0, minTiq: Infinity };
    return {
      opd_id:             r.opd_id!,
      ref:                r.ref!,
      op_num:             r.op_num ?? "",
      cliente:            r.cliente ?? "—",
      cantidad:           r.cantidad ?? 0,
      detalle:            r.detalle ?? null,
      fase_actual:        r.fase_actual as Enums<"fase_enum">,
      semaforo:           ocultarGlobales ? null : (r.semaforo as Enums<"semaforo_enum"> | null),
      slack:              ocultarGlobales ? null : (r.slack ?? null),
      score_efectivo:     ocultarGlobales ? null : (r.score_efectivo ?? null),
      fecha_fin_planeada: r.fecha_fin_planeada,
      bloqueada:          r.bloqueada ?? false,
      motivo_bloqueo:     r.motivo_bloqueo as Enums<"motivo_bloqueo_enum"> | null,
      pendientes_abiertos:    r.pendientes_abiertos ?? 0,
      componentes_total:      comp.total,
      componentes_cortados:   comp.cortados,
      cantidad_objetivo_total:    comp.obj,
      cantidad_cortada_total:     comp.cort,
      cantidad_tiqueteada_total:  comp.tiq,
      prendas_completas:          comp.minTiq === Infinity ? 0 : comp.minTiq,
      fecha_promesa_satelites:    r.fecha_promesa_satelites ?? null,
      subestado_satelite:         (r.subestado_satelite as Enums<"satelite_subestado_enum"> | null) ?? null,
      fecha_compromiso:           ocultarGlobales ? null : ((r as Record<string, unknown>).fecha_compromiso as string | null ?? null),
      slack_fase:                 (r as Record<string, unknown>).slack_fase as number | null ?? null,
      semaforo_fase:              (r as Record<string, unknown>).semaforo_fase as Enums<"semaforo_enum"> | null ?? null,
      prioridad_fase:             (r as Record<string, unknown>).prioridad_fase as number | null ?? null,
      paquete_completo:           (r as Record<string, unknown>).paquete_completo as boolean ?? false,
      uds_en_fase:                (r as Record<string, unknown>).uds_en_fase as number ?? (r as Record<string, unknown>).cantidad as number,
      uds_recibidas_empaque:      (r as Record<string, unknown>).uds_recibidas_empaque as number | null ?? null,
      fecha_ingreso_fase:         (r as Record<string, unknown>).fecha_ingreso_fase as string | null ?? null,
    };
  });
}
