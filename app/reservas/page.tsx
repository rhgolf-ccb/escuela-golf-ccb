import { Suspense } from "react";
import ReservasModule from "@/components/ReservasModule";

export const metadata = {
  title: "Reservas | Escuela de Golf CCB",
};

export default function ReservasPage() {
  return (
    <Suspense>
      <ReservasModule />
    </Suspense>
  );
}
