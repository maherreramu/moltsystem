import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/supabase";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refrescar sesión — no cambiar el flujo de lógica entre esta llamada y la respuesta
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Rutas siempre públicas — no requieren sesión ni autorización
  const esPublica = pathname.startsWith("/login") ||
                    pathname.startsWith("/auth/") ||
                    pathname.startsWith("/acceso-pendiente");

  if (esPublica) return supabaseResponse;

  // Cualquier otra ruta requiere sesión de Supabase
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Verificar que el usuario está autorizado en usuarios_sistema
  const { data: acceso } = await supabase.rpc(
    "check_user_access" as never,
    { p_email: user.email } as never
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accesoRow = Array.isArray(acceso) ? (acceso as any)[0] : null;
  const autorizado = accesoRow?.activo === true;

  if (!autorizado) {
    const url = request.nextUrl.clone();
    url.pathname = "/acceso-pendiente";
    return NextResponse.redirect(url);
  }

  // Restricción de rutas para lider_fase: solo /mi-fase y /pendientes
  const rol = accesoRow?.rol as string | undefined;
  if (rol === "lider_fase") {
    const rutasPermitidas = ["/mi-fase", "/pendientes", "/api", "/auth/", "/login", "/acceso-pendiente"];
    const permitida = rutasPermitidas.some(r => pathname.startsWith(r));
    if (!permitida) {
      const url = request.nextUrl.clone();
      url.pathname = "/mi-fase";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
