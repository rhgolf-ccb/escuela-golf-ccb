"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import BibliotecaDrillPicker from "./BibliotecaDrillPicker";

// ── Types (exported — used in ProgramacionModule / PacoPlanningModal) ────────
export interface Actividad {
  nombre: string; duracion_min: number; como_se_juega: string;
  adaptacion_birdies: string; adaptacion_albatros: string;
  como_se_gana: string; materiales: string;
}

export type CategoriaEstacion = "juego_largo" | "juego_corto" | "putt";
export type TipoEspecial = "test_tecnico" | "test_fisico" | "campo_pacos" | "campo_infantil";

export interface DrillJuvenilEstacion { titulo: string; descripcion: string; }

export interface EstacionJuvenil {
  categoria: CategoriaEstacion;
  drills: DrillJuvenilEstacion[]; // 1 a 3
  desafio: string;
}

export interface SesionJuvenilEstaciones {
  tipo: "estaciones";
  estaciones: EstacionJuvenil[];
}

export interface SesionJuvenilEspecial {
  tipo: "especial";
  tipo_especial: TipoEspecial;
  notas?: string | null;
}

// Legacy format — solo lectura, para semanas ya publicadas antes de este cambio
export interface SesionJuvenilLegacy {
  nombre_clase: string;
  objetivo_simple: string;
  actividades: Actividad[];
  actividad_estrella: string;
}

export type SesionJuvenilData = SesionJuvenilEstaciones | SesionJuvenilEspecial | SesionJuvenilLegacy;

// drills.categoria (tabla real de la biblioteca) por categoría de estación juvenil
export const DRILLS_CATEGORIA_JUVENIL: Record<CategoriaEstacion, string> = {
  juego_largo: "tecnico",
  juego_corto: "juego_corto",
  putt: "putting",
};

// ── Constants ──────────────────────────────────────────────────────────────────
const GREEN = "#1B4D2E";

const CATEGORIAS: { value: CategoriaEstacion; emoji: string; label: string }[] = [
  { value: "juego_largo", emoji: "🏌️", label: "Juego Largo" },
  { value: "juego_corto", emoji: "⛳",  label: "Juego Corto" },
  { value: "putt",        emoji: "🎯",  label: "Putt" },
];

const ESPECIALES: { value: TipoEspecial; emoji: string; label: string; desc: string }[] = [
  { value: "test_tecnico",   emoji: "📋", label: "Test técnico",       desc: "Evaluación P1-P10" },
  { value: "test_fisico",    emoji: "💪", label: "Test físico",        desc: "Evaluación TPI" },
  { value: "campo_pacos",    emoji: "🌿", label: "Campo Pacos/Fabios", desc: "Juego en campo real" },
  { value: "campo_infantil", emoji: "👶", label: "Campo Infantil",     desc: "Día lúdico diferente" },
];

const ESPECIAL_TIPO_SESION: Record<TipoEspecial, string> = {
  test_tecnico:   "test_tecnico",
  test_fisico:    "test_fisico",
  campo_pacos:    "campo",
  campo_infantil: "campo",
};

const ESPECIAL_LUGAR: Record<TipoEspecial, string> = {
  test_tecnico:   "campo_practica",
  test_fisico:    "campo_practica",
  campo_pacos:    "campo_pacos_fabios",
  campo_infantil: "campo_infantil",
};

const ESPECIAL_OBJETIVO: Record<TipoEspecial, string> = {
  test_tecnico:   "Evaluación técnica P1-P10",
  test_fisico:    "Evaluación física TPI",
  campo_pacos:    "Juego en Campo Pacos y Fabios",
  campo_infantil: "Día lúdico en Campo Infantil",
};

// ── Props ──────────────────────────────────────────────────────────────────────
interface ExistingSesion {
  id: string;
  sesion_juvenil?: SesionJuvenilData | null;
  hora_inicio: string | null;
  hora_fin: string | null;
}

interface Props {
  planId: string;
  dia: string;
  diaLabel: string;
  fecha: string;
  horaInicio?: string;
  horaFin?: string;
  sesionExistente?: ExistingSesion | null;
  onClose: () => void;
  onSaved: () => void;
}

// ── Station state ──────────────────────────────────────────────────────────────
interface StationState {
  categoria: CategoriaEstacion;
  open: boolean;
  fetched: boolean; // ya se pidió (o ya traía) contenido — no dispares IA de nuevo al abrir
  loading: boolean;
  failed: boolean;
  drills: DrillJuvenilEstacion[];
  desafio: string;
  showPicker: boolean;
}

