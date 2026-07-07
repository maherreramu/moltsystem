"use client";

import { useState, useTransition } from "react";
import { FASE_LABEL, FASES_ORDEN } from "@/lib/fases";
import {
  agregarUsuario, actualizarRolUsuario,
  toggleActivoUsuario, aprobarUsuarioPendiente,
  reenviarInvitacion,
} from "@/lib/actions/usuario-actions";
import type { UsuarioSistema } from "./page";
import type { Enums } from "@/types/supabase";

type FaseAsignadaInput = { fase: Enums<"fase_enum">; solo_lectura: boolean };

const ROL_LABEL: Record<string, string> = {
  admin:          "Admin",
  directivo:      "Directivo",
  lider_fase:     "Líder de fase",
  visualizacion:  "Solo visualización",
};

const ROL_DESC: Record<string, string> = {
  admin:         "Acceso total — gestión de usuarios, clientes, score override",
  directivo:     "Puede avanzar fases, bloquear, replanificar, ver todo",
  lider_fase:    "Puede avanzar fases de su fase asignada",
  visualizacion: "Solo lectura — no puede realizar cambios",
};

// ─── Fila de usuario existente ────────────────────────────────────────────────
function FilaUsuario({ u }: { u: UsuarioSistema }) {
  const [isPending, start] = useTransition();
  const [msg, setMsg]      = useState<string | null>(null);
  const [rolLocal, setRol] = useState(u.rol);
  const [fasesLocal, setFases] = useState<FaseAsignadaInput[]>((u.fases_asignadas ?? []) as FaseAsignadaInput[]);
  const [confirmando, setConfirmando] = useState(false);

  function run(fn: () => Promise<{ ok?: boolean; error?: string; mensaje?: string | null }>) {
    start(async () => {
      try {
        const r = await fn();
        if (r?.error) { setMsg(`❌ ${r.error}`); setTimeout(() => setMsg(null), 5000); }
        else { setMsg(r?.mensaje ?? "✓"); setTimeout(() => setMsg(null), r?.mensaje ? 6000 : 1500); }
      } catch (e) { setMsg(`❌ ${(e as Error).message}`); setTimeout(() => setMsg(null), 4000); }
    });
  }

  return (
    <tr className={`border-b border-gray-100 ${!u.activo ? "opacity-50" : ""}`}>
      <td className="px-4 py-3">
        <div>
          <p className="text-xs font-medium text-gray-900">{u.nombre ?? u.email}</p>
          <p className="text-[10px] text-gray-400">{u.email}</p>
          {!u.vinculado && (
            <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1 rounded">sin login aún</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="space-y-1">
          <select
            value={rolLocal}
            onChange={e => setRol(e.target.value)}
            disabled={isPending}
            className="text-xs border border-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50"
          >
            {Object.keys(ROL_LABEL).map(r => (
              <option key={r} value={r}>{ROL_LABEL[r]}</option>
            ))}
          </select>
          {rolLocal === "lider_fase" && (
            <div className="mt-2 space-y-1">
              <p className="text-[10px] text-gray-500 font-semibold">Fases asignadas:</p>
              <div className="grid grid-cols-2 gap-1">
                {FASES_ORDEN.map(f => {
                  const assigned = fasesLocal.find(x => x.fase === f);
                  return (
                    <div key={f} className="text-[10px] flex items-center gap-1">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!assigned}
                          onChange={e => {
                            if (e.target.checked) setFases(prev => [...prev, { fase: f, solo_lectura: false }]);
                            else setFases(prev => prev.filter(x => x.fase !== f));
                          }}
                        />
                        <span className={assigned ? "text-gray-900" : "text-gray-500"}>{FASE_LABEL[f]}</span>
                      </label>
                      {assigned && (
                        <label className="text-gray-400 ml-1 flex items-center gap-0.5 cursor-pointer">
                          <input type="checkbox" checked={assigned.solo_lectura}
                              onChange={e => setFases(prev => prev.map(x => x.fase === f ? { ...x, solo_lectura: e.target.checked } : x))} />
                          <span className="text-[9px]">Solo lec.</span>
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {(rolLocal !== u.rol || (rolLocal === "lider_fase" && JSON.stringify(fasesLocal) !== JSON.stringify(u.fases_asignadas ?? []))) && (
            <button
              disabled={isPending}
              onClick={() => run(() => actualizarRolUsuario(u.id, rolLocal, fasesLocal))}
              className="text-[10px] bg-gray-900 text-white px-2 py-0.5 rounded hover:bg-gray-700 disabled:opacity-40">
              Guardar
            </button>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${u.activo ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
          {u.activo ? "Activo" : "Inactivo"}
        </span>
      </td>
      <td className="px-4 py-3">
        {msg && <span className="text-[10px] text-gray-600 mr-2">{msg}</span>}
        {!u.vinculado && u.activo && (
          <button
            disabled={isPending}
            onClick={() => run(() => reenviarInvitacion(u.email))}
            className="text-[10px] px-2 py-1 rounded border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-40 mr-1">
            Enviar invitación
          </button>
        )}
        {confirmando ? (
          <span className="inline-flex items-center gap-1">
            <span className="text-[10px] text-red-700">¿Confirmar?</span>
            <button
              disabled={isPending}
              onClick={() => { run(() => toggleActivoUsuario(u.id, !u.activo)); setConfirmando(false); }}
              className="text-[10px] px-2 py-1 rounded border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40">
              Sí
            </button>
            <button
              onClick={() => setConfirmando(false)}
              className="text-[10px] px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50">
              No
            </button>
          </span>
        ) : (
          <button
            disabled={isPending}
            onClick={() => u.activo ? setConfirmando(true) : run(() => toggleActivoUsuario(u.id, true))}
            className={`text-[10px] px-2 py-1 rounded border disabled:opacity-40 ${u.activo ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-700 hover:bg-green-50"}`}
          >
            {u.activo ? "Desactivar" : "Activar"}
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── Formulario agregar usuario ───────────────────────────────────────────────
function AgregarUsuarioForm({ onClose }: { onClose: () => void }) {
  const [email, setEmail]   = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol]       = useState("directivo");
  const [fases, setFases]   = useState<FaseAsignadaInput[]>([]);
  const [isPending, start]  = useTransition();
  const [err, setErr]       = useState<string | null>(null);
  const [warn, setWarn]     = useState<string | null>(null);

  function submit() {
    start(async () => {
      try {
        const r = await agregarUsuario({ email, nombre, rol, fases_asignadas: fases });
        if (r?.error) { setErr(r.error); return; }
        if (r?.inviteError) setWarn(`Usuario agregado, pero el email de invitación falló: ${r.inviteError}`);
        else onClose();
      } catch (e) { setErr((e as Error).message); }
    });
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
      <p className="text-sm font-semibold text-gray-800">Agregar usuario</p>
      <p className="text-[10px] text-gray-500">
        Se enviará un email de invitación para que el usuario establezca su contraseña y acceda al sistema.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Correo electrónico *</label>
          <input value={email} onChange={e => setEmail(e.target.value)}
            type="email" placeholder="nombre@empresa.com"
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400" />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Nombre</label>
          <input value={nombre} onChange={e => setNombre(e.target.value)}
            placeholder="Nombre completo"
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400" />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Rol *</label>
          <select value={rol} onChange={e => setRol(e.target.value)}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400">
            {Object.keys(ROL_LABEL).map(r => (
              <option key={r} value={r}>{ROL_LABEL[r]}</option>
            ))}
          </select>
          <p className="text-[9px] text-gray-400 mt-0.5">{ROL_DESC[rol]}</p>
        </div>
        {rol === "lider_fase" && (
          <div className="col-span-2">
            <label className="text-[10px] text-gray-500 block mb-1">Fases asignadas *</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {FASES_ORDEN.map(f => {
                const assigned = fases.find(x => x.fase === f);
                return (
                  <div key={f} className="text-[10px] flex items-center gap-1">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!assigned}
                        onChange={e => {
                          if (e.target.checked) setFases(prev => [...prev, { fase: f, solo_lectura: false }]);
                          else setFases(prev => prev.filter(x => x.fase !== f));
                        }}
                      />
                      <span className={assigned ? "text-gray-900 font-medium" : "text-gray-500"}>{FASE_LABEL[f]}</span>
                    </label>
                    {assigned && (
                      <label className="text-gray-400 ml-1 flex items-center gap-0.5 cursor-pointer">
                        <input type="checkbox" checked={assigned.solo_lectura}
                            onChange={e => setFases(prev => prev.map(x => x.fase === f ? { ...x, solo_lectura: e.target.checked } : x))} />
                        <span className="text-[9px]">Solo lec.</span>
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {err  && <p className="text-xs text-red-600">{err}</p>}
      {warn && <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">{warn}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={isPending}
          className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50">
          {isPending ? "Agregando..." : "Agregar y enviar invitación"}
        </button>
        <button onClick={onClose}
          className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50">
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Pendientes de aprobación ─────────────────────────────────────────────────
function PendienteCard({ p }: { p: { id: string; email: string; created_at: string } }) {
  const [rol, setRol]       = useState("directivo");
  const [nombre, setNombre] = useState("");
  const [isPending, start]  = useTransition();
  const [done, setDone]     = useState(false);

  function aprobar() {
    start(async () => {
      await aprobarUsuarioPendiente({ email: p.email, nombre, rol, auth_user_id: p.id });
      setDone(true);
    });
  }

  if (done) return (
    <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
      ✓ {p.email} aprobado
    </div>
  );

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 border border-orange-200 rounded-lg bg-orange-50/50 flex-wrap">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-800 truncate">{p.email}</p>
        <p className="text-[10px] text-gray-400">Primer login: {p.created_at.slice(0,10)}</p>
      </div>
      <input value={nombre} onChange={e => setNombre(e.target.value)}
        placeholder="Nombre (opcional)"
        className="text-xs border border-gray-300 rounded px-2 py-1 w-36 focus:outline-none focus:ring-1 focus:ring-gray-400" />
      <select value={rol} onChange={e => setRol(e.target.value)}
        className="text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-gray-400">
        {Object.keys(ROL_LABEL).map(r => (
          <option key={r} value={r}>{ROL_LABEL[r]}</option>
        ))}
      </select>
      <button onClick={aprobar} disabled={isPending}
        className="text-xs bg-green-700 text-white px-3 py-1 rounded hover:bg-green-800 disabled:opacity-40">
        Aprobar
      </button>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function UsuariosClient({
  usuarios,
  pendientes,
}: {
  usuarios: UsuarioSistema[];
  pendientes: { id: string; email: string; created_at: string }[];
}) {
  const [mostrarForm, setForm] = useState(false);

  const activos   = usuarios.filter(u => u.activo);
  const inactivos = usuarios.filter(u => !u.activo);

  return (
    <div className="space-y-6">
      {/* Pendientes de aprobación */}
      {pendientes.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-orange-700 mb-2 flex items-center gap-2">
            Pendientes de aprobación
            <span className="bg-orange-100 text-orange-700 text-[10px] px-1.5 py-0.5 rounded-full">{pendientes.length}</span>
          </h2>
          <p className="text-[10px] text-gray-500 mb-2">
            Estos usuarios han iniciado sesión pero no tienen acceso autorizado aún.
          </p>
          <div className="space-y-2">
            {pendientes.map(p => <PendienteCard key={p.id} p={p} />)}
          </div>
        </section>
      )}

      {/* Usuarios activos */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-800">
            Usuarios con acceso
            <span className="ml-2 text-[10px] text-gray-400 font-normal">{activos.length} activos</span>
          </h2>
          <button onClick={() => setForm(v => !v)}
            className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded hover:bg-gray-800">
            + Agregar usuario
          </button>
        </div>

        {mostrarForm && <div className="mb-4"><AgregarUsuarioForm onClose={() => setForm(false)} /></div>}

        <div className="border border-gray-200 rounded-lg [overflow:clip]">
          <table className="w-full min-w-max text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-14 z-10">
              <tr>
                {["Usuario", "Rol", "Estado", "Acciones"].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activos.map(u => <FilaUsuario key={u.id} u={u} />)}
              {activos.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-400">Sin usuarios activos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Usuarios inactivos */}
      {inactivos.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 mb-2">
            Inactivos <span className="text-[10px] font-normal">{inactivos.length}</span>
          </h2>
          <div className="border border-gray-200 rounded-lg overflow-hidden opacity-70">
            <table className="w-full text-sm">
              <tbody>
                {inactivos.map(u => <FilaUsuario key={u.id} u={u} />)}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Descripción de roles */}
      <section className="border border-gray-200 rounded-lg p-4 bg-gray-50">
        <h3 className="text-xs font-semibold text-gray-700 mb-2">Referencia de roles</h3>
        <div className="grid grid-cols-2 gap-2">
          {Object.keys(ROL_LABEL).map(r => (
            <div key={r} className="text-xs">
              <span className="font-medium text-gray-800">{ROL_LABEL[r]}:</span>{" "}
              <span className="text-gray-500">{ROL_DESC[r]}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
