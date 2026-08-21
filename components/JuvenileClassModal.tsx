"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import EstacionLibraryPicker from "./EstacionLibraryPicker";
import { FOCOS, FOCO_LABEL, MATERIALES, MATERIAL_LABEL } from "@/lib/estacion-library-constants";

// ── Types (exported — used in ProgramacionModule / PacoPlanningModal) ────────
export interface Actividad {
  nombre: string; duracion_min: number; como_se_juega: string;
  adaptacion_birdies: string; adaptacion_albatros: string;
  como_se_gana: string; materiales: string;
}

// "fisico" y "campo_infantil" son nuevos — antes campo_infantil solo existía
// como tipo de día especial completo; ahora también es una estación normal
// más dentro de un día de 2-4 estaciones (planeación manual guiada).
export type CategoriaEstacion = "juego_largo" | "juego_corto" | "putt" | "fisico" | "campo_infantil";
export type TipoEspecial = "test_tecnico" | "test_fisico" | "campo_pacos" | "campo_infantil";

export interface DrillJuvenilEstacion { titulo: string; descripcion: string; id?: string; series_repeticiones?: string | null }

export interface EstacionJuvenil {
  categoria: CategoriaEstacion;
  foco?: string | null; // foco del tema (opcional)
  responsable?: string | null; // profesor a cargo
  drills: DrillJuvenilEstacion[]; // 1 a 3
  desafio: string;
  lugar?: string; // nuevo — sitio de práctica, elegido al final por estación
}

