"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────
type TemaChip = "swing" | "juego_corto" | "putt" | "campo" | "juego_libre" | "test_tecnico" | "test_fisico";
type Lugar = "campo_practica" | "putting_green" | "campo_infantil" | "campo_pacos_fabios" | "campo_completo";

export interface Actividad {
  nombre: string;
  duracion_min: number;
  como_se_juega: string;
  adaptacion_birdies: string;
  adaptacion_albatros: string;
  como_se_gana: string;
  materiales: string;
}

export interface SesionJuvenilData {
  nombre_clase: string;
  objetivo_simple: string;
  actividades: Actividad[];
  actividad_estrella: string;
}

interface ExistingSesion {
  id: string;
  objetivo: string;
  tipo_sesion: string;
  lugar: Lugar;
  hora_inicio: string | null;
  hora_fin: string | null;
  drills: Array<{
    titulo: string;
    descripcion: string;
    dificultad_birdies?: string | null;
    dificultad_albatros?: string | null;
  }>;
  sesion_juvenil?: SesionJuvenilData | null;
}

interface Props {
  planId: string;
  planTema: string;
  dia: string;
  diaLabel: string;
  fecha: string;
  horaInicio?: string;
  horaFin?: string;
  sesionExistente?: ExistingSesion | null;
  onClose: () => void;
  onSaved: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const GREEN = "#1B4D2E";

const LUGAR_LABEL: Record<Lugar, string> = {
  campo_practica: "Campo de práctica",
  putting_green: "Putting Green",
  campo_infantil: "Campo Infantil",
  campo_pacos_fabios: "Pacos y Fabios",
  campo_completo: "Campo Completo",
};

const CHIPS: { value: TemaChip; emoji: string; label: string }[] = [
  { value: "swing",       emoji: "🏌️", label: "Swing" },
  { value: "juego_corto", emoji: "⛳",  label: "Juego corto" },
  { value: "putt",        emoji: "🎯",  label: "Putt" },
  { value: "campo",       emoji: "🌿",  label: "Campo" },
  { value: "juego_libre", emoji: "🎮",  label: "Juego libre" },
  { value: "test_tecnico",emoji: "📋",  label: "Test técnico" },
  { value: "test_fisico", emoji: "💪",  label: "Test físico" },
];

const CHIP_TIPO: Record<TemaChip, string> = {
  swing:        "tiro_largo",
  juego_corto:  "juego_corto",
  putt:         "putt",
  campo:        "campo",
  juego_libre:  "campo",
  test_tecnico: "test_tecnico",
  test_fisico:  "test_fisico",
};

const CHIP_TEMA: Record<TemaChip, string> = {
  swing:        "Swing",
  juego_corto:  "Juego corto",
  putt:         "Putt",
  campo:        "Salida al campo",
  juego_libre:  "Juego libre",
  test_tecnico: "Test técnico",
  test_fisico:  "Test físico",
};

function mapAILugar(str: string): Lugar {
  const s = str.toLowerCase();
  if (s.includes("infantil"))                         return "campo_infantil";
  if (s.includes("pacos") || s.includes("fabios"))   return "campo_pacos_fabios";
  if (s.includes("putt") || s.includes("green") || s.includes("fundador")) return "putting_green";
  if (s.includes("completo"))                         return "campo_completo";
  return "campo_practica";
}

function parseJSONFallback(raw: string): unknown {
  try { return JSON.parse(raw); } catch { /* */ }
  const cleaned = raw.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
  try { return JSON.parse(cleaned); } catch { /* */ }
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* */ } }
  return null;
}
// parseJSONFallback kept for future use — the API already strips markdown
void parseJSONFallback;

