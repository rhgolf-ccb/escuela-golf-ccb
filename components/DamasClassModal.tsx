"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import EstacionLibraryPicker from "./EstacionLibraryPicker";

export type CategoriaEstacionDamas = "juego_largo" | "juego_corto" | "putt" | "fisico";
export type TipoEspecialDamas = "test_tecnico" | "test_fisico" | "campo";

export interface DrillEstacionDamas { titulo: string; descripcion: string; id?: string; series_repeticiones?: string | null }

// Estación de Damas — se mantienen nombre/lugar/duracion_min/descripcion (los
// que ya lee sesionesToEstaciones en ProgramacionModule.tsx, para no romper el
// render de la grilla con datos viejos) y se agregan categoria/drills, nuevos,
// para que el detalle muestre cada ejercicio elegido en vez de un solo bloque
// de texto libre.
export interface EstacionDamasGuiada {
  nombre: string; lugar: string; duracion_min: number; descripcion: string;
  categoria: CategoriaEstacionDamas;
  drills: DrillEstacionDamas[];
}

const DRILLS_CATEGORIA_DAMAS: Record<CategoriaEstacionDamas, string | null> = {
  juego_largo: "tecnico",
  juego_corto: "juego_corto",
  putt: "putting",
  fisico: null,
};

const CATEGORIAS: { value: CategoriaEstacionDamas; emoji: string; label: string }[] = [
  { value: "juego_largo", emoji: "🏌️", label: "Juego Largo" },
  { value: "juego_corto", emoji: "⛳",  label: "Juego Corto" },
  { value: "putt",        emoji: "🎯",  label: "Putt" },
  { value: "fisico",      emoji: "💪",  label: "Físico" },
];

const CATEGORIA_LABEL: Record<CategoriaEstacionDamas, string> = {
  juego_largo: "Juego Largo", juego_corto: "Juego Corto", putt: "Putt", fisico: "Físico",
};

const ESPECIALES: { value: TipoEspecialDamas; emoji: string; label: string; desc: string }[] = [
  { value: "test_tecnico", emoji: "📋", label: "Test técnico",   desc: "Evaluación P1-P10" },
  { value: "test_fisico",  emoji: "💪", label: "Test físico",    desc: "Evaluación TPI" },
  { value: "campo",        emoji: "🌿", label: "Salida al campo", desc: "Juego en campo real" },
];

const ESPECIAL_TIPO_SESION: Record<TipoEspecialDamas, string> = {
  test_tecnico: "test_tecnico", test_fisico: "test_fisico", campo: "campo",
};
const ESPECIAL_LUGAR: Record<TipoEspecialDamas, string> = {
  test_tecnico: "campo_practica", test_fisico: "campo_practica", campo: "campo_pacos_fabios",
};
const ESPECIAL_OBJETIVO: Record<TipoEspecialDamas, string> = {
  test_tecnico: "Evaluación técnica P1-P10", test_fisico: "Evaluación física TPI", campo: "Juego en Campo Pacos y Fabios",
};

const DURACION_ESTACION_MIN = 25; // 3 estaciones rotativas de 25 min es el estándar de Damas

const ACCENT = "#86198f";

interface ExistingSesion {
  id: string;
  tipo_sesion: string;
  estaciones_damas?: EstacionDamasGuiada[] | { nombre: string; lugar: string; duracion_min: number; descripcion: string }[] | null;
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
  horariosDefecto?: { tipo_plan: string; dia_semana: string; hora_inicio: string; hora_fin: string }[];
  onClose: () => void;
  onSaved: () => void;
}

interface StationState {
  categoria: CategoriaEstacionDamas;
  open: boolean;
  drills: DrillEstacionDamas[];
  showPicker: boolean;
}

function nuevaEstacion(categoria: CategoriaEstacionDamas): StationState {
  return { categoria, open: false, drills: [], showPicker: false };
}

const POOL_ORDEN: CategoriaEstacionDamas[] = ["juego_largo", "juego_corto", "putt", "fisico"];

function esGuiada(e: unknown): e is EstacionDamasGuiada {
  return !!e && typeof e === "object" && "categoria" in (e as Record<string, unknown>) && "drills" in (e as Record<string, unknown>);
}

