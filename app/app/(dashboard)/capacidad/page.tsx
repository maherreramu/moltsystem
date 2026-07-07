import { fetchCapacidadData } from "@/lib/queries/capacidad";
import { CapacidadGrid } from "@/components/capacidad/capacidad-grid";
export const revalidate = 60;
export default async function CapacidadPage() {
  const data = await fetchCapacidadData();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Capacidad</h1>
        <span className="text-sm text-gray-500">OP-Ds simultáneas por semana × fase</span>
      </div>
      <CapacidadGrid data={data} />
    </div>
  );
}
