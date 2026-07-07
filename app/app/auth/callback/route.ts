import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  // Detrás de Caddy el proceso Node ve 0.0.0.0:3000; reconstruir con headers forwarded.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;
  const next = searchParams.get("next") ?? "/produccion";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Verificar autorización y vincular user_id si es el primer login
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        const sb = await createServiceClient();
        const { data: registro } = await sb
          .from("usuarios_sistema")
          .select("id, user_id, activo")
          .eq("email", user.email)
          .single();

        if (!registro || !registro.activo) {
          // No autorizado — redirigir a página de espera
          return NextResponse.redirect(`${origin}/acceso-pendiente`);
        }

        // Vincular user_id si es el primer login (estaba null)
        if (registro.user_id === null) {
          await sb.from("usuarios_sistema")
            .update({ user_id: user.id })
            .eq("id", registro.id);
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
