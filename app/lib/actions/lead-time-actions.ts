"use server";

import { revalidatePath } from "next/cache";
import { createClient, createCachedServiceClient } from "@/lib/supabase/server";

const FASES_ORDEN = [
  "fase_0", "compras", "trazo", "corte",
  "tiqueteo", "satelites", "empaque", "despacho",
] as const;

async function assertIsAdmin() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("No autenticado");
  const svc = createCachedServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (svc as any).from("usuarios_sistema")
    .select("rol").eq("email", user.email).single();
  if (data?.rol !== "admin") throw new Error("Solo admin puede modificar los tiempos estándar");
}

export async function fetchLeadTimesEstandar(): Promise<{ fase: string; dias_default: number; condiciones: string | null }[]> {
  const sb = createCachedServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb as any)
    .from("lead_time_recurso")
    .select("fase, dias_default, condiciones")
    .eq("recurso", "estandar")
    .eq("activo", true)
    .order("fase");
  if (error) throw new Error(error.message);
  return (data ?? []).sort(
    (a: { fase: string }, b: { fase: string }) =>
      FASES_ORDEN.indexOf(a.fase as never) - FASES_ORDEN.indexOf(b.fase as never)
  );
}

export async function updateLeadTimeEstandar(fase: string, dias: number): Promise<void> {
  await assertIsAdmin();
  if (!FASES_ORDEN.includes(fase as never)) throw new Error(`Fase inválida: ${fase}`);
  if (!Number.isInteger(dias) || dias < 0 || dias > 90) throw new Error("Días debe ser entero entre 0 y 90");

  const sb = createCachedServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any)
    .from("lead_time_recurso")
    .update({ dias_default: dias })
    .eq("fase", fase)
    .eq("recurso", "estandar");
  if (error) throw new Error(error.message);
  revalidatePath("/admin/config");
}

export async function bulkUpdateLeadTimesEstandar(
  items: { fase: string; dias: number }[]
): Promise<void> {
  await assertIsAdmin();
  const validFases = new Set(FASES_ORDEN);
  for (const { fase, dias } of items) {
    if (!validFases.has(fase as never)) throw new Error(`Fase inválida: ${fase}`);
    if (!Number.isInteger(dias) || dias < 0 || dias > 90)
      throw new Error(`Días inválido para ${fase}: ${dias} (debe ser 0–90)`);
  }
  const sb = createCachedServiceClient();
  for (const { fase, dias } of items) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb as any)
      .from("lead_time_recurso")
      .update({ dias_default: dias })
      .eq("fase", fase)
      .eq("recurso", "estandar");
    if (error) throw new Error(error.message);
  }
  revalidatePath("/admin/config");
}
