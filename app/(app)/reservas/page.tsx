import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isStaffRole, type Rol } from "@/lib/roles";
import ReservasModule from "@/components/ReservasModule";
import ReservaPadreView from "@/components/ReservaPadreView";

export const metadata = {
  title: "Reservas | Escuela de Golf CCB",
};

export default async function ReservasPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: appUser } = await supabase.from("app_users").select("rol").eq("id", user.id).maybeSingle();
  if (!appUser) redirect("/login");
  const rol = appUser.rol as Rol;

  if (isStaffRole(rol)) {
    return (
      <Suspense>
        <ReservasModule />
      </Suspense>
    );
  }

  const { data: vinculos } = await supabase
    .from("user_estudiantes")
    .select("students(id, full_name, grupo_activo)")
    .eq("user_id", user.id);

  const estudiantes = (vinculos ?? [])
    .map((v) => (Array.isArray(v.students) ? v.students[0] : v.students))
    .filter((s): s is { id: string; full_name: string; grupo_activo: string | null } => !!s);

  return <ReservaPadreView estudiantes={estudiantes} />;
}
