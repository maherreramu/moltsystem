import { createServiceClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/supabase";

export type OPDCola = {
  opd_id: string;
  ref: string;
  op_num: string;
  score_efectivo: number;
  score_calculado: number;
  score_override: number | null;
  pts_urgencia: number;
  pts_contractual: number;
  pts_estrategico: number;
  pts_complejidad: number;
  pts_velocidad: number;
  pts_caja: number;
  slack_dias: number | null;
  semaforo: Enums<"semaforo_enum"> | null;
  fase_actual: Enums<"fase_enum">;
  bloqueada: boolean;
  cliente_nombre: string;
};

export async function fetchColaData(): Promise<OPDCola[]> {
  const sb = await createServiceClient();

  const [{ data: scores }, { data: slack }, { data: clientes }, { data: clientesImpel }, { data: ops }] =
    await Promise.all([
      sb.from("v_score").select("*"),
      sb.from("v_slack").select("opd_id,semaforo,fase_actual,bloqueada,cliente_id"),
      sb.from("clientes").select("id,cliente_impel_id"),
      sb.from("clientes_impel").select("id_impel,razon_social"),
      sb.from("ops").select("op_num,cliente_id"),
    ]);

  const slackMap    = new Map((slack ?? []).map((s) => [s.opd_id, s]));
  const clienteMap  = new Map((clientes ?? []).map((c) => [c.id, c.cliente_impel_id]));
  const impelMap    = new Map((clientesImpel ?? []).map((c) => [c.id_impel, c.razon_social]));
  const opsMap      = new Map((ops ?? []).map((o) => [o.op_num, o.cliente_id]));

  return (scores ?? [])
    .filter((s) => s.opd_id && s.ref && s.op_num && s.score_efectivo != null)
    .map((s) => {
      const sl = slackMap.get(s.opd_id!);
      const clienteId  = opsMap.get(s.op_num!);
      const impelId    = clienteId ? clienteMap.get(clienteId) : null;
      return {
        opd_id:          s.opd_id!,
        ref:             s.ref!,
        op_num:          s.op_num!,
        score_efectivo:  s.score_efectivo ?? 0,
        score_calculado: s.score_calculado ?? 0,
        score_override:  s.score_override ?? null,
        pts_urgencia:    s.pts_urgencia ?? 0,
        pts_contractual: s.pts_contractual ?? 0,
        pts_estrategico: s.pts_estrategico ?? 0,
        pts_complejidad: s.pts_complejidad ?? 0,
        pts_velocidad:   s.pts_velocidad ?? 0,
        pts_caja:        s.pts_caja ?? 0,
        slack_dias:      s.slack_dias,
        semaforo:        (sl?.semaforo as Enums<"semaforo_enum">) ?? null,
        fase_actual:     (sl?.fase_actual as Enums<"fase_enum">) ?? "fase_0",
        bloqueada:       sl?.bloqueada ?? false,
        cliente_nombre:  impelId ? (impelMap.get(impelId) ?? "—") : "—",
      };
    })
    .sort((a, b) => b.score_efectivo - a.score_efectivo);
}
