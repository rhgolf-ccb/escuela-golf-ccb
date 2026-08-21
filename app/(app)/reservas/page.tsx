import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getCurrentAppUser } from "@/lib/current-user";
import { isStaff } from "@/lib/roles";
import ReservasModule from "@/components/ReservasModule";
import ReservaPadreView from "@/components/ReservaPadreView";

export const metadata = {
  title: "Reservas | Escuela de Golf CCB",
};

export default async function ReservasPage() {
  const currentUser = await getCurrentAppUser();
  if (!currentUser) redirect("/login");

  if (isStaff(currentUser.rol)) {
    return (
      <Suspense>
        <ReservasModule />
      </Suspense>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: vinculos } = await supabase
    .from("user_estudiantes")
    .select("students(id, full_name, grupo_activo, birth_date, gender)")
    .eq("user_id", currentUser.id);

  const estudiantes = (vinculos ?? [])
    .map((v) => (Array.isArray(v.students) ? v.students[0] : v.students))
    .filter((s): s is { id: string; full_name: string; grupo_activo: string | null; birth_date: string | null; gender: string | null } => !!s);

  return <ReservaPadreView estudiantes={estudiantes} />;
}
