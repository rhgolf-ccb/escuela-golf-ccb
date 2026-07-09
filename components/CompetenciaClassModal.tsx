"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type DiaSemana = "martes" | "miercoles" | "jueves" | "viernes" | "sabado" | "domingo";
type TipoSesion = "tiro_largo" | "juego_corto" | "putt" | "campo" | "test_tecnico" | "test_fisico" | "trabajo_fisico";
type Lugar = "campo_practica" | "putting_green" | "campo_pacos_fabios" | "campo_infantil" | "campo_completo";

interface ExistingSesion {
  id: string; tipo_sesion: string; lugar: string; objetivo: string;
  drills: { titulo: string; descripcion: string }[];
  juego_competitivo: string | null;
  hora_inicio: string | null; hora_fin: string | null;
  estaciones_competencia?: { categoria: string }[] | null;
}

interface Props {
  planId: string;
  dia: DiaSemana;
  diaLabel: string;
  fecha: string;
  horaInicio?: string;
  horaFin?: string;
  sesionExistente?: ExistingSesion | null;
  onClose: () => void;
  onSaved: () => void;
}

interface LibraryDrill {
  id: string;
  titulo: string;
  descripcion: string;
  categoria: string;
  posicion_swing: string[] | null;
  duracion_minutos: number | null;
  repeticiones: string | null;
  rating: number | null;
  veces_usado: number | null;
}

// Ejercicio de la biblioteca de Trabajo físico (tabla ejercicios_fisicos) —
// distinta de la biblioteca de drills técnicos.
interface LibraryEjercicio {
  id: string;
  nombre: string;
  categoria: string;
  instrucciones: string | null;
  series_repeticiones: string | null;
  materiales: string | null;
  screen_vinculado: string | null;
}

interface AISuggestion {
  titulo: string;
  descripcion: string;
  duracion_min: number;
  repeticiones: string;
}

interface DrillEdit { titulo: string; descripcion: string; series_repeticiones?: string | null }

// Una estación editable de la sesión — cada categoría elegida (Juego corto,
// Trabajo físico, etc.) tiene su propio lugar, foco, drills/ejercicios y reto,
// para que al guardar queden separados en vez de mezclados en una sola sesión.
interface EstacionEdit {
  categoria: TipoSesion;
  objetivo: string;
  lugar: Lugar;
  juego_competitivo: string;
  drills: DrillEdit[];
}

const CATEGORIAS: { value: TipoSesion; icon: string; label: string }[] = [
  { value: "tiro_largo",     icon: "🏌️", label: "Tiro largo" },
  { value: "juego_corto",    icon: "⛳", label: "Juego corto" },
  { value: "putt",           icon: "🎯", label: "Putt" },
  { value: "campo",          icon: "🌿", label: "Campo" },
  { value: "test_tecnico",   icon: "📋", label: "Test técnico" },
  { value: "test_fisico",    icon: "🩺", label: "Test físico" },
  { value: "trabajo_fisico", icon: "💪", label: "Trabajo físico" },
];

// TipoSesion → drills table categoria column value (null = no usa la
// biblioteca de drills técnicos, como Trabajo físico que usa ejercicios_fisicos)
const DRILLS_CATEGORIA: Record<TipoSesion, string | null> = {
  tiro_largo:     "tecnico",
  juego_corto:    "juego_corto",
  putt:           "putting",
  campo:          "campo",
  test_tecnico:   "tecnico",
  test_fisico:    null,
  trabajo_fisico: null,
};

// Al reabrir el asistente para un día que ya tiene sesión guardada, precarga
// las categorías que ya estaban activas (una sola, o todas las de
// estaciones_competencia si se habían combinado) para que editar no borre
// sin querer una de las estaciones ya armadas.
function categoriasDesdeExistente(s?: ExistingSesion | null): TipoSesion[] {
  if (!s) return [];
  if (s.tipo_sesion === "competencia" && s.estaciones_competencia?.length) {
    return s.estaciones_competencia
      .map((e) => e.categoria)
      .filter((c): c is TipoSesion => CATEGORIAS.some((cat) => cat.value === c));
  }
  return CATEGORIAS.some((cat) => cat.value === s.tipo_sesion) ? [s.tipo_sesion as TipoSesion] : [];
}