function initStations(sesion?: ExistingSesion | null): StationState[] | null {
  const est = sesion?.estaciones_damas;
  if (est && est.length >= 2 && est.every(esGuiada)) {
    return (est as EstacionDamasGuiada[]).map((e) => ({ categoria: e.categoria, open: false, drills: e.drills, showPicker: false }));
  }
  return null;
}

function initMode(sesion?: ExistingSesion | null): "count" | "estaciones" | "especial_tipo" {
  if (sesion?.estaciones_damas && sesion.estaciones_damas.length >= 2 && sesion.estaciones_damas.every(esGuiada)) return "estaciones";
  if (sesion && ["test_tecnico", "test_fisico", "campo"].includes(sesion.tipo_sesion)) return "especial_tipo";
  return "count";
}

function initEspecial(sesion?: ExistingSesion | null): TipoEspecialDamas | null {
  if (!sesion) return null;
  return ESPECIALES.some((e) => e.value === sesion.tipo_sesion) ? (sesion.tipo_sesion as TipoEspecialDamas) : null;
}

function formatFecha(fecha: string) {
  return new Date(fecha + "T00:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

export default function DamasClassModal({
  planId, dia, diaLabel, fecha, horaInicio, horaFin, sesionExistente, horariosDefecto, onClose, onSaved,
}: Props) {
  const defaultHorario = (horariosDefecto ?? [])
    .filter((h) => h.tipo_plan === "damas" && h.dia_semana === dia)
    .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))[0];
  const horaInicioFinal = horaInicio || sesionExistente?.hora_inicio || defaultHorario?.hora_inicio.slice(0, 5) || "";
  const horaFinFinal = horaFin || sesionExistente?.hora_fin || defaultHorario?.hora_fin.slice(0, 5) || "";

  const [mode, setMode] = useState<"count" | "estaciones" | "especial_tipo">(() => initMode(sesionExistente));
  const [stations, setStations] = useState<StationState[]>(() => initStations(sesionExistente) ?? []);
  const [tipoEspecial, setTipoEspecial] = useState<TipoEspecialDamas | null>(() => initEspecial(sesionExistente));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allStationsFilled = stations.length >= 2 && stations.every((s) => s.drills.length > 0);

  function handleChooseCount(n: number) {
    if (n === 1) {
      setMode("especial_tipo");
      return;
    }
    setStations(POOL_ORDEN.slice(0, n).map(nuevaEstacion));
    setMode("estaciones");
  }

  function categoriasDisponibles(stIdx: number) {
    const usadasPorOtras = stations.filter((_, i) => i !== stIdx).map((s) => s.categoria);
    return CATEGORIAS.filter((c) => !usadasPorOtras.includes(c.value));
  }

  function changeCategoria(stIdx: number, categoria: CategoriaEstacionDamas) {
    setStations((prev) => prev.map((s, i) => (i === stIdx ? nuevaEstacion(categoria) : s)));
  }

  function toggleStation(idx: number) {
    setStations((prev) => prev.map((s, i) => (i === idx ? { ...s, open: !s.open } : s)));
  }

  function removeDrill(stIdx: number, drillIdx: number) {
    setStations((prev) => prev.map((s, i) => i === stIdx ? { ...s, drills: s.drills.filter((_, j) => j !== drillIdx) } : s));
  }

  function addDrill(stIdx: number, drill: DrillEstacionDamas) {
    setStations((prev) => prev.map((s, i) => i === stIdx ? { ...s, drills: [...s.drills, drill].slice(0, 3), showPicker: false } : s));
  }

  function togglePicker(stIdx: number, show: boolean) {
    setStations((prev) => prev.map((s, i) => (i === stIdx ? { ...s, showPicker: show } : s)));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      type Payload = Record<string, unknown>;
      let payload: Payload;

      if (mode === "especial_tipo") {
        if (!tipoEspecial) return;
        payload = {
          tipo_sesion: ESPECIAL_TIPO_SESION[tipoEspecial],
          lugar: ESPECIAL_LUGAR[tipoEspecial],
          objetivo: ESPECIAL_OBJETIVO[tipoEspecial],
          drills: [], juego_competitivo: null, sesion_juvenil: null, notas: null,
          estaciones_damas: null,
        };
      } else {
        if (stations.some((s) => s.drills.length === 0)) throw new Error("Falta al menos 1 ejercicio en alguna estación");
        const estaciones: EstacionDamasGuiada[] = stations.map((s) => ({
          nombre: CATEGORIA_LABEL[s.categoria],
          lugar: "Campo de práctica",
          duracion_min: DURACION_ESTACION_MIN,
          descripcion: s.drills.map((d) => d.titulo).join(", "),
          categoria: s.categoria,
          drills: s.drills,
        }));
        payload = {
          tipo_sesion: "damas_estaciones",
          lugar: "campo_practica",
          objetivo: `Sesión ${estaciones.length} estaciones: ${estaciones.map((e) => e.nombre).join(" · ")}`,
          drills: [], juego_competitivo: null, sesion_juvenil: null, notas: null,
          estaciones_damas: estaciones,
        };
      }

      if (!horaInicioFinal || !horaFinFinal) throw new Error("No hay horario por defecto para este día; defínelo en horarios_defecto.");

      const row = {
        plan_id: planId, dia_semana: dia, fecha,
        hora_inicio: horaInicioFinal, hora_fin: horaFinFinal,
        ...payload,
      };

      const { error: e } = await supabase.from("sesiones_semana").upsert(row, { onConflict: "plan_id,fecha,hora_inicio" });
      if (e) throw new Error(e.message);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const busy = saving;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={() => { if (!busy) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-6" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <h2 className="font-bold text-gray-900 text-sm">
              {sesionExistente ? "Cambiar sesión" : "Asignar sesión"} — {diaLabel}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {diaLabel} {formatFecha(fecha)}{horaInicioFinal && horaFinFinal ? ` · ${horaInicioFinal}–${horaFinFinal}` : ""}
            </p>
          </div>
          <button onClick={() => { if (!busy) onClose(); }} disabled={busy} className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* ── Paso 1: cuántas estaciones ── */}
        {mode === "count" && (
          <div className="p-5 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">¿Cuántas estaciones tiene este día?</p>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => handleChooseCount(n)}
                  className="flex flex-col items-center justify-center py-4 rounded-xl border-2 border-gray-200 hover:border-fuchsia-400 hover:bg-fuchsia-50 transition-all font-bold text-lg text-gray-800"
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              <strong>1</strong> convierte el día en especial (test técnico, test físico o salida al campo).{" "}
              <strong>2 a 4</strong> arma estaciones normales, cada una con sus propios ejercicios de la biblioteca.
            </p>
          </div>
        )}

        {/* ── Estaciones (2-4) ── */}
        {mode === "estaciones" && (
          <>
            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
              {stations.map((st, stIdx) => {
                const filled = st.drills.length > 0;
                const catInfo = CATEGORIAS.find((c) => c.value === st.categoria)!;
                return (
                  <div key={stIdx} className="border rounded-xl overflow-hidden" style={{ borderColor: filled ? ACCENT : "#e5e7eb" }}>
                    <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: filled ? "#fdf2f8" : "#f9fafb" }}>
                      <span className="text-lg flex-shrink-0">{catInfo.emoji}</span>
                      <select
                        value={st.categoria}
                        onChange={(e) => changeCategoria(stIdx, e.target.value as CategoriaEstacionDamas)}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-bold uppercase tracking-wide bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-fuchsia-300 rounded px-1 py-0.5"
                        style={{ color: ACCENT }}
                      >
                        {categoriasDisponibles(stIdx).map((c) => (
                          <option key={c.value} value={c.value}>Estación {stIdx + 1} — {c.label}</option>
                        ))}
                      </select>
                      <button onClick={() => toggleStation(stIdx)} className="ml-auto flex items-center gap-2 flex-shrink-0">
                        <span className="text-sm font-semibold text-gray-800 truncate max-w-[140px]">
                          {st.drills.length > 0
                            ? `${st.drills.length} ejercicio${st.drills.length > 1 ? "s" : ""}`
                            : <span className="text-gray-400 font-normal">Ver opciones →</span>}
                        </span>
                        {filled && (
                          <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: ACCENT }}>
                            <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={3}><path d="M3 10l4 4 9-9" /></svg>
                          </div>
                        )}
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth={2}
                          className={`transition-transform ${st.open ? "rotate-180" : ""}`}>
                          <path d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>

                    {st.open && (
                      <div className="border-t border-gray-100 p-3 space-y-3">
                        <div className="space-y-2">
                          {st.drills.map((d, dIdx) => (
                            <div key={dIdx} className="border border-gray-100 rounded-lg p-2.5 bg-gray-50 flex items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-gray-900">{d.titulo}</p>
                                {d.descripcion && <p className="text-xs text-gray-500 mt-0.5">{d.descripcion}</p>}
                              </div>
                              <button
                                onClick={() => removeDrill(stIdx, dIdx)}
                                className="text-gray-300 hover:text-red-500 shrink-0"
                              >
                                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
                              </button>
                            </div>
                          ))}
                        </div>

                        <button
                          onClick={() => togglePicker(stIdx, true)}
                          disabled={st.drills.length >= 3}
                          className="text-xs font-medium text-fuchsia-700 hover:text-fuchsia-900 disabled:opacity-40 disabled:hover:text-fuchsia-700"
                        >
                          + Agregar de la biblioteca
                        </button>

                        {st.showPicker && (
                          st.categoria === "fisico" ? (
                            <EstacionLibraryPicker
                              fuente="ejercicios_fisicos"
                              grupos={["Damas"]}
                              yaSeleccionados={st.drills.map((d) => d.titulo)}
                              onAdd={(item) => addDrill(stIdx, item)}
                              onClose={() => togglePicker(stIdx, false)}
                            />
                          ) : (
                            <EstacionLibraryPicker
                              fuente="drills"
                              categoriaDrills={DRILLS_CATEGORIA_DAMAS[st.categoria]!}
                              grupos={["damas"]}
                              yaSeleccionados={st.drills.map((d) => d.titulo)}
                              onAdd={(item) => addDrill(stIdx, item)}
                              onClose={() => togglePicker(stIdx, false)}
                            />
                          )
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {error && <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}
            </div>

            <div className="px-5 pb-5 pt-3 flex gap-2 border-t border-gray-100">
              <button onClick={() => setMode("count")} className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
                ← Volver
              </button>
              <button
                onClick={handleSave}
                disabled={!allStationsFilled || saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-all hover:brightness-110"
                style={{ background: ACCENT }}
              >
                {saving ? "Guardando..." : allStationsFilled ? "✓ Guardar sesión" : `Completa las estaciones (${stations.filter((s) => s.drills.length > 0).length}/${stations.length})`}
              </button>
            </div>
          </>
        )}

        {/* ── Especial (1 estación) ── */}
        {mode === "especial_tipo" && (
          <>
            <div className="p-5 space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Tipo de día especial</p>
              {ESPECIALES.map((esp) => (
                <button
                  key={esp.value}
                  onClick={() => setTipoEspecial(esp.value)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all"
                  style={tipoEspecial === esp.value ? { borderColor: ACCENT, background: "#fdf2f8" } : { borderColor: "#e5e7eb", background: "#f9fafb" }}
                >
                  <span className="text-xl">{esp.emoji}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{esp.label}</p>
                    <p className="text-xs text-gray-500">{esp.desc}</p>
                  </div>
                  {tipoEspecial === esp.value && (
                    <div className="ml-auto w-5 h-5 rounded-full flex items-center justify-center" style={{ background: ACCENT }}>
                      <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={3}><path d="M3 10l4 4 9-9" /></svg>
                    </div>
                  )}
                </button>
              ))}
              {error && <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}
            </div>

            <div className="px-5 pb-5 pt-3 flex gap-2 border-t border-gray-100">
              <button onClick={() => setMode("count")} className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
                ← Volver
              </button>
              <button
                onClick={handleSave}
                disabled={!tipoEspecial || saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-all"
                style={{ background: ACCENT }}
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
