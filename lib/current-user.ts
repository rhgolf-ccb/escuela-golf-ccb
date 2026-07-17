import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { Rol } from "@/lib/roles";

export type CurrentAppUser = {
  id: string;
  rol: Rol;
  nombre: string | null;
  email: string | null;
};

// Memoizado por request con cache() de React: middleware ya validó la sesión
// antes de llegar aquí, pero layout.tsx y cada page.tsx necesitaban el mismo
// user + rol — sin esto, se repetía la misma consulta a auth.getUser() y a
// app_users hasta 3 veces por navegación. cache() hace que, dentro del mismo
// request, todas esas llamadas compartan un único resultado.
export const getCurrentAppUser = cache(async (): Promise<CurrentAppUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("app_users")
    .select("rol, nombre, email")
    .eq("id", user.id)
    .maybeSingle();
  if (!data) return null;

  return { id: user.id, rol: data.rol as Rol, nombre: data.nombre, email: data.email };
});
