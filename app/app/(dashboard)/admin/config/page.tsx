import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fetchLeadTimesEstandar, updateLeadTimeEstandar } from "@/lib/actions/lead-time-actions";
import { fetchSemaforoConfig, upsertSemaforoRegla } from "@/lib/actions/semaforo-actions";
import { fetchPhaseJumpsConfig, upsertPhaseJump } from "@/lib/actions/phase-jumps-actions";
import { FASE_LABEL, FASES_ORDEN } from "@/lib/fases";
import { LeadTimeImportExport } from "@/components/admin/lead-time-import-export";

export const metadata = { title: "Configuración — Tiempos estándar" };

const FASES_OPERATIVAS = FASES_ORDEN.filter(
  f => f !== "fase_0" && f !== "cierre"
);

export default async function AdminConfigPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sb = await createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: yo } = await (sb as any).from("usuarios_sistema")
    .select("rol").eq("email", user.email).single();
  if (yo?.rol !== "admin") redirect("/produccion");

  const [rows, semaforos, phaseJumps] = await Promise.all([
    fetchLeadTimesEstandar(),
    fetchSemaforoConfig(),
    fetchPhaseJumpsConfig(),
  ]);

  const semGeneral = semaforos.find(s => s.scope === "general" && s.fase == null);
  const semPorFase = Object.fromEntries(
    semaforos.filter(s => s.scope === "fase" && s.fase != null).map(s => [s.fase!, s])
  );

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-12">

      {/* ── Tiempos estándar ──────────────────────────────── */}
      <section>
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Tiempos estándar por fase</h1>
        <p className="text-sm text-gray-500 mb-8">
          Días hábiles default que se aplican a cada OP-D nueva desde IMPEL.
          Los cambios aquí no afectan OP-Ds ya cargadas — para actualizarlas usa replanificación individual.
        </p>

        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Fase</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase w-28">Días</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Condiciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.fase} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {FASE_LABEL[row.fase as keyof typeof FASE_LABEL] ?? row.fase}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <form action={async (fd: FormData) => {
                      "use server";
                      const dias = Number(fd.get("dias"));
                      await updateLeadTimeEstandar(row.fase, dias);
                    }}>
                      <input
                        type="number"
                        name="dias"
                        min={0}
                        max={90}
                        defaultValue={row.dias_default}
                        className="w-16 text-center border border-gray-300 rounded px-2 py-1 text-sm
                                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <button
                        type="submit"
                        className="ml-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Guardar
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{row.condiciones ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <LeadTimeImportExport rows={rows} />

        <p className="mt-4 text-xs text-gray-400">
          Última edición reflejada en updated_at de la tabla lead_time_recurso.
          Solo usuarios con rol <span className="font-mono">admin</span> pueden modificar estos valores.
          Al importar, la columna A (Clave) identifica la fase y la columna C (Días) actualiza el valor.
        </p>
      </section>

      {/* ── Reglas de semáforo ────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Reglas de semáforo</h2>
        <p className="text-sm text-gray-500 mb-6">
          Umbrales en días hábiles para cada tipo de semáforo. El semáforo general mide días
          hasta la fecha de compromiso comercial. El semáforo de fase mide días hasta el cierre
          planeado de la fase actual según el Gantt pull — cada fase tiene su propio umbral.
        </p>

        {/* Semáforo general */}
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Semáforo general (días hasta compromiso)</h3>
        <div className="border border-gray-200 rounded-lg overflow-hidden mb-8">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Alcance</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase w-32">
                  <span className="text-green-600">Verde</span> (días ≥)
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase w-32">
                  <span className="text-yellow-500">Amarillo</span> (días ≥)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr className="hover:bg-gray-50/60 bg-gray-50/40">
                <td className="px-4 py-3 font-semibold text-gray-800">General (todas las OP-Ds)</td>
                <td className="px-4 py-3 text-center">
                  <form action={async (fd: FormData) => {
                    "use server";
                    await upsertSemaforoRegla("general", null, Number(fd.get("verde")), Number(fd.get("amarillo")));
                  }} className="flex items-center justify-center gap-1">
                    <input type="number" name="verde" min={-30} max={90}
                      defaultValue={semGeneral?.umbral_verde ?? 15}
                      className="w-14 text-center border border-green-300 rounded px-1 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                    <input type="number" name="amarillo" min={-30} max={90}
                      defaultValue={semGeneral?.umbral_amarillo ?? 7}
                      className="w-14 text-center border border-yellow-300 rounded px-1 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                      aria-label="Umbral amarillo" />
                    <button type="submit" className="ml-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                      Guardar
                    </button>
                  </form>
                </td>
                <td className="px-4 py-3 text-center text-xs text-gray-400">← en mismo form</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Semáforo de fase */}
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Semáforo de fase (días hasta cierre planeado de fase)</h3>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Fase</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase w-32">
                  <span className="text-green-600">Verde</span> (días ≥)
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase w-32">
                  <span className="text-yellow-500">Amarillo</span> (días ≥)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {FASES_OPERATIVAS.map(fase => {
                const cfg = semPorFase[fase];
                return (
                  <tr key={fase} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-medium text-gray-800">{FASE_LABEL[fase]}</td>
                    <td className="px-4 py-3 text-center" colSpan={2}>
                      <form action={async (fd: FormData) => {
                        "use server";
                        const v = fd.get("verde"), a = fd.get("amarillo");
                        if (!v || !a) return;
                        await upsertSemaforoRegla("fase", fase, Number(v), Number(a));
                      }} className="flex items-center justify-center gap-1">
                        <span className="text-xs text-gray-500 w-12 text-right mr-1">Verde:</span>
                        <input type="number" name="verde" min={-30} max={60}
                          defaultValue={cfg?.umbral_verde ?? 5}
                          className="w-14 text-center border border-green-300 rounded px-1 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                        <span className="text-xs text-gray-500 w-16 text-right mr-1">Amarillo:</span>
                        <input type="number" name="amarillo" min={-30} max={60}
                          defaultValue={cfg?.umbral_amarillo ?? 2}
                          className="w-14 text-center border border-yellow-300 rounded px-1 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                        <button type="submit" className="ml-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                          Guardar
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-gray-400">
          Semáforo general: días hasta fecha de compromiso comercial. Semáforo de fase: días hasta
          el cierre planeado por Gantt pull, configurable por cada fase individualmente.
          Solo usuarios con rol <span className="font-mono">admin</span> pueden modificar estos valores.
        </p>
      </section>

      {/* ── Saltos de fase permitidos (lider_fase) ──────────── */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Saltos de fase permitidos</h2>
        <p className="text-sm text-gray-500 mb-6">
          Define qué saltos de fase puede realizar un <span className="font-mono">lider_fase</span> desde
          su fase asignada. Admin y directivos siempre pueden saltar a cualquier fase anterior.
        </p>

        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Origen</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Destino</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase w-24">Permitido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {FASES_OPERATIVAS.flatMap(from =>
                FASES_OPERATIVAS
                  .filter(to => FASES_ORDEN.indexOf(to) > FASES_ORDEN.indexOf(from) && to !== "despacho")
                  .map(to => {
                    const current = phaseJumps.find(j => j.from_fase === from && j.to_fase === to);
                    return (
                      <tr key={`${from}-${to}`} className="hover:bg-gray-50/60">
                        <td className="px-4 py-3 font-medium text-gray-800">{FASE_LABEL[from]}</td>
                        <td className="px-4 py-3 text-gray-600">{FASE_LABEL[to]}</td>
                        <td className="px-4 py-3 text-center">
                          <form action={async (fd: FormData) => {
                            "use server";
                            const allowed = fd.get("allowed") === "1";
                            await upsertPhaseJump(from, to, allowed);
                          }}>
                            <input type="hidden" name="allowed" value={current?.allowed ? "0" : "1"} />
                            <button
                              type="submit"
                              className={`w-8 h-5 rounded-full transition-colors ${current?.allowed ? "bg-violet-600" : "bg-gray-200"}`}
                              title={current?.allowed ? "Clic para deshabilitar" : "Clic para habilitar"}
                            >
                              <span className={`block w-4 h-4 bg-white rounded-full shadow mx-auto transition-transform ${current?.allowed ? "translate-x-1.5" : "-translate-x-1.5"}`} />
                            </button>
                          </form>
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-gray-400">
          Solo usuarios con rol <span className="font-mono">admin</span> pueden modificar estos valores.
          Los cambios aplican inmediatamente para todos los líderes de fase.
        </p>
      </section>
    </div>
  );
}