function initStations(sesion?: ExistingSesion | null): StationState[] {
  const base: StationState[] = CATEGORIAS.map((c) => ({
    categoria: c.value, open: false, fetched: false, loading: false, failed: false,
    drills: [], desafio: "", showPicker: false,
  }));
  if (sesion?.sesion_juvenil && 'tipo' in sesion.sesion_juvenil && sesion.sesion_juvenil.tipo === "estaciones") {
    const est = sesion.sesion_juvenil.estaciones;
    base.forEach((s, i) => {
      const existing = est.find((e) => e.categoria === s.categoria);
      if (!existing) return;
      base[i].drills = existing.drills ?? [];
      base[i].desafio = existing.desafio ?? "";
      base[i].fetched = true;
    });
  }
  return base;
}

function initMode(sesion?: ExistingSesion | null): "tipo" | "estaciones" | "especial" {
  if (!sesion?.sesion_juvenil || !('tipo' in sesion.sesion_juvenil)) return "tipo";
  return sesion.sesion_juvenil.tipo === "estaciones" ? "estaciones" : "especial";
}

function initEspecial(sesion?: ExistingSesion | null): TipoEspecial | null {
  if (!sesion?.sesion_juvenil || !('tipo' in sesion.sesion_juvenil)) return null;
  if (sesion.sesion_juvenil.tipo !== "especial") return null;
  return sesion.sesion_juvenil.tipo_especial;
}

