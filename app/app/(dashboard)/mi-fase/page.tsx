import { fetchMiFaseData, fetchPendientesMiFase } from "@/lib/queries/mi-fase";
import { MiFaseClient } from "./mi-fase-client";
import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/supabase";
import { fetchPhaseJumpsConfig } from "@/lib/actions/phase-jumps-actions";
export const revalidate = 30;
export default async function MiFasePage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();

  let fasesVisibles: Enums<"fase_enum">[] | null = null;
  let fasesOperativas: Enums<"fase_enum">[] = [];
  let rol: string | null = null;
  if (user?.email) {
    const svc = await createServiceClient();
    const { data: userInfo } = await svc.from("usuarios_sistema").select("id, rol").eq("email", user.email).single();
    rol = userInfo?.rol ?? null;

    if (userInfo && rol === "lider_fase") {
      const { data: ufa } = await svc.from("usuario_fases_asignadas").select("fase, solo_lectura").eq("usuario_id", userInfo.id);
      if (ufa) {
        fasesVisibles = ufa.map((u) => u.fase);
        fasesOperativas = ufa.filter((u) => !u.solo_lectura).map((u) => u.fase);
      }
    }
  }

  const esLider = rol === "lider_fase";

  const [data, pendientes, liderJumps] = await Promise.all([
    fetchMiFaseData(fasesVisibles, esLider),
    fetchPendientesMiFase(),
    fetchPhaseJumpsConfig(),
  ]);
  return <MiFaseClient data={data} pendientes={pendientes} fasesOperativas={fasesOperativas} esLider={esLider} rol={rol} liderJumps={liderJumps} />;
}
