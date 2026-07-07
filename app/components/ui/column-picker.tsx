"use client";
import { useState, useRef, useEffect } from "react";
import { Columns3, GripVertical } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type ColDef = { key: string; label: string; hideable?: boolean };

interface Props {
  cols: ColDef[];
  visibility: Record<string, boolean>;
  onToggle: (key: string) => void;
  onReset: () => void;
  order?: string[];
  onReorder?: (from: number, to: number) => void;
}

function SortablePickerItem({
  col, visibility, onToggle,
}: { col: ColDef; visibility: Record<string, boolean>; onToggle: (k: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: col.key });
  const hideable = col.hideable !== false;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-1.5 px-1 py-1 rounded hover:bg-gray-50"
    >
      <span {...attributes} {...listeners}
        className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing flex-none"
        onClick={e => e.stopPropagation()}>
        <GripVertical className="w-3 h-3" />
      </span>
      <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-700 flex-1 min-w-0">
        <input
          type="checkbox"
          checked={visibility[col.key] ?? true}
          onChange={() => hideable && onToggle(col.key)}
          disabled={!hideable}
          className={`flex-none ${!hideable ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
        />
        <span className="truncate">{col.label}</span>
      </label>
    </div>
  );
}

// Dropdown con checkboxes para mostrar/ocultar y arrastrar para reordenar columnas.
export function ColumnPicker({ cols, visibility, onToggle, onReset, order, onReorder }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !onReorder || !order || active.id === over.id) return;
    const from = order.indexOf(String(active.id));
    const to   = order.indexOf(String(over.id));
    if (from >= 0 && to >= 0) onReorder(from, to);
  }

  // Only count hideable columns as "hidden"
  const hiddenCount = cols.filter(c => (c.hideable !== false) && !visibility[c.key]).length;

  const orderedCols = order
    ? order.map(k => cols.find(c => c.key === k)).filter(Boolean) as ColDef[]
    : cols;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`h-8 flex items-center gap-1.5 px-2 rounded-md border text-xs transition-colors
          ${hiddenCount > 0
            ? "border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100"
            : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
      >
        <Columns3 className="w-3.5 h-3.5" />
        Columnas
        {hiddenCount > 0 && (
          <span className="ml-0.5 bg-blue-200 text-blue-800 rounded-full px-1.5 text-[10px] font-semibold">
            {hiddenCount} oculta{hiddenCount !== 1 ? "s" : ""}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 min-w-48">
          {order && onReorder ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={orderedCols.map(c => c.key)} strategy={verticalListSortingStrategy}>
                <div className="space-y-0 max-h-72 overflow-y-auto">
                  {orderedCols.map(c => (
                    <SortablePickerItem
                      key={c.key}
                      col={c}
                      visibility={visibility}
                      onToggle={onToggle}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {orderedCols.map(c => (
                <label key={c.key} className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-gray-50 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={visibility[c.key] ?? true}
                    onChange={() => onToggle(c.key)}
                    className="cursor-pointer"
                  />
                  {c.label}
                </label>
              ))}
            </div>
          )}
          <div className="border-t border-gray-100 mt-2 pt-1.5 px-2">
            <button onClick={onReset} className="text-[10px] text-gray-400 hover:text-gray-700">
              Restablecer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
