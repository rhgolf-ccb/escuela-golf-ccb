import StudentsModule from "@/components/StudentsModule";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getCurrentAppUser } from "@/lib/current-user";
import { isStaff } from "@/lib/roles";

export const metadata = {
  title: "Alumnos | Escuela de Golf CCB",
};

export default async function AlumnosPage() {
  const currentUser = await getCurrentAppUser();

  // Para una familia el padrón es solo lectura del grupo de Competencia; los
  // ids de sus hijos son lo único que abre el perfil completo desde el listado.
  let misEstudiantesIds: string[] = [];
  if (currentUser && !isStaff(currentUser.rol)) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("user_estudiantes")
      .select("estudiante_id")
      .eq("user_id", currentUser.id);
    misEstudiantesIds = (data ?? [])
      .map((v) => (v.estudiante_id ? String(v.estudiante_id) : null))
      .filter((id): id is string => !!id);
  }

  return (
    <StudentsModule
      currentRol={currentUser?.rol ?? null}
      misEstudiantesIds={misEstudiantesIds}
    />
  );
}