export interface SesionJuvenilEstaciones {
  tipo: "estaciones";
  estaciones: EstacionJuvenil[]; // 2 a 4 — dato viejo siempre trae exactamente 3
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

// drills.categoria (tabla real de la biblioteca) por categoría de estación
// juvenil — "fisico" no usa esta tabla (ver ejercicios_fisicos más abajo).
export const DRILLS_CATEGORIA_JUVENIL: Record<CategoriaEstacion, string | null> = {
  juego_largo: "tecnico",
  juego_corto: "juego_corto",
  putt: "putting",
  campo_infantil: "campo",
  fisico: null,
};

// ── Constants ──────────────────────────────────────────────────────────────────
const GREEN = "var(--ui-gold)";

const CATEGORIAS: { value: CategoriaEstacion; emoji: string; label: string }[] = [
  { value: "juego_largo",    emoji: "🏌️", label: "Juego Largo" },
  { value: "juego_corto",    emoji: "⛳",  label: "Juego Corto" },
  { value: "putt",           emoji: "🎯",  label: "Putt" },
  { value: "fisico",         emoji: "💪",  label: "Físico" },
  { value: "campo_infantil", emoji: "👶",  label: "Campo Infantil" },
];

export const CATEGORIA_ESTACION_LABEL_JUVENIL: Record<CategoriaEstacion, string> = {
  juego_largo: "Juego Largo", juego_corto: "Juego Corto", putt: "Putt",
  fisico: "Físico", campo_infantil: "Campo Infantil",
};

// Solo estas 3 categorías tienen sugerencia por IA (app/api/suggest-station-game
// solo conoce drills de golf) — Físico y Campo Infantil se arman siempre a mano
// desde la biblioteca (ejercicios_fisicos / drills categoría "campo").
const CATEGORIAS_CON_IA = new Set<CategoriaEstacion>(["juego_largo", "juego_corto", "putt"]);

// Foco/Material — mismo vocabulario que la Biblioteca de Drills (DrillsModule.tsx),
// usados como filtros previos a mostrar la biblioteca. Solo aplican a
// categorías que usan drills.categoria — no a "fisico" (biblioteca distinta).

const LUGARES_ESTACION: { value: string; label: string }[] = [
  { value: "campo_practica",    label: "Campo de práctica" },
  { value: "putting_green",     label: "Putting Green" },
  { value: "campo_infantil",    label: "Campo Infantil" },
  { value: "campo_pacos_fabios", label: "Campo Pacos y Fabios" },
  { value: "campo_completo",    label: "Campo Completo" },
];

// Sugerencia inicial de lugar según la categoría de la estación — el
// profesor la ve como punto de partida al llegar al último paso, pero sigue
// siendo un dropdown editable, nunca se guarda a ciegas.
function sugerirLugar(categoria: CategoriaEstacion): string {
  if (categoria === "putt") return "putting_green";
  if (categoria === "campo_infantil") return "campo_infantil";
  return "campo_practica";
}

const ESPECIALES: { value: TipoEspecial; emoji: string; label: string; desc: string }[] = [
  { value: "test_tecnico", emoji: "📋", label: "Test técnico",  desc: "Evaluación P1-P10" },
  { value: "test_fisico",  emoji: "💪", label: "Test físico",   desc: "Evaluación TPI" },
  { value: "campo_pacos",  emoji: "🌿", label: "Salida al campo", desc: "Juego en campo real" },
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
  // Único fallback cuando horariosDefecto no trae nada para este día — nunca se
  // guarda sin hora, así el NOT NULL de sesiones_semana no rompe el guardado.
  horariosDefecto?: { tipo_plan: string; dia_semana: string; hora_inicio: string; hora_fin: string }[];
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
  foco: string | null;
  material: string[];
  drills: DrillJuvenilEstacion[];
  desafio: string;
  lugar: string;
  showPicker: boolean;
}

function nuevaEstacion(categoria: CategoriaEstacion): StationState {
  return {
    categoria, open: false, fetched: false, loading: false, failed: false,
    foco: null, material: [], drills: [], desafio: "", lugar: sugerirLugar(categoria), showPicker: false,
  };
}

const POOL_ORDEN: CategoriaEstacion[] = ["juego_largo", "juego_corto", "putt", "fisico", "campo_infantil"];

function initStations(sesion?: ExistingSesion | null): StationState[] | null {
  if (sesion?.sesion_juvenil && "tipo" in sesion.sesion_juvenil && sesion.sesion_juvenil.tipo === "estaciones") {
    const est = sesion.sesion_juvenil.estaciones;
    if (est.length >= 2) {
      return est.map((e) => ({
        categoria: e.categoria, open: false, fetched: true, loading: false, failed: false,
        foco: null, material: [],
        drills: e.drills ?? [], desafio: e.desafio ?? "", lugar: e.lugar ?? sugerirLugar(e.categoria), showPicker: false,
      }));
    }
  }
  return null;
}

function initMode(sesion?: ExistingSesion | null): "count" | "estaciones" | "especial_tipo" {
  if (!sesion?.sesion_juvenil || !("tipo" in sesion.sesion_juvenil)) return "count";
  if (sesion.sesion_juvenil.tipo === "estaciones" && sesion.sesion_juvenil.estaciones.length >= 2) return "estaciones";
  if (sesion.sesion_juvenil.tipo === "especial") return "especial_tipo";
  return "count";
}

function initEspecial(sesion?: ExistingSesion | null): TipoEspecial | null {
  if (!sesion?.sesion_juvenil || !("tipo" in sesion.sesion_juvenil)) return null;
  if (sesion.sesion_juvenil.tipo !== "especial") return null;
  const valor = sesion.sesion_juvenil.tipo_especial;
  // Solo los 3 nuevos son elegibles desde este flujo — un valor viejo
  // (campo_infantil como día completo) obliga a elegir de nuevo, en vez de
  // mostrar una opción que ya no existe en la lista.
  return ESPECIALES.some((e) => e.value === valor) ? valor : null;
}

function formatFecha(fecha: string) {
  return new Date(fecha + "T00:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function JuvenileClassModal({
  planId, dia, diaLabel, fecha,
  horaInicio, horaFin, sesionExistente, horariosDefecto,
  onClose, onSaved,
}: Props) {
  const slotsDia = (horariosDefecto ?? [])
    .filter((h) => h.tipo_plan === "juvenil" && h.dia_semana === dia)
    .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  const horaInicioFinal = horaInicio || sesionExistente?.hora_inicio || slotsDia[0]?.hora_inicio.slice(0, 5) || "";
  const horaFinFinal = horaFin || sesionExistente?.hora_fin || slotsDia[0]?.hora_fin.slice(0, 5) || "";
  const horarioHeader = slotsDia.length > 1
    ? slotsDia.map((s) => `${s.hora_inicio.slice(0, 5)}–${s.hora_fin.slice(0, 5)}`).join(" y ")
    : horaInicioFinal && horaFinFinal ? `${horaInicioFinal}–${horaFinFinal}` : "";

  const [mode, setMode] = useState<"count" | "estaciones" | "especial_tipo">(() => initMode(sesionExistente));
  const [stations, setStations] = useState<StationState[]>(() => initStations(sesionExistente) ?? []);
  const [tipoEspecial, setTipoEspecial] = useState<TipoEspecial | null>(() => initEspecial(sesionExistente));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = saving || stations.some((s) => s.loading);
  const allStationsFilled = stations.length >= 2 && stations.every((s) => s.drills.length > 0 && s.desafio.trim().length > 0);

  // ── AI: sugerir drills + desafío para una estación (solo golf) ─────────────
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
    if (!st.open && !st.fetched) {
      if (CATEGORIAS_CON_IA.has(st.categoria)) fetchSuggestion(idx);
      else setStations((prev) => prev.map((s, i) => i === idx ? { ...s, fetched: true } : s));
    }
  }

