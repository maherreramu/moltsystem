"use client";

import { useRef, useState } from "react";
import { bulkUpdateLeadTimesEstandar } from "@/lib/actions/lead-time-actions";
import { FASE_LABEL } from "@/lib/fases";

type Row = { fase: string; dias_default: number; condiciones: string | null };

export function LeadTimeImportExport({ rows }: { rows: Row[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Tiempos");

    ws.addRow(["Clave", "Fase", "Días", "Condiciones"]);
    const header = ws.getRow(1);
    header.font = { bold: true };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];

    for (const row of rows) {
      ws.addRow([
        row.fase,
        FASE_LABEL[row.fase as keyof typeof FASE_LABEL] ?? row.fase,
        row.dias_default,
        row.condiciones ?? "",
      ]);
    }

    ws.columns = [{ width: 14 }, { width: 14 }, { width: 8 }, { width: 50 }];

    // Mark Días column with light blue so users know it's editable
    ws.eachRow((r, i) => {
      if (i === 1) return;
      r.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F4FD" } };
    });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tiempos_estandar.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setStatus(null);

    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      if (!ws) throw new Error("El archivo no contiene hojas.");

      const items: { fase: string; dias: number }[] = [];
      const errors: string[] = [];

      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header
        const clave = String(row.getCell(1).value ?? "").trim();
        if (!clave) return;
        const raw = row.getCell(3).value;
        const dias = typeof raw === "number" ? raw : Number(raw);
        if (!clave) return;
        if (isNaN(dias) || !Number.isInteger(dias) || dias < 0 || dias > 90) {
          errors.push(`Fila ${rowNumber}: "${clave}" tiene días inválidos (${raw})`);
          return;
        }
        items.push({ fase: clave, dias });
      });

      if (errors.length) {
        setStatus(`Errores en el archivo: ${errors.join("; ")}`);
        return;
      }
      if (!items.length) {
        setStatus("No se encontraron filas válidas en el archivo.");
        return;
      }

      await bulkUpdateLeadTimesEstandar(items);
      setStatus(`✓ ${items.length} fase${items.length !== 1 ? "s" : ""} actualizada${items.length !== 1 ? "s" : ""}.`);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3 mt-4 flex-wrap">
      <button
        onClick={handleExport}
        className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
      >
        ↓ Exportar Excel
      </button>

      <label
        className={`text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 cursor-pointer select-none ${loading ? "opacity-50 pointer-events-none" : ""}`}
      >
        ↑ Importar Excel
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleImport}
          disabled={loading}
        />
      </label>

      {loading && <span className="text-xs text-gray-500 animate-pulse">Importando…</span>}
      {status && !loading && (
        <span
          className={`text-xs font-medium ${status.startsWith("✓") ? "text-green-600" : "text-red-600"}`}
        >
          {status}
        </span>
      )}

      <span className="text-xs text-gray-400 ml-auto">
        El archivo debe mantener la columna A (Clave) y editar solo la columna C (Días).
      </span>
    </div>
  );
}
