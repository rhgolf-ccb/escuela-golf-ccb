"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

// ── Types (exported — used in ProgramacionModule) ─────────────────────────────
export interface Actividad {
  nombre: string; duracion_min: number; como_se_juega: string;
  adaptacion_birdies: string; adaptacion_albatros: string;
  como_se_gana: string; materiales: string;
}

export interface JuegoJuvenil {
  nombre: string;
  como_se_juega: string;
  adaptacion_facil: string;
  adaptacion_retadora: string;
}

export type CategoriaEstacion = "juego_largo" | "juego_corto" | "putt";
export type TipoEspecial = "test_tecnico" | "test_fisico" | "campo_pacos" | "campo_infantil";

export interface SesionJuvenilEstaciones {
  tipo: "estaciones";
  estaciones: Array<{ categoria: CategoriaEstacion; juego: JuegoJuvenil }>;
}

export interface SesionJuvenilEspecial {
  tipo: "especial";
  tipo_especial: TipoEspecial;
}

// Legacy format (backward compat — weekly plan AI still generates this)
export interface SesionJuvenilLegacy {
  nombre_clase: string;
  objetivo_simple: string;
  actividades: Actividad[];
  actividad_estrella: string;
}

export type SesionJuvenilData = SesionJuvenilEstaciones | SesionJuvenilEspecial | SesionJuvenilLegacy;

// ── Game library ───────────────────────────────────────────────────────────────
const JUEGOS_BIBLIOTECA: Record<CategoriaEstacion, JuegoJuvenil[]> = {
  juego_largo: [
    {
      nombre: "El Lanzamisiles",
      como_se_juega: "5 pelotas a zonas marcadas a 10, 20, 30, 40 y 50m. Zona más lejana = más puntos. Gana mayor suma en 5 turnos.",
      adaptacion_facil: "Birdies: tee elevado, solo 3 zonas, contar los 3 mejores de 5 tiros.",
      adaptacion_retadora: "Albatros: puntos solo si cae dentro de la zona exacta.",
    },
    {
      nombre: "El Rey del Fairway",
      como_se_juega: "Quien llega más lejos dentro del fairway (zona delimitada) gana la ronda. 5 rondas, el que gana 3 primero es Rey.",
      adaptacion_facil: "Birdies: zona más ancha, cualquier tiro dentro del área cuenta.",
      adaptacion_retadora: "Albatros: fairway más estrecho, los tiros fuera restan 1 punto.",
    },
    {
      nombre: "La Catapulta",
      como_se_juega: "Carrera de 2 min: ¿cuántas pelotas llegas al aro a 30m? Cada pelota dentro suma 2 pts. Rebotes que quedan en el aro suman 1.",
      adaptacion_facil: "Birdies: aro más grande y más cerca, tiempo 3 min.",
      adaptacion_retadora: "Albatros: solo vuelo directo al aro (no rebotes).",
    },
    {
      nombre: "Semáforo de Swing",
      como_se_juega: "El instructor grita colores: Verde = swing completo, Rojo = parar en P5 foto, Amarillo = girar pie trasero. 10 instrucciones. Fallo = -1 pto.",
      adaptacion_facil: "Birdies: solo Verde y Rojo, sin penalización.",
      adaptacion_retadora: "Albatros: secuencias más rápidas, deben nombrar el siguiente color.",
    },
  ],
  juego_corto: [
    {
      nombre: "El Malabarista",
      como_se_juega: "Chip desde 15m a 3 aros: rojo (más lejos, 3 pts), azul (medio, 2 pts), blanco (más cerca, 1 pt). 8 chips por persona.",
      adaptacion_facil: "Birdies: aros más grandes, posición más cerca.",
      adaptacion_retadora: "Albatros: los aros cambian de posición entre turno y turno.",
    },
    {
      nombre: "El Francotirador",
      como_se_juega: "Pitch a banderitas de colores a 8, 12 y 18m. Cada banderita vale pts según distancia. 3 rondas, suma total.",
      adaptacion_facil: "Birdies: banderitas grandes, solo 2 distancias.",
      adaptacion_retadora: "Albatros: penalización si la pelota rebota antes de llegar a la banderita.",
    },
    {
      nombre: "La Pelota Caliente",
      como_se_juega: "Turno de 60 seg: todos chipean a la zona marcada en equipo. El equipo suma puntos de las pelotas dentro. Se compite contra el tiempo.",
      adaptacion_facil: "Birdies: chipean al mismo tiempo (no turnos individuales).",
      adaptacion_retadora: "Albatros: solo 2 pelotas por jugador, deben escoger el momento.",
    },
    {
      nombre: "El Castillo",
      como_se_juega: "3 conos a 10m. Derríbalos con chips. Cono derribado = 1 pt. Derribar los 3 en un turno = 5 pts bono.",
      adaptacion_facil: "Birdies: conos más cerca, 3 intentos por cono.",
      adaptacion_retadora: "Albatros: solo chip de vuelo limpio derriba los conos.",
    },
  ],
  putt: [
    {
      nombre: "La Batalla de Putts",
      como_se_juega: "Duelos 1 vs 1: quien emboca o queda más cerca gana el duelo. Torneo de eliminación. Distancia varía por ronda (1-5m).",
      adaptacion_facil: "Birdies: distancias cortas (1-2m), quedar cerca cuenta como ganar.",
      adaptacion_retadora: "Albatros: solo embocar gana el duelo (quedar cerca no suma).",
    },
    {
      nombre: "El Caracol",
      como_se_juega: "Recorrido de 6 hoyos en espiral. Si embocan avanzan 2 extra. Si fallan 2 seguidos, vuelven 1. Gana quien termina primero.",
      adaptacion_facil: "Birdies: distancias de 0.5-1m, máximo 3 intentos por hoyo.",
      adaptacion_retadora: "Albatros: 1 sola oportunidad por hoyo, fallo = volver al anterior.",
    },
    {
      nombre: "La Caja de Sorpresas",
      como_se_juega: "El instructor saca un papel: distancia + regla especial (mano contraria, ojos cerrados, rodillas…). Todos puttean con esa regla. Emboca = 2 pts, más cerca = 1 pt.",
      adaptacion_facil: "Birdies: reglas especiales solo en último turno.",
      adaptacion_retadora: "Albatros: deben cumplir regla Y embocar para sumar.",
    },
    {
      nombre: "El Rompecabezas",
      como_se_juega: "5 hoyos numerados, el jugador elige el orden. Se acumulan golpes. Al final se revela el 'hoyo doble' que multiplica ese resultado ×2.",
      adaptacion_facil: "Birdies: máximo 3 golpes por hoyo antes de avanzar (gipper).",
      adaptacion_retadora: "Albatros: completar todos en cierto total de golpes para ganar.",
    },
  ],
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
  juegoIdx: number | null;
  extras: JuegoJuvenil[];
  generando: boolean;
  open: boolean;
}