function formatFecha(fecha: string) {
  return new Date(fecha + "T00:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function JuvenileClassModal({
  planId, dia, diaLabel, fecha,
  horaInicio, horaFin, sesionExistente,
  onClose, onSaved,
}: Props) {
  const [mode, setMode] = useState<"tipo" | "estaciones" | "especial">(() => initMode(sesionExistente));
  const [stations, setStations] = useState<StationState[]>(() => initStations(sesionExistente));
  const [tipoEspecial, setTipoEspecial] = useState<TipoEspecial | null>(() => initEspecial(sesionExistente));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = saving || stations.some((s) => s.loading);
  const allStationsFilled = stations.every((s) => s.drills.length > 0 && s.desafio.trim().length > 0);

  // ── AI: sugerir drills + desafío para una estación ──────────────────────
  async function fetchSuggestion(stIdx: number) {
    const st = stations[stIdx];
    setStations((prev) => prev.map((s, i) => i === stIdx ? { ...s, loading: true, failed: false } : s));
    try {
      const res = await fetch("/api/suggest-station-game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId, categoria: st.categoria }),
      });
      const data = await res.json() as { drills?: DrillJuvenilEstacion[]; desafio?: string; error?: string };
      if (!res.ok || !data.drills?.length) throw new Error(data.error ?? "Sin sugerencias");
      setStations((prev) => prev.map((s, i) => i === stIdx
        ? { ...s, drills: data.drills!.slice(0, 3), desafio: data.desafio ?? "", loading: false, fetched: true }
        : s));
    } catch {
      setStations((prev) => prev.map((s, i) => i === stIdx ? { ...s, loading: false, failed: true, fetched: true } : s));
    }
  }

  function toggleStation(idx: number) {
    const st = stations[idx];
    setStations((prev) => prev.map((s, i) => i === idx ? { ...s, open: !s.open } : s));
    if (!st.open && !st.fetched) fetchSuggestion(idx);
  }

  function removeDrill(stIdx: number, drillIdx: number) {
    setStations((prev) => prev.map((s, i) => i === stIdx ? { ...s, drills: s.drills.filter((_, j) => j !== drillIdx) } : s));
  }

  function addDrillFromBiblioteca(stIdx: number, drill: DrillJuvenilEstacion) {
    setStations((prev) => prev.map((s, i) => i === stIdx ? { ...s, drills: [...s.drills, drill].slice(0, 3), showPicker: false } : s));
  }

  function updateDesafio(stIdx: number, value: string) {
    setStations((prev) => prev.map((s, i) => i === stIdx ? { ...s, desafio: value } : s));
  }

  function togglePicker(stIdx: number, show: boolean) {
    setStations((prev) => prev.map((s, i) => i === stIdx ? { ...s, showPicker: show } : s));
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      type Payload = Record<string, unknown>;
      let payload: Payload;

      if (mode === "especial") {
        if (!tipoEspecial) return;
        payload = {
          plan_id: planId, dia_semana: dia, fecha,
          tipo_sesion: ESPECIAL_TIPO_SESION[tipoEspecial],
          lugar: ESPECIAL_LUGAR[tipoEspecial],
          hora_inicio: horaInicio || null, hora_fin: horaFin || null,
          objetivo: ESPECIAL_OBJETIVO[tipoEspecial],
          drills: [], juego_competitivo: null, estaciones_damas: null, notas: null,
          sesion_juvenil: { tipo: "especial", tipo_especial: tipoEspecial },
        };
      } else {
        const estaciones: EstacionJuvenil[] = stations.map((s) => {
          if (s.drills.length === 0) throw new Error(`Falta al menos 1 drill en ${s.categoria}`);
          return { categoria: s.categoria, drills: s.drills, desafio: s.desafio };
        });
        payload = {
          plan_id: planId, dia_semana: dia, fecha,
          tipo_sesion: "juvenil_estaciones",
          lugar: "campo_practica",
          hora_inicio: horaInicio || null, hora_fin: horaFin || null,
          objetivo: "Sesión 3 estaciones: Juego Largo · Juego Corto · Putt",
          drills: [], juego_competitivo: null, estaciones_damas: null, notas: null,
          sesion_juvenil: { tipo: "estaciones", estaciones },
        };
      }

      if (sesionExistente) {
        const { error: e } = await supabase.from("sesiones_semana").update(payload).eq("id", sesionExistente.id);
        if (e) throw new Error(e.message);
      } else {
        // Delete any existing session for this plan+fecha before inserting to prevent duplicates
        await supabase.from("sesiones_semana").delete().eq("plan_id", planId).eq("fecha", fecha);
        const { error: e } = await supabase.from("sesiones_semana").insert(payload);
        if (e) throw new Error(e.message);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={() => { if (!busy) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-6"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <h2 className="font-bold text-gray-900 text-sm">
              {sesionExistente ? "Cambiar sesión" : "Asignar sesión"} — {diaLabel}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">{diaLabel} {formatFecha(fecha)}</p>
          </div>
          <button onClick={() => { if (!busy) onClose(); }} disabled={busy}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Elegir tipo ── */}
        {mode === "tipo" && (
          <div className="p-5 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">¿Qué tipo de sesión?</p>
            <button
              onClick={() => setMode("estaciones")}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-green-400 hover:bg-green-50 text-left transition-all group"
            >
              <span className="text-3xl">🎯</span>
              <div>
                <p className="font-bold text-gray-900 group-hover:text-green-900">Día de 3 estaciones</p>
                <p className="text-xs text-gray-500">Juego Largo · Juego Corto · Putt — 2-3 drills y un desafío por estación</p>
              </div>
            </button>
            <button
              onClick={() => setMode("especial")}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-purple-400 hover:bg-purple-50 text-left transition-all group"
            >
              <span className="text-3xl">⭐</span>
              <div>
                <p className="font-bold text-gray-900 group-hover:text-purple-900">Día especial</p>
                <p className="text-xs text-gray-500">Test técnico, test físico, campo real u otro</p>
              </div>
            </button>
          </div>
        )}

        {/* ── Estaciones ── */}
        {mode === "estaciones" && (
          <>
            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
              {stations.map((st, stIdx) => {
                const cat = CATEGORIAS[stIdx];
                const filled = st.drills.length > 0 && st.desafio.trim().length > 0;
                return (
                  <div key={st.categoria} className="border rounded-xl overflow-hidden"
                    style={{ borderColor: filled ? GREEN : "#e5e7eb" }}>
                    {/* Station header */}
                    <button
                      onClick={() => toggleStation(stIdx)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left"
                      style={{ background: filled ? "#f0faf2" : "#f9fafb" }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg flex-shrink-0">{cat.emoji}</span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: GREEN }}>
                            Estación {stIdx + 1} — {cat.label}
                          </p>
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {st.drills.length > 0
                              ? `${st.drills.length} drill${st.drills.length > 1 ? "s" : ""}${st.desafio ? " + desafío" : ""}`
                              : <span className="text-gray-400 font-normal">Ver sugerencias →</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {filled && (
                          <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: GREEN }}>
                            <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={3}><path d="M3 10l4 4 9-9" /></svg>
                          </div>
                        )}
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth={2}
                          className={`transition-transform ${st.open ? "rotate-180" : ""}`}>
                          <path d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {/* Station content */}
                    {st.open && (
                      <div className="border-t border-gray-100 p-3 space-y-3">
                        {st.loading ? (
                          <div className="flex items-center gap-2 text-xs text-gray-400 py-4 justify-center">
                            <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                            Generando sugerencias con IA... (5–10 seg)
                          </div>
                        ) : (
                          <>
                            {st.failed && (
                              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                                <p className="text-xs text-amber-700">No se generaron sugerencias.</p>
                                <button onClick={() => fetchSuggestion(stIdx)} className="text-xs font-semibold text-amber-800 hover:underline whitespace-nowrap shrink-0">
                                  🔄 Reintentar
                                </button>
                              </div>
                            )}

                            <div className="space-y-2">
                              {st.drills.map((d, dIdx) => (
                                <div key={dIdx} className="border border-gray-100 rounded-lg p-2.5 bg-gray-50 flex items-start gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-gray-900">{d.titulo}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">{d.descripcion}</p>
                                  </div>
                                  <button
                                    onClick={() => removeDrill(stIdx, dIdx)}
                                    disabled={st.drills.length <= 1}
                                    className="text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:hover:text-gray-300 shrink-0"
                                  >
                                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
                                  </button>
                                </div>
                              ))}
                            </div>

                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => togglePicker(stIdx, true)}
                                disabled={st.drills.length >= 3}
                                className="text-xs font-medium text-blue-700 hover:text-blue-900 disabled:opacity-40 disabled:hover:text-blue-700"
                              >
                                + Agregar de la biblioteca
                              </button>
                              <button
                                onClick={() => fetchSuggestion(stIdx)}
                                className="flex items-center gap-1.5 text-xs font-medium text-purple-700 hover:text-purple-900"
                              >
                                🔄 Regenerar con IA
                              </button>
                            </div>

                            <div>
                              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Desafío</label>
                              <textarea
                                value={st.desafio}
                                onChange={(e) => updateDesafio(stIdx, e.target.value)}
                                rows={2}
                                placeholder="Reto o juego competitivo de cierre para esta estación"
                                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 resize-none"
                              />
                            </div>
                          </>
                        )}

                        {st.showPicker && (
                          <BibliotecaDrillPicker
                            categoriaDrills={DRILLS_CATEGORIA_JUVENIL[st.categoria]}
                            yaSeleccionados={st.drills.map((d) => d.titulo)}
                            onAdd={(drill) => addDrillFromBiblioteca(stIdx, drill)}
                            onClose={() => togglePicker(stIdx, false)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {error && (
                <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
              )}
            </div>

            <div className="px-5 pb-5 pt-3 flex gap-2 border-t border-gray-100">
              <button onClick={() => setMode("tipo")}
                className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
                ← Volver
              </button>
              <button
                onClick={handleSave}
                disabled={!allStationsFilled || saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-all hover:brightness-110"
                style={{ background: GREEN }}
              >
                {saving ? "Guardando..." : allStationsFilled ? "✓ Guardar sesión" : `Completa las 3 estaciones (${stations.filter((s) => s.drills.length > 0 && s.desafio.trim()).length}/3)`}
              </button>
            </div>
          </>
        )}

        {/* ── Especial ── */}
        {mode === "especial" && (
          <>
            <div className="p-5 space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Tipo de día especial</p>
              {ESPECIALES.map((esp) => (
                <button
                  key={esp.value}
                  onClick={() => setTipoEspecial(esp.value)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all"
                  style={tipoEspecial === esp.value
                    ? { borderColor: "#7c3aed", background: "#f5f3ff" }
                    : { borderColor: "#e5e7eb", background: "#f9fafb" }}
                >
                  <span className="text-xl">{esp.emoji}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{esp.label}</p>
                    <p className="text-xs text-gray-500">{esp.desc}</p>
                  </div>
                  {tipoEspecial === esp.value && (
                    <div className="ml-auto w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "#7c3aed" }}>
                      <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={3}><path d="M3 10l4 4 9-9" /></svg>
                    </div>
                  )}
                </button>
              ))}
              {error && (
                <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
              )}
            </div>

            <div className="px-5 pb-5 pt-3 flex gap-2 border-t border-gray-100">
              <button onClick={() => setMode("tipo")}
                className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
                ← Volver
              </button>
              <button
                onClick={handleSave}
                disabled={!tipoEspecial || saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-all"
                style={{ background: "#7c3aed" }}
              >
                {saving ? "Guardando..." : "✓ Guardar día especial"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
