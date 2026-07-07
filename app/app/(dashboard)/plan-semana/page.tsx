import { fetchPlanSemanaData } from "@/lib/queries/plan-semana";
import { PlanSemanaClient } from "./plan-semana-client";
export const revalidate = 30;
export default async function PlanSemanaPage() {
  const data = await fetchPlanSemanaData();
  return <PlanSemanaClient data={data} />;
}
