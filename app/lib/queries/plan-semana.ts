import { createServiceClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/supabase";

export type OPDFoco = {
  opd_id: string;
  ref: string;
  op_num: string;
  cliente: string;
  fase_actual: Enums<"fase_enum">;
  fase_objetivo: Enums<"fase_enum">;
  start_date: string;
  due_date: string;
  semaforo: Enums<"semaforo_enum"> | null;
  slack: number | null;
  score_efectivo: number | null;
  bloqueada: boolean;
  motivo_bloqueo: Enums<"motivo_bloqueo_enum"> | null;
};

export async function fetchPlanSemanaData(): Promise<OPDFoco[]> {
  const sb = await createServiceClient();
  const { data } = await sb
    .from("v_foco_semanal")
    .select("*")
    .order("score_efectivo", { ascending: false });

  return (data ?? [])
    .filter((r) => r.opd_id && r.ref)
    .map((r) => ({
      opd_id:        r.opd_id!,
      ref:           r.ref!,
      op_num:        r.op_num ?? "",
      cliente:       r.cliente ?? "—",
      fase_actual:   r.fase_actual as Enums<"fase_enum">,
      fase_objetivo: r.fase_objetivo_semana as Enums<"fase_enum">,
      start_date:    r.start_date ?? "",
      due_date:      r.due_date ?? "",
      semaforo:      r.semaforo as Enums<"semaforo_enum"> | null,
      slack:         r.slack,
      score_efectivo: r.score_efectivo,
      bloqueada:     r.bloqueada ?? false,
      motivo_bloqueo: r.motivo_bloqueo as Enums<"motivo_bloqueo_enum"> | null,
    }));
}
