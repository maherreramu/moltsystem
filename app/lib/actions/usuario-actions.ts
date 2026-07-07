"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/supabase";

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

async function assertIsAdmin(actor: string, sb: Awaited<ReturnType<typeof getSb>>) {
  const { data } = await sb.from("usuarios_sistema").select("rol").eq("email", actor).single();
  if (data?.rol !== "admin") throw new Error("Solo el administrador puede gestionar usuarios");
}

// ─── Agregar usuario al sistema ───────────────────────────────────────────────
export async function agregarUsuario(params: {
  email: string;
  nombre: string;
  rol: string;
  fases_asignadas?: { fase: Enums<"fase_enum">; solo_lectura: boolean }[];
}) {
  const actor = await getActorEmail();
  const sb    = await getSb();
  await assertIsAdmin(actor, sb);

  if (!params.email.trim()) return { error: "El correo es obligatorio" };
  if (params.rol === "lider_fase" && (!params.fases_asignadas || !params.fases_asignadas.some(f => !f.solo_lectura))) {
    return { error: "Los líderes de fase requieren al menos una fase operativa asignada" };
  }

  const email = params.email.toLowerCase().trim();
  const rpcSb = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (rpcSb as any).rpc("admin_upsert_usuario", {
    p_email: email,
    p_nombre: params.nombre.trim() || null,
    p_rol: params.rol,
    p_activo: true,
    p_fases: params.fases_asignadas ?? null,
    p_auth_user_id: null,
  });

  if (error) {
    if (error.code === "23505") return { error: "Ya existe un usuario con ese correo" };
    return { error: error.message };
  }

  // Invitar al usuario vía Supabase Auth — crea auth.users y envía el email
  const admin = createAdminClient();
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email);
  if (!inviteError && inviteData?.user?.id) {
    await sb.from("usuarios_sistema")
      .update({ user_id: inviteData.user.id })
      .eq("email", email);
  }

  revalidatePath("/admin/usuarios");
  return { ok: true, inviteError: inviteError?.message ?? null };
}

// ─── Actualizar rol ───────────────────────────────────────────────────────────
export async function actualizarRolUsuario(
  id: string,
  rol: string,
  fases_asignadas?: { fase: Enums<"fase_enum">; solo_lectura: boolean }[]
) {
  const actor = await getActorEmail();
  const sb    = await getSb();
  await assertIsAdmin(actor, sb);

  if (rol === "lider_fase" && (!fases_asignadas || !fases_asignadas.some(f => !f.solo_lectura))) {
    return { error: "Los líderes de fase requieren al menos una fase operativa asignada" };
  }

  const { data: user } = await sb.from("usuarios_sistema").select("email, nombre, activo, user_id").eq("id", id).single();
  if (!user) return { error: "Usuario no encontrado" };
  const rpcSb = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (rpcSb as any).rpc("admin_upsert_usuario", {
    p_email: user.email,
    p_nombre: user.nombre,
    p_rol: rol,
    p_activo: user.activo,
    p_fases: fases_asignadas ?? null,
    p_auth_user_id: user.user_id,
    p_id: id
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/usuarios");
  return { ok: true };
}

// ─── Activar / desactivar ─────────────────────────────────────────────────────
export async function toggleActivoUsuario(id: string, activo: boolean) {
  const actor = await getActorEmail();
  const sb    = await getSb();
  await assertIsAdmin(actor, sb);

  // Proteger: no desactivar al propio admin
  const { data: propio } = await sb.from("usuarios_sistema")
    .select("email").eq("id", id).single();
  if (propio?.email === actor && !activo) {
    return { error: "No puedes desactivar tu propia cuenta" };
  }

  await sb.from("usuarios_sistema").update({ activo }).eq("id", id);
  revalidatePath("/admin/usuarios");
  return { ok: true };
}

// ─── Aprobar usuario pendiente (ya se autenticó pero no estaba en el sistema) ─
export async function aprobarUsuarioPendiente(params: {
  email: string;
  nombre: string;
  rol: string;
  auth_user_id: string;
  fases_asignadas?: { fase: Enums<"fase_enum">; solo_lectura: boolean }[];
}) {
  const actor = await getActorEmail();
  const sb    = await getSb();
  await assertIsAdmin(actor, sb);
  const rpcSb = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (rpcSb as any).rpc("admin_upsert_usuario", {
    p_email: params.email.toLowerCase().trim(),
    p_nombre: params.nombre || null,
    p_rol: params.rol,
    p_activo: true,
    p_fases: params.fases_asignadas ?? null,
    p_auth_user_id: params.auth_user_id,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/usuarios");
  return { ok: true };
}

// ─── Reenviar invitación a usuario sin login ──────────────────────────────────
export async function reenviarInvitacion(email: string) {
  const actor = await getActorEmail();
  const sb    = await getSb();
  await assertIsAdmin(actor, sb);

  const normalizedEmail = email.toLowerCase().trim();
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.inviteUserByEmail(normalizedEmail);

  if (error) {
    // Usuario ya existe en auth — buscar su ID y vincularlo
    if (error.message.includes("already been registered")) {
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const authUser = list?.users.find(u => u.email === normalizedEmail);
      if (authUser) {
        await sb.from("usuarios_sistema")
          .update({ user_id: authUser.id })
          .eq("email", normalizedEmail);
        // Enviar magic link para que pueda ingresar
        await admin.auth.admin.generateLink({ type: "magiclink", email: normalizedEmail });
        return { ok: true, mensaje: "Usuario ya registrado — se vinculó y se envió un magic link para ingresar." };
      }
      return { error: "Usuario no encontrado en auth.users" };
    }
    return { error: error.message };
  }

  if (data?.user?.id) {
    await sb.from("usuarios_sistema")
      .update({ user_id: data.user.id })
      .eq("email", normalizedEmail);
  }
  return { ok: true, mensaje: null };
}

// ─── Listar usuarios pendientes (en auth.users pero no en usuarios_sistema) ────
export async function getPendientesAprobacion(): Promise<{
  id: string; email: string; created_at: string;
}[]> {
  const actor = await getActorEmail();
  const sb    = await getSb();
  await assertIsAdmin(actor, sb);

  const admin = createAdminClient();
  const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 200 });

  if (!authUsers?.users) return [];

  const { data: registrados } = await sb
    .from("usuarios_sistema").select("email");
  const registradosSet = new Set((registrados ?? []).map((u: { email: string }) => u.email));

  return authUsers.users
    .filter(u => u.email && !registradosSet.has(u.email))
    .map(u => ({ id: u.id, email: u.email!, created_at: u.created_at }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}
