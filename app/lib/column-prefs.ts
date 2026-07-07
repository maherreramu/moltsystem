"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import type { ViewPrefs } from "@/lib/queries/ui-prefs";

function reorderArr<T>(arr: T[], from: number, to: number): T[] {
  const result = [...arr];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

// Hook para persistir visibilidad y orden de columnas en localStorage por vista.
// viewKey debe ser estable y único por vista (ej. "produccion-tabla", "mi-fase", "gantt").
// defaultOrder: orden de columnas por defecto; si se omite, se usa Object.keys(defaults).
export function useColumnPrefs(
  viewKey: string,
  defaults: Record<string, boolean>,
  defaultOrder?: string[]
) {
  const storageKey = `col-prefs:${viewKey}`;
  const orderKey   = `col-order:${viewKey}`;
  const defOrder   = defaultOrder ?? Object.keys(defaults);

  const [visibility, setVisibility] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return defaults;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return defaults;
      return { ...defaults, ...JSON.parse(raw) };
    } catch {
      return defaults;
    }
  });

  const [order, setOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return defOrder;
    try {
      const raw = localStorage.getItem(orderKey);
      if (!raw) return defOrder;
      const saved: string[] = JSON.parse(raw);
      const defSet   = new Set(defOrder);
      const filtered = saved.filter(k => defSet.has(k));
      const missing  = defOrder.filter(k => !filtered.includes(k));
      return [...filtered, ...missing];
    } catch {
      return defOrder;
    }
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(visibility)); } catch { /* quota exceeded */ }
  }, [visibility, storageKey]);

  useEffect(() => {
    try { localStorage.setItem(orderKey, JSON.stringify(order)); } catch { /* quota exceeded */ }
  }, [order, orderKey]);

  const toggle = useCallback((col: string) => {
    setVisibility(prev => ({ ...prev, [col]: !prev[col] }));
  }, []);

  const move = useCallback((from: number, to: number) => {
    setOrder(prev => reorderArr(prev, from, to));
  }, []);

  const reset = useCallback(() => {
    setVisibility(defaults);
    setOrder(defOrder);
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    try { localStorage.removeItem(orderKey);   } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, orderKey]);

  return { visibility, toggle, reset, order, move };
}

// Hook para WIP y Gantt por fase — siembra desde props del servidor,
// persiste en Supabase vía debounce (no localStorage).
export function useViewPrefs(
  viewKey: string,
  defaults: Record<string, boolean>,
  defaultOrder: string[],
  defaultSort: { sortCol: string; sortDir: "asc" | "desc" },
  initial: ViewPrefs | undefined,
  onSave: (viewKey: string, patch: Partial<ViewPrefs>) => void | Promise<unknown>
) {
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() => ({
    ...defaults,
    ...(initial?.visibility ?? {}),
  }));

  const [order, setOrder] = useState<string[]>(() => {
    const saved = initial?.order;
    if (!saved) return defaultOrder;
    const defSet   = new Set(defaultOrder);
    const filtered = saved.filter((k: string) => defSet.has(k));
    const missing  = defaultOrder.filter(k => !filtered.includes(k));
    return [...filtered, ...missing];
  });

  const [sortCol, setSortCol] = useState<string>(initial?.sortCol ?? defaultSort.sortCol);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initial?.sortDir ?? defaultSort.sortDir);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = useCallback((patch: Partial<ViewPrefs>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      Promise.resolve(onSave(viewKey, patch))
        .then(r => { if (r && !(r as { ok: boolean }).ok) console.error("[useViewPrefs] save_ui_pref falló", viewKey, (r as { error?: string }).error); })
        .catch(err => console.error("[useViewPrefs] save_ui_pref error", viewKey, err));
    }, 600);
  }, [viewKey, onSave]);

  const toggle = useCallback((col: string) => {
    setVisibility(prev => {
      const next = { ...prev, [col]: !prev[col] };
      scheduleSave({ visibility: next });
      return next;
    });
  }, [scheduleSave]);

  const move = useCallback((from: number, to: number) => {
    setOrder(prev => {
      const next = reorderArr(prev, from, to);
      scheduleSave({ order: next });
      return next;
    });
  }, [scheduleSave]);

  const setSort = useCallback((col: string, dir: "asc" | "desc") => {
    setSortCol(col);
    setSortDir(dir);
    scheduleSave({ sortCol: col, sortDir: dir });
  }, [scheduleSave]);

  const reset = useCallback(() => {
    setVisibility(defaults);
    setOrder(defaultOrder);
    setSortCol(defaultSort.sortCol);
    setSortDir(defaultSort.sortDir);
    onSave(viewKey, { visibility: defaults, order: defaultOrder, sortCol: defaultSort.sortCol, sortDir: defaultSort.sortDir });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, onSave]);

  return { visibility, toggle, reset, order, move, sortCol, sortDir, setSort };
}
