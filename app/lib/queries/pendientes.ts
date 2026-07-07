import { createServiceClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/supabase";

export type Pendiente = {
  id: string;
  opd_padre_id: string;
  opd_ref: string;
  op_num: string;
  cantidad_total_opd: number;
  fase_origen: Enums<"fase_enum">;
  fase_actual: Enums<"fase_enum">;
  motivo: Enums<"causa_desvio_enum">;
  cantidad_afectada: number;
  estado: Enums<"pendiente_estado_enum">;
  urgencia: "vencido" | "urgente" | "en_curso";
  fecha_compromiso_subsanacion: string | null;
  responsable: string | null;
  notas: string | null;
  dias_abierto: number;
};

export async function fetchPendientesData(fase?: Enums<"fase_enum">): Promise<Pendiente[]> {
  const sb = await createServiceClient();
  let q = sb
    .from("v_pendientes_abiertos")
    .select("*")
    .order("fecha_compromiso_subsanacion", { ascending: true, nullsFirst: false });
  if (fase) q = q.eq("fase_actual", fase);
  const { data } = await q;

  return (data ?? [])
    .filter((r) => r.id && r.opd_ref)
    .map((r) => ({
      id:                           r.id!,
      opd_padre_id:                 r.opd_padre_id ?? "",
      opd_ref:                      r.opd_ref!,
      op_num:                       r.op_num ?? "",
      fase_origen:                  r.fase_origen as Enums<"fase_enum">,
      fase_actual:                  r.fase_actual as Enums<"fase_enum">,
      motivo:                       r.motivo as Enums<"causa_desvio_enum">,
      cantidad_total_opd:           r.cantidad_total_opd ?? 0,
      cantidad_afectada:            r.cantidad_afectada ?? 0,
      estado:                       r.estado as Enums<"pendiente_estado_enum">,
      urgencia:                     (r.urgencia ?? "en_curso") as "vencido" | "urgente" | "en_curso",
      fecha_compromiso_subsanacion: r.fecha_compromiso_subsanacion,
      responsable:                  r.responsable,
      notas:                        r.notas,
      dias_abierto:                 r.dias_abierto ?? 0,
    }));
}
