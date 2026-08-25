import Navbar from "@/components/Navbar";
import AsesorGolfChat from "@/components/AsesorGolfChat";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getCurrentAppUser } from "@/lib/current-user";
import { isStaff, puedeUsarPaco, type Rol } from "@/lib/roles";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const currentUser = await getCurrentAppUser();

  const role: Rol | null = currentUser?.rol ?? null;
  const nombre: string | null = currentUser?.nombre ?? null;
  const email: string | null = currentUser?.email ?? null;
  let fotoUrl: string | null = null;
  if (currentUser) {
    const supabase = await createSupabaseServerClient();
    if (isStaff(currentUser.rol)) {
      const { data: staffRow } = await supabase
        .from("staff_directorio")
        .select("foto_url")
        .eq("user_id", currentUser.id)
        .maybeSingle();
      fotoUrl = staffRow?.foto_url ?? null;
    } else {
      // Familias: el avatar sale de la ficha del alumno vinculado. La cuenta
      // del alumno es él mismo, y la del papá con un solo hijo no tiene otra
      // cara que mostrar. Con dos o más hijos se quedan las iniciales: elegir
      // una de las dos caras para la cuenta del papá sería arbitrario.
      const { data: vinculos } = await supabase
        .from("user_estudiantes")
        .select("students(foto_url)")
        .eq("user_id", currentUser.id);
      const alumnos = (vinculos ?? [])
        .map((v) => (Array.isArray(v.students) ? v.students[0] : v.students))
        .filter((a): a is { foto_url: string | null } => !!a);
      if (alumnos.length === 1 || currentUser.rol === "alumno_competencia") {
        fotoUrl = alumnos[0]?.foto_url ?? null;
      }
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Navbar role={role} nombre={nombre} email={email} fotoUrl={fotoUrl} />
      <main className="flex-1 flex flex-col min-w-0 overflow-x-hidden pt-14 lg:pt-0">
        {children}
      </main>
      {role && puedeUsarPaco(role) && <AsesorGolfChat rol={role} />}
    </div>
  );
}
