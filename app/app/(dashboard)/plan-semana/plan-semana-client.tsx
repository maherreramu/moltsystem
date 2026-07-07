"use client";

import { useState, useTransition } from "react";
import { PlanSemanaView } from "@/components/plan-semana/plan-semana-view";
import { OPDDetailDrawer } from "@/components/drawer/opd-detail-drawer";
import { fetchPlanSemanaWeek } from "@/lib/actions/plan-semana-actions";
import type { OPDFoco } from "@/lib/queries/plan-semana";

export function PlanSemanaClient({ data }: { data: OPDFoco[] }) {
  const [sel, setSel]         = useState<string | null>(null);
  const [offset, setOffset]   = useState(0);
  const [semData, setSemData] = useState<OPDFoco[]>(data);
  const [isPending, start]    = useTransition();

  function navegar(nuevoOffset: number) {
    start(async () => {
      const d = await fetchPlanSemanaWeek(nuevoOffset);
      setSemData(d);
      setOffset(nuevoOffset);
    });
  }

  return (
    <>
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Plan de la semana</h1>
        <PlanSemanaView
          data={semData}
          offset={offset}
          isPending={isPending}
          onSelectOpd={setSel}
          onNavegar={navegar}
        />
      </div>
      <OPDDetailDrawer opdId={sel} onClose={() => setSel(null)} />
    </>
  );
}
