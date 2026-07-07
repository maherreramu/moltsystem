import type { Enums } from "@/types/supabase";

// Re-exportar para que los componentes puedan importar desde aquí sin romper
export { FASES_ORDEN, FASE_LABEL } from "@/lib/fases";

export type OPDKanban = {
  opd_id: string;
  ref: string;
  op_num: string;
  cliente_id: string | null;
  fase_actual: Enums<"fase_enum">;
  semaforo: Enums<"semaforo_enum"> | null;
  slack: number | null;
  dias_plan_restantes: number | null;
  bloqueada: boolean | null;
  plan_congelado: boolean | null;
};

export type OPDWithMeta = OPDKanban & {
  score_efectivo: number | null;
  pendientes: number;
  cliente_nombre: string;
  subestado_satelite: string | null;
  slack_fase: number | null;
  semaforo_fase: Enums<"semaforo_enum"> | null;
};

export type KanbanData = {
  columnas: Record<Enums<"fase_enum">, OPDWithMeta[]>;
  totales: Record<Enums<"fase_enum">, number>;
};



