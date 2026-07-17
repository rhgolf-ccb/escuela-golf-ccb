import StudentsModule from "@/components/StudentsModule";
import { getCurrentAppUser } from "@/lib/current-user";

export const metadata = {
  title: "Alumnos | Escuela de Golf CCB",
};

export default async function AlumnosPage() {
  const currentUser = await getCurrentAppUser();
  return <StudentsModule currentRol={currentUser?.rol ?? null} />;
}
