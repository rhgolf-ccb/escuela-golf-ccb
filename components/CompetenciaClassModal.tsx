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
  posicion_swing: string[] | null;
  duracion_minutos: number | null;
  repeticiones: string | null;
  rating: number | null;
  veces_usado: number | null;
}

interface AIDrill {
  titulo: string;
  descripcion: string;
  duracion_min: number;
  repeticiones: string;
  categoriaOrigen: TipoSesion;
}

interface DrillEdit { titulo: string; descripcion: string }

const CATEGORIAS: { value: TipoSesion; icon: string; label: string }[] = [
  { value: "tiro_largo",     icon: "🏌️", label: "Tiro largo" },
  { value: "juego_corto",    icon: "⛳", label: "Juego corto" },
  { value: "putt",           icon: "🎯", label: "Putt" },
  { value: "campo",          icon: "🌿", label: "Campo" },
  { value: "test_tecnico",   icon: "📋", label: "Test técnico" },
  { value: "test_fisico",    icon: "🩺", label: "Test físico" },
  { value: "trabajo_fisico", icon: "💪", label: "Trabajo físico" },
];

// TipoSesion → drills table categoria column value
const DRILLS_CATEGORIA: Record<TipoSesion, string | null> = {
  tiro_largo:     "tecnico",
  juego_corto:    "juego_corto",
  putt:           "putting",
  campo:          "campo",
  test_tecnico:   "tecnico",
  test_fisico:    null,
  trabajo_fisico: null,
};

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
  const [categorias, setCategorias] = useState<TipoSesion[]>([]);
  const [enfoqueFisico, setEnfoqueFisico] = useState<string[]>([]);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Library drills
  const [libraryDrills, setLibraryDrills]         = useState<LibraryDrill[]>([]);
  const [loadingLibrary, setLoadingLibrary]        = useState(false);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<Set<string>>(new Set());

  // AI suggestions
  const [aiDrills, setAiDrills]                   = useState<AIDrill[]>([]);
  const [loadingAI, setLoadingAI]                  = useState(false);
  const [selectedAiIdx, setSelectedAiIdx]          = useState<Set<number>>(new Set());
  const [aiMeta, setAiMeta]                        = useState<{ foco: string; lugar: string; juego: string } | null>(null);

  // Preview editable
  const [focoEdit, setFocoEdit]       = useState("");
  const [lugarEdit, setLugarEdit]     = useState<Lugar>("campo_practica");
  const [drillsEdit, setDrillsEdit]   = useState<DrillEdit[]>([]);
  const [juegoEdit, setJuegoEdit]     = useState("");

  const totalSelected = selectedLibraryIds.size + selectedAiIdx.size;
  const catInfos = CATEGORIAS.filter((c) => categorias.includes(c.value));

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

  async function handleContinuarCategorias() {
    if (categorias.length === 0) return;
    setMode("seleccion");
    setError(null);
    setSelectedLibraryIds(new Set());
    setSelectedAiIdx(new Set());
    setLibraryDrills([]);
    setAiDrills([]);
    setAiMeta(null);

    const drillsCats = Array.from(new Set(categorias.map((cat) => DRILLS_CATEGORIA[cat]).filter((c): c is string => !!c)));

    // Fetch library drills y sugerencias de IA (una por categoría elegida) en paralelo
    const libraryPromise = drillsCats.length
      ? (async () => {
          setLoadingLibrary(true);
          const { data } = await supabase
            .from("drills")
            .select("id, titulo, descripcion, posicion_swing, duracion_minutos, repeticiones, rating, veces_usado")
            .in("categoria", drillsCats)
            .eq("aprobado", true)
            .order("rating", { ascending: false })
            .limit(20);
          setLibraryDrills((data as LibraryDrill[]) ?? []);
          setLoadingLibrary(false);
        })()
      : Promise.resolve();

    const aiPromise = (async () => {
      setLoadingAI(true);
      try {
        const resultados = await Promise.all(
          categorias.map(async (cat) => {
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
              drills?: Omit<AIDrill, "categoriaOrigen">[]; juego_competitivo?: string; error?: string;
            };
            if (!res.ok) throw new Error(data.error ?? "Error IA");
            return { cat, data };
          })
        );
        const catInfo = (cat: TipoSesion) => CATEGORIAS.find((c) => c.value === cat);
        setAiMeta({
          foco: resultados.map(({ cat, data }) => `${catInfo(cat)?.label}: ${data.foco_principal ?? ""}`).join(" · "),
          lugar: resultados[0]?.data.lugar ?? "campo_practica",
          juego: resultados.map(({ data }) => data.juego_competitivo).filter(Boolean).join(" · "),
        });
        setAiDrills(
          resultados.flatMap(({ cat, data }) => (data.drills ?? []).slice(0, 3).map((d) => ({ ...d, categoriaOrigen: cat })))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error de conexión con IA");
      } finally {
        setLoadingAI(false);
      }
    })();

    await Promise.all([libraryPromise, aiPromise]);
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

  function handleGoPreview() {
    const fromLib = libraryDrills
      .filter((d) => selectedLibraryIds.has(d.id))
      .map((d) => ({ titulo: d.titulo, descripcion: d.descripcion }));
    const fromAI = aiDrills
      .filter((_, i) => selectedAiIdx.has(i))
      .map((d) => ({ titulo: d.titulo, descripcion: d.descripcion }));
    setFocoEdit(aiMeta?.foco ?? "");
    setLugarEdit((aiMeta?.lugar ?? "campo_practica") as Lugar);
    setJuegoEdit(aiMeta?.juego ?? "");
    setDrillsEdit([...fromLib, ...fromAI]);
    setMode("preview");
  }

  async function handleSave() {
    if (categorias.length === 0) return;
    setSaving(true); setError(null);
    try {
      // Increment veces_usado for library drills (fire-and-forget)
      for (const id of selectedLibraryIds) {
        const drill = libraryDrills.find((d) => d.id === id);
        if (drill) {
          supabase.from("drills")
            .update({ veces_usado: (drill.veces_usado ?? 0) + 1 })
            .eq("id", id)
            .then(() => {});
        }
      }

      // Insert AI drills into library with aprobado=true (fire-and-forget) —
      // cada sugerencia usa la categoría de la que realmente salió, no una fija,
      // porque ahora se puede combinar más de una categoría en la misma sesión.
      for (const idx of selectedAiIdx) {
        const drill = aiDrills[idx];
        const drillsCat = drill ? DRILLS_CATEGORIA[drill.categoriaOrigen] : null;
        if (drill && drillsCat) {
          supabase.from("drills").insert({
            titulo:          drill.titulo,
            descripcion:     drill.descripcion,
            categoria:       drillsCat,
            duracion_minutos: drill.duracion_min,
            repeticiones:    drill.repeticiones,
            aprobado:        true,
            generado_por_ia: true,
          }).then(() => {});
        }
      }

      const payload = {
        plan_id: planId, dia_semana: dia, fecha,
        tipo_sesion: categorias[0],
        lugar: lugarEdit,
        hora_inicio: horaInicio || null,
        hora_fin:    horaFin    || null,
        objetivo:    focoEdit,
        drills:      drillsEdit.map((d) => ({ titulo: d.titulo, descripcion: d.descripcion })),
        juego_competitivo: juegoEdit || null,
        estaciones_damas: null, sesion_juvenil: null, notas: null,
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
                : mode === "seleccion"     ? `${catInfos.map((c) => `${c.icon} ${c.label}`).join(" + ")} — Seleccionar drills`
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
            <p className="text-xs text-gray-500 -mt-1">Puedes combinar más de una — por ejemplo Tiro largo + Test físico.</p>
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

        {/* ── Selección de drills ── */}
        {mode === "seleccion" && (
          <>
            <div className="px-5 py-5 space-y-6 max-h-[72vh] overflow-y-auto">

              {/* SECCIÓN A: Biblioteca */}
              <div>
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                  A · Elegir de la biblioteca
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

                {loadingAI ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400 py-3">
                    <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Generando sugerencias con IA... (5–10 seg)
                  </div>
                ) : aiDrills.length === 0 ? (
                  !error && <p className="text-xs text-gray-400 italic py-2 px-1">No se generaron sugerencias.</p>
                ) : (
                  <div className="space-y-2">
                    {aiDrills.map((drill, idx) => {
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
                              {categorias.length > 1 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                                  {CATEGORIAS.find((c) => c.value === drill.categoriaOrigen)?.icon} {CATEGORIAS.find((c) => c.value === drill.categoriaOrigen)?.label}
                                </span>
                              )}
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
                onClick={handleGoPreview}
                disabled={totalSelected === 0}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:brightness-110 transition-all"
                style={{ background: ACCENT }}
              >
                {totalSelected === 0
                  ? loadingAI ? "Cargando sugerencias..." : "Selecciona al menos 1 drill"
                  : `Revisar sesión (${totalSelected} drill${totalSelected > 1 ? "s" : ""}) →`}
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

              {/* Foco */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">Foco de la sesión</label>
                <input
                  value={focoEdit}
                  onChange={(e) => setFocoEdit(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              {/* Lugar */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">Lugar</label>
                <select
                  value={lugarEdit}
                  onChange={(e) => setLugarEdit(e.target.value as Lugar)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                >
                  {(Object.keys(LUGAR_LABEL) as Lugar[]).map((l) => (
                    <option key={l} value={l}>{LUGAR_LABEL[l]}</option>
                  ))}
                </select>
              </div>

              {/* Drills */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                    Drills seleccionados ({drillsEdit.length})
                  </label>
                  <button
                    onClick={() => setMode("seleccion")}
                    className="text-[10px] font-medium text-blue-500 hover:underline"
                  >
                    ← Cambiar selección
                  </button>
                </div>
                <div className="space-y-3">
                  {drillsEdit.map((drill, i) => (
                    <div key={i} className="border border-gray-100 rounded-xl p-3 bg-gray-50 space-y-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                          style={{ background: ACCENT }}
                        >
                          {i + 1}
                        </div>
                        <input
                          value={drill.titulo}
                          onChange={(e) => setDrillsEdit((prev) => prev.map((d, j) => j === i ? { ...d, titulo: e.target.value } : d))}
                          className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-blue-200 bg-white"
                        />
                        <button
                          onClick={() => setDrillsEdit((prev) => prev.filter((_, j) => j !== i))}
                          className="text-gray-300 hover:text-red-400 transition-colors"
                        >
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
                        </button>
                      </div>
                      <textarea
                        value={drill.descripcion}
                        onChange={(e) => setDrillsEdit((prev) => prev.map((d, j) => j === i ? { ...d, descripcion: e.target.value } : d))}
                        rows={2}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-200 bg-white resize-none"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Juego competitivo */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">
                  Juego / Reto final{" "}
                  <span className="font-normal text-gray-400 normal-case">(opcional)</span>
                </label>
                <input
                  value={juegoEdit}
                  onChange={(e) => setJuegoEdit(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="Ej: 3 series con presión de puntos..."
                />
              </div>

              {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>

            <div className="px-5 pb-5 flex gap-2 border-t border-gray-100 pt-4">
              <button
                onClick={() => setMode("seleccion")}
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
