import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { ADMIN_ROLES, type Rol } from "@/lib/roles";
import AccesosModule from "@/components/AccesosModule";

export const metadata = {
  title: "Accesos | Escuela de Golf CCB",
};

export default async function AccesosPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: appUser } = await supabase.from("app_users").select("rol").eq("id", user.id).maybeSingle();
  if (!appUser || !ADMIN_ROLES.includes(appUser.rol as Rol)) redirect("/");

  const { data: config } = await supabase.from("app_config").select("value").eq("key", "session_days").maybeSingle();

  return <AccesosModule currentUserId={user.id} initialSessionDays={config?.value ? Number(config.value) : null} />;
}
