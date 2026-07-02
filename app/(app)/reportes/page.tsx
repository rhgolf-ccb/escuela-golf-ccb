import { Suspense } from "react";
import ReportesModule from "@/components/ReportesModule";

export const metadata = {
  title: "Reportes | Escuela de Golf CCB",
};

export default function ReportesPage() {
  return (
    <Suspense>
      <ReportesModule />
    </Suspense>
  );
}