function formatFecha(fecha: string): string {
  return new Date(fecha + "T00:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

// ── PDF para padres ───────────────────────────────────────────────────────────
function JuvenilPDFContent({
  plan, diaLabel, fecha, horaInicio, horaFin, refProp,
}: {
  plan: SesionJuvenilData;
  diaLabel: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  refProp: React.RefObject<HTMLDivElement | null>;
}) {
  const fechaFmt = new Date(fecha + "T00:00:00").toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div
      ref={refProp}
      style={{ width: 794, padding: "48px 56px", fontFamily: "Arial, sans-serif", background: "#fff", color: "#1a1a1a" }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: "#4b7c52", textTransform: "uppercase", marginBottom: 8 }}>
          Escuela de Golf CCB
        </div>
        <div style={{ fontSize: 28, fontWeight: "bold", color: GREEN, marginBottom: 6 }}>
          {plan.nombre_clase}
        </div>
        <div style={{ fontSize: 13, color: "#555" }}>
          Grupo Juvenil · Birdies · Águilas · Albatros
        </div>
        <div style={{ marginTop: 10, fontSize: 13, color: "#333" }}>
          {diaLabel} {fechaFmt} · {horaInicio}–{horaFin}
        </div>
        <div style={{ width: 60, height: 3, background: GREEN, margin: "16px auto 0" }} />
      </div>

      {/* Objetivo para padres */}
      <div style={{ background: "#f0faf2", border: `2px solid ${GREEN}`, borderRadius: 8, padding: "14px 18px", marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: "bold", color: GREEN, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
          Hoy trabajamos:
        </div>
        <div style={{ fontSize: 15, color: "#1a3a1a", lineHeight: 1.5, fontStyle: "italic" }}>
          "{plan.objetivo_simple}"
        </div>
      </div>

      {/* Actividades */}
      {plan.actividades.map((act, i) => (
        <div key={i} style={{ marginBottom: 22, borderLeft: "4px solid #a7d7b0", paddingLeft: 16 }}>
          <div style={{ fontSize: 13, fontWeight: "bold", color: GREEN, marginBottom: 4 }}>
            Actividad {i + 1} · {act.duracion_min} min — {act.nombre}
          </div>
          <div style={{ fontSize: 12, color: "#333", lineHeight: 1.7, marginBottom: 8 }}>
            {act.como_se_juega}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 4 }}>
            {act.adaptacion_birdies && (
              <div style={{ background: "#dbeafe", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#1e40af" }}>
                <strong>Birdies (4-5a):</strong> {act.adaptacion_birdies}
              </div>
            )}
            {act.adaptacion_albatros && (
              <div style={{ background: "#fef9c3", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#854d0e" }}>
                <strong>Albatros (9-12a):</strong> {act.adaptacion_albatros}
              </div>
            )}
          </div>
          {act.como_se_gana && (
            <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
              🏆 {act.como_se_gana}
            </div>
          )}
        </div>
      ))}

      {/* Actividad estrella */}
      {plan.actividad_estrella && (
        <div style={{ background: "#fff8ec", border: "2px solid #e6a817", borderRadius: 8, padding: "14px 18px", marginTop: 8, marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: "bold", color: "#b45309", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
            ⭐ Actividad estrella del día
          </div>
          <div style={{ fontSize: 15, fontWeight: "bold", color: "#7c2d12" }}>{plan.actividad_estrella}</div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 32, paddingTop: 14, borderTop: "1px solid #ddd", textAlign: "center", fontSize: 10, color: "#888" }}>
        Escuela de Golf CCB · {fechaFmt}
        <br />¡Hoy aprendemos jugando! ⛳
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
  const hasExistingNew = !!sesionExistente?.sesion_juvenil?.actividades;

  const [step, setStep] = useState<1 | 2>(hasExistingNew ? 2 : 1);

  // Step 1
  const [selectedChip, setSelectedChip] = useState<TemaChip | null>(null);
  const [temaExtra, setTemaExtra]        = useState("");
  const [lugarEnum, setLugarEnum]        = useState<Lugar>(sesionExistente?.lugar ?? "campo_practica");
  const [testHoraInicio, setTestHoraInicio] = useState(horaInicio ?? "16:30");
  const [testHoraFin, setTestHoraFin]       = useState(horaFin ?? "17:30");

  // Step 2
  const [clasePlan, setClasePlan]   = useState<SesionJuvenilData | null>(
    hasExistingNew ? sesionExistente!.sesion_juvenil! : null,
  );
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [planError, setPlanError]     = useState<string | null>(null);

  // Save
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // PDF
  const pdfRef = useRef<HTMLDivElement>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const isTest = selectedChip === "test_tecnico" || selectedChip === "test_fisico";
  const busy   = saving || loadingPlan || generatingPdf;

  async function handleSugerirClase() {
    if (!selectedChip) return;
    const tema = CHIP_TEMA[selectedChip] + (temaExtra.trim() ? ` — ${temaExtra.trim()}` : "");
    setLoadingPlan(true);
    setPlanError(null);
    setStep(2);
    setClasePlan(null);
    try {
      const res = await fetch("/api/plan-juvenile-class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tema, lugar: LUGAR_LABEL[lugarEnum], fecha, dia_semana: dia }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al generar clase");
      setClasePlan(data as SesionJuvenilData);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Error desconocido");
      setStep(1);
    } finally {
      setLoadingPlan(false);
    }
  }

  function updateActividad(i: number, updates: Partial<Actividad>) {
    setClasePlan((p) => {
      if (!p) return p;
      const actividades = [...p.actividades];
      actividades[i] = { ...actividades[i], ...updates };
      return { ...p, actividades };
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const chipValue   = selectedChip;
      const tipoSesion  = chipValue ? CHIP_TIPO[chipValue] : (sesionExistente?.tipo_sesion ?? "campo");
      const isTestSave  = chipValue === "test_tecnico" || chipValue === "test_fisico";

      let payload: Record<string, unknown>;

      if (isTestSave) {
        payload = {
          plan_id: planId,
          dia_semana: dia,
          fecha,
          tipo_sesion: tipoSesion,
          lugar: lugarEnum as string,
          hora_inicio: testHoraInicio || null,
          hora_fin: testHoraFin || null,
          objetivo: chipValue === "test_tecnico"
            ? "Sesión de evaluación técnica P1-P10"
            : "Sesión de evaluación física TPI",
          drills: [],
          juego_competitivo: null,
          estaciones_damas: null,
          notas: null,
          sesion_juvenil: null,
        };
      } else {
        if (!clasePlan) return;
        const lugarSave = mapAILugar((clasePlan as unknown as { lugar?: string }).lugar ?? LUGAR_LABEL[lugarEnum]);
        payload = {
          plan_id: planId,
          dia_semana: dia,
          fecha,
          tipo_sesion: tipoSesion,
          lugar: lugarSave as string,
          hora_inicio: horaInicio || null,
          hora_fin: horaFin || null,
          objetivo: clasePlan.objetivo_simple,
          drills: clasePlan.actividades.map((a) => ({
            titulo: a.nombre,
            descripcion: a.como_se_juega,
            dificultad_birdies: a.adaptacion_birdies || null,
            dificultad_aguilas: null,
            dificultad_albatros: a.adaptacion_albatros || null,
            dificultad_mas14: null,
          })),
          juego_competitivo: null,
          estaciones_damas: null,
          notas: null,
          sesion_juvenil: clasePlan,
        };
      }

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
                {sesionExistente ? "Editar clase" : "Nueva clase"} — Juvenil
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {diaLabel} {formatFecha(fecha)} · {planTema}
              </p>
            </div>
            <div className="flex items-center gap-4">
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

          {/* ── PASO 1: ¿Qué trabajamos hoy? ── */}
          {step === 1 && (
            <>
              <div className="px-6 py-6 space-y-5 max-h-[70vh] overflow-y-auto">
                <h3 className="text-base font-bold text-gray-900">¿Qué trabajamos hoy?</h3>

                {/* Chips */}
                <div className="flex flex-wrap gap-2">
                  {CHIPS.map((chip) => {
                    const isSelected  = selectedChip === chip.value;
                    const isTestChip  = chip.value === "test_tecnico" || chip.value === "test_fisico";
                    const activeColor = isTestChip
                      ? { border: "#6d28d9", bg: "#ede9fe", text: "#6d28d9" }
                      : { border: GREEN, bg: "#f0faf2", text: GREEN };
                    return (
                      <button
                        key={chip.value}
                        onClick={() => setSelectedChip(isSelected ? null : chip.value)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold border-2 transition-all"
                        style={isSelected
                          ? { borderColor: activeColor.border, background: activeColor.bg, color: activeColor.text }
                          : { borderColor: "#e5e7eb", background: "#f9fafb", color: "#374151" }}
                      >
                        <span>{chip.emoji}</span>
                        <span>{chip.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Extra text (solo para chips no-test) */}
                {selectedChip && !isTest && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">¿Algo específico? (opcional)</label>
                    <input
                      value={temaExtra}
                      onChange={(e) => setTemaExtra(e.target.value)}
                      placeholder={`Ej: Enfocarse en el ${CHIP_TEMA[selectedChip].toLowerCase()}...`}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                    />
                  </div>
                )}

                {/* Lugar */}
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

                {/* Test: hora + mensaje informativo */}
                {isTest && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Hora inicio</label>
                        <input
                          type="time"
                          value={testHoraInicio}
                          onChange={(e) => setTestHoraInicio(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Hora fin</label>
                        <input
                          type="time"
                          value={testHoraFin}
                          onChange={(e) => setTestHoraFin(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                    <div
                      className="rounded-xl border-2 p-4 space-y-1"
                      style={selectedChip === "test_tecnico"
                        ? { borderColor: "#9d174d", background: "#fdf2f8" }
                        : { borderColor: "#6d28d9", background: "#f5f3ff" }}
                    >
                      <p
                        className="text-sm font-bold"
                        style={{ color: selectedChip === "test_tecnico" ? "#9d174d" : "#6d28d9" }}
                      >
                        {selectedChip === "test_tecnico"
                          ? "📋 Sesión de evaluación técnica P1-P10"
                          : "💪 Sesión de evaluación física TPI"}
                      </p>
                      <p className="text-xs text-gray-600">
                        El protocolo de test está disponible en el módulo Tests.
                      </p>
                    </div>
                  </>
                )}

                {planError && (
                  <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">
                    {planError}
                  </div>
                )}
              </div>

              {/* Footer paso 1 */}
              <div className="px-6 pb-6 flex gap-2 border-t border-gray-100 pt-4">
                {isTest ? (
                  <button
                    onClick={handleSave}
                    disabled={!selectedChip || saving}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-all"
                    style={{ background: selectedChip === "test_tecnico" ? "#9d174d" : "#6d28d9" }}
                  >
                    {saving ? "Guardando..." : "Guardar sesión de test"}
                  </button>
                ) : (
                  <button
                    onClick={handleSugerirClase}
                    disabled={!selectedChip}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-all hover:brightness-110"
                    style={{ background: GREEN }}
                  >
                    Sugerir clase →
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            </>
          )}

          {/* ── PASO 2: Preview de la clase ── */}
          {step === 2 && (
            <>
              <div className="px-6 py-6 space-y-4 max-h-[70vh] overflow-y-auto">

                {/* Loading */}
                {loadingPlan && (
                  <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
                    <svg className="animate-spin h-7 w-7" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    <p className="text-sm font-medium">Diseñando la clase...</p>
                    <p className="text-xs text-gray-400">Esto puede tomar unos segundos</p>
                  </div>
                )}

                {!loadingPlan && clasePlan && (
                  <div className="space-y-4">

                    {/* Cabecera de la clase */}
                    <div className="bg-green-50 border-2 rounded-xl p-4" style={{ borderColor: GREEN }}>
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">🎮</span>
                        <div className="flex-1">
                          <input
                            value={clasePlan.nombre_clase}
                            onChange={(e) => setClasePlan((p) => p ? { ...p, nombre_clase: e.target.value } : p)}
                            className="text-lg font-bold bg-transparent border-0 focus:outline-none w-full"
                            style={{ color: GREEN }}
                          />
                          <p className="text-xs text-gray-500 mt-0.5">
                            {diaLabel} {formatFecha(fecha)} · {horaInicio ?? "16:30"}–{horaFin ?? "17:30"} · {LUGAR_LABEL[lugarEnum]}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Objetivo para padres */}
                    <div className="border border-green-200 rounded-lg p-3 bg-green-50">
                      <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide mb-1.5">Para los papás:</p>
                      <textarea
                        value={clasePlan.objetivo_simple}
                        onChange={(e) => setClasePlan((p) => p ? { ...p, objetivo_simple: e.target.value } : p)}
                        rows={2}
                        className="w-full text-sm text-gray-800 bg-transparent border-0 focus:outline-none resize-none italic"
                        placeholder="Objetivo en lenguaje de padres..."
                      />
                    </div>

                    {/* Actividades */}
                    {clasePlan.actividades.map((act, i) => (
                      <div key={i} className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[10px] font-bold text-white px-2 py-0.5 rounded-full shrink-0"
                            style={{ background: GREEN }}
                          >
                            ACTIVIDAD {i + 1}
                          </span>
                          <input
                            value={act.duracion_min}
                            onChange={(e) => updateActividad(i, { duracion_min: +e.target.value })}
                            type="number" min={5} max={45}
                            className="w-12 text-[11px] border border-gray-200 rounded px-1.5 py-0.5 bg-white focus:outline-none"
                          />
                          <span className="text-[11px] text-gray-400">min</span>
                        </div>
                        <input
                          value={act.nombre}
                          onChange={(e) => updateActividad(i, { nombre: e.target.value })}
                          placeholder="Nombre divertido..."
                          className="w-full text-base font-bold text-gray-900 bg-transparent border-0 border-b border-gray-200 focus:outline-none pb-1"
                        />
                        <div>
                          <p className="text-[10px] font-bold text-gray-500 mb-1">¿Cómo se juega?</p>
                          <textarea
                            value={act.como_se_juega}
                            onChange={(e) => updateActividad(i, { como_se_juega: e.target.value })}
                            rows={2}
                            className="w-full text-xs text-gray-700 border border-gray-200 rounded px-2 py-1.5 bg-white focus:outline-none resize-none"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-lg p-2 bg-blue-50 border border-blue-100">
                            <p className="text-[10px] font-bold text-blue-700 mb-1">Birdies (4-5a)</p>
                            <textarea
                              value={act.adaptacion_birdies}
                              onChange={(e) => updateActividad(i, { adaptacion_birdies: e.target.value })}
                              rows={2}
                              className="w-full text-[11px] bg-white border border-blue-100 rounded px-1.5 py-1 resize-none focus:outline-none"
                            />
                          </div>
                          <div className="rounded-lg p-2 bg-yellow-50 border border-yellow-100">
                            <p className="text-[10px] font-bold text-yellow-700 mb-1">Albatros (9-12a)</p>
                            <textarea
                              value={act.adaptacion_albatros}
                              onChange={(e) => updateActividad(i, { adaptacion_albatros: e.target.value })}
                              rows={2}
                              className="w-full text-[11px] bg-white border border-yellow-100 rounded px-1.5 py-1 resize-none focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                          <p className="text-[10px] font-bold text-amber-700 mb-1">🏆 ¿Cómo se gana?</p>
                          <input
                            value={act.como_se_gana}
                            onChange={(e) => updateActividad(i, { como_se_gana: e.target.value })}
                            className="w-full text-xs bg-transparent border-0 focus:outline-none text-amber-900"
                          />
                        </div>
                      </div>
                    ))}

                    {/* Actividad estrella */}
                    <div className="border-2 border-yellow-300 bg-yellow-50 rounded-xl p-3 flex items-center gap-3">
                      <span className="text-xl">⭐</span>
                      <div className="flex-1">
                        <p className="text-[10px] font-bold text-yellow-700 mb-0.5">Actividad estrella del día:</p>
                        <input
                          value={clasePlan.actividad_estrella}
                          onChange={(e) => setClasePlan((p) => p ? { ...p, actividad_estrella: e.target.value } : p)}
                          className="w-full text-sm font-semibold text-yellow-900 bg-transparent border-0 focus:outline-none"
                        />
                      </div>
                    </div>

                    {saveError && (
                      <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{saveError}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Footer paso 2 */}
              {!loadingPlan && clasePlan && (
                <div className="px-6 pb-6 flex gap-2 border-t border-gray-100 pt-4">
                  <button
                    onClick={() => { setStep(1); setClasePlan(null); setPlanError(null); }}
                    disabled={busy}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  >
                    ← Regenerar
                  </button>
                  <button
                    onClick={handleDownloadPDF}
                    disabled={busy}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1.5"
                  >
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                    </svg>
                    {generatingPdf ? "..." : "PDF padres"}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={busy}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 hover:brightness-110 transition-all"
                    style={{ background: GREEN }}
                  >
                    {saving ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                        Guardando...
                      </>
                    ) : "✓ Guardar clase"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* PDF oculto para generación */}
      <div style={{ position: "absolute", left: "-9999px", top: 0, pointerEvents: "none" }}>
        {clasePlan && (
          <JuvenilPDFContent
            plan={clasePlan}
            diaLabel={diaLabel}
            fecha={fecha}
            horaInicio={horaInicio ?? "16:30"}
            horaFin={horaFin ?? "17:30"}
            refProp={pdfRef}
          />
        )}
      </div>
    </>
  );
}
