import ProgramacionModule from "@/components/ProgramacionModule";
import { getCurrentAppUser } from "@/lib/current-user";

export const metadata = {
  title: "Programación Semanal | Escuela de Golf CCB",
};

export default async function ProgramacionPage() {
  const currentUser = await getCurrentAppUser();
  return <ProgramacionModule currentRol={currentUser?.rol ?? null} />;
}
