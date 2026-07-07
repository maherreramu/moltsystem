import { createServiceClient } from "@/lib/supabase/server";
import { fetchCurrentRol } from "@/lib/queries/ui-prefs";
import { OpsClient } from "./ops-client";


export type OPAgregada = {
  op_num: string;
  cliente_id: string | null;
  nombre: string | null;
  cliente: string;
  comercial: string | null;
  impel_id: string | null;
  fecha_creacion_impel: string | null;
  fecha_ingreso_sistema: string | null;
  fecha_compromiso: string;
  total_uds: number;
  n_op_ds: number;
  uds_reales: number;
  semaforo_op: string;
  rojas: number;
  amarillas: number;
  verdes: number;
  fases: Record<string, number>;   // { fase: count }
  pendientes_abiertos: number;
};

export default async function OPsPage() {
  const sb = await createServiceClient();

  // OP con semáforo agregado (v_semaforo_op)
  const [{ data: semaforos }, { data: opds }, { data: ops }, { data: clientes }, { data: clientesImpel }, { data: pendientes }, rol] =
    await Promise.all([
      sb.from("v_semaforo_op").select("op_num,semaforo_op,total_op_ds,rojas,amarillas,verdes"),
      sb.from("op_ds").select("op_num,cantidad,fase_actual").eq("activa", true),
      sb.from("ops").select("op_num,impel_id,nombre,comercial,fecha_creacion_impel,fecha_compromiso,total_uds,cliente_id,created_at").eq("activa", true).order("fecha_compromiso"),
      sb.from("clientes").select("id,cliente_impel_id"),
      sb.from("clientes_impel").select("id_impel,razon_social"),
      sb.from("op_d_pendientes").select("opd_padre_id").neq("estado","cerrado"),
      fetchCurrentRol(),
    ]);
  const puedeEditarCompromiso = ["admin", "directivo"].includes(rol ?? "");

  const semMap   = new Map((semaforos ?? []).map(s => [s.op_num, s]));
  const clienteMap = new Map((clientes ?? []).map(c => [c.id, c.cliente_impel_id]));
  const impelMap   = new Map((clientesImpel ?? []).map(c => [c.id_impel, c.razon_social]));

  // Pendientes por OP-D → luego agrupar por OP
  const pendMap = new Map<string, number>();
  for (const p of pendientes ?? []) {
    if (p.opd_padre_id) pendMap.set(p.opd_padre_id, (pendMap.get(p.opd_padre_id) ?? 0) + 1);
  }

  // Agregar OP-Ds por OP
  const opdsByOp = new Map<string, typeof opds>();
  for (const od of opds ?? []) {
    if (!opdsByOp.has(od.op_num)) opdsByOp.set(od.op_num, []);
    opdsByOp.get(od.op_num)!.push(od);
  }

  const result: OPAgregada[] = (ops ?? []).map(op => {
    const sem  = semMap.get(op.op_num);
    const ods  = opdsByOp.get(op.op_num) ?? [];
    const impelId = op.cliente_id ? clienteMap.get(op.cliente_id) : null;

    const fases: Record<string, number> = {};
    let uds_reales = 0;
    for (const od of ods) {
      fases[od.fase_actual] = (fases[od.fase_actual] ?? 0) + 1;
      uds_reales += od.cantidad ?? 0;
    }

    return {
      op_num:               op.op_num,
      impel_id:             op.impel_id ?? null,
      cliente_id:           op.cliente_id ?? null,
      nombre:               op.nombre,
      fecha_creacion_impel:  op.fecha_creacion_impel ?? null,
      fecha_ingreso_sistema: op.created_at ? op.created_at.slice(0, 10) : null,
      cliente:          impelId ? (impelMap.get(impelId) ?? "—") : "—",
      comercial:        op.comercial,
      fecha_compromiso: op.fecha_compromiso,
      total_uds:        op.total_uds ?? uds_reales,
      n_op_ds:          ods.length,
      uds_reales,
      semaforo_op:      sem?.semaforo_op ?? "verde",
      rojas:            sem?.rojas ?? 0,
      amarillas:        sem?.amarillas ?? 0,
      verdes:           sem?.verdes ?? 0,
      fases,
      pendientes_abiertos: 0, // se calcula abajo
    };
  });

  return <OpsClient ops={result} puedeEditarCompromiso={puedeEditarCompromiso} />;
}
