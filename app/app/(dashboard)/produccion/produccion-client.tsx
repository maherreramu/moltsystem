"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { OPDTable } from "@/components/tabla/opd-table";
import { TiemposTable } from "@/components/tabla/tiempos-table";
import { GanttChart } from "@/components/gantt/gantt-chart";
import { GanttPorFase } from "@/components/gantt/gantt-por-fase";
import { OPDDetailDrawer } from "@/components/drawer/opd-detail-drawer";
import type { KanbanData, OPDWithMeta } from "@/lib/queries/kanban";
import type { OPDTabla } from "@/lib/queries/tabla";
import type { GanttMeta } from "@/lib/queries/gantt";
import type { AllUiPrefs } from "@/lib/queries/ui-prefs";
import { saveUiPrefs } from "@/lib/actions/ui-prefs-actions";
import type { Enums } from "@/types/supabase";
import type { LiderJump } from "@/lib/actions/phase-jumps-actions";

type Props = {
  kanban: KanbanData;
  tabla: OPDTabla[];
  gantt: GanttMeta;
  tiempos: OPDTabla[];
  uiPrefs: AllUiPrefs;
  puedeEditarCompromiso: boolean;
  userRol?: string | null;
  liderJumps?: LiderJump[];
};

export default function ProduccionClient({ kanban, tabla, gantt, tiempos, uiPrefs, puedeEditarCompromiso, userRol = null, liderJumps = [] }: Props) {
  const [opdSeleccionado, setOpdSeleccionado] = useState<string | null>(null);
  const [opdSemaforo, setOpdSemaforo] = useState<Enums<"semaforo_enum"> | null>(null);
  const [ocultarCierre, setOcultarCierre] = useState(true);
  const totalOpds = Object.values(kanban.totales).reduce((a, b) => a + b, 0);
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tablaFiltrada  = useMemo(() => ocultarCierre ? tabla.filter(o => o.fase_actual !== "cierre") : tabla, [tabla, ocultarCierre]);
  const tiemposFiltrados = useMemo(() => ocultarCierre ? tiempos.filter(o => o.fase_actual !== "cierre") : tiempos, [tiempos, ocultarCierre]);
  const ganttFiltrado  = useMemo(() => ocultarCierre ? { ...gantt, rows: gantt.rows.filter(r => r.fase_actual !== "cierre") } : gantt, [gantt, ocultarCierre]);

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel("produccion-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "op_ds" }, () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => router.refresh(), 800);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "op_d_pendientes" }, () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => router.refresh(), 800);
      })
      .subscribe();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(ch);
    };
  }, [router]);

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Producción</h1>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer" title="Las OP-Ds en fase Cierre se archivan automáticamente tras 30 días">
              <input type="checkbox" checked={ocultarCierre} onChange={e => setOcultarCierre(e.target.checked)} className="cursor-pointer" />
              Ocultar cierre
            </label>
            <span className="text-sm text-gray-500">{totalOpds} OP-Ds activas</span>
          </div>
        </div>

        <Tabs defaultValue="kanban">
          <TabsList>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
            <TabsTrigger value="wip">WIP</TabsTrigger>
            <TabsTrigger value="prioridad">Gantt por fase</TabsTrigger>
            <TabsTrigger value="tabla">Tabla</TabsTrigger>
            <TabsTrigger value="tiempos">Tiempos</TabsTrigger>
          </TabsList>

          <TabsContent value="kanban" className="mt-4">
            <KanbanBoard data={kanban} onSelectOpd={(o: OPDWithMeta) => {
              setOpdSeleccionado(o.opd_id);
              setOpdSemaforo(o.semaforo);
            }} />
          </TabsContent>

          <TabsContent value="wip" className="mt-4">
            <GanttChart
              data={ganttFiltrado.rows}
              festivos={ganttFiltrado.festivos}
              onSelectOpd={(id) => { setOpdSeleccionado(id); setOpdSemaforo(null); }}
              readOnly
              initialPrefs={uiPrefs["gantt"]}
              onSavePrefs={saveUiPrefs}
            />
          </TabsContent>

          <TabsContent value="prioridad" className="mt-4">
            <GanttPorFase
              allRows={ganttFiltrado.rows}
              festivos={ganttFiltrado.festivos}
              onSelectOpd={(id) => { setOpdSeleccionado(id); setOpdSemaforo(null); }}
              initialPrefs={uiPrefs["gantt-por-fase"]}
              onSavePrefs={saveUiPrefs}
            />
          </TabsContent>

          <TabsContent value="tabla" className="mt-4">
            <OPDTable data={tablaFiltrada} puedeEditarCompromiso={puedeEditarCompromiso} onSelectOpd={(o: OPDTabla) => {
              setOpdSeleccionado(o.opd_id);
              setOpdSemaforo(null);
            }} />
          </TabsContent>

          <TabsContent value="tiempos" className="mt-4">
            <TiemposTable data={tiemposFiltrados} />
          </TabsContent>
        </Tabs>
      </div>

      <OPDDetailDrawer opdId={opdSeleccionado} semaforo={opdSemaforo} puedeEditarCompromiso={puedeEditarCompromiso} onClose={() => { setOpdSeleccionado(null); setOpdSemaforo(null); }} userRol={userRol} liderJumpsDrawer={liderJumps} />
    </>
  );
}
