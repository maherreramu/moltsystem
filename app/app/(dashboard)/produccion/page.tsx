import { Suspense } from "react";
import { fetchProduccionData, buildKanbanData, buildTablaData, buildGanttData } from "@/lib/queries/produccion";
import { fetchTablaData } from "@/lib/queries/tabla";
import { fetchUiPrefs, fetchCurrentRol } from "@/lib/queries/ui-prefs";
import { fetchPhaseJumpsConfig } from "@/lib/actions/phase-jumps-actions";
import ProduccionClient from "./produccion-client";

export const revalidate = 60; // fallback ISR; unstable_cache en produccion.ts maneja el cache principal

export default async function ProduccionPage() {
  const [payload, tiemposData, uiPrefs, rol, liderJumps] = await Promise.all([
    fetchProduccionData(),
    fetchTablaData(),
    fetchUiPrefs(),
    fetchCurrentRol(),
    fetchPhaseJumpsConfig(),
  ]);
  const puedeEditarCompromiso = ["admin", "directivo"].includes(rol ?? "");

  return (
    <Suspense fallback={<div className="text-gray-400 text-sm">Cargando producción…</div>}>
      <ProduccionClient
        kanban={buildKanbanData(payload)}
        tabla={buildTablaData(payload)}
        gantt={buildGanttData(payload)}
        tiempos={tiemposData}
        uiPrefs={uiPrefs}
        puedeEditarCompromiso={puedeEditarCompromiso}
        userRol={rol}
        liderJumps={liderJumps}
      />
    </Suspense>
  );
}
