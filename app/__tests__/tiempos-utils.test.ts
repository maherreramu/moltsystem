import { describe, it, expect } from "vitest";
import {
  updateCellInBuffer,
  applyBatchToBuffer,
  bufferToChanges,
  type EditBuffer,
} from "../lib/tiempos-utils";

// ─── updateCellInBuffer ────────────────────────────────────────────────────────

describe("updateCellInBuffer", () => {
  it("agrega una entrada cuando el valor difiere del original", () => {
    const buffer: EditBuffer = new Map();
    const result = updateCellInBuffer(buffer, "opd-1", "dias_satelites", 20, 15);
    expect(result.get("opd-1")).toEqual({ dias_satelites: 20 });
  });

  it("acumula múltiples campos en el mismo OP-D", () => {
    let buffer: EditBuffer = new Map();
    buffer = updateCellInBuffer(buffer, "opd-1", "dias_satelites", 20, 15);
    buffer = updateCellInBuffer(buffer, "opd-1", "dias_corte", 6, 4);
    expect(result(buffer, "opd-1")).toEqual({ dias_satelites: 20, dias_corte: 6 });
  });

  it("elimina el campo cuando el nuevo valor es igual al original", () => {
    let buffer: EditBuffer = new Map([["opd-1", { dias_satelites: 20, dias_corte: 6 }]]);
    buffer = updateCellInBuffer(buffer, "opd-1", "dias_satelites", 15, 15);
    expect(result(buffer, "opd-1")).toEqual({ dias_corte: 6 });
  });

  it("elimina el OP-D del buffer cuando se restaura el único campo modificado", () => {
    let buffer: EditBuffer = new Map([["opd-1", { dias_satelites: 20 }]]);
    buffer = updateCellInBuffer(buffer, "opd-1", "dias_satelites", 15, 15);
    expect(buffer.has("opd-1")).toBe(false);
  });

  it("no modifica el OP-D si el nuevo valor ya es distinto del mismo campo", () => {
    const buffer: EditBuffer = new Map([["opd-1", { dias_satelites: 20 }]]);
    const result2 = updateCellInBuffer(buffer, "opd-1", "dias_satelites", 25, 15);
    expect(result2.get("opd-1")).toEqual({ dias_satelites: 25 });
  });

  it("no muta el buffer original", () => {
    const buffer: EditBuffer = new Map();
    const result2 = updateCellInBuffer(buffer, "opd-1", "dias_satelites", 20, 15);
    expect(buffer.size).toBe(0);
    expect(result2.size).toBe(1);
  });

  it("maneja múltiples OP-Ds independientes", () => {
    let buffer: EditBuffer = new Map();
    buffer = updateCellInBuffer(buffer, "opd-1", "dias_satelites", 20, 15);
    buffer = updateCellInBuffer(buffer, "opd-2", "dias_corte", 6, 4);
    expect(buffer.size).toBe(2);
    expect(result(buffer, "opd-1")).toEqual({ dias_satelites: 20 });
    expect(result(buffer, "opd-2")).toEqual({ dias_corte: 6 });
  });

  it("limpiar opd-1 no afecta opd-2", () => {
    let buffer: EditBuffer = new Map([
      ["opd-1", { dias_satelites: 20 }],
      ["opd-2", { dias_corte: 6 }],
    ]);
    buffer = updateCellInBuffer(buffer, "opd-1", "dias_satelites", 15, 15);
    expect(buffer.has("opd-1")).toBe(false);
    expect(result(buffer, "opd-2")).toEqual({ dias_corte: 6 });
  });
});

// ─── applyBatchToBuffer ────────────────────────────────────────────────────────

describe("applyBatchToBuffer", () => {
  it("aplica el mismo valor a múltiples filas", () => {
    const buffer: EditBuffer = new Map();
    const rows = [
      { opdId: "opd-1", originalVal: 15 },
      { opdId: "opd-2", originalVal: 15 },
    ];
    const result2 = applyBatchToBuffer(buffer, rows, "dias_satelites", 20);
    expect(result2.size).toBe(2);
    expect(result2.get("opd-1")).toEqual({ dias_satelites: 20 });
    expect(result2.get("opd-2")).toEqual({ dias_satelites: 20 });
  });

  it("omite filas donde el valor lote es igual al original", () => {
    const buffer: EditBuffer = new Map();
    const rows = [
      { opdId: "opd-1", originalVal: 20 }, // mismo que diasLote
      { opdId: "opd-2", originalVal: 15 },
    ];
    const result2 = applyBatchToBuffer(buffer, rows, "dias_satelites", 20);
    expect(result2.has("opd-1")).toBe(false);
    expect(result2.get("opd-2")).toEqual({ dias_satelites: 20 });
  });

  it("limpia entrada existente si el valor lote vuelve al original", () => {
    const buffer: EditBuffer = new Map([["opd-1", { dias_satelites: 20 }]]);
    const rows = [{ opdId: "opd-1", originalVal: 15 }]; // originalVal=15, diasLote=15
    const result2 = applyBatchToBuffer(buffer, rows, "dias_satelites", 15);
    expect(result2.has("opd-1")).toBe(false);
  });

  it("preserva otros campos del mismo OP-D al aplicar batch", () => {
    const buffer: EditBuffer = new Map([["opd-1", { dias_corte: 6 }]]);
    const rows = [{ opdId: "opd-1", originalVal: 15 }];
    const result2 = applyBatchToBuffer(buffer, rows, "dias_satelites", 20);
    expect(result2.get("opd-1")).toEqual({ dias_corte: 6, dias_satelites: 20 });
  });

  it("no muta el buffer original", () => {
    const buffer: EditBuffer = new Map();
    const rows = [{ opdId: "opd-1", originalVal: 15 }];
    applyBatchToBuffer(buffer, rows, "dias_satelites", 20);
    expect(buffer.size).toBe(0);
  });

  it("lista de filas vacía devuelve buffer sin cambios", () => {
    const buffer: EditBuffer = new Map([["opd-1", { dias_satelites: 20 }]]);
    const result2 = applyBatchToBuffer(buffer, [], "dias_corte", 5);
    expect(result2).toEqual(buffer);
    expect(result2.size).toBe(1);
  });
});

// ─── bufferToChanges ───────────────────────────────────────────────────────────

describe("bufferToChanges", () => {
  it("convierte el buffer al formato de replanOpdsMixed", () => {
    const buffer: EditBuffer = new Map([
      ["opd-1", { dias_satelites: 20 }],
      ["opd-2", { dias_corte: 6, dias_trazo: 4 }],
    ]);
    const changes = bufferToChanges(buffer);
    expect(changes).toHaveLength(2);
    expect(changes.find((c) => c.opdId === "opd-1")?.cambios).toEqual({ dias_satelites: 20 });
    expect(changes.find((c) => c.opdId === "opd-2")?.cambios).toEqual({ dias_corte: 6, dias_trazo: 4 });
  });

  it("devuelve array vacío para buffer vacío", () => {
    expect(bufferToChanges(new Map())).toEqual([]);
  });
});

// ─── Helper local ──────────────────────────────────────────────────────────────
function result(buffer: EditBuffer, opdId: string) {
  return buffer.get(opdId);
}
