import Navbar from "@/components/Navbar";
import AsesorGolfChat from "@/components/AsesorGolfChat";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getCurrentAppUser } from "@/lib/current-user";
import { isStaff, type Rol } from "@/lib/roles";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const currentUser = await getCurrentAppUser();

  const role: Rol | null = currentUser?.rol ?? null;
  const nombre: string | null = currentUser?.nombre ?? null;
  const email: string | null = currentUser?.email ?? null;
  let fotoUrl: string | null = null;
  if (currentUser) {
    const supabase = await createSupabaseServerClient();
    const { data: staffRow } = await supabase
      .from("staff_directorio")
      .select("foto_url")
      .eq("user_id", currentUser.id)
      .maybeSingle();
    fotoUrl = staffRow?.foto_url ?? null;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Navbar role={role} nombre={nombre} email={email} fotoUrl={fotoUrl} />
      <main className="flex-1 flex flex-col min-w-0 overflow-x-hidden pt-14 lg:pt-0">
        {children}
      </main>
      {role && isStaff(role) && <AsesorGolfChat rol={role} />}
    </div>
  );
}
