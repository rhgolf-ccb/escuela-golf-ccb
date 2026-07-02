import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import MiPerfilView from "@/components/MiPerfilView";
import type { Rol } from "@/lib/roles";

export const metadata = {
  title: "Mi Perfil | Escuela de Golf CCB",
};

export default async function MiPerfilPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: appUser } = await supabase
    .from("app_users")
    .select("rol")
    .eq("id", user.id)
    .maybeSingle();
  if (!appUser) redirect("/login");

  const { data: vinculos } = await supabase
    .from("user_estudiantes")
    .select("students(id, full_name, grupo_activo, foto_url, birth_date)")
    .eq("user_id", user.id);

  const estudiantes = (vinculos ?? [])
    .map((v) => (Array.isArray(v.students) ? v.students[0] : v.students))
    .filter((s): s is { id: string; full_name: string; grupo_activo: string | null; foto_url: string | null; birth_date: string | null } => !!s);

  return <MiPerfilView rol={appUser.rol as Rol} estudiantes={estudiantes} />;
}
