"use server";

import { createCachedServiceClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/supabase";
import { getLunesDeOffset, toISODate } from "@/lib/format";
import type { OPDFoco } from "@/lib/queries/plan-semana";

type RawFoco = {
  opd_id: string;
  ref: string;
  op_num: string;
  cliente: string;
  fase_actual: string;
  fase_objetivo: string;
  start_date: string;
  due_date: string;
  semaforo: string | null;
  slack: number | null;
  score_efectivo: number | null;
  bloqueada: boolean;
  motivo_bloqueo: string | null;
};

export async function fetchPlanSemanaWeek(offsetSemanas: number): Promise<OPDFoco[]> {
  const sb     = createCachedServiceClient();
  const lunes  = getLunesDeOffset(offsetSemanas);
  const lunesISO = toISODate(lunes);

  const { data, error } = await sb.rpc("get_plan_semana" as never, { p_lunes: lunesISO } as never);
  if (error) throw new Error(`get_plan_semana: ${(error as { message: string }).message}`);

  return ((data as RawFoco[]) ?? []).map(r => ({
    opd_id:         r.opd_id,
    ref:            r.ref,
    op_num:         r.op_num ?? "",
    cliente:        r.cliente ?? "—",
    fase_actual:    r.fase_actual as Enums<"fase_enum">,
    fase_objetivo:  r.fase_objetivo as Enums<"fase_enum">,
    start_date:     r.start_date ?? "",
    due_date:       r.due_date ?? "",
    semaforo:       r.semaforo as Enums<"semaforo_enum"> | null,
    slack:          r.slack,
    score_efectivo: r.score_efectivo,
    bloqueada:      r.bloqueada ?? false,
    motivo_bloqueo: r.motivo_bloqueo as Enums<"motivo_bloqueo_enum"> | null,
  }));
}
