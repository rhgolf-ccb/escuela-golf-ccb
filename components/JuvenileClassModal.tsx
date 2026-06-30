"use client";

import { useState } from "react";
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
  dia: string;
  diaLabel: string;
  fecha: string;
  horaInicio?: string;
  horaFin?: string;
  sesionExistente?: ExistingSesion | null;
  actividadesYaUsadas?: string[];
  onClose: () => void;
  onSaved: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const GREEN = "#1B4D2E";

const CHIPS: { value: TemaChip; emoji: string; label: string }[] = [
  { value: "swing",        emoji: "🏌️", label: "Swing" },
  { value: "juego_corto",  emoji: "⛳",  label: "Juego corto" },
  { value: "putt",         emoji: "🎯",  label: "Putt" },
  { value: "campo",        emoji: "🌿",  label: "Campo" },
  { value: "juego_libre",  emoji: "🎮",  label: "Juego libre" },
  { value: "test_tecnico", emoji: "📋",  label: "Test técnico" },
  { value: "test_fisico",  emoji: "💪",  label: "Test físico" },
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
  if (s.includes("infantil"))                              return "campo_infantil";
  if (s.includes("pacos") || s.includes("fabios"))        return "campo_pacos_fabios";
  if (s.includes("putt") || s.includes("green") || s.includes("fundador")) return "putting_green";
  if (s.includes("completo"))                              return "campo_completo";
  return "campo_practica";
}

