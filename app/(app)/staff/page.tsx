import StaffModule from "@/components/StaffModule";
import { getCurrentAppUser } from "@/lib/current-user";
import { isStaff } from "@/lib/roles";

export const metadata = {
  title: "Staff | Escuela de Golf CCB",
};

export default async function StaffPage() {
  const currentUser = await getCurrentAppUser();
  const soloLectura = !currentUser || !isStaff(currentUser.rol);
  return <StaffModule soloLectura={soloLectura} />;
}
