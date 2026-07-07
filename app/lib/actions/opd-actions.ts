"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/supabase";
import { FASES_ORDEN, saltoDestinosPermitidos } from "@/lib/fases";
import { fetchPhaseJumpsConfig } from "@/lib/actions/phase-jumps-actions";

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

// Retorna {actor, sb} y lanza error si el usuario tiene rol de solo visualización.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSbChecked(): Promise<{ actor: string; sb: any }> {
  const actor = await getActorEmail();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = await getSb();
  const { data } = await sb.from("usuarios_sistema").select("rol").eq("email", actor).single();
  if (data?.rol === "visualizacion") {
    throw new Error("Tu rol es de solo visualización. No puedes realizar cambios.");
  }
  return { actor, sb };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSbCheckedRol(): Promise<{ actor: string; sb: any; rol: string | null; fasesOperativas: Enums<"fase_enum">[] }> {
  const actor = await getActorEmail();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = await getSb();
  const { data } = await sb.from("usuarios_sistema").select("id, rol").eq("email", actor).single();
  if (data?.rol === "visualizacion") {
    throw new Error("Tu rol es de solo visualización. No puedes realizar cambios.");
  }
  let fasesOperativas: Enums<"fase_enum">[] = [];
  if (data) {
    const { data: ufa } = await sb.from("usuario_fases_asignadas").select("fase").eq("usuario_id", data.id).eq("solo_lectura", false);
    if (ufa) fasesOperativas = ufa.map((u: { fase: Enums<"fase_enum"> }) => u.fase);
  }
  return { actor, sb, rol: data?.rol ?? null, fasesOperativas };
}

// Retorna {actor, sb} y lanza error si el usuario NO es admin ni directivo.
// Usado para operaciones restringidas a gestión comercial (fecha de compromiso).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSbCheckedCompromiso(): Promise<{ actor: string; sb: any }> {
  const actor = await getActorEmail();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = await getSb();
  const { data } = await sb.from("usuarios_sistema").select("rol").eq("email", actor).single();
  if (!data || !["admin", "directivo"].includes(data.rol)) {
    throw new Error("Sin permisos — solo admin y directivos pueden cambiar la fecha de compromiso.");
  }
  return { actor, sb };
}

// ─── Helper interno de avance de fase (reutilizado por batch) ────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function _advanceOne(sb: any, actor: string, opdId: string, observaciones?: string, opts?: { permitirParcial?: boolean }) {
  const { data: opd } = await sb.from("op_ds")
    .select("fase_actual,ref,f0_ficha_tec,f0_patronaje,f0_muestra,f0_aprobacion,f0_tela_avios,f0_op_creada")
    .eq("id", opdId).single();

  if (!opd) return { error: "OP-D no encontrada" };

  const idx = FASES_ORDEN.indexOf(opd.fase_actual);
  if (idx >= FASES_ORDEN.length - 1) return { error: "Ya está en la última fase", ref: opd.ref as string };

  const faseDest = FASES_ORDEN[idx + 1];

  if (faseDest === "despacho") {
    const { count } = await sb.from("op_d_pendientes")
      .select("*", { count: "exact", head: true })
      .eq("opd_padre_id", opdId)
      .neq("estado", "cerrado");
    if ((count ?? 0) > 0)
      return { error: `Hay ${count} pendiente(s) abierto(s). Ciérralos antes de pasar a Despacho.` };
  }

  if (faseDest === "tiqueteo" && !opts?.permitirParcial) {
    const { count } = await sb.from("op_d_componentes")
      .select("*", { count: "exact", head: true })
      .eq("opd_id", opdId)
      .eq("cortado", false);
    if ((count ?? 0) > 0)
      return { error: `Hay ${count} tela(s) sin cortar. Complétalas antes de pasar a Tiqueteo.` };
  }

  const updatePayload: Record<string, unknown> = { fase_actual: faseDest };
  if (opd.fase_actual === "satelites") {
    updatePayload.fecha_recepcion_satelites = new Date().toISOString().slice(0, 10);
  }
  const { error: updErr } = await sb.from("op_ds").update(updatePayload).eq("id", opdId);
  if (updErr) return { error: updErr.message, ref: opd.ref as string };

  await sb.from("phase_events").insert({
    opd_id: opdId, tipo: "phase_advance", actor,
    payload: { fase_from: opd.fase_actual, fase_to: faseDest, ...(observaciones?.trim() && { observaciones: observaciones.trim() }) },
  });

  if (opd.fase_actual === "fase_0") {
    await sb.rpc("freeze_baseline", { p_opd_id: opdId, p_actor: actor });
  }

  return { ok: true, faseDest, ref: opd.ref as string };
}

// ─── Avance de fase completo ──────────────────────────────────────────────────
export async function advancePhase(opdId: string, observaciones?: string) {
  const { actor, sb } = await getSbChecked();
  const result = await _advanceOne(sb, actor, opdId, observaciones);
  if (result.error) return { error: result.error };
  updateTag("produccion");
  revalidatePath("/produccion"); revalidatePath("/mi-fase"); revalidatePath("/cola");
  return { ok: true, faseDest: result.faseDest };
}

// ─── Avance de fase en lote ───────────────────────────────────────────────────
export async function advancePhaseBatch(opdIds: string[]) {
  const { actor, sb } = await getSbChecked();
  if (!opdIds.length) return { error: "Nada que aplicar" };
  const resultados = await Promise.all(opdIds.map((id) => _advanceOne(sb, actor, id)));
  const ok = resultados.filter((r) => r.ok).length;
  const errores = resultados
    .map((r, i) => ({ ref: r.ref ?? opdIds[i], error: r.error }))
    .filter((r) => r.error) as { ref: string; error: string }[];
  updateTag("produccion");
  revalidatePath("/produccion"); revalidatePath("/mi-fase"); revalidatePath("/cola");
  return { ok, errores };
}

