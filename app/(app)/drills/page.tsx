import DrillsModule from "@/components/DrillsModule";
import { getCurrentAppUser } from "@/lib/current-user";
import { isStaff } from "@/lib/roles";

export const metadata = {
  title: "Drills | Escuela de Golf CCB",
};

export default async function DrillsPage() {
  const currentUser = await getCurrentAppUser();
  const soloLectura = !currentUser || !isStaff(currentUser.rol);
  return <DrillsModule soloLectura={soloLectura} />;
}
