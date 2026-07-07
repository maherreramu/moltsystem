import { fetchPendientesData } from "@/lib/queries/pendientes";
import { PendientesClient } from "./pendientes-client";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/supabase";
export const revalidate = 30;
export default async function PendientesPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();

  let faseFiltro: Enums<"fase_enum"> | undefined;
  if (user?.email) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = await createServiceClient() as any;
    const { data: userInfo } = await svc.from("usuarios_sistema").select("id,rol").eq("email", user.email).single();
    if (userInfo?.rol === "lider_fase") {
      const { data: ufa } = await svc.from("usuario_fases_asignadas").select("fase").eq("usuario_id", userInfo.id).eq("solo_lectura", false).limit(1).maybeSingle();
      if (ufa?.fase) faseFiltro = ufa.fase as Enums<"fase_enum">;
    }
  }

  const data = await fetchPendientesData(faseFiltro);
  return <PendientesClient data={data} />;
}