async function _saltarOne(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  actor: string,
  rol: string | null,
  fasesOperativas: Enums<"fase_enum">[],
  liderJumps: Awaited<ReturnType<typeof fetchPhaseJumpsConfig>>,
  opdId: string,
  faseDestino: Enums<"fase_enum">,
  motivo: string,
): Promise<{ ok?: true; faseDest?: string; error?: string }> {
  const { data: opd } = await sb.from("op_ds")
    .select("fase_actual,ref,op_num")
    .eq("id", opdId).single();
  if (!opd) return { error: "OP-D no encontrada" };

  const faseActual = opd.fase_actual as Enums<"fase_enum">;
  const idxFrom = FASES_ORDEN.indexOf(faseActual);
  const idxTo   = FASES_ORDEN.indexOf(faseDestino);

  if (idxTo <= idxFrom) {
    return { error: `La fase destino debe ser posterior a la actual (${faseActual})` };
  }
  if (faseDestino === "despacho" || faseDestino === "cierre") {
    return { error: "No se puede saltar directamente a despacho o cierre" };
  }

  // Validación de permiso por rol
  const destinos = saltoDestinosPermitidos(rol, fasesOperativas, [faseActual], liderJumps);
  if (!destinos.includes(faseDestino)) {
    return { error: "No tienes permiso para este salto de fase" };
  }

  const fasesSaltadas = FASES_ORDEN.slice(idxFrom + 1, idxTo) as Enums<"fase_enum">[];

  // Poner días en 0 para fases saltadas → trigger RN-06 recalcula el pull automáticamente
  const diasPatch: Partial<Record<string, number>> = {};
  for (const f of fasesSaltadas) {
    diasPatch[`dias_${f}`] = 0;
  }
  if (Object.keys(diasPatch).length > 0) {
    const { error: dErr } = await sb.from("op_ds").update(diasPatch).eq("id", opdId);
    if (dErr) return { error: dErr.message };
  }

  // Marcar fases saltadas como tercerizadas en phase_plans
  for (const f of fasesSaltadas) {
    await sb.from("phase_plans").update({ tercerizado: true }).eq("opd_id", opdId).eq("fase", f);
  }

  // Avanzar fase_actual
  const { error: updErr } = await sb.from("op_ds").update({ fase_actual: faseDestino }).eq("id", opdId);
  if (updErr) return { error: updErr.message };

  await sb.from("phase_events").insert({
    opd_id: opdId, tipo: "phase_advance", actor,
    payload: { fase_from: faseActual, fase_to: faseDestino, salto: true, fases_saltadas: fasesSaltadas, motivo_tercerizacion: motivo },
  });

  // Congelar baseline si se salta DESDE fase_0 (override de compuerta — solo admin/directivo llegan aquí)
  if (faseActual === "fase_0") {
    await sb.rpc("freeze_baseline", { p_opd_id: opdId, p_actor: actor });
  }

  return { ok: true, faseDest: faseDestino };
}

export async function saltarFase(
  opdId: string,
  faseDestino: Enums<"fase_enum">,
  motivo: string,
): Promise<{ ok?: true; faseDest?: string; error?: string }> {
  const { actor, sb, rol, fasesOperativas } = await getSbCheckedRol();
  const liderJumps = await fetchPhaseJumpsConfig();
  const result = await _saltarOne(sb, actor, rol, fasesOperativas, liderJumps, opdId, faseDestino, motivo);
  if (result.error) return { error: result.error };
  updateTag("produccion");
  revalidatePath("/produccion"); revalidatePath("/mi-fase");
  return { ok: true, faseDest: result.faseDest };
}

export async function saltarFaseBatch(opdIds: string[], faseDestino: Enums<"fase_enum">, motivo: string) {
  const { actor, sb, rol, fasesOperativas } = await getSbCheckedRol();
  if (!opdIds.length) return { error: "Nada que aplicar" };
  const liderJumps = await fetchPhaseJumpsConfig();
  const resultados = await Promise.all(
    opdIds.map((id) => _saltarOne(sb, actor, rol, fasesOperativas, liderJumps, id, faseDestino, motivo))
  );
  const ok = resultados.filter((r) => r.ok).length;
  const errores = resultados
    .map((r, i) => ({ ref: opdIds[i], error: r.error }))
    .filter((r) => r.error) as { ref: string; error: string }[];
  updateTag("produccion");
  revalidatePath("/produccion"); revalidatePath("/mi-fase");
  return { ok, errores };
}

// ─── Sin novedad en lote ──────────────────────────────────────────────────────
export async function dailyCheckBatch(opdIds: string[]) {
  const { actor, sb } = await getSbChecked();
  if (!opdIds.length) return { error: "Nada que aplicar" };
  const eventos = opdIds.map((id) => ({ opd_id: id, tipo: "daily_check", actor, payload: { nota: "sin_novedad" } }));
  await sb.from("phase_events").insert(eventos);
  updateTag("produccion");
  revalidatePath("/mi-fase"); revalidatePath("/actividad");
  return { ok: opdIds.length };
}

