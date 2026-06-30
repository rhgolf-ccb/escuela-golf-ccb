"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────
type TipoSesion = "tiro_largo" | "juego_corto" | "putt" | "campo";
type Lugar = "campo_practica" | "putting_green" | "campo_infantil" | "campo_pacos_fabios" | "campo_completo";

export interface SesionJuvenilData {
  calentamiento: { descripcion: string; duracion_min: number };
  drill_durations: number[];
  juego_competitivo_struct: {
    titulo: string; descripcion: string;
    reglas_birdies: string; reglas_aguilas: string; reglas_albatros: string;
    como_se_gana: string; duracion_min: number;
  };
  objetivo_por_grupo: { birdies: string; aguilas: string; albatros: string };
  materiales_totales: string[];
}

interface JuvenilSugerencia {
  id: number; tema: string; tipo: string; lugar: string;
  justificacion: string; recomendada: boolean;
}

interface JuvenilDrill {
  titulo: string; duracion_min: number;
  descripcion_general: string;
  variante_birdies: string; variante_aguilas: string; variante_albatros: string;
  material_necesario: string;
}

interface JuvenilJuegoComp {
  titulo: string; descripcion: string;
  reglas_birdies: string; reglas_aguilas: string; reglas_albatros: string;
  como_se_gana: string; duracion_min: number;
}

interface JuvenilPlanClase {
  objetivo_clase: string; lugar: string;
  hora_inicio: string; hora_fin: string;
  calentamiento: { descripcion: string; duracion_min: number };
  drills: JuvenilDrill[];
  juego_competitivo: JuvenilJuegoComp;
  objetivo_por_grupo: { birdies: string; aguilas: string; albatros: string };
  materiales_totales: string[];
}

interface ExistingSesion {
  id: string; objetivo: string;
  tipo_sesion: string; lugar: Lugar;
  hora_inicio: string | null; hora_fin: string | null;
  drills: Array<{
    titulo: string; descripcion: string;
    dificultad_birdies?: string | null;
    dificultad_aguilas?: string | null;
    dificultad_albatros?: string | null;
  }>;
  sesion_juvenil?: SesionJuvenilData | null;
}

interface Props {
  planId: string; planTema: string;
  dia: string; diaLabel: string; fecha: string;
  horaInicio?: string; horaFin?: string;
  sesionExistente?: ExistingSesion | null;
  onClose: () => void;
  onSaved: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const LUGAR_LABEL: Record<Lugar, string> = {
  campo_practica: "Campo de práctica",
  putting_green: "Putting Green",
  campo_infantil: "Campo Infantil",
  campo_pacos_fabios: "Pacos y Fabios",
  campo_completo: "Campo Completo",
};

const TIPO_OPTIONS: { value: TipoSesion; label: string }[] = [
  { value: "tiro_largo", label: "Tiro Largo" },
  { value: "juego_corto", label: "Juego Corto" },
  { value: "putt", label: "Putt" },
  { value: "campo", label: "Campo" },
];

const GREEN = "#1B4D2E";

function mapAILugar(str: string): Lugar {
  const s = str.toLowerCase();
  if (s.includes("infantil")) return "campo_infantil";
  if (s.includes("pacos") || s.includes("fabios")) return "campo_pacos_fabios";
  if (s.includes("putt") || s.includes("green") || s.includes("fundador")) return "putting_green";
  if (s.includes("completo")) return "campo_completo";
  return "campo_practica";
}

function mapTipoSesion(tipo: string): TipoSesion {
  if (["tiro_largo", "juego_corto", "putt", "campo"].includes(tipo)) return tipo as TipoSesion;
  return "campo";
}

function parseJSONFallback(raw: string): unknown {
  try { return JSON.parse(raw); } catch { /* */ }
  const cleaned = raw.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
  try { return JSON.parse(cleaned); } catch { /* */ }
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* */ } }
  return null;
}

function formatHora(t: string | null): string { return t ? t.slice(0, 5) : ""; }

