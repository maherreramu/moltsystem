"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function AccesoPendientePage() {
  const router = useRouter();

  async function salir() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-5 p-8 bg-white rounded-xl shadow-sm border border-gray-200 text-center">
        <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center mx-auto">
          <span className="text-2xl">⏳</span>
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Acceso pendiente</h1>
          <p className="mt-2 text-sm text-gray-600">
            Tu cuenta todavía no tiene acceso al sistema de producción Molt.
          </p>
          <p className="mt-3 text-sm text-gray-500">
            Solicítalo a{" "}
            <a href="mailto:mateo.herrera@molt.com.co"
              className="text-blue-600 hover:underline font-medium">
              mateo.herrera@molt.com.co
            </a>
          </p>
        </div>
        <button onClick={salir}
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
          Volver al inicio de sesión
        </button>
      </div>
    </div>
  );
}
