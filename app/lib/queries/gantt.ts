import type { Enums } from "@/types/supabase";

export type PhasePlan = {
  fase: Enums<"fase_enum">;
  start_date: string;
  due_date: string;
  dias: number;
};

export type GanttRow = {
  opd_id: string;
  ref: string;
  op_num: string;
  cliente_nombre: string;
  semaforo: Enums<"semaforo_enum"> | null;
  prioridad_manual: number | null;
  cantidad: number;
  score_efectivo: number | null;
  fase_actual: Enums<"fase_enum">;
  detalle: string | null;
  slack: number | null;
  fases: PhasePlan[];
  baseline: PhasePlan[];
  // Campos extendidos
  fecha_compromiso: string | null;
  comercial: string | null;
  bloqueada: boolean | null;
  dias_plan_restantes: number | null;
  pendientes: number;
  fecha_promesa_satelites: string | null;
  fecha_recepcion_satelites: string | null;
  recurso_corte: Enums<"recurso_corte_enum"> | null;
  tipo_despacho: Enums<"tipo_despacho_enum"> | null;
  colores: string | null;
  motivo_bloqueo: Enums<"motivo_bloqueo_enum"> | null;
  causa_desvio: Enums<"causa_desvio_enum"> | null;
  slack_fase: number | null;
  semaforo_fase: Enums<"semaforo_enum"> | null;
  promesa_fase: string | null;
  subestado_satelite: Enums<"satelite_subestado_enum"> | null;
  fecha_ingreso_fase: string | null;
};

export type GanttMeta = {
  rows: GanttRow[];
  festivos: string[];
};
