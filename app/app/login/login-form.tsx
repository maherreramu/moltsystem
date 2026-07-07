"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const [email, setEmail]     = useState("");
  const [password, setPass]   = useState("");
  const [modo, setModo]       = useState<"magic"|"password">("magic");
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const router = useRouter();

  async function handleAzureSSO() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
    else setSent(true);
    setLoading(false);
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    // El middleware verifica la autorización en usuarios_sistema en cada request
    router.push("/produccion");
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-6 p-8 bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Molt Producción</h1>
          <p className="mt-1 text-sm text-gray-500">Sistema de seguimiento operativo</p>
        </div>

        <button onClick={handleAzureSSO}
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
          <svg width="16" height="16" viewBox="0 0 21 21" fill="none">
            <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
            <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
            <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
          </svg>
          Continuar con Microsoft
        </button>

        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">o usa tu correo</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Toggle magic link / contraseña */}
        <div className="flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
          <button onClick={() => { setModo("magic"); setError(null); setSent(false); }}
            className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${modo === "magic" ? "bg-white shadow-sm text-gray-900 font-medium" : "text-gray-500 hover:text-gray-700"}`}>
            Enlace mágico
          </button>
          <button onClick={() => { setModo("password"); setError(null); setSent(false); }}
            className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${modo === "password" ? "bg-white shadow-sm text-gray-900 font-medium" : "text-gray-500 hover:text-gray-700"}`}>
            Contraseña
          </button>
        </div>

        {sent ? (
          <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-800">
            Revisa tu correo — te enviamos un enlace de acceso a <strong>{email}</strong>.
          </div>
        ) : (
          <form onSubmit={modo === "magic" ? handleMagicLink : handlePassword} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Correo electrónico</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="correo@empresa.com" required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            {modo === "password" && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Contraseña</label>
                <input type="password" value={password} onChange={e => setPass(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 transition-colors">
              {loading ? "…" : modo === "magic" ? "Enviar enlace de acceso" : "Iniciar sesión"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
