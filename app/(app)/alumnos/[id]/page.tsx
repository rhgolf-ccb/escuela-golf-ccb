import { redirect } from "next/navigation";
import StudentProfile from "@/components/StudentProfile";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getCurrentAppUser } from "@/lib/current-user";
import { isStaff } from "@/lib/roles";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function StudentProfilePage({ params }: Props) {
  const { id } = await params;

  const currentUser = await getCurrentAppUser();
  if (!currentUser) redirect("/login");

  // Una familia de Competencia ve el listado de su grupo, pero el perfil
  // completo — tests, asistencia y notas del profesor — solo el de sus hijos.
  if (!isStaff(currentUser.rol)) {
    const supabase = await createSupabaseServerClient();
    const { data: vinculo } = await supabase
      .from("user_estudiantes")
      .select("estudiante_id")
      .eq("user_id", currentUser.id)
      .eq("estudiante_id", id)
      .maybeSingle();
    if (!vinculo) redirect("/alumnos");
  }

  return <StudentProfile studentId={id} currentRol={currentUser.rol} />;
}
