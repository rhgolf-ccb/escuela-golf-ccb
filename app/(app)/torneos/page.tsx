import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/current-user";
import { isStaff } from "@/lib/roles";
import TorneosModule from "@/components/TorneosModule";

export const metadata = {
  title: "Torneos | Escuela de Golf CCB",
};

export default async function TorneosPage() {
  const currentUser = await getCurrentAppUser();
  if (!currentUser) redirect("/login");
  // Solo el staff carga torneos. La familia ve los puntos que salieron de aquí
  // desde las pantallas del alumno, no desde este módulo.
  if (!isStaff(currentUser.rol)) redirect("/mi-perfil");

  return <TorneosModule />;
}
