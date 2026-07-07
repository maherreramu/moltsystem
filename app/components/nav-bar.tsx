"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

const NAV_OPERATIVO = [
  { href: "/produccion",  label: "Producción"  },
  { href: "/mi-fase",     label: "Mi fase"     },
  { href: "/pendientes",  label: "Pendientes"  },
  { href: "/plan-semana", label: "Plan semana" },
  { href: "/ops",         label: "OPs"         },
];

const NAV_ANALITICO = [
  { href: "/cola",        label: "Cola"        },
  { href: "/capacidad",   label: "Capacidad"   },
  { href: "/junta",       label: "Junta lunes" },
  { href: "/actividad",   label: "Actividad"   },
  { href: "/clientes",    label: "Clientes"    },
];

const ROL_LABEL: Record<string, string> = {
  admin:         "Admin",
  directivo:     "Directivo",
  lider_fase:    "Líder de fase",
  visualizacion: "Solo visualización",
};

function UserMenu({ user, rol }: { user: User; rol?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const initials = (user.email ?? "?").charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Menú de usuario"
        className={`flex items-center gap-1.5 pl-2 pr-2.5 h-8 rounded-full text-xs font-semibold transition-colors ${
          open ? "bg-gray-700 text-white" : "bg-gray-900 text-white hover:bg-gray-700"
        }`}
      >
        <span>{initials}</span>
        <span className={`text-[10px] opacity-60 transition-transform duration-150 ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
          {/* Info del usuario */}
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-900 truncate" title={user.email}>
              {user.email}
            </p>
            {rol && (
              <span className="mt-1 inline-block text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                {ROL_LABEL[rol] ?? rol}
              </span>
            )}
          </div>

          {/* Links de admin */}
          {rol === "admin" && (
            <div className="py-1 border-b border-gray-100">
              <Link
                href="/admin/config"
                onClick={() => setOpen(false)}
                className={`flex items-center px-4 py-2 text-xs transition-colors ${
                  pathname.startsWith("/admin/config")
                    ? "text-gray-900 font-medium bg-gray-50"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                Configuración
              </Link>
              <Link
                href="/admin/usuarios"
                onClick={() => setOpen(false)}
                className={`flex items-center px-4 py-2 text-xs transition-colors ${
                  pathname.startsWith("/admin/usuarios")
                    ? "text-gray-900 font-medium bg-gray-50"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                Gestión de usuarios
              </Link>
            </div>
          )}

          {/* Salir */}
          <div className="py-1">
            <button
              onClick={handleLogout}
              className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NavBar({ user, rol }: { user: User; rol?: string }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        {/* Navegación */}
        <div className="flex items-center gap-6">
          <span className="font-bold text-gray-900 text-sm">Molt</span>
          <nav className="flex items-center gap-1">
            {(rol === "lider_fase"
              ? NAV_OPERATIVO.filter(n => n.href === "/mi-fase" || n.href === "/pendientes")
              : NAV_OPERATIVO
            ).map(({ href, label }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${
                    active
                      ? "bg-gray-100 text-gray-900 font-medium"
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
            {rol !== "lider_fase" && (
              <>
                <span className="w-px h-4 bg-gray-200 mx-1" />
                {NAV_ANALITICO.map(({ href, label }) => {
                  const active = pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${
                        active
                          ? "bg-gray-100 text-gray-900 font-medium"
                          : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                      }`}
                    >
                      {label}
                    </Link>
                  );
                })}
              </>
            )}
          </nav>
        </div>

        {/* Avatar con dropdown */}
        <UserMenu user={user} rol={rol} />
      </div>
    </header>
  );
}