function initStations(sesion?: ExistingSesion | null): StationState[] {
  const base: StationState[] = CATEGORIAS.map((c) => ({
    categoria: c.value, juegoIdx: null, extras: [], generando: false, open: false,
  }));
  if (sesion?.sesion_juvenil && 'tipo' in sesion.sesion_juvenil && sesion.sesion_juvenil.tipo === "estaciones") {
    const est = sesion.sesion_juvenil.estaciones;
    base.forEach((s, i) => {
      const existing = est.find((e) => e.categoria === s.categoria);
      if (!existing) return;
      const lib = JUEGOS_BIBLIOTECA[s.categoria];
      const libIdx = lib.findIndex((g) => g.nombre === existing.juego.nombre);
      if (libIdx >= 0) {
        base[i].juegoIdx = libIdx;
      } else {
        base[i].extras = [existing.juego];
        base[i].juegoIdx = lib.length; // extras start at lib.length
      }
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

  const busy = saving || stations.some((s) => s.generando);
  const allStationsFilled = stations.every((s) => s.juegoIdx !== null);

  // ── Resolve selected game for a station ──────────────────────────────────
  function getJuego(s: StationState): JuegoJuvenil | null {
    if (s.juegoIdx === null) return null;
    const lib = JUEGOS_BIBLIOTECA[s.categoria];
    if (s.juegoIdx < lib.length) return lib[s.juegoIdx];
    return s.extras[s.juegoIdx - lib.length] ?? null;
  }

  function allGames(s: StationState): JuegoJuvenil[] {
    return [...JUEGOS_BIBLIOTECA[s.categoria], ...s.extras];
  }

  // ── Toggle station open/closed ───────────────────────────────────────────
  function toggleStation(idx: number) {
    setStations((prev) => prev.map((s, i) => i === idx ? { ...s, open: !s.open } : s));
  }

  function selectGame(stIdx: number, gameIdx: number) {
    setStations((prev) => prev.map((s, i) => i === stIdx ? { ...s, juegoIdx: gameIdx, open: false } : s));
  }

  // ── AI: suggest more games for a station ────────────────────────────────
  async function handleSuggestMore(stIdx: number) {
    const st = stations[stIdx];
    setStations((prev) => prev.map((s, i) => i === stIdx ? { ...s, generando: true } : s));
    setError(null);
    try {
      const juegosYaUsados = allGames(st).map((g) => g.nombre);
      const res = await fetch("/api/suggest-station-game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: planId,
          categoria: st.categoria,
          juegos_ya_usados: juegosYaUsados,
        }),
      });
      const data = await res.json() as { opciones?: JuegoJuvenil[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Error al generar");
      const nuevos = data.opciones ?? [];
      if (nuevos.length === 0) throw new Error("Sin opciones nuevas");
      setStations((prev) => prev.map((s, i) =>
        i === stIdx ? { ...s, extras: [...s.extras, ...nuevos], generando: false, open: true } : s
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setStations((prev) => prev.map((s, i) => i === stIdx ? { ...s, generando: false } : s));
    }
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
        const estaciones = stations.map((s) => {
          const juego = getJuego(s);
          if (!juego) throw new Error(`Falta juego en ${s.categoria}`);
          return { categoria: s.categoria, juego };
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
                <p className="text-xs text-gray-500">Juego Largo · Juego Corto · Putt — elige un juego para cada una</p>
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
                const games = allGames(st);
                const selectedJuego = getJuego(st);
                return (
                  <div key={st.categoria} className="border rounded-xl overflow-hidden"
                    style={{ borderColor: st.juegoIdx !== null ? GREEN : "#e5e7eb" }}>
                    {/* Station header */}
                    <button
                      onClick={() => toggleStation(stIdx)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left"
                      style={{ background: st.juegoIdx !== null ? "#f0faf2" : "#f9fafb" }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg flex-shrink-0">{cat.emoji}</span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: GREEN }}>
                            Estación {stIdx + 1} — {cat.label}
                          </p>
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {selectedJuego ? selectedJuego.nombre : <span className="text-gray-400 font-normal">Elige un juego →</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {st.juegoIdx !== null && (
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

                    {/* Game list */}
                    {st.open && (
                      <div className="border-t border-gray-100 divide-y divide-gray-50">
                        {games.map((juego, gIdx) => {
                          const isSelected = st.juegoIdx === gIdx;
                          return (
                            <button
                              key={gIdx}
                              onClick={() => selectGame(stIdx, gIdx)}
                              className="w-full text-left px-4 py-3 transition-colors hover:bg-gray-50"
                              style={isSelected ? { background: "#f0faf2" } : {}}
                            >
                              <div className="flex items-start gap-2">
                                <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all`}
                                  style={isSelected ? { borderColor: GREEN, background: GREEN } : { borderColor: "#d1d5db" }}>
                                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-gray-900">{juego.nombre}</p>
                                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{juego.como_se_juega}</p>
                                  {isSelected && (
                                    <div className="mt-2 space-y-1">
                                      <p className="text-[11px] text-blue-700 bg-blue-50 rounded px-2 py-1">
                                        🐦 <strong>Fácil:</strong> {juego.adaptacion_facil}
                                      </p>
                                      <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1">
                                        🦅 <strong>Retador:</strong> {juego.adaptacion_retadora}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}

                        {/* Suggest more */}
                        <div className="px-4 py-2.5">
                          <button
                            onClick={() => handleSuggestMore(stIdx)}
                            disabled={st.generando}
                            className="flex items-center gap-2 text-xs font-medium text-purple-700 hover:text-purple-900 disabled:opacity-50"
                          >
                            {st.generando ? (
                              <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                              </svg>
                            ) : "🎲"}
                            {st.generando ? "Generando ideas..." : "Sugerir más con IA"}
                          </button>
                        </div>
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
                {saving ? "Guardando..." : allStationsFilled ? "✓ Guardar sesión" : `Elige los 3 juegos (${stations.filter(s => s.juegoIdx !== null).length}/3)`}
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