// ─── Bloquear en lote ────────────────────────────────────────────────────────
export async function blockOpdBatch(opdIds: string[], motivo: Enums<"motivo_bloqueo_enum">, observaciones?: string) {
  const { actor, sb } = await getSbChecked();
  if (!opdIds.length) return { error: "Nada que aplicar" };
  await sb.from("op_ds").update({ bloqueada: true, motivo_bloqueo: motivo }).in("id", opdIds);
  const eventos = opdIds.map((id) => ({
    opd_id: id, tipo: "block", actor,
    payload: { motivo, ...(observaciones?.trim() && { observaciones: observaciones.trim() }) },
  }));
  await sb.from("phase_events").insert(eventos);
  updateTag("produccion");
  revalidatePath("/produccion"); revalidatePath("/mi-fase");
  return { ok: opdIds.length };
}

// ─── Desbloquear en lote ──────────────────────────────────────────────────────
export async function unblockBatch(opdIds: string[], resolucion: string) {
  const { actor, sb } = await getSbChecked();
  if (!opdIds.length) return { error: "Nada que aplicar" };
  await sb.from("op_ds").update({ bloqueada: false, motivo_bloqueo: null }).in("id", opdIds);
  const eventos = opdIds.map((id) => ({ opd_id: id, tipo: "unblock", actor, payload: { resolucion } }));
  await sb.from("phase_events").insert(eventos);
  updateTag("produccion");
  revalidatePath("/produccion"); revalidatePath("/mi-fase");
  return { ok: opdIds.length };
}

// ─── Sin novedad (daily check) ───────────────────────────────────────────────
export async function dailyCheck(opdId: string) {
  const { actor, sb } = await getSbChecked();
  await sb.from("phase_events").insert({
    opd_id: opdId, tipo: "daily_check", actor, payload: { nota: "sin_novedad" },
  });
  updateTag("produccion");
  revalidatePath("/mi-fase"); revalidatePath("/actividad");
  return { ok: true };
}

// ─── Revertir fase (solo admin) ──────────────────────────────────────────────
export async function revertPhase(opdId: string, motivo: string) {
  const { actor, sb } = await getSbChecked();

  const { data: opd } = await sb
    .from("op_ds")
    .select("fase_actual,ref")
    .eq("id", opdId).single();

  if (!opd) return { error: "OP-D no encontrada" };

  const idx = FASES_ORDEN.indexOf(opd.fase_actual);
  if (idx <= 0) return { error: "Ya está en Fase 0, no se puede revertir" };

  const faseAnterior = FASES_ORDEN[idx - 1];

  await sb.from("op_ds").update({ fase_actual: faseAnterior }).eq("id", opdId);
  await sb.from("phase_events").insert({
    opd_id: opdId, tipo: "phase_revert", actor,
    payload: { fase_from: opd.fase_actual, fase_to: faseAnterior, motivo },
  });

  updateTag("produccion");
  revalidatePath("/produccion"); revalidatePath("/mi-fase"); revalidatePath("/actividad");
  return { ok: true, faseAnterior };
}

export async function revertPhaseBatch(opdIds: string[], motivo: string) {
  await getSbChecked();
  if (!opdIds.length) return { error: "Nada que aplicar" };
  const resultados = await Promise.all(opdIds.map((id) => revertPhase(id, motivo)));
  const ok = resultados.filter((r) => r.ok).length;
  const errores = resultados
    .map((r, i) => ({ ref: opdIds[i], error: r.error }))
    .filter((r) => r.error) as { ref: string; error: string }[];
  return { ok, errores };
}

// ─── Avance parcial ───────────────────────────────────────────────────────────
export async function advancePhaseParcial(opdId: string, cantidadPendiente: number, motivo: Enums<"causa_desvio_enum">, observaciones?: string) {
  const { actor, sb } = await getSbChecked();
  const { data: opd } = await sb.from("op_ds").select("fase_actual,ref,cantidad").eq("id", opdId).single();
  if (!opd) return { error: "OP-D no encontrada" };
  const idx = FASES_ORDEN.indexOf(opd.fase_actual);
  if (idx >= FASES_ORDEN.length - 1) return { error: "Última fase" };
  const faseDest = FASES_ORDEN[idx + 1];
  await sb.from("op_ds").update({ fase_actual: faseDest }).eq("id", opdId);
  const obs = observaciones?.trim() || null;
  await sb.from("phase_events").insert({ opd_id: opdId, tipo: "phase_advance_parcial", actor, payload: { fase_from: opd.fase_actual, fase_to: faseDest, cantidad_pendiente: cantidadPendiente, motivo, ...(obs && { observaciones: obs }) } });
  await sb.from("op_d_pendientes").insert({ opd_padre_id: opdId, fase_origen: opd.fase_actual, motivo, cantidad_afectada: cantidadPendiente, fase_actual: opd.fase_actual, estado: "pendiente", notas: obs });
  updateTag("produccion");
  revalidatePath("/produccion"); revalidatePath("/pendientes");
  return { ok: true };
}

// ─── Bloquear / desbloquear ───────────────────────────────────────────────────
export async function blockOpd(opdId: string, motivo: Enums<"motivo_bloqueo_enum">, observaciones?: string) {
  const { actor, sb } = await getSbChecked();
  await sb.from("op_ds").update({ bloqueada: true, motivo_bloqueo: motivo }).eq("id", opdId);
  await sb.from("phase_events").insert({ opd_id: opdId, tipo: "block", actor, payload: { motivo, ...(observaciones?.trim() && { observaciones: observaciones.trim() }) } });
  updateTag("produccion");
  revalidatePath("/produccion"); revalidatePath("/mi-fase");
  return { ok: true };
}

