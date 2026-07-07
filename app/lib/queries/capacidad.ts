import { createServiceClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/supabase";
import { FASES_ORDEN } from "@/lib/fases";

export type CapacidadRow = {
  semana_inicio: string;
  semana_label: string;
  fase: Enums<"fase_enum">;
  op_ds_simultaneas: number;
  unidades_totales: number;
  n_clientes: number;
  color_carga: Enums<"semaforo_enum">;
};

export type CapacidadGrid = {
  semanas: string[];        // "YYYY-WW" labels
  semana_fechas: string[];  // fechas ISO de inicio
  data: Record<string, Record<Enums<"fase_enum">, CapacidadRow | null>>;
};

export async function fetchCapacidadData(): Promise<CapacidadGrid> {
  const sb = await createServiceClient();

  // Vista materializada se refresca por cron diario; aquí solo leemos

  const { data } = await sb
    .from("v_capacidad_semana_fase")
    .select("*")
    .order("semana_inicio");

  const rows = (data ?? []) as CapacidadRow[];

  // Construir grid semana × fase
  const semanas = [...new Set(rows.map((r) => r.semana_label ?? ""))].filter(Boolean).sort();
  const semanaFechas = [...new Set(rows.map((r) => r.semana_inicio ?? ""))].filter(Boolean).sort();

  const grid: Record<string, Record<Enums<"fase_enum">, CapacidadRow | null>> = {};
  for (const s of semanas) {
    grid[s] = Object.fromEntries(FASES_ORDEN.map((f) => [f, null])) as Record<Enums<"fase_enum">, CapacidadRow | null>;
  }
  for (const row of rows) {
    if (row.semana_label && row.fase) {
      grid[row.semana_label][row.fase as Enums<"fase_enum">] = row;
    }
  }

  return { semanas, semana_fechas: semanaFechas, data: grid };
}
