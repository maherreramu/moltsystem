import type { Enums } from "@/types/supabase";
import type { LiderJump } from "@/lib/actions/phase-jumps-actions";

export const SUBESTADO_SATELITE_ORDEN: Enums<"satelite_subestado_enum">[] = [
  "corte_externo",
  "marcacion",
  "confeccion",
  "paquete_completo",
];

export const SUBESTADO_LABEL: Record<Enums<"satelite_subestado_enum">, string> = {
  corte_externo:    "Corte externo",
  marcacion:        "Marcación",
  confeccion:       "Confección",
  paquete_completo: "Paquete completo",
};

export const FASES_ORDEN: Enums<"fase_enum">[] = [
  "fase_0", "compras", "trazo", "corte",
  "tiqueteo", "satelites", "empaque", "despacho", "cierre",
];

export const FASE_LABEL: Record<Enums<"fase_enum">, string> = {
  fase_0:    "Fase 0",
  compras:   "Compras",
  trazo:     "Trazo",
  corte:     "Corte",
  tiqueteo:  "Tiqueteo",
  satelites: "Satélites",
  empaque:   "Empaque",
  despacho:  "Despacho",
  cierre:    "Cierre",
};

// Devuelve los destinos de salto válidos según rol, fase asignada y fases de origen seleccionadas.
// admin/directivo: cualquier fase posterior (excluye despacho y cierre).
// lider_fase: solo destinos habilitados en phase_jumps_config y solo si todos los orígenes == faseAsignada.
// visualizacion / null: vacío.
export function saltoDestinosPermitidos(
  rol: string | null,
  fasesOperativas: Enums<"fase_enum">[],
  origenes: Enums<"fase_enum">[],
  liderJumps: LiderJump[],
): Enums<"fase_enum">[] {
  if (!origenes.length) return [];
  if (rol === "admin" || rol === "directivo") {
    const maxIdx = Math.max(...origenes.map(f => FASES_ORDEN.indexOf(f)));
    return maxIdx >= 0 ? FASES_ORDEN.slice(maxIdx + 1, -2) : [];
  }
  if (rol === "lider_fase" && fasesOperativas.length > 0) {
    // Solo si todos los orígenes pertenecen a las fases operativas del líder
    if (!origenes.every(f => fasesOperativas.includes(f))) return [];

    // Obtenemos los destinos válidos para el primer origen
    const primerOrigen = origenes[0];
    const destinos = new Set(
      liderJumps.filter(j => j.from_fase === primerOrigen && j.allowed).map(j => j.to_fase as Enums<"fase_enum">)
    );

    // Intersectamos con los destinos válidos de los demás orígenes
    for (let i = 1; i < origenes.length; i++) {
      const orig = origenes[i];
      const destsOrig = new Set(liderJumps.filter(j => j.from_fase === orig && j.allowed).map(j => j.to_fase as Enums<"fase_enum">));
      for (const d of destinos) {
        if (!destsOrig.has(d)) destinos.delete(d);
      }
    }
    return Array.from(destinos);
  }
  return [];
}
