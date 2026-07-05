import ProgramacionModule from "@/components/ProgramacionModule";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { Rol } from "@/lib/roles";

export const metadata = {
  title: "Programación Semanal | Escuela de Golf CCB",
};

export default async function ProgramacionPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  let currentRol: Rol | null = null;
  if (user) {
    const { data } = await supabase.from("app_users").select("rol").eq("id", user.id).maybeSingle();
    currentRol = (data?.rol as Rol) ?? null;
  }

  return <ProgramacionModule currentRol={currentRol} />;
}