function formatFecha(fecha: string): string {
  return new Date(fecha + "T00:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

// ── PDF Template (hidden) ─────────────────────────────────────────────────────
function JuvenilPDFContent({
  plan, diaLabel, fecha, refProp,
}: { plan: JuvenilPlanClase; diaLabel: string; fecha: string; refProp: React.RefObject<HTMLDivElement | null> }) {
  const fechaFmt = new Date(fecha + "T00:00:00").toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div
      ref={refProp}
      style={{
        width: 794, padding: "48px 56px", fontFamily: "Georgia, serif",
        background: "#fff", color: "#1a1a1a",
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: "#4b7c52", textTransform: "uppercase", marginBottom: 8 }}>
          Escuela de Golf CCB
        </div>
        <div style={{ fontSize: 22, fontWeight: "bold", color: GREEN, marginBottom: 4 }}>
          Programación de clase
        </div>
        <div style={{ fontSize: 13, color: "#555" }}>
          Grupo Juvenil · Birdies · Águilas · Albatros
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: "#333" }}>
          {fechaFmt} · {plan.hora_inicio}–{plan.hora_fin} · {plan.lugar}
        </div>
        <div style={{ width: 60, height: 3, background: GREEN, margin: "16px auto 0" }} />
      </div>

      {/* Objetivo */}
      <div style={{ background: "#f0faf2", border: `2px solid ${GREEN}`, borderRadius: 8, padding: "14px 18px", marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: "bold", color: GREEN, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
          🎯 Objetivo de hoy
        </div>
        <div style={{ fontSize: 14, color: "#1a3a1a", lineHeight: 1.5 }}>{plan.objetivo_clase}</div>
      </div>

      {/* Drills */}
      {plan.drills.map((drill, i) => (
        <div key={i} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: "bold", color: GREEN, marginBottom: 4 }}>
            {i + 1}. {drill.titulo}
            <span style={{ fontWeight: "normal", color: "#666", fontSize: 11, marginLeft: 8 }}>· {drill.duracion_min} min</span>
          </div>
          <div style={{ fontSize: 12, color: "#333", lineHeight: 1.6, paddingLeft: 12, borderLeft: `3px solid #a7d7b0` }}>
            {drill.descripcion_general}
          </div>
        </div>
      ))}

      {/* Juego del día */}
      {plan.juego_competitivo && (
        <div style={{ background: "#fff8ec", border: "2px solid #e6a817", borderRadius: 8, padding: "14px 18px", marginTop: 12, marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: "bold", color: "#b45309", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
            🏆 Juego del día · {plan.juego_competitivo.duracion_min} min
          </div>
          <div style={{ fontSize: 13, fontWeight: "bold", color: "#7c2d12", marginBottom: 4 }}>
            {plan.juego_competitivo.titulo}
          </div>
          <div style={{ fontSize: 12, color: "#333", lineHeight: 1.6 }}>
            {plan.juego_competitivo.descripcion}
          </div>
        </div>
      )}

      {/* Materiales */}
      {plan.materiales_totales?.length > 0 && (
        <div style={{ fontSize: 12, color: "#444", marginBottom: 24 }}>
          <span style={{ fontWeight: "bold", color: GREEN }}>📦 Materiales: </span>
          {plan.materiales_totales.join(" · ")}
        </div>
      )}

      {/* Footer */}
      <div style={{
        marginTop: 32, paddingTop: 14, borderTop: "1px solid #ddd",
        textAlign: "center", fontSize: 10, color: "#888",
      }}>
        Escuela de Golf CCB · {fechaFmt}
        <br />Con mucho entusiasmo y aprendizaje para todos nuestros jugadores ⛳
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function JuvenileClassModal({
  planId, planTema, dia, diaLabel, fecha,
  horaInicio, horaFin, sesionExistente,
  onClose, onSaved,
}: Props) {
  const isEdit = !!sesionExistente?.sesion_juvenil;
  const [step, setStep] = useState<1 | 2>(isEdit ? 2 : 1);

  // Step 1 state
  const [sugerencias, setSugerencias] = useState<JuvenilSugerencia[]>([]);
  const [loadingSuger, setLoadingSuger] = useState(false);
  const [sugerError, setSugerError] = useState<string | null>(null);
  const [selectedSugerIdx, setSelectedSugerIdx] = useState<number | null>(null);
  const [temaCustom, setTemaCustom] = useState("");
  const [lugarEnum, setLugarEnum] = useState<Lugar>("campo_practica");
  const [tipoSesion, setTipoSesion] = useState<TipoSesion>("campo");

  // Step 2 state
  const [clasePlan, setClasePlan] = useState<JuvenilPlanClase | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // PDF
  const pdfRef = useRef<HTMLDivElement>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Pre-populate from existing session
  useEffect(() => {
    if (sesionExistente?.sesion_juvenil) {
      const jd = sesionExistente.sesion_juvenil;
      setClasePlan({
        objetivo_clase: sesionExistente.objetivo,
        lugar: LUGAR_LABEL[sesionExistente.lugar] ?? sesionExistente.lugar,
        hora_inicio: formatHora(sesionExistente.hora_inicio),
        hora_fin: formatHora(sesionExistente.hora_fin),
        calentamiento: jd.calentamiento,
        drills: sesionExistente.drills.map((d, i) => ({
          titulo: d.titulo,
          duracion_min: jd.drill_durations?.[i] ?? 15,
          descripcion_general: d.descripcion,
          variante_birdies: d.dificultad_birdies ?? "",
          variante_aguilas: d.dificultad_aguilas ?? "",
          variante_albatros: d.dificultad_albatros ?? "",
          material_necesario: "",
        })),
        juego_competitivo: jd.juego_competitivo_struct,
        objetivo_por_grupo: jd.objetivo_por_grupo,
        materiales_totales: jd.materiales_totales,
      });
    }
  }, [sesionExistente]);

  // Auto-load suggestions
  const handleSugerirTemas = useCallback(async () => {
    setLoadingSuger(true); setSugerError(null);
    try {
      const { data: lastSes } = await supabase
        .from("sesiones_semana")
        .select("objetivo, tipo_sesion, lugar, fecha")
        .order("fecha", { ascending: false })
        .limit(1);
      const { data: lastTests } = await supabase
        .from("swing_evaluations")
        .select("grupo, score_promedio, evaluation_date")
        .in("grupo", ["Birdies", "Águilas", "Albatros"])
        .order("evaluation_date", { ascending: false })
        .limit(5);

      const res = await fetch("/api/suggest-juvenile-class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha, dia_semana: dia,
          ultima_sesion: lastSes?.[0] ?? null,
          contexto_tests: lastTests?.length ? lastTests : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al sugerir");
      if (data.sugerencias) {
        setSugerencias(data.sugerencias);
        const recIdx = data.sugerencias.findIndex((s: JuvenilSugerencia) => s.recomendada);
        if (recIdx >= 0) {
          setSelectedSugerIdx(recIdx);
          setLugarEnum(mapAILugar(data.sugerencias[recIdx].lugar));
          setTipoSesion(mapTipoSesion(data.sugerencias[recIdx].tipo));
        }
      }
    } catch (err) {
      setSugerError(err instanceof Error ? err.message : "Error al cargar sugerencias");
    } finally {
      setLoadingSuger(false);
    }
  }, [fecha, dia]);

  useEffect(() => {
    if (step === 1) handleSugerirTemas();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getTema(): string {
    if (selectedSugerIdx !== null && !temaCustom.trim()) return sugerencias[selectedSugerIdx]?.tema ?? "";
    return temaCustom.trim();
  }

  async function handleGenerarPlan(temaOverride?: string) {
    const tema = temaOverride ?? getTema();
    if (!tema) return;
    setLoadingPlan(true); setPlanError(null); setStep(2); setClasePlan(null);
    try {
      const res = await fetch("/api/plan-juvenile-class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha, dia_semana: dia,
          tema, tipo_sesion: tipoSesion,
          lugar: LUGAR_LABEL[lugarEnum],
          hora_inicio: horaInicio ?? "16:30",
          hora_fin: horaFin ?? "17:30",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al generar plan");
      setClasePlan(data as JuvenilPlanClase);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Error desconocido");
      setStep(1);
    } finally {
      setLoadingPlan(false);
    }
  }

  function updatePlan<K extends keyof JuvenilPlanClase>(key: K, val: JuvenilPlanClase[K]) {
    setClasePlan((p) => p ? { ...p, [key]: val } : p);
  }

  function updateDrill(i: number, updates: Partial<JuvenilDrill>) {
    setClasePlan((p) => {
      if (!p) return p;
      const drills = [...p.drills]; drills[i] = { ...drills[i], ...updates };
      return { ...p, drills };
    });
  }

  function updateJuego(updates: Partial<JuvenilJuegoComp>) {
    setClasePlan((p) => p ? { ...p, juego_competitivo: { ...p.juego_competitivo, ...updates } } : p);
  }

  async function handleSave() {
    if (!clasePlan) return;
    setSaving(true); setSaveError(null);
    try {
      const lugarMapped = mapAILugar(clasePlan.lugar);

      const drillsMapped = clasePlan.drills.map((d) => ({
        titulo: d.titulo,
        descripcion: d.descripcion_general,
        dificultad_birdies: d.variante_birdies || null,
        dificultad_aguilas: d.variante_aguilas || null,
        dificultad_albatros: d.variante_albatros || null,
        dificultad_mas14: null,
      }));

      const sesionJuvenilData: SesionJuvenilData = {
        calentamiento: clasePlan.calentamiento,
        drill_durations: clasePlan.drills.map((d) => d.duracion_min),
        juego_competitivo_struct: clasePlan.juego_competitivo,
        objetivo_por_grupo: clasePlan.objetivo_por_grupo,
        materiales_totales: clasePlan.materiales_totales,
      };

      const juegoCompText = clasePlan.juego_competitivo
        ? `${clasePlan.juego_competitivo.titulo}: ${clasePlan.juego_competitivo.descripcion}`
        : null;

      const payload = {
        plan_id: planId,
        dia_semana: dia,
        fecha,
        tipo_sesion: mapTipoSesion(tipoSesion) as string,
        lugar: lugarMapped as string,
        hora_inicio: clasePlan.hora_inicio || horaInicio || null,
        hora_fin: clasePlan.hora_fin || horaFin || null,
        objetivo: clasePlan.objetivo_clase,
        drills: drillsMapped,
        juego_competitivo: juegoCompText,
        estaciones_damas: null,
        notas: null,
        sesion_juvenil: sesionJuvenilData,
      };

      if (sesionExistente) {
        const { error } = await supabase.from("sesiones_semana").update(payload).eq("id", sesionExistente.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("sesiones_semana").insert(payload);
        if (error) throw new Error(error.message);
      }

      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadPDF() {
    if (!clasePlan || !pdfRef.current) return;
    setGeneratingPdf(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"), import("html2canvas"),
      ]);
      const canvas = await html2canvas(pdfRef.current, { scale: 2, backgroundColor: "#fff", useCORS: true, logging: false });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = (canvas.height * pdfW) / canvas.width;
      const pageH = pdf.internal.pageSize.getHeight();
      let y = 0;
      while (y < pdfH) {
        if (y > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, -y, pdfW, pdfH);
        y += pageH;
      }
      pdf.save(`Clase_Juvenil_${fecha}.pdf`);
    } finally {
      setGeneratingPdf(false);
    }
  }

  const tema = getTema();
  const busy = saving || loadingPlan || generatingPdf;

  return (
    <>
      {/* ── Modal ── */}
      <div
        className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto"
        onClick={() => { if (!busy) onClose(); }}
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-6" onClick={(e) => e.stopPropagation()}>

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
            <div>
              <h2 className="font-bold text-gray-900">
                {isEdit ? "Editar clase" : "Nueva clase"} — Juvenil
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {diaLabel} {formatFecha(fecha)} · {planTema}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* Step indicators */}
              <div className="flex items-center gap-1">
                {([1, 2] as const).map((s) => (
                  <div key={s} className="flex items-center">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all"
                      style={step >= s ? { background: GREEN, color: "#fff" } : { background: "#f3f4f6", color: "#9ca3af" }}
                    >
                      {step > s
                        ? <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={3}><path d="M3 10l4 4 9-9"/></svg>
                        : s}
                    </div>
                    {s < 2 && <div className="w-5 h-0.5 mx-0.5 bg-gray-200" style={step > s ? { background: GREEN, opacity: 0.4 } : {}} />}
                  </div>
                ))}
              </div>
              <button
                onClick={() => { if (!busy) onClose(); }}
                disabled={busy}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-40"
              >
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          </div>

          {/* ── PASO 1: Sugerencias ── */}
          {step === 1 && (
            <>
              <div className="px-6 py-6 space-y-5 max-h-[70vh] overflow-y-auto">
                <div>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Paso 1 de 2</p>
                  <h3 className="text-base font-bold text-gray-900">¿Qué trabajamos hoy?</h3>
                  <p className="text-xs text-gray-400 mt-0.5">El agente sugiere el tema según el progreso reciente del grupo</p>
                </div>

                {/* Loading */}
                {loadingSuger && (
                  <div className="flex items-center gap-3 py-8 justify-center text-gray-400">
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                    <span className="text-sm">El agente está analizando el progreso del grupo...</span>
                  </div>
                )}

                {/* Error */}
                {sugerError && !loadingSuger && (
                  <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">
                    {sugerError} —{" "}
                    <button onClick={handleSugerirTemas} className="underline font-medium">Reintentar</button>
                  </div>
                )}

                {/* Sugerencia cards */}
                {!loadingSuger && sugerencias.length > 0 && (
                  <div className="space-y-3">
                    {sugerencias.map((sug, i) => (
                      <button
                        key={sug.id}
                        onClick={() => {
                          setSelectedSugerIdx(i);
                          setTemaCustom("");
                          setLugarEnum(mapAILugar(sug.lugar));
                          setTipoSesion(mapTipoSesion(sug.tipo));
                        }}
                        className="w-full text-left rounded-xl border-2 p-4 transition-all hover:shadow-sm"
                        style={selectedSugerIdx === i
                          ? { borderColor: GREEN, background: "#f0faf2" }
                          : { borderColor: "#e5e7eb", background: "#f9fafb" }}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            {sug.recomendada && (
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
                                ⭐ RECOMENDADA
                              </span>
                            )}
                            <span className="text-sm font-bold text-gray-900">{sug.tema}</span>
                          </div>
                          <div
                            className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                            style={selectedSugerIdx === i ? { borderColor: GREEN, background: GREEN } : { borderColor: "#d1d5db" }}
                          >
                            {selectedSugerIdx === i && (
                              <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={3}><path d="M3 10l4 4 9-9"/></svg>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-1.5">
                          <span className="px-1.5 py-0.5 bg-gray-100 rounded">{sug.tipo}</span>
                          <span>·</span>
                          <span>{sug.lugar}</span>
                        </div>
                        <p className="text-xs text-gray-600 italic">"{sug.justificacion}"</p>
                      </button>
                    ))}
                  </div>
                )}

                {/* Custom tema */}
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1.5">O escribe tu propio tema:</p>
                  <input
                    value={temaCustom}
                    onChange={(e) => {
                      setTemaCustom(e.target.value);
                      if (e.target.value.trim()) setSelectedSugerIdx(null);
                    }}
                    placeholder="Ej: Fundamentos del grip y postura..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                  />
                </div>

                {/* Lugar y tipo */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Lugar</label>
                    <select
                      value={lugarEnum}
                      onChange={(e) => setLugarEnum(e.target.value as Lugar)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
                    >
                      {(Object.entries(LUGAR_LABEL) as [Lugar, string][]).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tipo de sesión</label>
                    <select
                      value={tipoSesion}
                      onChange={(e) => setTipoSesion(e.target.value as TipoSesion)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
                    >
                      {TIPO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 pb-6 flex gap-2 border-t border-gray-100 pt-4">
                <button
                  onClick={() => handleGenerarPlan()}
                  disabled={!tema || loadingSuger}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-all hover:brightness-110"
                  style={{ background: GREEN }}
                >
                  Siguiente →
                </button>
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            </>
          )}

          {/* ── PASO 2: Plan preview editable ── */}
          {step === 2 && (
            <>
              <div className="px-6 py-6 space-y-5 max-h-[70vh] overflow-y-auto">
                {/* Loading */}
                {loadingPlan && (
                  <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
                    <svg className="animate-spin h-7 w-7" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                    <p className="text-sm font-medium">El agente está diseñando la clase...</p>
                    <p className="text-xs text-gray-400">Esto puede tomar unos segundos</p>
                  </div>
                )}

                {planError && (
                  <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">
                    {planError}
                  </div>
                )}

                {!loadingPlan && clasePlan && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Paso 2 de 2</p>
                      <h3 className="text-base font-bold text-gray-900">Preview de la clase</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Todos los campos son editables · Ajusta lo que necesites</p>
                    </div>

                    {/* Meta (hora, lugar) */}
                    <div className="flex items-center gap-3 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2.5 flex-wrap">
                      <span className="font-semibold text-gray-700">{diaLabel} {formatFecha(fecha)}</span>
                      <span>·</span>
                      <span>
                        <input
                          value={clasePlan.hora_inicio}
                          onChange={(e) => updatePlan("hora_inicio", e.target.value)}
                          type="time"
                          className="border-0 bg-transparent text-xs focus:outline-none w-16"
                        />
                        –
                        <input
                          value={clasePlan.hora_fin}
                          onChange={(e) => updatePlan("hora_fin", e.target.value)}
                          type="time"
                          className="border-0 bg-transparent text-xs focus:outline-none w-16"
                        />
                      </span>
                      <span>·</span>
                      <select
                        value={mapAILugar(clasePlan.lugar)}
                        onChange={(e) => updatePlan("lugar", LUGAR_LABEL[e.target.value as Lugar])}
                        className="border-0 bg-transparent text-xs focus:outline-none text-gray-600"
                      >
                        {(Object.entries(LUGAR_LABEL) as [Lugar, string][]).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </div>

                    {/* Objetivo */}
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide mb-1.5">🎯 Objetivo de la clase</p>
                      <textarea
                        value={clasePlan.objetivo_clase}
                        onChange={(e) => updatePlan("objetivo_clase", e.target.value)}
                        rows={2}
                        className="w-full text-sm text-gray-800 bg-transparent border-0 focus:outline-none resize-none"
                      />
                    </div>

                    {/* Calentamiento */}
                    <div className="border border-orange-100 bg-orange-50 rounded-lg p-3">
                      <p className="text-[10px] font-bold text-orange-700 uppercase tracking-wide mb-1.5">
                        🔥 Calentamiento · {clasePlan.calentamiento.duracion_min} min
                      </p>
                      <textarea
                        value={clasePlan.calentamiento.descripcion}
                        onChange={(e) => updatePlan("calentamiento", { ...clasePlan.calentamiento, descripcion: e.target.value })}
                        rows={2}
                        className="w-full text-sm text-gray-800 bg-transparent border-0 focus:outline-none resize-none"
                      />
                    </div>

                    {/* Drills */}
                    {clasePlan.drills.map((drill, i) => (
                      <div key={i} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-bold text-gray-400 uppercase">Drill {i + 1}</span>
                          <input
                            value={drill.duracion_min}
                            onChange={(e) => updateDrill(i, { duracion_min: +e.target.value })}
                            type="number" min={5} max={30}
                            className="w-12 text-[10px] border border-gray-200 rounded px-1.5 py-0.5 bg-white focus:outline-none"
                          />
                          <span className="text-[10px] text-gray-400">min</span>
                        </div>
                        <input
                          value={drill.titulo}
                          onChange={(e) => updateDrill(i, { titulo: e.target.value })}
                          placeholder="Título del drill..."
                          className="w-full text-sm font-semibold text-gray-900 bg-transparent border-0 border-b border-gray-200 focus:outline-none mb-2 pb-1"
                        />
                        <div className="mb-3">
                          <p className="text-[10px] font-bold text-gray-500 mb-1">Descripción general</p>
                          <textarea
                            value={drill.descripcion_general}
                            onChange={(e) => updateDrill(i, { descripcion_general: e.target.value })}
                            rows={2}
                            className="w-full text-xs text-gray-700 border border-gray-200 rounded px-2 py-1.5 bg-white focus:outline-none resize-none"
                          />
                        </div>
                        <div className="space-y-2">
                          {[
                            { key: "variante_birdies" as const, label: "▸ Birdies (4-5 años)", bg: "#dbeafe", tc: "#1e40af" },
                            { key: "variante_aguilas" as const, label: "▸ Águilas (6-8 años)", bg: "#dcfce7", tc: "#166534" },
                            { key: "variante_albatros" as const, label: "▸ Albatros (9-12 años)", bg: "#fef9c3", tc: "#854d0e" },
                          ].map(({ key, label, bg, tc }) => (
                            <div key={key} className="rounded-md p-2" style={{ background: bg }}>
                              <p className="text-[10px] font-bold mb-1" style={{ color: tc }}>{label}</p>
                              <textarea
                                value={drill[key]}
                                onChange={(e) => updateDrill(i, { [key]: e.target.value })}
                                rows={2}
                                className="w-full text-[11px] bg-white border border-gray-200 rounded px-1.5 py-1 resize-none focus:outline-none"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Juego competitivo */}
                    {clasePlan.juego_competitivo && (
                      <div className="border border-orange-200 bg-orange-50 rounded-lg p-3">
                        <p className="text-[10px] font-bold text-orange-700 uppercase tracking-wide mb-2">
                          🏆 Juego Competitivo · {clasePlan.juego_competitivo.duracion_min} min
                        </p>
                        <input
                          value={clasePlan.juego_competitivo.titulo}
                          onChange={(e) => updateJuego({ titulo: e.target.value })}
                          placeholder="Título del juego..."
                          className="w-full text-sm font-semibold text-gray-900 bg-transparent border-0 border-b border-orange-200 focus:outline-none mb-2 pb-1"
                        />
                        <div className="mb-2">
                          <p className="text-[10px] font-bold text-gray-500 mb-1">Descripción</p>
                          <textarea
                            value={clasePlan.juego_competitivo.descripcion}
                            onChange={(e) => updateJuego({ descripcion: e.target.value })}
                            rows={2}
                            className="w-full text-xs text-gray-700 border border-orange-100 rounded px-2 py-1.5 bg-white focus:outline-none resize-none"
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          {[
                            { key: "reglas_birdies" as const, label: "Birdies", bg: "#dbeafe", tc: "#1e40af" },
                            { key: "reglas_aguilas" as const, label: "Águilas", bg: "#dcfce7", tc: "#166534" },
                            { key: "reglas_albatros" as const, label: "Albatros", bg: "#fef9c3", tc: "#854d0e" },
                          ].map(({ key, label, bg, tc }) => (
                            <div key={key} className="rounded p-2" style={{ background: bg }}>
                              <p className="text-[10px] font-bold mb-1" style={{ color: tc }}>{label}</p>
                              <textarea
                                value={clasePlan.juego_competitivo[key]}
                                onChange={(e) => updateJuego({ [key]: e.target.value })}
                                rows={1}
                                className="w-full text-[11px] bg-white border border-gray-200 rounded px-1.5 py-1 resize-none focus:outline-none"
                              />
                            </div>
                          ))}
                          <div className="rounded p-2 bg-gray-100">
                            <p className="text-[10px] font-bold text-gray-600 mb-1">¿Cómo se gana?</p>
                            <textarea
                              value={clasePlan.juego_competitivo.como_se_gana}
                              onChange={(e) => updateJuego({ como_se_gana: e.target.value })}
                              rows={1}
                              className="w-full text-[11px] bg-white border border-gray-200 rounded px-1.5 py-1 resize-none focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Materiales */}
                    {clasePlan.materiales_totales?.length > 0 && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">📦 Materiales</p>
                        <p className="text-xs text-gray-700">{clasePlan.materiales_totales.join(", ")}</p>
                      </div>
                    )}

                    {saveError && (
                      <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{saveError}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              {!loadingPlan && clasePlan && (
                <div className="px-6 pb-6 flex gap-2 border-t border-gray-100 pt-4">
                  <button
                    onClick={() => { setStep(1); setClasePlan(null); setPlanError(null); }}
                    disabled={busy}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1.5"
                  >
                    ← Regenerar
                  </button>
                  <button
                    onClick={handleDownloadPDF}
                    disabled={busy}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1.5"
                  >
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                    {generatingPdf ? "..." : "PDF"}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={busy}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 hover:brightness-110 transition-all"
                    style={{ background: GREEN }}
                  >
                    {saving ? (
                      <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg> Guardando...</>
                    ) : "✓ Guardar clase"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Hidden PDF template */}
      <div style={{ position: "absolute", left: "-9999px", top: 0, pointerEvents: "none" }}>
        {clasePlan && (
          <JuvenilPDFContent
            plan={clasePlan}
            diaLabel={diaLabel}
            fecha={fecha}
            refProp={pdfRef}
          />
        )}
      </div>
    </>
  );
}
