"use server";

import { revalidatePath } from "next/cache";
import { createClient, createCachedServiceClient, createAdminClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/supabase";

async function assertIsAdmin() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("No autenticado");
  const svc = createCachedServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (svc as any).from("usuarios_sistema")
    .select("rol").eq("email", user.email).single();
  if (data?.rol !== "admin") throw new Error("Solo admin puede modificar la configuración de semáforo");
}

export type SemaforoConfigRow = {
  scope: string;
  fase: Enums<"fase_enum"> | null;
  umbral_verde: number;
  umbral_amarillo: number;
};

export async function fetchSemaforoConfig(): Promise<SemaforoConfigRow[]> {
  const sb = createCachedServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb as any)
    .from("semaforo_config")
    .select("scope,fase,umbral_verde,umbral_amarillo");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertSemaforoRegla(
  scope: string,
  fase: string | null,
  umbralVerde: number,
  umbralAmarillo: number,
): Promise<void> {
  await assertIsAdmin();
  if (!Number.isInteger(umbralVerde) || !Number.isInteger(umbralAmarillo))
    throw new Error("Los umbrales deben ser enteros");
  if (umbralVerde <= umbralAmarillo)
    throw new Error("El umbral verde debe ser mayor al umbral amarillo");

  const sbAny = createAdminClient();

  // Buscar fila existente
  const query = fase
    ? sbAny.from("semaforo_config").select("umbral_verde").eq("scope", scope).eq("fase", fase)
    : sbAny.from("semaforo_config").select("umbral_verde").eq("scope", scope).is("fase", null);

  const { data: existing } = await query.maybeSingle();

  if (existing) {
    const upd = fase
      ? sbAny.from("semaforo_config").update({ umbral_verde: umbralVerde, umbral_amarillo: umbralAmarillo, updated_at: new Date().toISOString() }).eq("scope", scope).eq("fase", fase)
      : sbAny.from("semaforo_config").update({ umbral_verde: umbralVerde, umbral_amarillo: umbralAmarillo, updated_at: new Date().toISOString() }).eq("scope", scope).is("fase", null);
    const { error } = await upd;
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sbAny.from("semaforo_config").insert({
      scope,
      fase: fase || null,
      umbral_verde: umbralVerde,
      umbral_amarillo: umbralAmarillo,
    });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/admin/config");
}
