import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { DIRECTOR_COORD_ROLES, type Rol } from "@/lib/roles";
import PacoKnowledgeModule from "@/components/PacoKnowledgeModule";

export const metadata = {
  title: "Base de conocimiento | Escuela de Golf CCB",
};

export default async function BaseConocimientoPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: appUser } = await supabase.from("app_users").select("rol").eq("id", user.id).maybeSingle();
  if (!appUser || !DIRECTOR_COORD_ROLES.includes(appUser.rol as Rol)) redirect("/");

  return <PacoKnowledgeModule />;
}
