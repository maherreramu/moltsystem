import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getPendientesAprobacion } from "@/lib/actions/usuario-actions";
import { UsuariosClient } from "./usuarios-client";

export type UsuarioSistema = {
  id: string;
  user_id: string | null;
  email: string;
  nombre: string | null;
  rol: string;
  activo: boolean;
  fases_asignadas: { fase: string; solo_lectura: boolean }[];
  vinculado: boolean;
  created_at: string;
};

export default async function AdminUsuariosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Solo admin puede ver esta página
  const sb = await createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: yo } = await (sb as any).from("usuarios_sistema")
    .select("rol").eq("email", user.email).single();
  if (yo?.rol !== "admin") redirect("/produccion");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: usuariosJson } = await (sb as any).rpc("get_usuarios_sistema_admin");
  const usuarios: UsuarioSistema[] = Array.isArray(usuariosJson) ? usuariosJson : [];

  const pendientes = await getPendientesAprobacion();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Gestión de usuarios</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Autoriza accesos, asigna roles y gestiona quién puede usar el sistema.
        </p>
      </div>
      <UsuariosClient usuarios={usuarios} pendientes={pendientes} />
    </div>
  );
}