  function categoriasDisponibles(stIdx: number) {
    const usadasPorOtras = stations.filter((_, i) => i !== stIdx).map((s) => s.categoria);
    return CATEGORIAS.filter((c) => !usadasPorOtras.includes(c.value));
  }

  function changeCategoria(stIdx: number, categoria: CategoriaEstacion) {
    setStations((prev) => prev.map((s, i) => i === stIdx ? nuevaEstacion(categoria) : s));
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

  function updateFoco(stIdx: number, value: string) {
    // Cambiar el foco invalida los ejercicios ya elegidos con el filtro
    // anterior — evita dejar drills que ya no calzan con el nuevo criterio.
    setStations((prev) => prev.map((s, i) => i === stIdx ? { ...s, foco: value || null, drills: [], desafio: "", fetched: true } : s));
  }

  function toggleMaterial(stIdx: number, value: string) {
    setStations((prev) => prev.map((s, i) => {
      if (i !== stIdx) return s;
      const next = s.material.includes(value) ? s.material.filter((m) => m !== value) : [...s.material, value];
      return { ...s, material: next, drills: [], desafio: "" };
    }));
  }

  function updateLugar(stIdx: number, value: string) {
    setStations((prev) => prev.map((s, i) => i === stIdx ? { ...s, lugar: value } : s));
  }

  function togglePicker(stIdx: number, show: boolean) {
    setStations((prev) => prev.map((s, i) => i === stIdx ? { ...s, showPicker: show } : s));
  }

  function handleChooseCount(n: number) {
    if (n === 1) {
      setMode("especial_tipo");
      return;
    }
    setStations(POOL_ORDEN.slice(0, n).map(nuevaEstacion));
    setMode("estaciones");
  }

  // ── Save ─────────────────────────────────────────────────────────────────
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
          drills: [], juego_competitivo: null, estaciones_damas: null, notas: null,
          sesion_juvenil: { tipo: "especial", tipo_especial: tipoEspecial },
        };
      } else {
        const estaciones: EstacionJuvenil[] = stations.map((s) => {
          if (s.drills.length === 0) throw new Error(`Falta al menos 1 ejercicio en ${CATEGORIA_ESTACION_LABEL_JUVENIL[s.categoria]}`);
          return { categoria: s.categoria, drills: s.drills, desafio: s.desafio, lugar: s.lugar };
        });
        payload = {
          tipo_sesion: "juvenil_estaciones",
          lugar: "campo_practica",
          objetivo: `Sesión ${estaciones.length} estaciones: ${estaciones.map((e) => CATEGORIA_ESTACION_LABEL_JUVENIL[e.categoria]).join(" · ")}`,
          drills: [], juego_competitivo: null, estaciones_damas: null, notas: null,
          sesion_juvenil: { tipo: "estaciones", estaciones },
        };
      }

      // Sábado y domingo tienen 2 horarios físicos con el MISMO contenido — se
      // guardan en un solo upsert para que nunca puedan divergir entre sí.
      const slots = slotsDia.length > 0 ? slotsDia : [{ hora_inicio: horaInicioFinal, hora_fin: horaFinFinal }];
      if (!slots[0]?.hora_inicio) throw new Error("No hay horario por defecto para este día; defínelo en horarios_defecto.");

      const rows = slots.map((slot) => ({
        plan_id: planId, dia_semana: dia, fecha,
        hora_inicio: slot.hora_inicio.slice(0, 5), hora_fin: slot.hora_fin.slice(0, 5),
        ...payload,
      }));

      const { error: e } = await supabase.from("sesiones_semana").upsert(rows, { onConflict: "plan_id,fecha,hora_inicio" });
      if (e) throw new Error(e.message);
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
      <div className="bg-(--ui-card) rounded-2xl shadow-2xl w-full max-w-xl my-6"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-(--ui-border-soft) sticky top-0 bg-(--ui-card) rounded-t-2xl z-10">
          <div>
            <h2 className="font-bold text-(--ui-text) text-sm">
              {sesionExistente ? "Cambiar sesión" : "Asignar sesión"} — {diaLabel}
            </h2>
            <p className="text-xs text-(--ui-text-3) mt-0.5">{diaLabel} {formatFecha(fecha)}{horarioHeader ? ` · ${horarioHeader}` : ""}</p>
          </div>
          <button onClick={() => { if (!busy) onClose(); }} disabled={busy}
            className="text-(--ui-text-3) hover:text-(--ui-text-2) disabled:opacity-40">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Paso 1: cuántas estaciones ── */}
        {mode === "count" && (
          <div className="p-5 space-y-3">
            <p className="text-xs font-bold text-(--ui-text-3) uppercase tracking-wide">¿Cuántas estaciones tiene este día?</p>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => handleChooseCount(n)}
                  className="flex flex-col items-center justify-center py-4 rounded-xl border-2 border-(--ui-border) hover:border-green-400 hover:bg-(--ui-ok-bg) transition-all font-bold text-lg text-(--ui-text)"
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-(--ui-text-3)">
              <strong>1</strong> convierte el día en especial (test técnico, test físico o salida al campo).{" "}
              <strong>2 a 4</strong> arma estaciones normales, cada una con sus propios drills/ejercicios y un desafío de cierre.
            </p>
          </div>
        )}

        {/* ── Estaciones (2-4) ── */}
        {mode === "estaciones" && (
          <>
            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
              {stations.map((st, stIdx) => {
                const filled = st.drills.length > 0 && st.desafio.trim().length > 0;
                const catInfo = CATEGORIAS.find((c) => c.value === st.categoria)!;
                return (
                  <div key={stIdx} className="border rounded-xl overflow-hidden"
                    style={{ borderColor: filled ? GREEN : "var(--ui-border)" }}>
                    {/* Station header: categoría (dropdown) + toggle */}
                    <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: filled ? "var(--ui-ok-bg)" : "var(--ui-card-alt)" }}>
                      <span className="text-lg flex-shrink-0">{catInfo.emoji}</span>
                      <select
                        value={st.categoria}
                        onChange={(e) => changeCategoria(stIdx, e.target.value as CategoriaEstacion)}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-bold uppercase tracking-wide bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-green-300 rounded px-1 py-0.5"
                        style={{ color: GREEN }}
                      >
                        {categoriasDisponibles(stIdx).map((c) => (
                          <option key={c.value} value={c.value}>Estación {stIdx + 1} — {c.label}</option>
                        ))}
                      </select>
                      <button onClick={() => toggleStation(stIdx)} className="ml-auto flex items-center gap-2 flex-shrink-0">
                        <span className="text-sm font-semibold text-(--ui-text) truncate max-w-[140px]">
                          {st.drills.length > 0
                            ? `${st.drills.length} drill${st.drills.length > 1 ? "s" : ""}${st.desafio ? " + desafío" : ""}`
                            : <span className="text-(--ui-text-3) font-normal">Ver opciones →</span>}
                        </span>
                        {filled && (
                          <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: GREEN }}>
                            <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={3}><path d="M3 10l4 4 9-9" /></svg>
                          </div>
                        )}
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="var(--ui-text-3)" strokeWidth={2}
                          className={`transition-transform ${st.open ? "rotate-180" : ""}`}>
                          <path d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>

                    {/* Station content */}
                    {st.open && (
                      <div className="border-t border-(--ui-border-soft) p-3 space-y-3">
                        {st.loading ? (
                          <div className="flex items-center gap-2 text-xs text-(--ui-text-3) py-4 justify-center">
                            <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                            Generando sugerencias con IA... (5–10 seg)
                          </div>
                        ) : (
                          <>
                            {/* 1) Foco — solo aplica a estaciones basadas en drills técnicos */}
                            {st.categoria !== "fisico" && (
                              <div>
                                <label className="text-[11px] font-bold text-(--ui-text-3) uppercase tracking-wide block mb-1">1 · Foco</label>
                                <select
                                  value={st.foco ?? ""}
                                  onChange={(e) => updateFoco(stIdx, e.target.value)}
                                  className="w-full text-xs border border-(--ui-border) rounded-lg px-2.5 py-1.5 bg-(--ui-card)"
                                >
                                  <option value="">Cualquiera</option>
                                  {FOCOS.map((f) => <option key={f} value={f}>{FOCO_LABEL[f]}</option>)}
                                </select>
                              </div>
                            )}

                            {/* 2) Material */}
                            <div>
                              <label className="text-[11px] font-bold text-(--ui-text-3) uppercase tracking-wide block mb-1">2 · Material</label>
                              <div className="flex flex-wrap gap-1.5">
                                {MATERIALES.map((m) => (
                                  <button key={m} type="button" onClick={() => toggleMaterial(stIdx, m)}
                                    className="px-2 py-1 rounded-full text-[11px] font-semibold border transition-all"
                                    style={st.material.includes(m) ? { background: "var(--ui-warn)", color: "var(--g-on-accent)", borderColor: "var(--ui-warn)" } : { background: "var(--ui-card-alt)", color: "var(--ui-text-2)", borderColor: "var(--ui-border)" }}>
                                    {MATERIAL_LABEL[m]}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {st.failed && (
                              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-(--ui-warn-bg) border border-(--ui-warn)">
                                <p className="text-xs text-(--ui-warn)">No se generaron sugerencias.</p>
                                <button onClick={() => fetchSuggestion(stIdx)} className="text-xs font-semibold text-(--ui-warn) hover:underline whitespace-nowrap shrink-0">
                                  🔄 Reintentar
                                </button>
                              </div>
                            )}

                            {/* 3) Ejercicios */}
                            <div>
                              <label className="text-[11px] font-bold text-(--ui-text-3) uppercase tracking-wide block mb-1">3 · Ejercicios</label>
                              <div className="space-y-2">
                                {st.drills.map((d, dIdx) => (
                                  <div key={dIdx} className="border border-(--ui-border-soft) rounded-lg p-2.5 bg-(--ui-card-alt) flex items-start gap-2">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-semibold text-(--ui-text)">{d.titulo}</p>
                                      <p className="text-xs text-(--ui-text-3) mt-0.5">{d.descripcion}</p>
                                    </div>
                                    <button
                                      onClick={() => removeDrill(stIdx, dIdx)}
                                      disabled={st.drills.length <= 1}
                                      className="text-(--ui-text-3) hover:text-(--ui-bad) disabled:opacity-30 disabled:hover:text-(--ui-text-3) shrink-0"
                                    >
                                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => togglePicker(stIdx, true)}
                                disabled={st.drills.length >= 3}
                                className="text-xs font-medium text-(--g-birdies-fg) hover:text-blue-900 disabled:opacity-40 disabled:hover:text-(--g-birdies-fg)"
                              >
                                + Agregar de la biblioteca
                              </button>
                              {CATEGORIAS_CON_IA.has(st.categoria) && (
                                <button
                                  onClick={() => fetchSuggestion(stIdx)}
                                  className="flex items-center gap-1.5 text-xs font-medium text-(--g-mas14-fg) hover:text-purple-900"
                                >
                                  🔄 Regenerar con IA
                                </button>
                              )}
                            </div>

                            <div>
                              <label className="text-[11px] font-bold text-(--ui-text-3) uppercase tracking-wide block mb-1">Desafío</label>
                              <textarea
                                value={st.desafio}
                                onChange={(e) => updateDesafio(stIdx, e.target.value)}
                                rows={2}
                                placeholder="Reto o juego competitivo de cierre para esta estación"
                                className="w-full text-xs border border-(--ui-border) rounded-lg px-2.5 py-1.5 resize-none"
                              />
                            </div>

                            {/* 4) Sitio de práctica — al final, ya con material/ejercicios decididos */}
                            <div>
                              <label className="text-[11px] font-bold text-(--ui-text-3) uppercase tracking-wide block mb-1">4 · Sitio de práctica</label>
                              <select
                                value={st.lugar}
                                onChange={(e) => updateLugar(stIdx, e.target.value)}
                                className="w-full text-xs border border-(--ui-border) rounded-lg px-2.5 py-1.5 bg-(--ui-card)"
                              >
                                {LUGARES_ESTACION.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                              </select>
                            </div>
                          </>
                        )}

                        {st.showPicker && (
                          st.categoria === "fisico" ? (
                            <EstacionLibraryPicker
                              fuente="ejercicios_fisicos"
                              grupos={["Birdies", "Águilas", "Albatros", "+14"]}
                              yaSeleccionados={st.drills.map((d) => d.titulo)}
                              onAdd={(item) => addDrillFromBiblioteca(stIdx, item)}
                              onClose={() => togglePicker(stIdx, false)}
                            />
                          ) : (
                            <EstacionLibraryPicker
                              fuente="drills"
                              categoriaDrills={DRILLS_CATEGORIA_JUVENIL[st.categoria]!}
                              grupos={[]}
                              foco={st.foco}
                              material={st.material}
                              yaSeleccionados={st.drills.map((d) => d.titulo)}
                              onAdd={(item) => addDrillFromBiblioteca(stIdx, item)}
                              onClose={() => togglePicker(stIdx, false)}
                            />
                          )
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {error && (
                <div className="bg-(--ui-bad-bg) border border-(--ui-bad) rounded-lg px-4 py-3 text-sm text-(--ui-bad)">{error}</div>
              )}
            </div>

            <div className="px-5 pb-5 pt-3 flex gap-2 border-t border-(--ui-border-soft)">
              <button onClick={() => setMode("count")}
                className="px-4 py-2.5 rounded-xl text-sm font-medium border border-(--ui-border) text-(--ui-text-2) hover:bg-(--ui-card-alt)">
                ← Volver
              </button>
              <button
                onClick={handleSave}
                disabled={!allStationsFilled || saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-(--g-on-accent) disabled:opacity-40 transition-all hover:brightness-110"
                style={{ background: GREEN }}
              >
                {saving ? "Guardando..." : allStationsFilled ? "✓ Guardar sesión" : `Completa las estaciones (${stations.filter((s) => s.drills.length > 0 && s.desafio.trim()).length}/${stations.length})`}
              </button>
            </div>
          </>
        )}

        {/* ── Especial (1 estación) ── */}
        {mode === "especial_tipo" && (
          <>
            <div className="p-5 space-y-2">
              <p className="text-xs font-bold text-(--ui-text-3) uppercase tracking-wide mb-3">Tipo de día especial</p>
              {ESPECIALES.map((esp) => (
                <button
                  key={esp.value}
                  onClick={() => setTipoEspecial(esp.value)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all"
                  style={tipoEspecial === esp.value
                    ? { borderColor: "var(--g-mas14-fg)", background: "var(--g-mas14-bg)" }
                    : { borderColor: "var(--ui-border)", background: "var(--ui-card-alt)" }}
                >
                  <span className="text-xl">{esp.emoji}</span>
                  <div>
                    <p className="text-sm font-semibold text-(--ui-text)">{esp.label}</p>
                    <p className="text-xs text-(--ui-text-3)">{esp.desc}</p>
                  </div>
                  {tipoEspecial === esp.value && (
                    <div className="ml-auto w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "var(--g-mas14-fg)" }}>
                      <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={3}><path d="M3 10l4 4 9-9" /></svg>
                    </div>
                  )}
                </button>
              ))}
              {error && (
                <div className="bg-(--ui-bad-bg) border border-(--ui-bad) rounded-lg px-4 py-3 text-sm text-(--ui-bad)">{error}</div>
              )}
            </div>

            <div className="px-5 pb-5 pt-3 flex gap-2 border-t border-(--ui-border-soft)">
              <button onClick={() => setMode("count")}
                className="px-4 py-2.5 rounded-xl text-sm font-medium border border-(--ui-border) text-(--ui-text-2) hover:bg-(--ui-card-alt)">
                ← Volver
              </button>
              <button
                onClick={handleSave}
                disabled={!tipoEspecial || saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-(--g-on-accent) disabled:opacity-40 transition-all"
                style={{ background: "var(--g-mas14-fg)" }}
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
