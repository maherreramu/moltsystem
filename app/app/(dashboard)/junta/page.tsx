import { createServiceClient } from "@/lib/supabase/server";
import { fetchColaData } from "@/lib/queries/cola";
import { fetchPlanSemanaData } from "@/lib/queries/plan-semana";
import { fetchPendientesData } from "@/lib/queries/pendientes";
import { fetchCapacidadData } from "@/lib/queries/capacidad";
import { JuntaClient } from "./junta-client";

export const revalidate = 30;

export default async function JuntaPage() {
  const [cola, foco, pendientes, capacidad] = await Promise.all([
    fetchColaData(),
    fetchPlanSemanaData(),
    fetchPendientesData(),
    fetchCapacidadData(),
  ]);

  // Bloqueos activos (bloqueadas sin resolver)
  const sb = await createServiceClient();
  const { data: bloqueos } = await sb
    .from("op_ds")
    .select("id,ref,op_num,motivo_bloqueo,fase_actual,updated_at")
    .eq("bloqueada", true)
    .eq("activa", true)
    .order("updated_at", { ascending: true })
    .limit(30);

  return (
    <JuntaClient
      cola={cola.slice(0, 20)}
      foco={foco}
      pendientes={pendientes}
      capacidad={capacidad}
      bloqueos={bloqueos ?? []}
    />
  );
}