export async function unblockOpd(opdId: string, resolucion: string) {
  const { actor, sb } = await getSbChecked();
  await sb.from("op_ds").update({ bloqueada: false, motivo_bloqueo: null }).eq("id", opdId);
  await sb.from("phase_events").insert({ opd_id: opdId, tipo: "unblock", actor, payload: { resolucion } });
  updateTag("produccion");
  revalidatePath("/produccion"); revalidatePath("/mi-fase");
  return { ok: true };
}

// ─── Checkbox F0 ──────────────────────────────────────────────────────────────
export async function updateF0Checkbox(
  opdId: string,
  campo: "f0_ficha_tec"|"f0_patronaje"|"f0_muestra"|"f0_aprobacion"|"f0_tela_avios"|"f0_op_creada",
  valor: boolean
) {
  const { actor, sb } = await getSbChecked();
  await sb.from("op_ds").update({ [campo]: valor }).eq("id", opdId);
  await sb.from("phase_events").insert({ opd_id: opdId, tipo: "f0_checkbox_update", actor, payload: { campo, valor } });
  updateTag("produccion");
  revalidatePath("/produccion");
  return { ok: true };
}

// ─── Score override ───────────────────────────────────────────────────────────
export async function scoreOverride(opdId: string, score: number | null, motivo: string) {
  const { actor, sb } = await getSbChecked();
  await sb.from("op_ds").update({ score_override: score, score_motivo: motivo }).eq("id", opdId);
  await sb.from("phase_events").insert({ opd_id: opdId, tipo: "score_update", actor, payload: { score_override: score, motivo } });
  updateTag("produccion");
  revalidatePath("/produccion"); revalidatePath("/cola");
  return { ok: true };
}

// ─── Replanificación ─────────────────────────────────────────────────────────
export async function replanOpd(
  opdId: string,
  cambios: Partial<Record<"dias_fase_0"|"dias_compras"|"dias_trazo"|"dias_corte"|"dias_tiqueteo"|"dias_satelites"|"dias_empaque"|"dias_despacho", number>>
) {
  const { actor, sb } = await getSbChecked();
  await sb.from("op_ds").update(cambios).eq("id", opdId);
  await sb.from("phase_events").insert({ opd_id: opdId, tipo: "replan", actor, payload: cambios });
  updateTag("produccion");
  revalidatePath("/produccion"); revalidatePath("/mi-fase");
  return { ok: true };
}

export async function replanOpFull(
  opNum: string,
  cambios: Partial<Record<"dias_fase_0"|"dias_compras"|"dias_trazo"|"dias_corte"|"dias_tiqueteo"|"dias_satelites"|"dias_empaque"|"dias_despacho", number>>
) {
  const { actor, sb } = await getSbChecked();
  if (!Object.keys(cambios).length) return { error: "Nada que aplicar" };

  const { data: opds } = await sb.from("op_ds").select("id").eq("op_num", opNum);
  if (!opds || opds.length === 0) return { error: "No se encontraron OP-Ds" };

  await sb.from("op_ds").update(cambios).eq("op_num", opNum);

  const eventos = opds.map((o: { id: string }) => ({
    opd_id: o.id, tipo: "replan", actor,
    payload: { ...cambios, nivel: "op" }
  }));
  await sb.from("phase_events").insert(eventos);

  updateTag("produccion");
  revalidatePath("/produccion"); revalidatePath("/mi-fase");
  return { ok: true, n: opds.length };
}

export async function replanBatchOpds(
  opdIds: string[],
  cambios: Partial<Record<"dias_fase_0"|"dias_compras"|"dias_trazo"|"dias_corte"|"dias_tiqueteo"|"dias_satelites"|"dias_empaque"|"dias_despacho", number>>,
  motivo?: string
) {
  const { actor, sb } = await getSbChecked();
  if (!opdIds.length || !Object.keys(cambios).length) return { error: "Nada que aplicar" };
  await sb.from("op_ds").update(cambios).in("id", opdIds);
  const eventos = opdIds.map((id) => ({
    opd_id: id, tipo: "replan", actor,
    payload: { ...cambios, lote: true, ...(motivo ? { motivo } : {}) },
  }));
  await sb.from("phase_events").insert(eventos);
  updateTag("produccion");
  revalidatePath("/produccion"); revalidatePath("/mi-fase");
  return { ok: true, n: opdIds.length };
}

// ─── Replanificación mixta (por OP-D, cambios distintos por fila) ────────────
export async function replanOpdsMixed(
  changes: { opdId: string; cambios: Partial<Record<"dias_fase_0"|"dias_compras"|"dias_trazo"|"dias_corte"|"dias_tiqueteo"|"dias_satelites"|"dias_empaque"|"dias_despacho", number>> }[],
  motivo?: string
): Promise<{ ok: true; n: number } | { error: string }> {
  const { actor, sb } = await getSbChecked();
  const valid = changes.filter((c) => Object.keys(c.cambios).length > 0);
  if (!valid.length) return { error: "Nada que aplicar" };
  for (const { opdId, cambios } of valid) {
    // Trigger RN-06 llama recalc_pull automáticamente al UPDATE de dias_* en op_ds
    await sb.from("op_ds").update(cambios).eq("id", opdId);
    await sb.from("phase_events").insert({
      opd_id: opdId, tipo: "replan", actor,
      payload: { ...cambios, lote: true, ...(motivo ? { motivo } : {}) },
    });
  }
  updateTag("produccion");
  revalidatePath("/produccion"); revalidatePath("/mi-fase");
  return { ok: true, n: valid.length };
}

