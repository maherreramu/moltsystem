"use client";

import React, { useRef, useState, useTransition } from "react";
import type { OPDMiFase } from "@/lib/queries/mi-fase";
import type { Enums } from "@/types/supabase";
import { setPhasePromiseBatch, setUdsRecibidasEmpaque } from "@/lib/actions/opd-actions";

type ExportRow = Record<string, string | number>;
type ImportRow = { id: string; fecha: string; recibidas: number | null };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado";
}

export function MiFaseImportExport({
  data,
  faseActual,
  fasesOperativas,
  promesas,
  esLider
}: {
  data: OPDMiFase[];
  faseActual: string;
  fasesOperativas: string[];
  promesas: Map<string, string>;
  esLider: boolean;
}) {
  const [isPending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Si no está filtrado por una sola fase, no permitimos exportar/importar
  // Opcional: Permitir solo si el usuario tiene permisos operativos en esta fase.
  const canOperate = faseActual !== "todas" && (!esLider || fasesOperativas.includes(faseActual));

  if (!canOperate) return null;

  async function handleExport() {
    setMsg("Exportando...");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(`MiFase_${faseActual}`);

      ws.columns = [
        { header: "ID (No Modificar)", key: "id", width: 36 },
        { header: "Fase Exportada (No Modificar)", key: "fase", width: 15 },
        { header: "Referencia", key: "ref", width: 15 },
        { header: "Cliente", key: "cliente", width: 25 },
        { header: "Cantidad OP-D", key: "cantidad", width: 15 },
        { header: "Promesa Entrega (YYYY-MM-DD)", key: "promesa", width: 20 },
        ...(faseActual === "empaque" ? [{ header: "Unidades Recibidas", key: "recibidas", width: 18 }] : [])
      ];

      for (const row of data) {
        if (row.fase_actual !== faseActual) continue;
        const rowData: ExportRow = {
          id: row.opd_id,
          fase: row.fase_actual,
          ref: row.ref,
          cliente: row.cliente,
          cantidad: row.cantidad,
          promesa: promesas.get(row.opd_id) ?? "",
        };
        if (faseActual === "empaque") {
          rowData.recibidas = row.uds_recibidas_empaque ?? "";
        }
        ws.addRow(rowData);
      }

      // Estilos
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };

      // Proteger las columnas que no se deben modificar
      ws.getColumn("id").font = { color: { argb: "FF888888" } };
      ws.getColumn("fase").font = { color: { argb: "FF888888" } };

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `MiFase_${faseActual}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg("✓ Exportado");
    } catch (e) {
      setMsg("❌ Error al exportar");
      console.error(e);
    }
    setTimeout(() => setMsg(""), 3000);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg("Importando...");

    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ab = await file.arrayBuffer();
      await wb.xlsx.load(ab);
      const ws = wb.worksheets[0];

      if (!ws) throw new Error("Archivo Excel vacío o sin hojas.");

      const rows: ImportRow[] = [];
      let headerValidated = false;

      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          const colFase = row.getCell(2).value?.toString();
          if (!colFase?.includes("Fase Exportada")) {
            throw new Error("Formato inválido. Usa el archivo exportado de esta misma vista.");
          }
          headerValidated = true;
          return;
        }

        const id = row.getCell(1).value?.toString()?.trim();
        const fase = row.getCell(2).value?.toString()?.trim();
        const promesa = row.getCell(6).value; // Puede ser Date o string
        const recibidas = faseActual === "empaque" ? row.getCell(7).value : null;

        if (!id) return;

        if (fase !== faseActual) {
          throw new Error(`Inyección detectada: La fila con Ref ${row.getCell(3).value} pertenece a la fase '${fase}', pero estás importando en '${faseActual}'.`);
        }

        let fechaStr = "";
        if (promesa instanceof Date) {
          fechaStr = promesa.toISOString().slice(0, 10);
        } else if (typeof promesa === "string") {
          fechaStr = promesa.trim();
        }

        let numRecibidas: number | null = null;
        if (recibidas != null && recibidas !== "") {
          numRecibidas = parseInt(recibidas.toString(), 10);
        }

        rows.push({ id, fecha: fechaStr, recibidas: numRecibidas });
      });

      if (!headerValidated) throw new Error("No se detectaron las columnas esperadas.");

      start(async () => {
        try {
          let countPromesas = 0;
          let countRecibidas = 0;

          // Separar por promesas y recibidas
          const promesasGroup = new Map<string, string[]>(); // fecha -> ids[]
          for (const r of rows) {
            // Promesas
            if (r.fecha) {
              const opds = promesasGroup.get(r.fecha) ?? [];
              opds.push(r.id);
              promesasGroup.set(r.fecha, opds);
            }
          }

          // Ejecutar actualizaciones masivas
          for (const [fecha, ids] of promesasGroup.entries()) {
            await setPhasePromiseBatch(ids, faseActual as Enums<"fase_enum">, fecha);
            countPromesas += ids.length;
          }

          // Actualizar recibidas uno por uno
          if (faseActual === "empaque") {
            for (const r of rows) {
              if (r.recibidas !== null) {
                // Solo si la OP-D pertenece a los datos mostrados actualmente para evitar modificar otras OP-Ds
                if (data.some(d => d.opd_id === r.id)) {
                  await setUdsRecibidasEmpaque(r.id, r.recibidas);
                  countRecibidas++;
                }
              }
            }
          }

          setMsg(`✓ ${countPromesas} promesas, ${countRecibidas} uds. recibidas actualizadas.`);
        } catch (err: unknown) {
          setMsg(`❌ Error: ${errorMessage(err)}`);
        }
        setTimeout(() => setMsg(""), 5000);
      });
    } catch (e: unknown) {
      setMsg(`❌ ${errorMessage(e)}`);
      console.error(e);
      setTimeout(() => setMsg(""), 5000);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 font-medium ml-2 mr-1">Lote:</span>
      <button
        onClick={handleExport}
        disabled={isPending}
        className="h-7 px-3 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1 font-medium text-gray-700 disabled:opacity-50"
      >
        <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
        Exportar
      </button>

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isPending}
        className="h-7 px-3 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1 font-medium text-gray-700 disabled:opacity-50"
      >
        <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
        Importar
      </button>

      <input
        type="file"
        accept=".xlsx"
        ref={fileInputRef}
        onChange={handleImport}
        className="hidden"
      />

      {msg && <span className="text-xs text-gray-600 ml-2 animate-pulse">{msg}</span>}
    </div>
  );
}
