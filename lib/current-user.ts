import { cache } from "react";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { Rol } from "@/lib/roles";

export type CurrentAppUser = {
  id: string;
  rol: Rol;
  nombre: string | null;
  email: string | null;
};

// Memoizado por request con cache() de React, y respaldado primero por los
// headers x-ccb-* que middleware.ts ya deja listos tras validar sesión + rol
// una sola vez — evita repetir auth.getUser()/app_users desde cada layout y
// page.tsx. Solo si esos headers faltan (ej. una llamada fuera del alcance
// del matcher de middleware) se cae a la consulta directa a Supabase.
export const getCurrentAppUser = cache(async (): Promise<CurrentAppUser | null> => {
  const h = await headers();
  const uid = h.get("x-ccb-uid");
  const rol = h.get("x-ccb-rol");
  if (uid && rol) {
    const nombre = h.get("x-ccb-nombre");
    const email = h.get("x-ccb-email");
    return {
      id: uid,
      rol: rol as Rol,
      nombre: nombre ? decodeURIComponent(nombre) : null,
      email: email ? decodeURIComponent(email) : null,
    };
  }

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