// ─── Satélites ────────────────────────────────────────────────────────────────
export async function setSatellitePromise(opdId: string, fecha: string) {
  const { actor, sb } = await getSbChecked();
  const { data: prev } = await sb.from("op_ds").select("fecha_promesa_satelites").eq("id", opdId).single();
  const fechaAnterior: string | null = prev?.fecha_promesa_satelites ?? null;
  const deltaDias = fechaAnterior
    ? Math.round((new Date(fecha).getTime() - new Date(fechaAnterior).getTime()) / 86_400_000)
    : null;
  await sb.from("op_ds").update({ fecha_promesa_satelites: fecha }).eq("id", opdId);
  await sb.from("phase_events").insert({ opd_id: opdId, tipo: "satellite_promise_set", actor, payload: { fecha, fecha_anterior: fechaAnterior, delta_dias: deltaDias } });
  updateTag("produccion");
  revalidatePath("/produccion"); revalidatePath("/mi-fase");
  return { ok: true };
}

export async function addObservacion(opdId: string, texto: string, fase: string) {
  if (!texto.trim()) return { ok: false, error: "vacío" };
  const { actor, sb } = await getSbChecked();
  await sb.from("phase_events").insert({ opd_id: opdId, tipo: "observacion_tecnica", fase: fase as Enums<"fase_enum">, actor, payload: { texto: texto.trim() } });
  updateTag("produccion");
  return { ok: true };
}

export async function setSatelliteReceived(opdId: string, fecha: string) {
  const { actor, sb } = await getSbChecked();
  await sb.from("op_ds").update({ fecha_recepcion_satelites: fecha }).eq("id", opdId);
  await sb.from("phase_events").insert({ opd_id: opdId, tipo: "satellite_received", actor, payload: { fecha } });
  updateTag("produccion");
  revalidatePath("/produccion"); revalidatePath("/mi-fase");
  return { ok: true };
}

// ─── Promesa de fecha por fase ───────────────────────────────────────────────
async function assertPuedeEditarFase(sb: any, actor: string, fase: Enums<"fase_enum">): Promise<void> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data } = await sb.from("usuarios_sistema").select("id, rol").eq("email", actor).single();
  if (!data) throw new Error("Usuario no encontrado en el sistema");
  if (data.rol === "visualizacion") throw new Error("Tu rol es de solo visualización");
  if (data.rol === "lider_fase") {
    const { data: ufa } = await sb.from("usuario_fases_asignadas")
      .select("fase").eq("usuario_id", data.id).eq("solo_lectura", false).eq("fase", fase);
    if (!ufa || ufa.length === 0)
      throw new Error(`Solo puedes editar promesas de tus fases operativas asignadas`);
  }
}

export async function setPhasePromise(opdId: string, fase: Enums<"fase_enum">, fecha: string) {
  const { actor, sb } = await getSbChecked();
  await assertPuedeEditarFase(sb, actor, fase);
  const { data: prev } = await sb.from("phase_promises").select("fecha_promesa").eq("opd_id", opdId).eq("fase", fase).maybeSingle();
  const fechaAnterior: string | null = prev?.fecha_promesa ?? null;
  const deltaDias = fechaAnterior
    ? Math.round((new Date(fecha).getTime() - new Date(fechaAnterior).getTime()) / 86_400_000)
    : null;
  const { error: upErr } = await sb.from("phase_promises").upsert(
    { opd_id: opdId, fase, fecha_promesa: fecha, set_by: actor, set_at: new Date().toISOString() },
    { onConflict: "opd_id,fase" }
  );
  if (upErr) return { error: upErr.message };
  await sb.from("phase_events").insert({
    opd_id: opdId, tipo: "satellite_promise_set", fase, actor,
    payload: { fecha, fecha_anterior: fechaAnterior, delta_dias: deltaDias, scope: "phase_promise" },
  });
  updateTag("produccion");
  revalidatePath("/produccion"); revalidatePath("/mi-fase");
  return { ok: true };
}

export async function setPhasePromiseBatch(opdIds: string[], fase: Enums<"fase_enum">, fecha: string) {
  const { actor, sb } = await getSbChecked();
  await assertPuedeEditarFase(sb, actor, fase);
  const { data: prevs } = await sb.from("phase_promises").select("opd_id,fecha_promesa").in("opd_id", opdIds).eq("fase", fase);

  const upserts = opdIds.map(id => ({ opd_id: id, fase, fecha_promesa: fecha, set_by: actor, set_at: new Date().toISOString() }));
  const { error: upErr } = await sb.from("phase_promises").upsert(upserts, { onConflict: "opd_id,fase" });
  if (upErr) return { error: upErr.message };

  const eventos = opdIds.map(id => {
    const prev = prevs?.find((p: { opd_id: string, fecha_promesa: string | null }) => p.opd_id === id);
    const fechaAnterior = prev?.fecha_promesa ?? null;
    const deltaDias = fechaAnterior
      ? Math.round((new Date(fecha).getTime() - new Date(fechaAnterior).getTime()) / 86_400_000)
      : null;
    return {
      opd_id: id, tipo: "satellite_promise_set" as const, fase, actor,
      payload: { fecha, fecha_anterior: fechaAnterior, delta_dias: deltaDias, scope: "phase_promise", lote: true },
    };
  });
  await sb.from("phase_events").insert(eventos);

  updateTag("produccion");
  revalidatePath("/produccion"); revalidatePath("/mi-fase");
  return { ok: true };
}

export async function togglePaqueteCompleto(opdId: string, val: boolean) {
  const { actor, sb } = await getSbChecked();
  await assertPuedeEditarFase(sb, actor, "compras");
  const { error } = await sb.from("op_ds").update({ paquete_completo: val }).eq("id", opdId);
  if (error) return { error: error.message };
  updateTag("produccion");
  revalidatePath("/mi-fase");
  return { ok: true };
}

