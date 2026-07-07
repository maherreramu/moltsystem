"use client";

import { useState, useMemo, useTransition } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import type { KanbanData, OPDWithMeta } from "@/lib/queries/kanban";
import { FASES_ORDEN, FASE_LABEL } from "@/lib/fases";
import { OPDCard } from "./opd-card";
import { advancePhase } from "@/lib/actions/opd-actions";
import type { Enums } from "@/types/supabase";

type Filtros = {
  semaforo: Enums<"semaforo_enum"> | "todos";
  busqueda: string;
};

type Props = {
  data: KanbanData;
  onSelectOpd: (opd: OPDWithMeta) => void;
};

const SEMAFORO_BORDER: Record<Enums<"semaforo_enum">, string> = {
  verde:    "border-t-green-500",
  amarillo: "border-t-yellow-400",
  rojo:     "border-t-red-500",
};

// ─── Columna droppable ────────────────────────────────────────────────────────
function KanbanColumn({ fase, items, total, onSelectOpd, isDropTarget }: {
  fase: Enums<"fase_enum">;
  items: OPDWithMeta[];
  total: number;
  onSelectOpd: (opd: OPDWithMeta) => void;
  isDropTarget: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: fase });
  const hayRojo     = items.some(o => o.semaforo === "rojo");
  const hayAmarillo = items.some(o => o.semaforo === "amarillo");
  const dominante: Enums<"semaforo_enum"> = hayRojo ? "rojo" : hayAmarillo ? "amarillo" : "verde";

  return (
    <div
      ref={setNodeRef}
      className={`flex-none w-52 flex flex-col rounded-lg border-t-2 transition-colors ${
        total > 0 ? SEMAFORO_BORDER[dominante] : "border-t-gray-200"
      } ${isOver && isDropTarget ? "bg-blue-50/70 ring-4 ring-blue-400" : "bg-gray-50"}`}
    >
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">{FASE_LABEL[fase]}</span>
        <span className="text-xs font-medium bg-gray-200 text-gray-600 px-1.5 rounded-full">{total}</span>
      </div>
      <div className="relative flex-1">
        <div className="overflow-y-auto max-h-[calc(100vh-280px)] px-2 pb-2 space-y-2">
          {items.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">—</p>
          ) : (
            items.map(opd => (
              <DraggableCard key={opd.opd_id} opd={opd} onClick={onSelectOpd} />
            ))
          )}
        </div>
        {items.length > 4 && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-gray-50 to-transparent" />
        )}
      </div>
    </div>
  );
}

// ─── Card draggable ───────────────────────────────────────────────────────────
function DraggableCard({ opd, onClick }: { opd: OPDWithMeta; onClick: (o: OPDWithMeta) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: opd.opd_id,
    data: { opd },
  });

  const style = transform
    ? { transform: `translate(${transform.x}px,${transform.y}px)`, opacity: isDragging ? 0.4 : 1 }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}
      className="touch-none" suppressHydrationWarning>
      <OPDCard opd={opd} onClick={onClick} />
    </div>
  );
}

// ─── Board principal ──────────────────────────────────────────────────────────
export function KanbanBoard({ data, onSelectOpd }: Props) {
  const [filtros, setFiltros]       = useState<Filtros>({ semaforo: "todos", busqueda: "" });
  const [activeOpd, setActiveOpd]   = useState<OPDWithMeta | null>(null);
  const [validDrop, setValidDrop]   = useState<Enums<"fase_enum"> | null>(null);
  const [isPending, startTransition] = useTransition();
  const [moveMsg, setMoveMsg]       = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const columnasFiltradas = useMemo(() => {
    return Object.fromEntries(
      FASES_ORDEN.map(fase => [
        fase,
        data.columnas[fase].filter(opd => {
          if (filtros.semaforo !== "todos" && opd.semaforo !== filtros.semaforo) return false;
          if (filtros.busqueda) {
            const q = filtros.busqueda.toLowerCase();
            return opd.ref.toLowerCase().includes(q) || opd.cliente_nombre.toLowerCase().includes(q);
          }
          return true;
        }),
      ])
    ) as Record<Enums<"fase_enum">, OPDWithMeta[]>;
  }, [data, filtros]);

  const totalFiltrado = FASES_ORDEN.reduce((s, f) => s + columnasFiltradas[f].length, 0);

  function onDragStart(event: DragStartEvent) {
    const opd = event.active.data.current?.opd as OPDWithMeta;
    if (!opd) return;
    setActiveOpd(opd);
    // Calcular la única fase destino válida (la siguiente)
    const idx = FASES_ORDEN.indexOf(opd.fase_actual);
    setValidDrop(idx >= 0 && idx < FASES_ORDEN.length - 1 ? FASES_ORDEN[idx + 1] : null);
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveOpd(null);
    setValidDrop(null);

    if (!over || !activeOpd) return;
    const faseDest = over.id as Enums<"fase_enum">;

    // Solo se permite avanzar UNA fase hacia adelante
    const idxOrigen = FASES_ORDEN.indexOf(activeOpd.fase_actual);
    const idxDest   = FASES_ORDEN.indexOf(faseDest);
    if (idxDest !== idxOrigen + 1) return;

    startTransition(async () => {
      const res = await advancePhase(activeOpd.opd_id);
      if (res.error) {
        setMoveMsg(`❌ ${res.error}`);
        setTimeout(() => setMoveMsg(null), 4000);
      } else {
        setMoveMsg(`✓ ${activeOpd.ref} → ${FASE_LABEL[faseDest]}`);
        setTimeout(() => setMoveMsg(null), 2000);
      }
    });
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="space-y-3">
        {/* Filtros */}
        <div className="flex items-center gap-3 flex-wrap">
          <input type="text" placeholder="Buscar ref o cliente…"
            value={filtros.busqueda}
            onChange={e => setFiltros(f => ({ ...f, busqueda: e.target.value }))}
            className="h-8 rounded-md border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 w-52" />
          <div className="flex gap-1">
            {(["todos","rojo","amarillo","verde"] as const).map(s => (
              <button key={s} onClick={() => setFiltros(f => ({ ...f, semaforo: s }))}
                className={`px-3 py-1 text-xs rounded-md border transition-colors ${filtros.semaforo === s ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
                {s === "todos" ? "Todos" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          {moveMsg && (
            <span className={`text-xs px-2 py-1 rounded ${moveMsg.startsWith("❌") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
              {moveMsg}
            </span>
          )}
          {activeOpd && validDrop && (
            <span className="text-xs text-blue-600 animate-pulse">
              Suelta en <strong>{FASE_LABEL[validDrop]}</strong>
            </span>
          )}
          <span className="text-xs text-gray-400 ml-auto">{totalFiltrado} OP-Ds</span>
        </div>

        {/* Columnas */}
        <div className="relative">
          <div className="flex gap-3 overflow-x-auto pb-3">
            {FASES_ORDEN.map(fase => (
              <KanbanColumn
                key={fase}
                fase={fase}
                items={columnasFiltradas[fase]}
                total={data.totales[fase]}
                onSelectOpd={onSelectOpd}
                isDropTarget={validDrop === fase}
              />
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white to-transparent" />
        </div>

        <p className="text-[10px] text-gray-400">
          Arrastra una card a la columna siguiente para avanzar la fase. Solo se permiten avances de una fase a la vez.
        </p>
      </div>

      {/* Overlay durante el drag */}
      <DragOverlay>
        {activeOpd && (
          <div className="opacity-90 rotate-2 shadow-xl">
            <OPDCard opd={activeOpd} onClick={() => {}} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
