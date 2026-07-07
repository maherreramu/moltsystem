"use client";

import type { GanttRow } from "@/lib/queries/gantt";
import type { ColDef } from "@/components/ui/column-picker";
import type { Enums } from "@/types/supabase";
import { FASE_LABEL } from "@/lib/fases";
import { toISODate } from "@/lib/format";

type ExportOpts = {
  rows: GanttRow[];
  order: string[];
  colVis: Record<string, boolean>;
  cols: ColDef[];
  /** Si se omite, inicio_plan/fin_plan usan row.fase_actual (modo WIP) */
  faseForPlan?: Enums<"fase_enum">;
  prioridadResolver: (row: GanttRow) => number | null;
  filenameBase: string;
  sheetName: string;
};

type CellValue = string | number | Date | null;

const SEM_LABEL: Record<Enums<"semaforo_enum">, string> = {
  verde: "Verde", amarillo: "Amarillo", rojo: "Rojo",
};

function extractValue(
  key: string,
  row: GanttRow,
  faseForPlan: Enums<"fase_enum"> | undefined,
  prioridadResolver: (row: GanttRow) => number | null,
): CellValue {
  const fase = faseForPlan ?? row.fase_actual;
  switch (key) {
    case "prioridad":
      return prioridadResolver(row);
    case "semaforo":
      return row.semaforo ? SEM_LABEL[row.semaforo] : null;
    case "semaforo_fase":
      return row.semaforo_fase ? SEM_LABEL[row.semaforo_fase] : null;
    case "ref":
      return row.ref;
    case "descripcion":
      return row.detalle ?? null;
    case "cliente":
      return row.cliente_nombre;
    case "cantidad":
      return row.cantidad;
    case "fase":
      return FASE_LABEL[row.fase_actual];
    case "slack":
      return row.slack;
    case "slack_fase":
      return row.slack_fase;
    case "score":
      return row.score_efectivo;
    case "fecha_compromiso":
      return row.fecha_compromiso ? new Date(row.fecha_compromiso + "T00:00:00") : null;
    case "comercial":
      return row.comercial ?? null;
    case "bloqueada":
      return row.bloqueada ? "Sí" : "No";
    case "dias_plan_restantes":
      return row.dias_plan_restantes;
    case "pendientes":
      return row.pendientes;
    case "inicio_plan": {
      const s = row.fases.find(f => f.fase === fase)?.start_date;
      return s ? new Date(s + "T00:00:00") : null;
    }
    case "fin_plan": {
      const d = row.fases.find(f => f.fase === fase)?.due_date;
      return d ? new Date(d + "T00:00:00") : null;
    }
    case "promesa_fase":
      return row.promesa_fase ? new Date(row.promesa_fase + "T00:00:00") : null;
    case "fecha_promesa_satelites":
      return row.fecha_promesa_satelites ? new Date(row.fecha_promesa_satelites + "T00:00:00") : null;
    case "fecha_recep_satelites":
      return row.fecha_recepcion_satelites ? new Date(row.fecha_recepcion_satelites + "T00:00:00") : null;
    case "recurso_corte":
      return row.recurso_corte ?? null;
    case "tipo_despacho":
      return row.tipo_despacho ?? null;
    case "colores":
      return row.colores ?? null;
    case "motivo_bloqueo":
      return row.motivo_bloqueo ?? null;
    case "causa_desvio":
      return row.causa_desvio ?? null;
    default:
      return null;
  }
}

const DATE_KEYS = new Set([
  "fecha_compromiso", "inicio_plan", "fin_plan",
  "promesa_fase", "fecha_promesa_satelites", "fecha_recep_satelites",
]);

export async function exportGanttRowsToXlsx(opts: ExportOpts): Promise<void> {
  const { rows, order, colVis, cols, faseForPlan, prioridadResolver, filenameBase, sheetName } = opts;

  const visibleKeys = order.filter(k => colVis[k] !== false);
  const labelMap = Object.fromEntries(cols.map(c => [c.key, c.label]));

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);

  // Headers
  ws.addRow(visibleKeys.map(k => labelMap[k] ?? k));
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // Data rows
  for (const row of rows) {
    const values = visibleKeys.map(k => extractValue(k, row, faseForPlan, prioridadResolver));
    const wsRow = ws.addRow(values);
    // Apply date format to date columns
    visibleKeys.forEach((k, i) => {
      if (DATE_KEYS.has(k) && values[i] != null) {
        wsRow.getCell(i + 1).numFmt = "dd/mm/yyyy";
      }
    });
  }

  // Auto column widths (simple heuristic)
  ws.columns.forEach((col, i) => {
    const key = visibleKeys[i];
    const header = labelMap[key] ?? key;
    const maxDataLen = Math.min(
      30,
      rows.reduce((max, row) => {
        const v = extractValue(key, row, faseForPlan, prioridadResolver);
        const len = v instanceof Date ? 10 : String(v ?? "").length;
        return Math.max(max, len);
      }, 0),
    );
    col.width = Math.max(header.length + 2, maxDataLen + 2, 10);
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameBase}_${toISODate(new Date())}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
