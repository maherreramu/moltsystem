import { createServiceClient } from "@/lib/supabase/server";
import { ActividadClient } from "./actividad-client";

export const revalidate = 15;

export type EventoLog = {
  id: string;
  opd_id: string;
  ref: string;
  op_num: string;
  tipo: string;
  actor: string;
  fase: string | null;
  payload: Record<string, unknown> | null;
  ts: string;
};

type EventoRow = {
  id: string;
  opd_id: string;
  tipo: string;
  actor: string;
  fase: string | null;
  payload: Record<string, unknown> | null;
  ts: string;
  op_ds?: { ref?: string | null; op_num?: string | null } | null;
};

export default async function ActividadPage() {
  const sb = await createServiceClient();

  const { data } = await sb
    .from("phase_events")
    .select(`
      id, opd_id, tipo, actor, fase, payload, ts,
      op_ds!inner(ref, op_num)
    `)
    .not("tipo", "in", "(op_arrival)")   // excluir ruido de carga inicial
    .order("ts", { ascending: false })
    .limit(500);

  const eventos: EventoLog[] = ((data ?? []) as EventoRow[]).map((e) => ({
    id:     e.id,
    opd_id: e.opd_id,
    ref:    e.op_ds?.ref    ?? "",
    op_num: e.op_ds?.op_num ?? "",
    tipo:   e.tipo,
    actor:  e.actor,
    fase:   e.fase,
    payload: e.payload,
    ts:     e.ts,
  }));

  return <ActividadClient eventos={eventos} />;
}