// Opciones de enfoque para la estación de Trabajo Físico — a diferencia de Test
// Físico (evaluación de protocolos TPI), esta es una estación de entrenamiento
// con ejercicios concretos según la cualidad física a trabajar.
const ENFOQUE_FISICO_OPCIONES = ["Potencia", "Movilidad", "Estabilidad / Core", "Equilibrio", "Prevención de lesiones"];

const LUGAR_LABEL: Record<string, string> = {
  campo_practica:     "Campo de práctica",
  putting_green:      "Putting Green",
  campo_pacos_fabios: "Campo Pacos y Fabios",
  campo_infantil:     "Campo Infantil",
  campo_completo:     "Campo Completo",
};

const ACCENT = "#1e40af";

function StarRating({ rating }: { rating: number | null }) {
  const stars = Math.round(rating ?? 0);
  return (
    <span className="flex gap-0.5 items-center">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="9" height="9" viewBox="0 0 20 20" fill={i <= stars ? "#f59e0b" : "#e5e7eb"}>
          <path d="M10 1l2.39 4.84L18 7.27l-4 3.9.94 5.49L10 14l-4.94 2.66L6 11.17 2 7.27l5.61-.43z" />
        </svg>
      ))}
    </span>
  );
}

export default function CompetenciaClassModal({
  planId, dia, diaLabel, fecha, horaInicio, horaFin, sesionExistente, onClose, onSaved,
}: Props) {
  type Mode = "categoria" | "enfoque_fisico" | "seleccion" | "preview";
  const [mode, setMode]       = useState<Mode>("categoria");
  const [categorias, setCategorias] = useState<TipoSesion[]>(() => categoriasDesdeExistente(sesionExistente));
  const [enfoqueFisico, setEnfoqueFisico] = useState<string[]>([]);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Índice (dentro de `categorias`) de la estación que se está armando en el
  // paso de selección — cada categoría se recorre una por una, no combinadas.
  const [stationIndex, setStationIndex] = useState(0);
  const stationCat = categorias[stationIndex];
  const esFisico = stationCat === "trabajo_fisico";

  // Biblioteca / IA de la estación EN CURSO (una sola categoría a la vez)
  const [libraryDrills, setLibraryDrills]         = useState<LibraryDrill[]>([]);
  const [libraryEjercicios, setLibraryEjercicios] = useState<LibraryEjercicio[]>([]);
  const [loadingLibrary, setLoadingLibrary]        = useState(false);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<Set<string>>(new Set());

  const [aiSuggestions, setAiSuggestions]         = useState<AISuggestion[]>([]);
  const [loadingAI, setLoadingAI]                  = useState(false);
  const [aiFailed, setAiFailed]                    = useState(false);
  const [selectedAiIdx, setSelectedAiIdx]          = useState<Set<number>>(new Set());
  const [aiFoco, setAiFoco]                        = useState("");
  const [aiJuego, setAiJuego]                      = useState("");
  const [lugarEstacion, setLugarEstacion]          = useState<Lugar>("campo_practica");

  // Estaciones ya confirmadas (se arman una por una a medida que se avanza)
  const [estacionesEdit, setEstacionesEdit] = useState<EstacionEdit[]>([]);

  const totalSelected = selectedLibraryIds.size + selectedAiIdx.size;
  const catInfos = CATEGORIAS.filter((c) => categorias.includes(c.value));
  const esMultiple = categorias.length > 1;

  function toggleCategoria(cat: TipoSesion) {
    setCategorias((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  function toggleEnfoqueFisico(op: string) {
    setEnfoqueFisico((prev) => (prev.includes(op) ? prev.filter((o) => o !== op) : [...prev, op]));
  }

  function handleContinuarDesdeCategorias() {
    if (categorias.length === 0) return;
    if (categorias.includes("trabajo_fisico")) setMode("enfoque_fisico");
    else handleContinuarCategorias();
  }

  function handleContinuarCategorias() {
    if (categorias.length === 0) return;
    setEstacionesEdit([]);
    setStationIndex(0);
    setMode("seleccion");
    fetchParaEstacion(0);
  }

  // Trae biblioteca + sugerencia IA para la categoría de la estación `idx` —
  // una sola categoría por vez, para que la selección de drills/ejercicios no
  // se mezcle entre estaciones.
  async function fetchParaEstacion(idx: number) {
    const cat = categorias[idx];
    setError(null);
    setSelectedLibraryIds(new Set());
    setSelectedAiIdx(new Set());
    setLibraryDrills([]);
    setLibraryEjercicios([]);
    setAiSuggestions([]);
    setAiFoco(""); setAiJuego("");
    setLugarEstacion("campo_practica");

    const libraryPromise = (async () => {
      setLoadingLibrary(true);
      if (cat === "trabajo_fisico") {
        // Ejercicios físicos vienen de ejercicios_fisicos, no de la biblioteca
        // de drills técnicos — filtrados por el grupo activo (Competencia).
        const { data } = await supabase
          .from("ejercicios_fisicos")
          .select("id, nombre, categoria, instrucciones, series_repeticiones, materiales, screen_vinculado")
          .contains("grupos", ["Competencia"])
          .order("nombre")
          .limit(30);
        setLibraryEjercicios((data as LibraryEjercicio[]) ?? []);
      } else {
        const drillsCat = DRILLS_CATEGORIA[cat];
        if (drillsCat) {
          const { data } = await supabase
            .from("drills")
            .select("id, titulo, descripcion, categoria, posicion_swing, duracion_minutos, repeticiones, rating, veces_usado")
            .eq("categoria", drillsCat)
            .eq("aprobado", true)
            .order("rating", { ascending: false })
            .limit(20);
          setLibraryDrills((data as LibraryDrill[]) ?? []);
        }
      }
      setLoadingLibrary(false);
    })();

    await Promise.all([libraryPromise, fetchAISuggestion(cat)]);
  }

  async function fetchAISuggestion(cat: TipoSesion) {
    setLoadingAI(true);
    setAiFailed(false);
    try {
      const res = await fetch("/api/suggest-competencia-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoria: cat,
          dia_semana: dia,
          enfoque_fisico: cat === "trabajo_fisico" ? enfoqueFisico : undefined,
        }),
      });
      const data = await res.json() as {
        foco_principal?: string; lugar?: string;
        drills?: AISuggestion[]; juego_competitivo?: string; error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Error IA");
      if (!data.drills?.length) throw new Error("La IA no generó sugerencias");
      setAiFoco(data.foco_principal ?? "");
      setAiJuego(data.juego_competitivo ?? "");
      setLugarEstacion((data.lugar as Lugar) ?? "campo_practica");
      setAiSuggestions(data.drills.slice(0, 3));
    } catch {
      setAiFailed(true);
    } finally {
      setLoadingAI(false);
    }
  }

  function toggleLibrary(id: string) {
    setSelectedLibraryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAI(idx: number) {
    setSelectedAiIdx((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  // Cierra la estación actual (con los drills/ejercicios elegidos) y pasa a la
  // siguiente categoría, o a la revisión final si ya era la última. Los efectos
  // secundarios de biblioteca (veces_usado, guardar sugerencias IA) se hacen
  // aquí mismo porque libraryDrills/aiSuggestions de esta estación se
  // descartan al pasar a la siguiente.
  function handleContinuarEstacion() {
    if (!esFisico) {
      for (const id of selectedLibraryIds) {
        const drill = libraryDrills.find((d) => d.id === id);
        if (drill) {
          supabase.from("drills").update({ veces_usado: (drill.veces_usado ?? 0) + 1 }).eq("id", id).then(() => {});
        }
      }
      const drillsCat = DRILLS_CATEGORIA[stationCat];
      if (drillsCat) {
        for (const idx of selectedAiIdx) {
          const drill = aiSuggestions[idx];
          if (drill) {
            supabase.from("drills").insert({
              titulo: drill.titulo, descripcion: drill.descripcion, categoria: drillsCat,
              duracion_minutos: drill.duracion_min, repeticiones: drill.repeticiones,
              aprobado: true, generado_por_ia: true,
            }).then(() => {});
          }
        }
      }
    }

    const fromLib = esFisico
      ? libraryEjercicios
          .filter((e) => selectedLibraryIds.has(e.id))
          .map((e) => ({ titulo: e.nombre, descripcion: e.instrucciones ?? "", series_repeticiones: e.series_repeticiones ?? null }))
      : libraryDrills
          .filter((d) => selectedLibraryIds.has(d.id))
          .map((d) => ({ titulo: d.titulo, descripcion: d.descripcion }));
    const fromAI = aiSuggestions
      .filter((_, i) => selectedAiIdx.has(i))
      .map((d) => ({ titulo: d.titulo, descripcion: d.descripcion }));

    const nuevaEstacion: EstacionEdit = {
      categoria: stationCat,
      objetivo: aiFoco,
      lugar: lugarEstacion,
      juego_competitivo: aiJuego,
      drills: [...fromLib, ...fromAI],
    };
    const siguiente = stationIndex + 1;
    const todas = [...estacionesEdit, nuevaEstacion];
    setEstacionesEdit(todas);

    if (siguiente < categorias.length) {
      setStationIndex(siguiente);
      fetchParaEstacion(siguiente);
    } else {
      setMode("preview");
    }
  }

  async function handleSave() {
    if (estacionesEdit.length === 0) return;
    setSaving(true); setError(null);
    try {
      // Con 1 sola categoría, tipo_sesion/objetivo/drills top-level quedan
      // igual que antes (fila simple). Con más de una, tipo_sesion pasa a ser
      // el genérico "competencia" y el resumen combinado queda solo como
      // fallback para vistas que no conocen estaciones_competencia — el
      // detalle real (lugar/foco/drills/reto por categoría) vive ahí, sin
      // mezclarse.
      const tipoSesionPayload = esMultiple ? "competencia" : estacionesEdit[0].categoria;
      const objetivoPayload = esMultiple
        ? estacionesEdit
            .map((e) => `${CATEGORIAS.find((c) => c.value === e.categoria)?.label}: ${e.drills.map((d) => d.titulo).join(", ")}`)
            .join(" · ")
        : estacionesEdit[0].objetivo;
      const juegoPayload = estacionesEdit.map((e) => e.juego_competitivo).filter(Boolean).join(" · ") || null;
      const drillsPayload = esMultiple ? [] : estacionesEdit[0].drills.map((d) => ({ titulo: d.titulo, descripcion: d.descripcion }));
      const lugarPayload = estacionesEdit[0].lugar;

      const payload = {
        plan_id: planId, dia_semana: dia, fecha,
        tipo_sesion: tipoSesionPayload,
        lugar: lugarPayload,
        hora_inicio: horaInicio || null,
        hora_fin:    horaFin    || null,
        objetivo:    objetivoPayload,
        drills:      drillsPayload,
        juego_competitivo: juegoPayload,
        estaciones_damas: null, sesion_juvenil: null, notas: null,
        estaciones_competencia: estacionesEdit.map((e) => ({
          categoria: e.categoria,
          objetivo: e.objetivo,
          lugar: e.lugar,
          juego_competitivo: e.juego_competitivo || null,
          drills: e.drills.map((d) => ({ titulo: d.titulo, descripcion: d.descripcion, series_repeticiones: d.series_repeticiones ?? null })),
        })),
      };

      if (sesionExistente) {
        const { error: e } = await supabase.from("sesiones_semana").update(payload).eq("id", sesionExistente.id);
        if (e) throw new Error(e.message);
      } else {
        await supabase.from("sesiones_semana").delete().eq("plan_id", planId).eq("fecha", fecha);
        const { error: e } = await supabase.from("sesiones_semana").insert(payload);
        if (e) throw new Error(e.message);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally { setSaving(false); }
  }

  const stationInfo = CATEGORIAS.find((c) => c.value === stationCat);

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={() => { if (!saving) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-6" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Competencia · {diaLabel}</p>
            <p className="text-sm font-bold text-gray-900">
              {mode === "categoria"       ? "Elige la categoría del día"
                : mode === "enfoque_fisico" ? "¿Qué enfoque físico?"
                : mode === "seleccion"      ? (esMultiple
                    ? `Estación ${stationIndex + 1} de ${categorias.length} — ${stationInfo?.icon} ${stationInfo?.label}`
                    : `${stationInfo?.icon} ${stationInfo?.label} — Seleccionar drills`)
                : "Revisa y guarda"}
            </p>
          </div>
          <button onClick={() => { if (!saving) onClose(); }} disabled={saving} className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* ── Categoría (multi-selección) ── */}
        {mode === "categoria" && (
          <div className="px-5 py-5 space-y-4">
            <p className="text-xs text-gray-500 -mt-1">Puedes combinar más de una — cada una queda como su propia estación, ej. Juego corto + Trabajo físico.</p>
            <div className="grid grid-cols-2 gap-3">
              {CATEGORIAS.map((cat) => {
                const sel = categorias.includes(cat.value);
                return (
                  <button
                    key={cat.value}
                    onClick={() => toggleCategoria(cat.value)}
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                      sel ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-blue-300 hover:bg-blue-50"
                    }`}
                  >
                    <span className="text-2xl">{cat.icon}</span>
                    <span className="text-sm font-semibold text-gray-800 flex-1">{cat.label}</span>
                    <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                      sel ? "border-blue-500 bg-blue-500" : "border-gray-300 bg-white"
                    }`}>
                      {sel && (
                        <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <button
              onClick={handleContinuarDesdeCategorias}
              disabled={categorias.length === 0}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:brightness-110 transition-all"
              style={{ background: ACCENT }}
            >
              {categorias.length === 0 ? "Elige al menos 1 categoría" : `Continuar (${categorias.length})`}
            </button>
          </div>
        )}

        {/* ── Enfoque físico (solo si se eligió Trabajo físico) ── */}
        {mode === "enfoque_fisico" && (
          <div className="px-5 py-5 space-y-4">
            <p className="text-xs text-gray-500 -mt-1">
              Trabajo físico es una estación de ejercicios de entrenamiento — distinta de Test físico, que es la evaluación de protocolos TPI. Elige la cualidad a trabajar (puedes marcar varias).
            </p>
            <div className="flex flex-wrap gap-2">
              {ENFOQUE_FISICO_OPCIONES.map((op) => {
                const sel = enfoqueFisico.includes(op);
                return (
                  <button
                    key={op}
                    onClick={() => toggleEnfoqueFisico(op)}
                    className="text-xs font-medium px-3 py-1.5 rounded-full border transition-all"
                    style={sel ? { background: ACCENT, color: "#fff", borderColor: ACCENT } : { color: "#6b7280", borderColor: "#e5e7eb", background: "#fff" }}
                  >
                    {op}
                  </button>
                );
              })}
            </div>
            {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setMode("categoria")}
                className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                ← Atrás
              </button>
              <button
                onClick={handleContinuarCategorias}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white hover:brightness-110 transition-all"
                style={{ background: ACCENT }}
              >
                {enfoqueFisico.length === 0 ? "Continuar (enfoque general)" : `Continuar (${enfoqueFisico.length})`}
              </button>
            </div>
          </div>
        )}

        {/* ── Selección de drills/ejercicios de la estación en curso ── */}
        {mode === "seleccion" && (
          <>
            <div className="px-5 py-5 space-y-6 max-h-[72vh] overflow-y-auto">

              {/* Lugar de esta estación */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">Lugar de esta estación</label>
                <select
                  value={lugarEstacion}
                  onChange={(e) => setLugarEstacion(e.target.value as Lugar)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {(Object.keys(LUGAR_LABEL) as Lugar[]).map((l) => (
                    <option key={l} value={l}>{LUGAR_LABEL[l]}</option>
                  ))}
                </select>
              </div>

              {/* SECCIÓN A: Biblioteca (drills técnicos o ejercicios_fisicos) */}
              <div>
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                  A · {esFisico ? "Elegir ejercicios de la biblioteca" : "Elegir de la biblioteca"}
                  {selectedLibraryIds.size > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: ACCENT }}>
                      {selectedLibraryIds.size}
                    </span>
                  )}
                </p>

                {loadingLibrary ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400 py-3">
                    <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Cargando biblioteca...
                  </div>
                ) : esFisico ? (
                  libraryEjercicios.length === 0 ? (
                    <p className="text-xs text-gray-400 italic py-2 px-1">
                      No hay ejercicios físicos para Competencia aún en la biblioteca.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {libraryEjercicios.map((ej) => {
                        const sel = selectedLibraryIds.has(ej.id);
                        return (
                          <button
                            key={ej.id}
                            onClick={() => toggleLibrary(ej.id)}
                            className={`w-full text-left rounded-xl border-2 p-3 transition-all flex items-start gap-3 ${
                              sel ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300 bg-gray-50"
                            }`}
                          >
                            <div className={`w-4 h-4 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all ${
                              sel ? "border-blue-500 bg-blue-500" : "border-gray-300 bg-white"
                            }`}>
                              {sel && (
                                <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900">{ej.nombre}</p>
                              {ej.instrucciones && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{ej.instrucciones}</p>}
                              <div className="flex items-center gap-3 mt-1 flex-wrap">
                                {ej.series_repeticiones && (
                                  <span className="text-[10px] text-blue-600 font-medium">{ej.series_repeticiones}</span>
                                )}
                                {ej.screen_vinculado && (
                                  <span className="text-[10px] text-gray-400">🎯 {ej.screen_vinculado}</span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )
                ) : libraryDrills.length === 0 ? (
                  <p className="text-xs text-gray-400 italic py-2 px-1">
                    No hay drills en esta categoría aún. Los drills de IA que uses se guardarán en la biblioteca.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {libraryDrills.map((drill) => {
                      const sel = selectedLibraryIds.has(drill.id);
                      return (
                        <button
                          key={drill.id}
                          onClick={() => toggleLibrary(drill.id)}
                          className={`w-full text-left rounded-xl border-2 p-3 transition-all flex items-start gap-3 ${
                            sel ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300 bg-gray-50"
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all ${
                            sel ? "border-blue-500 bg-blue-500" : "border-gray-300 bg-white"
                          }`}>
                            {sel && (
                              <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-gray-900">{drill.titulo}</p>
                              <StarRating rating={drill.rating} />
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{drill.descripcion}</p>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              {drill.posicion_swing && drill.posicion_swing.length > 0 && (
                                <span className="text-[10px] text-blue-600 font-medium">{drill.posicion_swing.join(" · ")}</span>
                              )}
                              {drill.duracion_minutos && (
                                <span className="text-[10px] text-gray-400">{drill.duracion_minutos} min</span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* SECCIÓN B: Sugerencias IA */}
              <div>
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                  B · Sugerencias nuevas con IA
                  {selectedAiIdx.size > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: ACCENT }}>
                      {selectedAiIdx.size}
                    </span>
                  )}
                </p>

                {!loadingAI && aiFailed && (
                  <div className="flex items-center justify-between gap-2 mb-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                    <p className="text-xs text-amber-700">No se generaron sugerencias para {stationInfo?.label}.</p>
                    <button
                      onClick={() => fetchAISuggestion(stationCat)}
                      className="text-xs font-semibold text-amber-800 hover:underline whitespace-nowrap shrink-0"
                    >
                      🔄 Reintentar
                    </button>
                  </div>
                )}

                {loadingAI ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400 py-3">
                    <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Generando sugerencias con IA... (5–10 seg)
                  </div>
                ) : aiSuggestions.length === 0 ? (
                  !error && !aiFailed && <p className="text-xs text-gray-400 italic py-2 px-1">No se generaron sugerencias.</p>
                ) : (
                  <div className="space-y-2">
                    {aiSuggestions.map((drill, idx) => {
                      const sel = selectedAiIdx.has(idx);
                      return (
                        <button
                          key={idx}
                          onClick={() => toggleAI(idx)}
                          className={`w-full text-left rounded-xl border-2 p-3 transition-all flex items-start gap-3 ${
                            sel ? "border-purple-400 bg-purple-50" : "border-gray-200 hover:border-gray-300 bg-gray-50"
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all ${
                            sel ? "border-purple-500 bg-purple-500" : "border-gray-300 bg-white"
                          }`}>
                            {sel && (
                              <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-gray-900">{drill.titulo}</p>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">IA</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{drill.descripcion}</p>
                            <div className="flex items-center gap-3 mt-1">
                              {drill.duracion_min > 0 && (
                                <span className="text-[10px] text-gray-400">{drill.duracion_min} min</span>
                              )}
                              {sel && (
                                <span className="text-[10px] text-purple-600 font-medium">Se guardará en la biblioteca</span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>

            <div className="px-5 pb-5 flex gap-2 border-t border-gray-100 pt-4">
              <button
                onClick={() => { setMode("categoria"); setCategorias([]); setEnfoqueFisico([]); }}
                className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                ← Atrás
              </button>
              <button
                onClick={handleContinuarEstacion}
                disabled={totalSelected === 0}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:brightness-110 transition-all"
                style={{ background: ACCENT }}
              >
                {totalSelected === 0
                  ? loadingAI ? "Cargando sugerencias..." : "Selecciona al menos 1"
                  : stationIndex + 1 < categorias.length
                    ? `Continuar a Estación ${stationIndex + 2} →`
                    : `Revisar sesión (${estacionesEdit.length + 1} estación${estacionesEdit.length + 1 > 1 ? "es" : ""}) →`}
              </button>
            </div>
          </>
        )}

        {/* ── Preview editable ── */}
        {mode === "preview" && (
          <>
            <div className="px-5 py-5 space-y-4 max-h-[70vh] overflow-y-auto">

              {/* Cabecera día */}
              <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                <span className="font-semibold text-gray-700">
                  {diaLabel} · {new Date(fecha + "T00:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long" })}
                </span>
                {horaInicio && <span>· {horaInicio}–{horaFin}</span>}
                <span className="ml-auto flex flex-wrap gap-1 justify-end">
                  {catInfos.map((c) => (
                    <span key={c.value} className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                      {c.icon} {c.label}
                    </span>
                  ))}
                </span>
              </div>

              {/* Una estación por categoría — lugar, foco, drills y reto quedan separados */}
              <div className="space-y-4">
                {estacionesEdit.map((est, eIdx) => {
                  const info = CATEGORIAS.find((c) => c.value === est.categoria);
                  return (
                    <div key={est.categoria} className="border border-blue-100 rounded-xl p-3 bg-blue-50/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-blue-800 flex items-center gap-1.5">
                          {info?.icon} Estación {eIdx + 1} — {info?.label}
                        </p>
                        {eIdx === 0 && (
                          <button
                            onClick={() => { setStationIndex(0); setEstacionesEdit([]); setMode("seleccion"); fetchParaEstacion(0); }}
                            className="text-[10px] font-medium text-blue-500 hover:underline"
                          >
                            ← Cambiar selección
                          </button>
                        )}
                      </div>

                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">Lugar de esta estación</label>
                        <select
                          value={est.lugar}
                          onChange={(e) => setEstacionesEdit((prev) => prev.map((x, i) => i === eIdx ? { ...x, lugar: e.target.value as Lugar } : x))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                        >
                          {(Object.keys(LUGAR_LABEL) as Lugar[]).map((l) => (
                            <option key={l} value={l}>{LUGAR_LABEL[l]}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">Foco de la estación</label>
                        <input
                          value={est.objetivo}
                          onChange={(e) => setEstacionesEdit((prev) => prev.map((x, i) => i === eIdx ? { ...x, objetivo: e.target.value } : x))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block">
                          {est.categoria === "trabajo_fisico" ? "Ejercicios" : "Drills"} ({est.drills.length})
                        </label>
                        {est.drills.map((drill, dIdx) => (
                          <div key={dIdx} className="border border-gray-100 rounded-xl p-3 bg-white space-y-2">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                                style={{ background: ACCENT }}
                              >
                                {dIdx + 1}
                              </div>
                              <input
                                value={drill.titulo}
                                onChange={(e) => setEstacionesEdit((prev) => prev.map((x, i) => i === eIdx ? { ...x, drills: x.drills.map((d, j) => j === dIdx ? { ...d, titulo: e.target.value } : d) } : x))}
                                className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-blue-200 bg-white"
                              />
                              <button
                                onClick={() => setEstacionesEdit((prev) => prev.map((x, i) => i === eIdx ? { ...x, drills: x.drills.filter((_, j) => j !== dIdx) } : x))}
                                className="text-gray-300 hover:text-red-400 transition-colors"
                              >
                                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
                              </button>
                            </div>
                            <textarea
                              value={drill.descripcion}
                              onChange={(e) => setEstacionesEdit((prev) => prev.map((x, i) => i === eIdx ? { ...x, drills: x.drills.map((d, j) => j === dIdx ? { ...d, descripcion: e.target.value } : d) } : x))}
                              rows={2}
                              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-200 bg-white resize-none"
                            />
                            {drill.series_repeticiones && (
                              <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                                {drill.series_repeticiones}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">
                          Reto de la estación{" "}
                          <span className="font-normal text-gray-400 normal-case">(opcional)</span>
                        </label>
                        <input
                          value={est.juego_competitivo}
                          onChange={(e) => setEstacionesEdit((prev) => prev.map((x, i) => i === eIdx ? { ...x, juego_competitivo: e.target.value } : x))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                          placeholder="Ej: 3 series con presión de puntos..."
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>

            <div className="px-5 pb-5 flex gap-2 border-t border-gray-100 pt-4">
              <button
                onClick={() => { setStationIndex(0); setEstacionesEdit([]); setMode("seleccion"); fetchParaEstacion(0); }}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                ← Atrás
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:brightness-110 transition-all"
                style={{ background: ACCENT }}
              >
                {saving ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Guardando...
                  </>
                ) : "✓ Guardar sesión"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
