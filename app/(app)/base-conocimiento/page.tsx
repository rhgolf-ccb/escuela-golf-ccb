import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/current-user";
import { DIRECTOR_COORD_ROLES } from "@/lib/roles";
import PacoKnowledgeModule from "@/components/PacoKnowledgeModule";

export const metadata = {
  title: "Base de conocimiento | Escuela de Golf CCB",
};

export default async function BaseConocimientoPage() {
  const currentUser = await getCurrentAppUser();
  if (!currentUser) redirect("/login");
  if (!DIRECTOR_COORD_ROLES.includes(currentUser.rol)) redirect("/");

  return <PacoKnowledgeModule />;
}
