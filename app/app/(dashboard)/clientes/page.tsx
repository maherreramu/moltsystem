import { fetchClientesData } from "@/lib/queries/clientes";
import { ClientesClient } from "./clientes-client";

export const revalidate = 60;

export default async function ClientesPage() {
  const data = await fetchClientesData();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Clientes</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Caracterización de atributos que alimentan el score de priorización
          </p>
        </div>
      </div>
      <ClientesClient data={data} />
    </div>
  );
}
