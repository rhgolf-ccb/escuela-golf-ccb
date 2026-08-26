import { Suspense } from "react";
import ReportesModule from "@/components/ReportesModule";
import { getCurrentAppUser } from "@/lib/current-user";

export const metadata = {
  title: "Reportes | Escuela de Golf CCB",
};

export default async function ReportesPage() {
  // El rol viaja a la pantalla solo para decidir si se ofrece la pestaña de uso
  // de Paco, que es de director y coordinador. La ruta que sirve esos datos
  // vuelve a comprobarlo por su cuenta: esto es para no enseñar una pestaña que
  // al abrirse diría "no tienes permiso".
  const currentUser = await getCurrentAppUser();
  return (
    <Suspense>
      <ReportesModule currentRol={currentUser?.rol ?? null} />
    </Suspense>
  );
}
