"use client";

import Image from "next/image";

export interface ParentReportMeta {
  alumno_nombre: string;
  alumno_grupo: string | null;
  alumno_foto_url: string | null;
  alumno_birth_date?: string | null;
  fecha_generacion: string;
  hitos: { titulo: string; descripcion: string | null; fecha: string; foto_url: string | null }[];
}

export interface ParentReport {
  saludo: string;
  resumen_narrativo: string;
  fortalezas: string[];
  areas_crecimiento: string[];
  mensaje_cierre: string;
  recomendaciones_casa: string[];
  _meta?: ParentReportMeta;
}

interface Props {
  report: ParentReport;
  meta: ParentReportMeta;
}

function formatFecha(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
}

export default function ReportCard({ report, meta }: Props) {
  return (
    <div
      id="report-card-content"
      style={{ fontFamily: "'Segoe UI', Arial, sans-serif", background: "#fff", color: "#1a1a1a", maxWidth: 700, margin: "0 auto" }}
    >
      {/* Header */}
      <div style={{ background: "#1B4D2E", color: "#fff", padding: "32px 36px 24px", borderRadius: "12px 12px 0 0", display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
            <Image
              src="/Paco_transparente.png"
              alt="Escuela de Golf CCB"
              width={48}
              height={48}
              style={{ borderRadius: "50%", background: "#fff", padding: 4 }}
            />
            <div>
              <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", opacity: 0.75, fontWeight: 600 }}>
                Informe de Progreso
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>
                Escuela de Golf CCB
              </div>
            </div>
          </div>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
            {formatFecha(meta.fecha_generacion)}
          </div>
        </div>
        {meta.alumno_foto_url && (
          <Image
            src={meta.alumno_foto_url}
            alt={meta.alumno_nombre}
            width={72}
            height={72}
            style={{ borderRadius: "50%", border: "3px solid rgba(255,255,255,0.35)", objectFit: "cover" }}
          />
        )}
      </div>

      {/* Subheader: student info */}
      <div style={{ background: "#F0F7F3", padding: "16px 36px", borderBottom: "1px solid #dce8e0", display: "flex", gap: 32 }}>
        <div>
          <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Alumno</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1B4D2E" }}>{meta.alumno_nombre}</div>
        </div>
        {meta.alumno_grupo && (
          <div>
            <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Grupo</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#374151" }}>{meta.alumno_grupo}</div>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "28px 36px", background: "#fff" }}>
        {/* Saludo */}
        <p style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginBottom: 14 }}>{report.saludo}</p>

        {/* Narrative */}
        <p style={{ fontSize: 14, lineHeight: 1.75, color: "#374151", marginBottom: 24, whiteSpace: "pre-wrap" }}>
          {report.resumen_narrativo}
        </p>

        {/* Fortalezas */}
        {report.fortalezas?.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1B4D2E", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
              Fortalezas destacadas
            </div>
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
              {report.fortalezas.map((f, i) => (
                <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 7, fontSize: 14, color: "#374151" }}>
                  <span style={{ marginTop: 2, flexShrink: 0, width: 18, height: 18, borderRadius: "50%", background: "#DCFCE7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="#16a34a" strokeWidth={3}><path d="M4 10l4 4 8-8"/></svg>
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Áreas de crecimiento */}
        {report.areas_crecimiento?.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
              Oportunidades de crecimiento
            </div>
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
              {report.areas_crecimiento.map((a, i) => (
                <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 7, fontSize: 14, color: "#374151" }}>
                  <span style={{ marginTop: 2, flexShrink: 0, width: 18, height: 18, borderRadius: "50%", background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="9" height="9" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="#d97706" strokeWidth={2.5}/><path d="M10 6v5M10 14v.5" stroke="#d97706" strokeWidth={2.5} strokeLinecap="round"/></svg>
                  </span>
                  {a}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recomendaciones en casa */}
        {report.recomendaciones_casa?.length > 0 && (
          <div style={{ marginBottom: 22, background: "#F9FAFB", borderRadius: 10, padding: "16px 20px", border: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1e40af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
              Actividades recomendadas en casa
            </div>
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
              {report.recomendaciones_casa.map((r, i) => (
                <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 7, fontSize: 14, color: "#374151" }}>
                  <span style={{ color: "#3b82f6", fontWeight: 700, marginTop: 1 }}>→</span>
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Hitos */}
        {meta.hitos?.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
              Logros y hitos
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {meta.hitos.map((h, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", background: "#F5F3FF", borderRadius: 8, padding: "10px 14px" }}>
                  <span style={{ fontSize: 18, marginTop: -1 }}>★</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#374151" }}>{h.titulo}</div>
                    {h.descripcion && <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{h.descripcion}</div>}
                    <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>{formatFecha(h.fecha)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mensaje de cierre */}
        {report.mensaje_cierre && (
          <div style={{ marginTop: 20, padding: "16px 20px", background: "#F0F7F3", borderLeft: "4px solid #1B4D2E", borderRadius: "0 8px 8px 0" }}>
            <p style={{ margin: 0, fontSize: 14, fontStyle: "italic", color: "#374151", lineHeight: 1.6 }}>
              "{report.mensaje_cierre}"
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ background: "#1B4D2E", color: "rgba(255,255,255,0.7)", padding: "14px 36px", borderRadius: "0 0 12px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
        <span>Escuela de Golf CCB — Club Campestre de Bogotá</span>
        <span>{formatFecha(meta.fecha_generacion)}</span>
      </div>
    </div>
  );
}
