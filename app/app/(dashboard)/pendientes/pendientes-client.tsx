"use client";
import { useState } from "react";
import { PendientesList } from "@/components/pendientes/pendientes-list";
import { OPDDetailDrawer } from "@/components/drawer/opd-detail-drawer";
import type { Pendiente } from "@/lib/queries/pendientes";
export function PendientesClient({ data }: { data: Pendiente[] }) {
  const [sel, setSel] = useState<string | null>(null);
  return (
    <>
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Pendientes abiertos</h1>
        <PendientesList data={data} onSelectOpd={setSel} />
      </div>
      <OPDDetailDrawer opdId={sel} onClose={() => setSel(null)} />
    </>
  );
}
