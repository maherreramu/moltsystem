"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function getActorEmail(): Promise<string> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return user?.email ?? "unknown";
}

async function getSb() {
  const { createCachedServiceClient } = await import("@/lib/supabase/server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createCachedServiceClient() as any;
}

async function assertPuedeEditar(actor: string, sb: ReturnType<typeof getSb> extends Promise<infer T> ? T : never) {
  const { data } = await sb.from("usuarios_sistema")
    .select("rol").eq("email", actor).single();
  if (!data || !["admin","directivo"].includes(data.rol)) {
    throw new Error("Sin permisos — solo admin y directivos pueden editar clientes");
  }
}

function invalidar() {
  updateTag("produccion");
  updateTag("clientes");
  revalidatePath("/clientes");
  revalidatePath("/produccion");
  revalidatePath("/cola");
}

// ─── Caracterización: actualizar uno de los 4 campos del score ───────────────
export async function updateClienteCampo(
  clienteId: string,
  campo: "tier" | "tipo_relacion" | "condicion_pago" | "complejidad_tipica",
  valor: string
) {
  const actor = await getActorEmail();
  const sb    = await getSb();
  await assertPuedeEditar(actor, sb);
  await sb.from("clientes").update({ [campo]: valor }).eq("id", clienteId);
  invalidar();
  return { ok: true };
}

// ─── Homologación: asignar o limpiar alias ────────────────────────────────────
export async function homologarCliente(
  clienteId: string,
  homologadoAId: string | null
) {
  const actor = await getActorEmail();
  const sb    = await getSb();
  await assertPuedeEditar(actor, sb);

  if (homologadoAId) {
    // Validar: el destino no puede estar él mismo homologado (sin cadenas de 2 niveles)
    const { data: destino } = await sb.from("clientes")
      .select("homologado_a").eq("id", homologadoAId).single();
    if (destino?.homologado_a) {
      return { error: "El cliente destino ya es un alias de otro cliente. Solo se permite 1 nivel de homologación." };
    }
  }

  await sb.from("clientes")
    .update({ homologado_a: homologadoAId })
    .eq("id", clienteId);
  invalidar();
  return { ok: true };
}

// ─── Crear cliente manual ─────────────────────────────────────────────────────
export async function crearClienteManual(params: {
  nombre: string;
  tier: string;
  tipo_relacion: string;
  condicion_pago: string;
  complejidad_tipica: string;
}) {
  const actor = await getActorEmail();
  const sb    = await getSb();
  await assertPuedeEditar(actor, sb);

  if (!params.nombre.trim()) return { error: "El nombre es obligatorio" };

  // id_impel sintético para no violar la FK
  const idImpel = `MAN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  const { error: e1 } = await sb.from("clientes_impel").insert({
    id_impel:        idImpel,
    razon_social:    params.nombre.trim(),
    nit:             null,
    nombre_comercial: params.nombre.trim(),
  });
  if (e1) return { error: `clientes_impel: ${e1.message}` };

  const { error: e2 } = await sb.from("clientes").insert({
    cliente_impel_id:   idImpel,
    tier:               params.tier,
    tipo_relacion:      params.tipo_relacion,
    condicion_pago:     params.condicion_pago,
    complejidad_tipica: params.complejidad_tipica,
    es_manual:          true,
  });
  if (e2) return { error: `clientes: ${e2.message}` };

  invalidar();
  return { ok: true };
}

// ─── Reasignar cliente a una OP (afecta todas las OP-Ds) ─────────────────────
export async function reasignarClienteOp(
  opNum: string,
  clienteId: string
) {
  const actor = await getActorEmail();
  const sb    = await getSb();
  await assertPuedeEditar(actor, sb);

  await sb.from("ops").update({ cliente_id: clienteId }).eq("op_num", opNum);
  invalidar();
  revalidatePath("/ops");
  return { ok: true };
}
