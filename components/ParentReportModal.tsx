"use client";

import { useState, useRef } from "react";
import ReportCard, { ParentReport, ParentReportMeta } from "./ReportCard";

interface Props {
  studentId: string;
  studentName: string;
  hasSwingEvals: boolean;
  hasPhysicalEvals: boolean;
  hasTrackmanData: boolean;
  onClose: () => void;
}

export default function ParentReportModal({
  studentId,
  studentName,
  hasSwingEvals,
  hasPhysicalEvals,
  hasTrackmanData,
  onClose,
}: Props) {
  const [incluirTecnico, setIncluirTecnico] = useState(hasSwingEvals);
  const [incluirFisico, setIncluirFisico] = useState(hasPhysicalEvals);
  const [incluirTrackman, setIncluirTrackman] = useState(hasTrackmanData);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ParentReport | null>(null);
  const [meta, setMeta] = useState<ParentReportMeta | null>(null);
  const [informeId, setInformeId] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [copied, setCopied] = useState(false);

  const reportRef = useRef<HTMLDivElement>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setReport(null);
    setMeta(null);
    setInformeId(null);
    try {
      const res = await fetch("/api/parent-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alumno_id: studentId,
          incluir_tecnico: incluirTecnico,
          incluir_fisico: incluirFisico,
          incluir_trackman: incluirTrackman,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al generar el informe");
      setReport(data.informe);
      setMeta(data.meta);
      setInformeId(data.informe_id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadPdf() {
    if (!reportRef.current) return;
    setDownloadingPdf(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);
      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = (canvas.height * pdfW) / canvas.width;
      let y = 0;
      const pageH = pdf.internal.pageSize.getHeight();
      while (y < pdfH) {
        if (y > 0) pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, -y, pdfW, pdfH);
        y += pageH;
      }
      const safeName = studentName.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ\s]/g, "").trim().replace(/\s+/g, "_");
      pdf.save(`Informe_${safeName}.pdf`);
    } catch (err) {
      console.error("PDF error:", err);
      alert("Error al generar el PDF. Inténtelo de nuevo.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  function handleWhatsApp() {
    if (!informeId) return;
    const url = window.location.origin + "/informes/" + informeId;
    const text = `Hola! Te comparto el informe de progreso de ${studentName} de la Escuela de Golf CCB:\n\n${url}`;
    window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
  }

  async function handleCopyLink() {
    if (!informeId) return;
    const url = window.location.origin + "/informes/" + informeId;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const noneSelected = !incluirTecnico && !incluirFisico && !incluirTrackman;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "#1B4D2E" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-base">Informe para padres</h2>
              <p className="text-xs text-gray-500">{studentName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="px-6 py-5">
          {!report && (
            <>
              <p className="text-sm text-gray-600 mb-4">Selecciona las fuentes de datos a incluir en el informe:</p>

              <div className="space-y-3 mb-6">
                <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${hasSwingEvals ? "hover:bg-gray-50" : "opacity-40 cursor-not-allowed"}`}>
                  <input
                    type="checkbox"
                    checked={incluirTecnico}
                    disabled={!hasSwingEvals}
                    onChange={(e) => setIncluirTecnico(e.target.checked)}
                    className="w-4 h-4 accent-emerald-700"
                  />
                  <div>
                    <div className="font-medium text-sm text-gray-800">Evaluación técnica</div>
                    <div className="text-xs text-gray-500">{hasSwingEvals ? "Última evaluación del swing" : "No disponible"}</div>
                  </div>
                </label>

                <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${hasPhysicalEvals ? "hover:bg-gray-50" : "opacity-40 cursor-not-allowed"}`}>
                  <input
                    type="checkbox"
                    checked={incluirFisico}
                    disabled={!hasPhysicalEvals}
                    onChange={(e) => setIncluirFisico(e.target.checked)}
                    className="w-4 h-4 accent-emerald-700"
                  />
                  <div>
                    <div className="font-medium text-sm text-gray-800">Evaluación física TPI</div>
                    <div className="text-xs text-gray-500">{hasPhysicalEvals ? "Última evaluación física" : "No disponible"}</div>
                  </div>
                </label>

                <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${hasTrackmanData ? "hover:bg-gray-50" : "opacity-40 cursor-not-allowed"}`}>
                  <input
                    type="checkbox"
                    checked={incluirTrackman}
                    disabled={!hasTrackmanData}
                    onChange={(e) => setIncluirTrackman(e.target.checked)}
                    className="w-4 h-4 accent-emerald-700"
                  />
                  <div>
                    <div className="font-medium text-sm text-gray-800">Datos Trackman</div>
                    <div className="text-xs text-gray-500">{hasTrackmanData ? "Última sesión Trackman" : "No disponible"}</div>
                  </div>
                </label>
              </div>

              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
              )}

              <button
                onClick={handleGenerate}
                disabled={loading || noneSelected}
                className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: loading || noneSelected ? undefined : "#1B4D2E" }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                    Generando informe...
                  </span>
                ) : noneSelected ? "Selecciona al menos una fuente" : "Generar informe"}
              </button>
            </>
          )}

          {report && meta && (
            <div>
              {/* Action buttons */}
              <div className="flex gap-2 mb-4 flex-wrap">
                <button
                  onClick={() => { setReport(null); setMeta(null); setInformeId(null); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                  Nuevo informe
                </button>

                <button
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {downloadingPdf ? (
                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                  )}
                  {downloadingPdf ? "Generando..." : "Descargar PDF"}
                </button>

                {informeId && (
                  <>
                    <button
                      onClick={handleWhatsApp}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white transition-colors"
                      style={{ background: "#25D366" }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      WhatsApp
                    </button>

                    <button
                      onClick={handleCopyLink}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      {copied ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={2.5}><path d="M20 6L9 17l-5-5"/></svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      )}
                      {copied ? "¡Copiado!" : "Copiar enlace"}
                    </button>
                  </>
                )}
              </div>

              {/* Preview */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-y-auto max-h-[calc(100vh-320px)]">
                  <div ref={reportRef}>
                    <ReportCard report={report} meta={meta} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
