import { createClient } from "@supabase/supabase-js";
import ReportCard, { ParentReport, ParentReportMeta } from "@/components/ReportCard";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function InformePublicoPage({ params }: Props) {
  const { id } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from("informes_padres")
    .select("contenido_json, fecha")
    .eq("id", id)
    .single();

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-4xl mb-4">⛳</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Informe no encontrado</h1>
          <p className="text-gray-500 text-sm">El enlace puede haber expirado o ser incorrecto.</p>
        </div>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contenido = data.contenido_json as any;
  const report: ParentReport = {
    saludo: contenido.saludo ?? "",
    resumen_narrativo: contenido.resumen_narrativo ?? "",
    fortalezas: contenido.fortalezas ?? [],
    areas_crecimiento: contenido.areas_crecimiento ?? [],
    mensaje_cierre: contenido.mensaje_cierre ?? "",
    recomendaciones_casa: contenido.recomendaciones_casa ?? [],
  };

  const rawMeta = contenido._meta ?? {};
  const meta: ParentReportMeta = {
    alumno_nombre: rawMeta.alumno_nombre ?? "Alumno",
    alumno_grupo: rawMeta.alumno_grupo ?? null,
    alumno_foto_url: rawMeta.alumno_foto_url ?? null,
    alumno_birth_date: rawMeta.alumno_birth_date ?? null,
    fecha_generacion: rawMeta.fecha_generacion ?? data.fecha ?? new Date().toISOString().split("T")[0],
    hitos: rawMeta.hitos ?? [],
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <ReportCard report={report} meta={meta} />
      <p className="text-center text-xs text-gray-400 mt-6">
        Escuela de Golf CCB — Informe generado el {meta.fecha_generacion}
      </p>
    </div>
  );
}
