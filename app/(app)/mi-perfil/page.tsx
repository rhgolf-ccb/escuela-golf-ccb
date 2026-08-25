import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getCurrentAppUser } from "@/lib/current-user";
import MiPerfilView from "@/components/MiPerfilView";

export const metadata = {
  title: "Mi Perfil | Escuela de Golf CCB",
};

export default async function MiPerfilPage() {
  const currentUser = await getCurrentAppUser();
  if (!currentUser) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const { data: vinculos } = await supabase
    .from("user_estudiantes")
    .select("students(id, full_name, grupo_activo, foto_url, birth_date)")
    .eq("user_id", currentUser.id);

  const estudiantes = (vinculos ?? [])
    .map((v) => (Array.isArray(v.students) ? v.students[0] : v.students))
    .filter((s): s is { id: string; full_name: string; grupo_activo: string | null; foto_url: string | null; birth_date: string | null } => !!s)
    // La pantalla abre en el primero de la lista, y la consulta no trae orden:
    // un papá con dos hijos podía caer en el que todavía no tiene grupo (sin
    // tests, sin asistencia) y creer que la app está vacía. Primero los que sí
    // están en un grupo.
    .sort((a, b) =>
      (a.grupo_activo ? 0 : 1) - (b.grupo_activo ? 0 : 1) ||
      a.full_name.localeCompare(b.full_name, "es"));

  return <MiPerfilView rol={currentUser.rol} estudiantes={estudiantes} />;
}
