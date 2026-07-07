/**
 * Formateo de números consistente entre servidor y cliente.
 * toLocaleString() produce salida diferente según el locale del entorno
 * (Node.js vs browser) y causa hydration mismatches en Next.js SSR.
 * Esta función usa regex para separar miles con punto (estilo Colombia).
 */
export function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const DIAS  = ["dom","lun","mar","mié","jue","vie","sáb"];

/** Formatea un día sin locale: "lun 2 jun". Evita hydration mismatch. */
export function fmtDia(d: Date): string {
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
}

/**
 * Dado un ISO-date del lunes de la semana (o cualquier Date),
 * devuelve "lun 2 jun — vie 6 jun".
 */
export function fmtRangoSemana(lunesISO: string | Date): string {
  const lunes   = typeof lunesISO === "string" ? new Date(lunesISO + "T00:00:00") : lunesISO;
  const viernes = new Date(lunes); viernes.setDate(lunes.getDate() + 4);
  return `${fmtDia(lunes)} — ${fmtDia(viernes)}`;
}

/** Retorna el lunes de la semana que está a `offsetSemanas` de la actual. */
export function getLunesDeOffset(offsetSemanas: number): Date {
  const hoy   = new Date();
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - (hoy.getDay() === 0 ? 6 : hoy.getDay() - 1) + offsetSemanas * 7);
  lunes.setHours(0, 0, 0, 0);
  return lunes;
}

/** Date → "YYYY-MM-DD" sin problemas de timezone. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
