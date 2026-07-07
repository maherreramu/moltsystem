import { unstable_cache } from "next/cache";
import { createCachedServiceClient } from "@/lib/supabase/server";

export type ClienteRow = {
  id: string;
  nombre: string;
  tier: string;
  tipo_relacion: string;
  condicion_pago: string;
  complejidad_tipica: string;
  es_manual: boolean;
  homologado_a: string | null;
  homologado_a_nombre: string | null;
  n_ops_activas: number;
};

export const fetchClientesData = unstable_cache(
  async (): Promise<ClienteRow[]> => {
    const sb = createCachedServiceClient();
    const { data, error } = await sb.rpc("get_clientes_data" as never);
    if (error) throw new Error(`get_clientes_data: ${(error as { message: string }).message}`);
    return Array.isArray(data) ? (data as ClienteRow[]) : [];
  },
  ["clientes-data"],
  { revalidate: 120, tags: ["clientes"] }
);
