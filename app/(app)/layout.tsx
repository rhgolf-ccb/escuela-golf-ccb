import Navbar from "@/components/Navbar";
import AsesorGolfChat from "@/components/AsesorGolfChat";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { Rol } from "@/lib/roles";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  let role: Rol | null = null;
  if (user) {
    const { data } = await supabase.from("app_users").select("rol").eq("id", user.id).maybeSingle();
    role = (data?.rol as Rol) ?? null;
  }

  return (
    <div className="min-h-full flex flex-col">
      <Navbar role={role} />
      <main className="flex-1 flex flex-col">{children}</main>
      <AsesorGolfChat />
    </div>
  );
}
