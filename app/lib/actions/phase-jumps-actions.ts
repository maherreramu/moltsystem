"use server";

import { revalidatePath } from "next/cache";
import { createClient, createCachedServiceClient, createAdminClient } from "@/lib/supabase/server";
import { FASES_ORDEN } from "@/lib/fases";

async function assertIsAdmin() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("No autenticado");
  const svc = createCachedServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (svc as any).from("usuarios_sistema")
    .select("rol").eq("email", user.email).single();
  if (data?.rol !== "admin") throw new Error("Solo admin puede modificar los saltos de fase");
}

export type LiderJump = { from_fase: string; to_fase: string; allowed: boolean };

export async function fetchPhaseJumpsConfig(): Promise<LiderJump[]> {
  const sb = createCachedServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb as any)
    .from("phase_jumps_config")
    .select("from_fase,to_fase,allowed");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertPhaseJump(fromFase: string, toFase: string, allowed: boolean): Promise<void> {
  await assertIsAdmin();
  if (!FASES_ORDEN.includes(fromFase as never)) throw new Error(`Fase origen inválida: ${fromFase}`);
  if (!FASES_ORDEN.includes(toFase as never)) throw new Error(`Fase destino inválida: ${toFase}`);
  const idxFrom = FASES_ORDEN.indexOf(fromFase as never);
  const idxTo   = FASES_ORDEN.indexOf(toFase as never);
  if (idxTo <= idxFrom) throw new Error("La fase destino debe ser posterior a la origen");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = createAdminClient() as any;
  const { error } = await sbAny.from("phase_jumps_config")
    .upsert({ from_fase: fromFase, to_fase: toFase, allowed, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/config");
}
