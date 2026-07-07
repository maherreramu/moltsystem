import type { DiasFase } from "@/lib/queries/tabla";

export type EditBuffer = Map<string, Partial<Record<DiasFase, number>>>;

/**
 * Actualiza una celda en el buffer de edición pendiente.
 * Si el nuevo valor es igual al original, elimina la entrada del buffer.
 * Devuelve un nuevo Map (inmutable — compatible con setState de React).
 */
export function updateCellInBuffer(
  prev: EditBuffer,
  opdId: string,
  campo: DiasFase,
  newVal: number,
  originalVal: number
): EditBuffer {
  const next = new Map(prev);
  const existing = next.get(opdId) ?? {};
  if (newVal === originalVal) {
    const rest = { ...existing };
    delete rest[campo];
    if (Object.keys(rest).length === 0) next.delete(opdId);
    else next.set(opdId, rest);
  } else {
    next.set(opdId, { ...existing, [campo]: newVal });
  }
  return next;
}

export type BatchRow = { opdId: string; originalVal: number };

/**
 * Aplica un valor de días a un campo de fase para múltiples OP-Ds en el buffer.
 * Si el valor es igual al original de la fila, limpia esa entrada del buffer.
 */
export function applyBatchToBuffer(
  prev: EditBuffer,
  rows: BatchRow[],
  campo: DiasFase,
  diasLote: number
): EditBuffer {
  const next = new Map(prev);
  for (const { opdId, originalVal } of rows) {
    if (diasLote === originalVal) {
      const existing = next.get(opdId);
      if (existing) {
        const rest = { ...existing };
        delete rest[campo];
        if (Object.keys(rest).length === 0) next.delete(opdId);
        else next.set(opdId, rest);
      }
    } else {
      next.set(opdId, { ...(next.get(opdId) ?? {}), [campo]: diasLote });
    }
  }
  return next;
}

/**
 * Convierte el buffer de edición al formato esperado por replanOpdsMixed.
 */
export function bufferToChanges(
  buffer: EditBuffer
): { opdId: string; cambios: Partial<Record<DiasFase, number>> }[] {
  return Array.from(buffer.entries()).map(([opdId, cambios]) => ({ opdId, cambios }));
}