export async function togglePaqueteCompletoBatch(opdIds: string[], val: boolean) {
  const { actor, sb } = await getSbChecked();
  await assertPuedeEditarFase(sb, actor, "compras");
  const { error } = await sb.from("op_ds").update({ paquete_completo: val }).in("id", opdIds);
  if (error) return { error: error.message };
  updateTag("produccion");
  revalidatePath("/mi-fase");
  return { ok: true, n: opdIds.length };
}

export async function setUdsRecibidasEmpaque(opdId: string, val: number | null) {
  const { sb, actor } = await getSbChecked();
  await assertPuedeEditarFase(sb, actor, "empaque");
  const { error } = await sb.from("op_ds").update({ uds_recibidas_empaque: val }).eq("id", opdId);
  if (error) return { error: error.message };
  await sb.from("phase_events").insert({
    opd_id: opdId, tipo: "uds_recibidas_empaque_set", actor,
    payload: { uds_recibidas: val }
  });
  updateTag("produccion");
  revalidatePath("/mi-fase");
  return { ok: true };
}
// ─── Fecha compromiso (en ops) ───────────────────────────────────────────────
export async function setFechaCompromiso(opNum: string, fecha: string) {
  const { actor, sb } = await getSbCheckedCompromiso();
  const { data: prev } = await sb.from("ops").select("fecha_compromiso").eq("op_num", opNum).single();
  const { data, error } = await sb.from("ops").update({ fecha_compromiso: fecha }).eq("op_num", opNum).select();
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: `No se encontró la OP con número '${opNum}' al intentar actualizar.` };
  // El trigger tg_ops_recalc_fecha recalcula el pull de todas las op_ds de esta OP automáticamente
  const { data: opdRows } = await sb.from("op_ds").select("id").eq("op_num", opNum).eq("activa", true);
  if (opdRows?.length) {
    await sb.from("phase_events").insert(
      opdRows.map((r: { id: string }) => ({
        opd_id: r.id, tipo: "replan", actor,
        payload: { motivo: "cambio_fecha_compromiso", fecha_anterior: prev?.fecha_compromiso ?? null, fecha_nueva: fecha },
      }))
    );
  }
  updateTag("produccion");
  revalidatePath("/produccion", "page");
  revalidatePath("/mi-fase", "page");
  revalidatePath("/ops", "page");
  return { ok: true };
}

export async function setFechaCompromisoMultiple(opNums: string[], fecha: string) {
  const { actor, sb } = await getSbCheckedCompromiso();
  if (!opNums.length || !fecha) return { error: "Parámetros inválidos" };
  const { data: prevs } = await sb.from("ops").select("op_num,fecha_compromiso").in("op_num", opNums);
  const { error } = await sb.from("ops").update({ fecha_compromiso: fecha }).in("op_num", opNums);
  if (error) return { error: error.message };
  const { data: opdRows } = await sb.from("op_ds").select("id,op_num").in("op_num", opNums).eq("activa", true);
  if (opdRows?.length) {
    await sb.from("phase_events").insert(
      (opdRows as { id: string; op_num: string }[]).map((r) => {
        const prev = (prevs ?? []).find((p: { op_num: string; fecha_compromiso: string | null }) => p.op_num === r.op_num);
        return {
          opd_id: r.id, tipo: "replan", actor,
          payload: { motivo: "cambio_fecha_compromiso", lote: true, fecha_anterior: prev?.fecha_compromiso ?? null, fecha_nueva: fecha },
        };
      })
    );
  }
  updateTag("produccion");
  revalidatePath("/produccion"); revalidatePath("/mi-fase"); revalidatePath("/ops");
  return { ok: true, n: opNums.length };
}

// ─── Estado IMPEL (recordatorio para el operador) ────────────────────────────
const ESTADOS_IMPEL = [
  "Pendiente Inicio Producción",
  "En Producción",
  "En Producción - Reproceso",
] as const;
export type EstadoImpel = typeof ESTADOS_IMPEL[number];

export async function updateEstadoImpel(opNum: string, estado: EstadoImpel) {
  const { sb } = await getSbChecked();
  const { error } = await sb.from("ops").update({ estado_impel: estado }).eq("op_num", opNum);
  if (error) return { error: error.message };
  updateTag("produccion");
  return { ok: true };
}

// ─── Componentes / telas (checklist de corte) ───────────────────────────────
type ComponenteInput = { nombre_tela: string; ref_impel?: string | null; rol?: string | null };

