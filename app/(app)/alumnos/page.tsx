import StudentsModule from "@/components/StudentsModule";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { Rol } from "@/lib/roles";

export const metadata = {
  title: "Alumnos | Escuela de Golf CCB",
};

export default async function AlumnosPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  let currentRol: Rol | null = null;
  if (user) {
    const { data } = await supabase.from("app_users").select("rol").eq("id", user.id).maybeSingle();
    currentRol = (data?.rol as Rol) ?? null;
  }

  return <StudentsModule currentRol={currentRol} />;
}
