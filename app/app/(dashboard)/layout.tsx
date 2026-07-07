import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import NavBar from "@/components/nav-bar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Obtener el rol para el NavBar (usa service client para no depender de RLS de user_id)
  const sb = await createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: us } = await (sb as any)
    .from("usuarios_sistema")
    .select("rol")
    .eq("email", user.email)
    .single();
  const rol: string | undefined = us?.rol ?? undefined;

  return (
    <div className="min-h-screen flex flex-col">
      <NavBar user={user} rol={rol} />
      <main className="flex-1 container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