function formatFecha(fecha: string): string {
  return new Date(fecha + "T00:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

type Step = "categoria" | "generando" | "opciones";

// ── Component ─────────────────────────────────────────────────────────────────
export default function JuvenileClassModal({
  planId, dia, diaLabel, fecha,
  horaInicio, horaFin, sesionExistente,
  actividadesYaUsadas = [],
  onClose, onSaved,
}: Props) {
  const [step, setStep] = useState<Step>("categoria");
  const [selectedChip, setSelectedChip] = useState<TemaChip | null>(null);
  const [opciones, setOpciones] = useState<SesionJuvenilData[]>([]);
  const [opcionIdx, setOpcionIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testHoraInicio, setTestHoraInicio] = useState(horaInicio ?? "16:30");
  const [testHoraFin, setTestHoraFin] = useState(horaFin ?? "17:30");

  const isTest = selectedChip === "test_tecnico" || selectedChip === "test_fisico";
  const busy = saving || step === "generando";
  const stepNum = step === "categoria" ? 1 : 2;

  async function handleChipSelect(chip: TemaChip) {
    setSelectedChip(chip);
    setError(null);
    if (chip === "test_tecnico" || chip === "test_fisico") return;

    setStep("generando");
    setOpciones([]);
    setOpcionIdx(null);
    try {
      const res = await fetch("/api/plan-juvenile-class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tema: CHIP_TEMA[chip],
          lugar: "campo de prácticas",
          fecha,
          dia_semana: dia,
          actividades_ya_usadas_esta_semana: actividadesYaUsadas,
        }),
      });
      const data = await res.json() as { opciones?: SesionJuvenilData[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Error al generar opciones");
      const opts = data.opciones ?? [];
      if (opts.length === 0) throw new Error("No se generaron opciones");
      setOpciones(opts);
      setStep("opciones");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setStep("categoria");
    }
  }

  async function handleSave() {
    if (!selectedChip) return;
    setSaving(true);
    setError(null);
    try {
      const tipoSesion = CHIP_TIPO[selectedChip];
      type Payload = Record<string, unknown>;
      let payload: Payload;

      if (isTest) {
        payload = {
          plan_id: planId, dia_semana: dia, fecha,
          tipo_sesion: tipoSesion, lugar: "campo_practica",
          hora_inicio: testHoraInicio || null, hora_fin: testHoraFin || null,
          objetivo: selectedChip === "test_tecnico"
            ? "Sesión de evaluación técnica P1-P10"
            : "Sesión de evaluación física TPI",
          drills: [], juego_competitivo: null,
          estaciones_damas: null, notas: null, sesion_juvenil: null,
        };
      } else {
        if (opcionIdx === null) return;
        const clasePlan = opciones[opcionIdx];
        if (!clasePlan) return;
        payload = {
          plan_id: planId, dia_semana: dia, fecha,
          tipo_sesion: tipoSesion,
          lugar: mapAILugar((clasePlan as unknown as { lugar?: string }).lugar ?? ""),
          hora_inicio: horaInicio || null, hora_fin: horaFin || null,
          objetivo: clasePlan.objetivo_simple,
          drills: clasePlan.actividades.map((a) => ({
            titulo: a.nombre, descripcion: a.como_se_juega,
            dificultad_birdies: a.adaptacion_birdies || null,
            dificultad_aguilas: null,
            dificultad_albatros: a.adaptacion_albatros || null,
            dificultad_mas14: null,
          })),
          juego_competitivo: null, estaciones_damas: null, notas: null,
          sesion_juvenil: clasePlan,
        };
      }

      if (sesionExistente) {
        const { error: supaError } = await supabase.from("sesiones_semana").update(payload).eq("id", sesionExistente.id);
        if (supaError) throw new Error(supaError.message);
      } else {
        const { error: supaError } = await supabase.from("sesiones_semana").insert(payload);
        if (supaError) throw new Error(supaError.message);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={() => { if (!busy) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-6" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <h2 className="font-bold text-gray-900">
              {sesionExistente ? "Cambiar clase" : "Asignar clase"} — {diaLabel}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">{diaLabel} {formatFecha(fecha)}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              {[1, 2].map((s) => (
                <div key={s} className="flex items-center">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all"
                    style={stepNum >= s
                      ? { background: GREEN, color: "#fff" }
                      : { background: "#f3f4f6", color: "#9ca3af" }}
                  >
                    {stepNum > s
                      ? <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={3}><path d="M3 10l4 4 9-9" /></svg>
                      : s}
                  </div>
                  {s < 2 && (
                    <div
                      className="w-5 h-0.5 mx-0.5 transition-all"
                      style={stepNum > s ? { background: GREEN, opacity: 0.4 } : { background: "#e5e7eb" }}
                    />
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => { if (!busy) onClose(); }}
              disabled={busy}
              className="text-gray-400 hover:text-gray-600 disabled:opacity-40"
            >
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Paso 1: Elige categoría ── */}
        {step === "categoria" && (
          <>
            <div className="px-6 py-6 space-y-5">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">¿Qué trabajamos hoy?</h3>
              <div className="grid grid-cols-2 gap-2">
                {CHIPS.map((chip) => {
                  const isSelected = selectedChip === chip.value;
                  const testChip = chip.value === "test_tecnico" || chip.value === "test_fisico";
                  const sel = testChip
                    ? { border: "#7c3aed", bg: "#ede9fe", text: "#7c3aed" }
                    : { border: GREEN, bg: "#f0faf2", text: GREEN };
                  return (
                    <button
                      key={chip.value}
                      onClick={() => handleChipSelect(chip.value)}
                      disabled={busy}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-all text-left disabled:opacity-50"
                      style={isSelected
                        ? { borderColor: sel.border, background: sel.bg, color: sel.text }
                        : { borderColor: "#e5e7eb", background: "#f9fafb", color: "#374151" }}
                    >
                      <span className="text-xl">{chip.emoji}</span>
                      <span>{chip.label}</span>
                    </button>
                  );
                })}
              </div>

              {isTest && (
                <div className="space-y-3 pt-1">
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
                    className="rounded-xl border-2 p-4"
                    style={selectedChip === "test_tecnico"
                      ? { borderColor: "#be185d", background: "#fdf2f8" }
                      : { borderColor: "#7c3aed", background: "#f5f3ff" }}
                  >
                    <p className="text-sm font-bold" style={{ color: selectedChip === "test_tecnico" ? "#be185d" : "#7c3aed" }}>
                      {selectedChip === "test_tecnico" ? "📋 Evaluación técnica P1-P10" : "💪 Evaluación física TPI"}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">El protocolo de test está disponible en el módulo Tests.</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>

            {isTest && (
              <div className="px-6 pb-6 flex gap-2 border-t border-gray-100 pt-4">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-all"
                  style={{ background: selectedChip === "test_tecnico" ? "#be185d" : "#7c3aed" }}
                >
                  {saving ? "Guardando..." : "Guardar sesión de test"}
                </button>
                <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
                  Cancelar
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Generando ── */}
        {step === "generando" && (
          <div className="flex flex-col items-center gap-4 py-20 px-6">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: GREEN + "18" }}>
              <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24" style={{ color: GREEN }}>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-gray-800">Generando 3 opciones de clase...</p>
              <p className="text-sm text-gray-400 mt-1">El agente está diseñando ideas únicas para hoy</p>
            </div>
          </div>
        )}

        {/* ── Paso 2: Elige opción ── */}
        {step === "opciones" && (
          <>
            <div className="px-4 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <p className="px-2 text-xs text-gray-400 font-medium uppercase tracking-wide">
                Elige una clase para {diaLabel}
              </p>

              {actividadesYaUsadas.length > 0 && (
                <div className="mx-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-[11px] text-amber-700">
                    <span className="font-semibold">Ya usadas esta semana:</span>{" "}
                    {actividadesYaUsadas.join(" · ")}
                  </p>
                </div>
              )}

              {opciones.map((opcion, idx) => (
                <button
                  key={idx}
                  onClick={() => setOpcionIdx(idx)}
                  className="w-full text-left p-4 rounded-xl border-2 transition-all"
                  style={opcionIdx === idx
                    ? { borderColor: GREEN, background: "#f0faf2" }
                    : { borderColor: "#e5e7eb", background: "#ffffff" }}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-900">{opcion.nombre_clase}</p>
                      <p className="text-[11px] text-gray-500 italic mt-0.5 leading-relaxed">{opcion.objetivo_simple}</p>
                    </div>
                    {opcionIdx === idx && (
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: GREEN }}>
                        <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={3}>
                          <path d="M3 10l4 4 9-9" />
                        </svg>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    {opcion.actividades.map((act, ai) => (
                      <div key={ai} className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-gray-100 text-gray-500 text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                          {ai + 1}
                        </span>
                        <span className="text-xs font-medium text-gray-700">{act.nombre}</span>
                        <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">{act.duracion_min} min</span>
                      </div>
                    ))}
                  </div>

                  {opcion.actividad_estrella && (
                    <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-amber-700 font-medium">
                      <span>⭐</span>
                      <span>{opcion.actividad_estrella}</span>
                    </div>
                  )}
                </button>
              ))}

              {error && (
                <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>

            <div className="px-6 pb-6 flex gap-2 border-t border-gray-100 pt-4">
              <button
                onClick={() => { setStep("categoria"); setSelectedChip(null); setOpciones([]); setOpcionIdx(null); setError(null); }}
                className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                ← Cambiar tipo
              </button>
              <button
                onClick={handleSave}
                disabled={opcionIdx === null || saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 hover:brightness-110 transition-all"
                style={{ background: GREEN }}
              >
                {saving ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Guardando...
                  </>
                ) : "✓ Guardar clase seleccionada"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