// Define/reemplaza la lista de telas de una OP-D (asignación manual).
// Marca las filas como es_manual=true para protegerlas del ETL. Preserva el
// estado `cortado` de las telas que ya existían (match por nombre_tela).
export async function setComponentes(opdId: string, items: ComponenteInput[]) {
  const { actor, sb } = await getSbChecked();

  const limpios = items
    .map((i) => ({ ...i, nombre_tela: i.nombre_tela.trim() }))
    .filter((i) => i.nombre_tela.length > 0);

  const { data: existentes } = await sb.from("op_d_componentes")
    .select("id,nombre_tela,cortado,cantidad_cortada,cantidad_tiqueteada").eq("opd_id", opdId);
  type ExistRow = { nombre_tela: string; cortado: boolean; cantidad_cortada: number; cantidad_tiqueteada: number };
  const prevMap = new Map<string, ExistRow>(
    (existentes ?? []).map((e: ExistRow) => [e.nombre_tela, e])
  );

  // Obtener la cantidad de la OP-D para poblar cantidad_objetivo en nuevas filas
  const { data: opd } = await sb.from("op_ds").select("cantidad").eq("id", opdId).single();
  const cantidadOpd: number = (opd as { cantidad: number } | null)?.cantidad ?? 0;

  // Reemplazo total: borra las existentes y reinserta (preservando cantidades previas).
  await sb.from("op_d_componentes").delete().eq("opd_id", opdId);

  if (limpios.length) {
    const { error: insErr } = await sb.from("op_d_componentes").insert(
      limpios.map((i) => {
        const prev = prevMap.get(i.nombre_tela);
        return {
          opd_id: opdId,
          nombre_tela: i.nombre_tela,
          ref_impel: i.ref_impel ?? null,
          rol: i.rol ?? null,
          es_manual: true,
          cortado: false,
          cantidad_objetivo:   cantidadOpd,
          cantidad_cortada:    prev?.cantidad_cortada    ?? 0,
          cantidad_tiqueteada: prev?.cantidad_tiqueteada ?? 0,
        };
      })
    );
    if (insErr) return { ok: false, n: 0, error: insErr.message };
  }

  await sb.from("phase_events").insert({
    opd_id: opdId, tipo: "componentes_asignados", actor,
    payload: { telas: limpios.map((i) => i.nombre_tela), origen: "manual" },
  });

  updateTag("produccion");
  revalidatePath("/produccion"); revalidatePath("/mi-fase");
  return { ok: true, n: limpios.length };
}

// ─── Registrar corte por cantidad (reemplaza toggleComponenteCortado) ─────────
type RegistroItem = { componenteId: string; cantidad: number };

export async function registrarCorte(
  registros: RegistroItem[],
  motivo: Enums<"causa_desvio_enum"> | null,
  avanzarIds: string[],
): Promise<{ ok: number; errores: { ref: string; error: string }[] }> {
  const { actor, sb } = await getSbChecked();

  const compIds = registros.map(r => r.componenteId);
  const { data: comps } = await sb.from("op_d_componentes")
    .select("id,opd_id,nombre_tela,cantidad_objetivo,cantidad_cortada")
    .in("id", compIds);
  type CompRow = { id: string; opd_id: string; nombre_tela: string; cantidad_objetivo: number; cantidad_cortada: number };
  const compMap = new Map<string, CompRow>((comps ?? []).map((c: CompRow) => [c.id, c]));

  for (const reg of registros) {
    const comp = compMap.get(reg.componenteId);
    if (!comp || reg.cantidad <= 0) continue;
    const nueva = Math.min(comp.cantidad_cortada + reg.cantidad, comp.cantidad_objetivo);
    await sb.from("op_d_componentes").update({ cantidad_cortada: nueva }).eq("id", comp.id);
    await sb.from("phase_events").insert({
      opd_id: comp.opd_id, fase: "corte", tipo: "avance_corte", actor,
      payload: { componente_id: comp.id, nombre_tela: comp.nombre_tela, delta: reg.cantidad, total: nueva, objetivo: comp.cantidad_objetivo },
    });
    if (nueva < comp.cantidad_objetivo) {
      await sb.from("op_d_pendientes").insert({
        opd_padre_id: comp.opd_id, componente_id: comp.id,
        fase_origen: "corte", fase_actual: "corte",
        motivo: motivo ?? "volumen_parcial",
        cantidad_afectada: comp.cantidad_objetivo - nueva,
        estado: "pendiente",
      });
    }
  }

  let ok = 0;
  const errores: { ref: string; error: string }[] = [];
  for (const opdId of avanzarIds) {
    const res = await _advanceOne(sb, actor, opdId, undefined, { permitirParcial: true });
    if (res.ok) ok++;
    else errores.push({ ref: res.ref ?? opdId, error: res.error ?? "Error" });
  }

  updateTag("produccion");
  revalidatePath("/produccion"); revalidatePath("/mi-fase"); revalidatePath("/pendientes");
  return { ok, errores };
}

export async function registrarTiqueteo(
  registros: RegistroItem[],
  motivo: Enums<"causa_desvio_enum"> | null,
  avanzarIds: string[],
): Promise<{ ok: number; errores: { ref: string; error: string }[] }> {
  const { actor, sb } = await getSbChecked();

  const compIds = registros.map(r => r.componenteId);
  const { data: comps } = await sb.from("op_d_componentes")
    .select("id,opd_id,nombre_tela,cantidad_objetivo,cantidad_cortada,cantidad_tiqueteada")
    .in("id", compIds);
  type CompRow = { id: string; opd_id: string; nombre_tela: string; cantidad_objetivo: number; cantidad_cortada: number; cantidad_tiqueteada: number };
  const compMap = new Map<string, CompRow>((comps ?? []).map((c: CompRow) => [c.id, c]));

  for (const reg of registros) {
    const comp = compMap.get(reg.componenteId);
    if (!comp || reg.cantidad <= 0) continue;
    const nueva = Math.min(comp.cantidad_tiqueteada + reg.cantidad, comp.cantidad_cortada);
    await sb.from("op_d_componentes").update({ cantidad_tiqueteada: nueva }).eq("id", comp.id);
    await sb.from("phase_events").insert({
      opd_id: comp.opd_id, fase: "tiqueteo", tipo: "avance_tiqueteo", actor,
      payload: { componente_id: comp.id, nombre_tela: comp.nombre_tela, delta: reg.cantidad, total: nueva, objetivo: comp.cantidad_objetivo },
    });
    if (nueva < comp.cantidad_objetivo) {
      await sb.from("op_d_pendientes").insert({
        opd_padre_id: comp.opd_id, componente_id: comp.id,
        fase_origen: "tiqueteo", fase_actual: "tiqueteo",
        motivo: motivo ?? "volumen_parcial",
        cantidad_afectada: comp.cantidad_objetivo - nueva,
        estado: "pendiente",
      });
    }
  }

  let ok = 0;
  const errores: { ref: string; error: string }[] = [];
  for (const opdId of avanzarIds) {
    const res = await _advanceOne(sb, actor, opdId, undefined, { permitirParcial: true });
    if (res.ok) ok++;
    else errores.push({ ref: res.ref ?? opdId, error: res.error ?? "Error" });
  }

  updateTag("produccion");
  revalidatePath("/produccion"); revalidatePath("/mi-fase"); revalidatePath("/pendientes");
  return { ok, errores };
}

