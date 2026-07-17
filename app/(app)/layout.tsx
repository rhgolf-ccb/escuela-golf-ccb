import Navbar from "@/components/Navbar";
import AsesorGolfChat from "@/components/AsesorGolfChat";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isStaff, type Rol } from "@/lib/roles";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  let role: Rol | null = null;
  let nombre: string | null = null;
  let email: string | null = null;
  let fotoUrl: string | null = null;
  if (user) {
    const { data } = await supabase.from("app_users").select("rol, nombre, email").eq("id", user.id).maybeSingle();
    role = (data?.rol as Rol) ?? null;
    nombre = data?.nombre ?? null;
    email = data?.email ?? null;

    const { data: staffRow } = await supabase
      .from("staff_directorio")
      .select("foto_url")
      .eq("user_id", user.id)
      .maybeSingle();
    fotoUrl = staffRow?.foto_url ?? null;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Navbar role={role} nombre={nombre} email={email} fotoUrl={fotoUrl} />
      <main className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        {children}
      </main>
      {role && isStaff(role) && <AsesorGolfChat rol={role} />}
    </div>
  );
}
