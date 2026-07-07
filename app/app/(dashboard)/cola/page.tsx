import { fetchColaData } from "@/lib/queries/cola";
import { ColaClient } from "./cola-client";
export const revalidate = 30;
export default async function ColaPage() {
  const data = await fetchColaData();
  return <ColaClient data={data} />;
}
