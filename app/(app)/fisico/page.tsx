import FisicoModule from "@/components/FisicoModule";
import { getCurrentAppUser } from "@/lib/current-user";
import { isStaff } from "@/lib/roles";

export const metadata = {
  title: "Físico | Escuela de Golf CCB",
};

export default async function FisicoPage() {
  const currentUser = await getCurrentAppUser();
  const soloLectura = !currentUser || !isStaff(currentUser.rol);
  return <FisicoModule soloLectura={soloLectura} />;
}