// toggleComponenteCortado — DEPRECATED: cortado es derivado por trigger desde cantidad_cortada.
// Redirige a registrarCorte para compatibilidad con código legacy mientras se migra el drawer.
export async function toggleComponenteCortado(componenteId: string, cortado: boolean) {
  if (!cortado) return { ok: true }; // desmarcar no tiene sentido con el nuevo modelo
  return registrarCorte([{ componenteId, cantidad: 999999 }], null, []);
}

// ─── Subestados de satélites ─────────────────────────────────────────────────
export async function setSubestadoSatelite(opdId: string, subestado: string) {
  const { actor, sb } = await getSbChecked();
  await assertPuedeEditarFase(sb, actor, "satelites");
  await sb.from("op_ds").update({ subestado_satelite: subestado as never }).eq("id", opdId);
  await sb.from("phase_events").insert({
    opd_id: opdId, tipo: "satelite_subestado_change" as never, actor,
    fase: "satelites", payload: { subestado },
  });
  updateTag("produccion");
  return { ok: true };
}

export async function setSubfasePromesaSatelite(opdId: string, subestado: string, fecha: string) {
  const { actor, sb } = await getSbChecked();
  await assertPuedeEditarFase(sb, actor, "satelites");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any).from("satelite_subfase_promesa").upsert(
    { opd_id: opdId, subestado, fecha_promesa: fecha, set_by: actor, set_at: new Date().toISOString() },
    { onConflict: "opd_id,subestado" }
  );
  if (error) return { error: error.message };
  updateTag("produccion");
  return { ok: true };
}

// ─── Prioridad global (WIP/tabla) ────────────────────────────────────────────
export async function reordenarPrioridad(items: { opdId: string; prioridad: number | null }[]) {
  const { sb } = await getSbChecked();
  for (const { opdId, prioridad } of items) {
    await sb.from("op_ds").update({ prioridad_manual: prioridad }).eq("id", opdId);
  }
  updateTag("produccion");
  return { ok: true };
}

// ─── Prioridad por fase (Gantt por fase) ─────────────────────────────────────
export async function reordenarPrioridadFase(fase: string, items: { opdId: string; prioridad: number }[]) {
  const { sb } = await getSbChecked();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as any;
  for (const { opdId, prioridad } of items) {
    const { error } = await sbAny.from("op_d_prioridad_fase").upsert(
      { opd_id: opdId, fase, prioridad },
      { onConflict: "opd_id,fase" }
    );
    if (error) return { error: (error as { message: string }).message };
  }
  updateTag("produccion");
  return { ok: true };
}

// ─── Cerrar pendiente ─────────────────────────────────────────────────────────
export async function closePendiente(pendienteId: string) {
  const { actor, sb } = await getSbChecked();
  const { data: p } = await sb.from("op_d_pendientes")
    .select("opd_padre_id,fase_actual,motivo").eq("id", pendienteId).single();
  await sb.from("op_d_pendientes")
    .update({ estado: "cerrado", closed_at: new Date().toISOString(), closed_by: actor })
    .eq("id", pendienteId);
  if (p?.opd_padre_id) {
    await sb.from("phase_events").insert({
      opd_id: p.opd_padre_id, tipo: "pendiente_cerrado", actor,
      payload: { pendiente_id: pendienteId, fase_actual: p.fase_actual, motivo: p.motivo },
    });
  }
  updateTag("produccion");
  revalidatePath("/pendientes"); revalidatePath("/produccion"); revalidatePath("/mi-fase");
  return { ok: true };
}

// ─── Avanzar fase de un pendiente ────────────────────────────────────────────
export async function advancePendienteFase(pendienteId: string) {
  const { actor, sb } = await getSbChecked();

  const { data: p } = await sb.from("op_d_pendientes")
    .select("opd_padre_id,fase_actual,motivo,cantidad_afectada")
    .eq("id", pendienteId).single();

  if (!p) return { error: "Pendiente no encontrado" };

  const idx = FASES_ORDEN.indexOf(p.fase_actual);
  if (idx < 0 || idx >= FASES_ORDEN.length - 1)
    return { error: "El pendiente ya está en la última fase" };

  const faseDest = FASES_ORDEN[idx + 1];

  await sb.from("op_d_pendientes")
    .update({ fase_actual: faseDest })
    .eq("id", pendienteId);

  await sb.from("phase_events").insert({
    opd_id: p.opd_padre_id, tipo: "pendiente_avance", actor,
    payload: {
      pendiente_id: pendienteId,
      fase_from: p.fase_actual, fase_to: faseDest,
      motivo: p.motivo, cantidad: p.cantidad_afectada,
    },
  });

  updateTag("produccion");
  revalidatePath("/pendientes"); revalidatePath("/mi-fase");
  return { ok: true, faseDest };
}
