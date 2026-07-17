import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getCurrentAppUser } from "@/lib/current-user";
import { ADMIN_ROLES } from "@/lib/roles";
import AccesosModule from "@/components/AccesosModule";

export const metadata = {
  title: "Accesos | Escuela de Golf CCB",
};

export default async function AccesosPage() {
  const currentUser = await getCurrentAppUser();
  if (!currentUser) redirect("/login");
  if (!ADMIN_ROLES.includes(currentUser.rol)) redirect("/");

  const supabase = await createSupabaseServerClient();
  const { data: config } = await supabase.from("app_config").select("value").eq("key", "session_days").maybeSingle();

  return <AccesosModule currentUserId={currentUser.id} initialSessionDays={config?.value ? Number(config.value) : null} />;
}
