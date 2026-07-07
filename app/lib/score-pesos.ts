/**
 * Mapeo de puntos y labels para los 4 atributos de cliente que alimentan v_score.
 * La fuente de verdad es el SQL (v_score / 0026_clientes_homologacion_manual.sql).
 * Este módulo es solo para mostrar el aporte de cada opción en la UI de /clientes.
 */

export const TIER_PTS: Record<string, number> = {
  tier_1:   20,
  tier_2:   10,
  estandar:  4,
};

export const RELACION_PTS: Record<string, number> = {
  contrato_con_penalizacion: 20,
  contrato_sin_penalizacion: 12,
  recurrente:                 6,
  unico:                      0,
};

export const PAGO_PTS: Record<string, number> = {
  anticipado:  15,
  hasta_30d:   15,
  "30_a_60d":   8,
  mas_de_60d:   3,
};

export const COMPLEJIDAD_PTS: Record<string, number> = {
  alta:  5,
  media: 3,
  baja:  1,
};

export const TIER_LABEL: Record<string, string> = {
  tier_1:   "Tier 1 — cliente estratégico",
  tier_2:   "Tier 2 — cliente importante",
  estandar: "Estándar",
};

export const RELACION_LABEL: Record<string, string> = {
  contrato_con_penalizacion: "Contrato c/penalización",
  contrato_sin_penalizacion: "Contrato s/penalización",
  recurrente:                "Recurrente",
  unico:                     "Único / esporádico",
};

export const PAGO_LABEL: Record<string, string> = {
  anticipado:  "Anticipado",
  hasta_30d:   "≤30 días",
  "30_a_60d":  "30–60 días",
  mas_de_60d:  ">60 días",
};

export const COMPLEJIDAD_LABEL: Record<string, string> = {
  alta:  "Alta",
  media: "Media",
  baja:  "Baja",
};
