"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatWhatsAppMessage, openWhatsApp } from "@/lib/whatsapp-formatter";
import {
  TIPO_PLAN_LABEL, CATEGORIA_ESTACION_LABEL, toISODate, esEstacionEstructurada,
  type TipoPlan, type EstacionLibre, type DrillLibre, type EstacionEstructurada,
  type JuegoEstructurado, type Calentamiento, type Replicas, type ReplicaTurno,
  type EjercicioCalentamiento, type CategoriaEstacionEspecial,
} from "./ProgramacionModule";
import { TIPOS_PLAN } from "@/lib/grupos";

const GRUPOS: TipoPlan[] = TIPOS_PLAN;
const COLOR = "#b45309";
const CATEGORIAS: CategoriaEstacionEspecial[] = ["juego_largo", "juego_corto", "putt"];

type TipoEstructura = "estaciones" | "libre";
type Plantilla = { id: string; nombre: string; tipo_estructura: TipoEstructura; calentamiento: Calentamiento | null; estaciones: (EstacionLibre | EstacionEstructurada)[] };

function emptyEstacionLibre(): EstacionLibre {
  return { nombre: "", lugar: "", horario: "", drills: [] };
}
function emptyJuego(): JuegoEstructurado {
  return { nombre: "", objetivo_pedagogico: "", materiales: "", instrucciones_profesor: "", explicacion_ninos: "", reglas: [] };
}
function addMinutes(hhmm: string, min: number): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + min;
  const hh = Math.floor(((total % 1440) + 1440) % 1440 / 60);
  const mm = ((total % 60) + 60) % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
function formatHora12(hhmm: string): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}
function turnoLabel(t: ReplicaTurno, idx: number): string {
  return `Turno ${idx + 1} — ${t.nombre_grupo || "Sin nombre"} (${formatHora12(t.hora_inicio)})`;
}

async function buildDrillsContext(): Promise<string> {
  const { data } = await supabase.from("drills").select("titulo, categoria").eq("aprobado", true).order("categoria").limit(150);
  if (!data || data.length === 0) return "";
  const porCategoria = new Map<string, string[]>();
  for (const d of data) {
    const list = porCategoria.get(d.categoria) ?? [];
    list.push(d.titulo);
    porCategoria.set(d.categoria, list);
  }
  return Array.from(porCategoria.entries()).map(([cat, titulos]) => `${cat}: ${titulos.join(", ")}`).join("\n");
}

function buildCronogramaLines(inicio: string, calentamiento: Calentamiento | null, estaciones: (EstacionLibre | EstacionEstructurada)[]): string[] {
  let cursor = inicio;
  const lines: string[] = [];
  if (calentamiento?.incluye) {
    lines.push(`- **${cursor}–${addMinutes(cursor, calentamiento.duracion_min)} · Calentamiento**`);
    calentamiento.ejercicios.forEach((ej) => lines.push(`  - ${ej.nombre} (${ej.duracion_min} min): ${ej.descripcion}`));
    cursor = addMinutes(cursor, calentamiento.duracion_min);
  }
  estaciones.forEach((est) => {
    if (esEstacionEstructurada(est)) {
      const fin = addMinutes(cursor, est.duracion_min);
      lines.push(`- **${cursor}–${fin} · ${CATEGORIA_ESTACION_LABEL[est.categoria]}** — ${est.juego.nombre}`);
      cursor = fin;
    } else {
      lines.push(`- **${est.nombre}**${est.horario ? ` (${est.horario})` : ""}${est.lugar ? ` · ${est.lugar}` : ""}`);
    }
  });
  return lines;
}

function buildMarkdown(params: {
  nombre: string; fecha: string; grupos: TipoPlan[]; horaInicio: string;
  tipoEstructura: TipoEstructura; calentamiento: Calentamiento | null; replicas: Replicas | null;
  estaciones: (EstacionLibre | EstacionEstructurada)[]; notas: string;
}): string {
  const { nombre, fecha, grupos, horaInicio, calentamiento, replicas, estaciones, notas } = params;
  const fechaFmt = fecha ? new Date(`${fecha}T00:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" }) : "";
  const gruposLine = grupos.map((g) => TIPO_PLAN_LABEL[g]).join(", ") || "Sin especificar";
  const lines: string[] = [`## Grupos participantes`, gruposLine, ``];

  if (replicas && replicas.turnos.length > 0) {
    lines.push(`## Cronograma por turno`);
    replicas.turnos.forEach((t, ti) => {
      lines.push(`### ${turnoLabel(t, ti)}`);
      lines.push(...buildCronogramaLines(t.hora_inicio, calentamiento, estaciones));
      lines.push("");
    });
  } else {
    lines.push(`## Cronograma`);
    lines.push(...buildCronogramaLines(horaInicio, calentamiento, estaciones));
    lines.push("");
  }

  lines.push(`## Detalle por estación`);
  estaciones.forEach((est) => {
    if (esEstacionEstructurada(est)) {
      lines.push(`### ${CATEGORIA_ESTACION_LABEL[est.categoria]} — ${est.juego.nombre} (${est.duracion_min} min)`);
      lines.push(`**Objetivo pedagógico:** ${est.juego.objetivo_pedagogico}`);
      lines.push(`**Materiales:** ${est.juego.materiales}`);
      lines.push(`**Instrucciones para el profesor:** ${est.juego.instrucciones_profesor}`);
      lines.push(`**Cómo explicárselo a los niños:** ${est.juego.explicacion_ninos}`);
      est.juego.reglas.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
    } else {
      const meta = [est.horario, est.lugar].filter(Boolean).join(" · ");
      lines.push(`### ${est.nombre}${meta ? ` — ${meta}` : ""}`);
      est.drills.forEach((d) => lines.push(`- **${d.titulo}**: ${d.descripcion}`));
    }
    lines.push("");
  });

  if (notas.trim()) lines.push(`## Notas logísticas`, notas.trim());

  return [`# ${nombre}${fechaFmt ? ` — ${fechaFmt}` : ""}`, ...lines].join("\n");
}

export default function ActividadEspecialWizard({
  fechaSugerida, gruposSugeridos, onClose, onCreated,
}: {
  fechaSugerida: string; gruposSugeridos: TipoPlan[]; onClose: () => void; onCreated: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [tipoEstructura, setTipoEstructura] = useState<TipoEstructura | null>(null);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);

  // Paso 2
  const [nombre, setNombre] = useState("");
  const [grupos, setGrupos] = useState<TipoPlan[]>(gruposSugeridos);
  const [fecha, setFecha] = useState(fechaSugerida);
  const [horaInicio, setHoraInicio] = useState("09:00");
  const [duracionTotal, setDuracionTotal] = useState(60);
  const [seReplica, setSeReplica] = useState(false);
  const [turnos, setTurnos] = useState<ReplicaTurno[]>([]);

  // Paso 3
  const [calentIncluye, setCalentIncluye] = useState(true);
  const [calentDuracion, setCalentDuracion] = useState(10);
  const [calentEjercicios, setCalentEjercicios] = useState<EjercicioCalentamiento[]>([]);
  const [loadingCalent, setLoadingCalent] = useState(false);
  const [numEstaciones, setNumEstaciones] = useState(3);
  const [categoriasEstaciones, setCategoriasEstaciones] = useState<CategoriaEstacionEspecial[]>(["juego_largo", "juego_corto", "putt"]);
  const [duracionesEstaciones, setDuracionesEstaciones] = useState<number[]>([15, 15, 15]);

  // Paso 4 — opciones IA por estación
  const [opcionesPorEstacion, setOpcionesPorEstacion] = useState<(JuegoEstructurado[] | null)[]>([null, null, null]);
  const [loadingOpciones, setLoadingOpciones] = useState<number | null>(null);
  const [elegidoPorEstacion, setElegidoPorEstacion] = useState<(JuegoEstructurado | null)[]>([null, null, null]);
  const [editandoIdx, setEditandoIdx] = useState<number | null>(null);

  // Estaciones libres (tipo "libre")
  const [estacionesLibres, setEstacionesLibres] = useState<EstacionLibre[]>([emptyEstacionLibre()]);
  const [descripcionPaco, setDescripcionPaco] = useState("");
  const [generandoLibre, setGenerandoLibre] = useState(false);
  const [generarLibreError, setGenerarLibreError] = useState<string | null>(null);

  // Paso 5
  const [notas, setNotas] = useState("");

  // Paso 6
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [savingPlantilla, setSavingPlantilla] = useState(false);
  const [plantillaMsg, setPlantillaMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("actividad_especial_plantillas").select("*").order("created_at", { ascending: false }).limit(10)
      .then(({ data }) => setPlantillas((data as Plantilla[]) ?? []));
  }, []);

  function toggleGrupo(g: TipoPlan) {
    setGrupos((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  function toggleReplica(checked: boolean) {
    setSeReplica(checked);
    if (checked && turnos.length === 0) {
      setTurnos([{ hora_inicio: horaInicio, nombre_grupo: "" }, { hora_inicio: addMinutes(horaInicio, duracionTotal), nombre_grupo: "" }]);
    }
  }
  function addTurno() {
    setTurnos((prev) => [...prev, { hora_inicio: addMinutes(prev[prev.length - 1]?.hora_inicio ?? horaInicio, duracionTotal), nombre_grupo: "" }]);
  }
  function updateTurno(idx: number, patch: Partial<ReplicaTurno>) {
    setTurnos((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }
  function removeTurno(idx: number) {
    setTurnos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function fetchCalentamiento() {
    setLoadingCalent(true);
    try {
      const res = await fetch("/api/actividad-especial-calentamiento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grupos, duracion_min: calentDuracion }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al generar el calentamiento");
      setCalentEjercicios(data.ejercicios as EjercicioCalentamiento[]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al generar el calentamiento");
    }
    setLoadingCalent(false);
  }

  function updateEjercicioCalent(idx: number, patch: Partial<EjercicioCalentamiento>) {
    setCalentEjercicios((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }
  function removeEjercicioCalent(idx: number) {
    setCalentEjercicios((prev) => prev.filter((_, i) => i !== idx));
  }

  function setNumEstacionesTo(n: number) {
    setNumEstaciones(n);
    setCategoriasEstaciones((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? CATEGORIAS[i % 3]));
    setDuracionesEstaciones((prev) => {
      const restante = Math.max(duracionTotal - (calentIncluye ? calentDuracion : 0), n * 5);
      const base = Math.floor(restante / n);
      return Array.from({ length: n }, (_, i) => prev[i] ?? base);
    });
    setOpcionesPorEstacion(Array.from({ length: n }, (_, i) => opcionesPorEstacion[i] ?? null));
    setElegidoPorEstacion(Array.from({ length: n }, (_, i) => elegidoPorEstacion[i] ?? null));
  }

  async function fetchOpciones(idx: number, evitar: string[] = []) {
    setLoadingOpciones(idx);
    try {
      const res = await fetch("/api/actividad-especial-juego", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoria: categoriasEstaciones[idx], grupos, duracion_min: duracionesEstaciones[idx], evitar }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al generar opciones");
      setOpcionesPorEstacion((prev) => prev.map((o, i) => (i === idx ? (data.opciones as JuegoEstructurado[]) : o)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al generar opciones");
    }
    setLoadingOpciones(null);
  }

  function handlePedirOtras(idx: number) {
    const evitar = (opcionesPorEstacion[idx] ?? []).map((o) => o.nombre);
    fetchOpciones(idx, evitar);
  }

  function elegirOpcion(idx: number, juego: JuegoEstructurado) {
    setElegidoPorEstacion((prev) => prev.map((e, i) => (i === idx ? juego : e)));
  }

  function actualizarElegido(idx: number, patch: Partial<JuegoEstructurado>) {
    setElegidoPorEstacion((prev) => prev.map((e, i) => (i === idx && e ? { ...e, ...patch } : e)));
  }

  // ── Estaciones libres helpers ──────────────────────────────────────────
  function updateEstLibre(idx: number, patch: Partial<EstacionLibre>) {
    setEstacionesLibres((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }
  function addEstLibre() { setEstacionesLibres((prev) => [...prev, emptyEstacionLibre()]); }
  function removeEstLibre(idx: number) { setEstacionesLibres((prev) => prev.filter((_, i) => i !== idx)); }
  function addDrillLibre(idx: number) {
    setEstacionesLibres((prev) => prev.map((e, i) => (i === idx ? { ...e, drills: [...e.drills, { titulo: "", descripcion: "" }] } : e)));
  }
  function updateDrillLibre(idx: number, di: number, patch: Partial<DrillLibre>) {
    setEstacionesLibres((prev) => prev.map((e, i) => (i === idx ? { ...e, drills: e.drills.map((d, j) => (j === di ? { ...d, ...patch } : d)) } : e)));
  }
  function removeDrillLibre(idx: number, di: number) {
    setEstacionesLibres((prev) => prev.map((e, i) => (i === idx ? { ...e, drills: e.drills.filter((_, j) => j !== di) } : e)));
  }

  async function handleGenerarLibre() {
    if (!descripcionPaco.trim()) { setGenerarLibreError("Describe qué quieres hacer en esta actividad."); return; }
    setGenerandoLibre(true);
    setGenerarLibreError(null);
    try {
      const drillsCtx = await buildDrillsContext();
      const res = await fetch("/api/actividad-especial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descripcion: descripcionPaco.trim(), grupos, fecha, drills_ctx: drillsCtx }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al generar la actividad");
      if (data.nombre) setNombre(data.nombre);
      setEstacionesLibres(
        (data.estaciones ?? []).map((e: Partial<EstacionLibre>) => ({
          nombre: e.nombre ?? "", lugar: e.lugar ?? "", horario: e.horario ?? "",
          drills: (e.drills ?? []).map((d: Partial<DrillLibre>) => ({ titulo: d.titulo ?? "", descripcion: d.descripcion ?? "" })),
        }))
      );
      if (data.notas) setNotas(data.notas);
    } catch (err) {
      setGenerarLibreError(err instanceof Error ? err.message : "Error al generar la actividad");
    }
    setGenerandoLibre(false);
  }

  function aplicarPlantilla(p: Plantilla) {
    setTipoEstructura(p.tipo_estructura);
    if (p.tipo_estructura === "estaciones") {
      const estructuradas = p.estaciones.filter(esEstacionEstructurada) as EstacionEstructurada[];
      setNumEstaciones(estructuradas.length || 1);
      setCategoriasEstaciones(estructuradas.map((e) => e.categoria));
      setDuracionesEstaciones(estructuradas.map((e) => e.duracion_min));
      setElegidoPorEstacion(estructuradas.map((e) => e.juego));
      setOpcionesPorEstacion(estructuradas.map(() => null));
      if (p.calentamiento) {
        setCalentIncluye(p.calentamiento.incluye);
        setCalentDuracion(p.calentamiento.duracion_min);
        setCalentEjercicios(p.calentamiento.ejercicios ?? []);
      }
      setStep(5);
    } else {
      setEstacionesLibres(p.estaciones.filter((e) => !esEstacionEstructurada(e)) as EstacionLibre[]);
      setStep(5);
    }
    if (p.nombre) setNombre(p.nombre);
  }

  const estacionesFinal: (EstacionLibre | EstacionEstructurada)[] = tipoEstructura === "estaciones"
    ? categoriasEstaciones.map((cat, i) => ({ categoria: cat, duracion_min: duracionesEstaciones[i], juego: elegidoPorEstacion[i] ?? emptyJuego() }))
    : estacionesLibres;

  const calentamientoFinal: Calentamiento | null = tipoEstructura === "estaciones"
    ? { incluye: calentIncluye, duracion_min: calentDuracion, ejercicios: calentIncluye ? calentEjercicios : [] }
    : null;

  const replicasFinal: Replicas | null = seReplica && turnos.length > 0 ? { turnos } : null;

  const horaFin = addMinutes(horaInicio, duracionTotal);

  async function handlePublicar() {
    if (!nombre.trim()) { setSaveError("Ponle un nombre a la actividad."); return; }
    if (!fecha) { setSaveError("Selecciona una fecha."); return; }
    if (grupos.length === 0) { setSaveError("Selecciona al menos un grupo participante."); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const { error } = await supabase.from("actividades_especiales").insert({
        nombre: nombre.trim(), grupos, fecha,
        hora_inicio: horaInicio || null, hora_fin: horaFin || null,
        tipo_estructura: tipoEstructura ?? "libre",
        estaciones: estacionesFinal,
        calentamiento: calentamientoFinal,
        replicas: replicasFinal,
        notas: notas.trim() || null,
      });
      if (error) throw new Error(error.message);
      setSaved(true);
      onCreated();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Error al guardar la actividad");
    }
    setSaving(false);
  }

  async function handleGuardarPlantilla() {
    setSavingPlantilla(true);
    setPlantillaMsg(null);
    try {
      const { error } = await supabase.from("actividad_especial_plantillas").insert({
        nombre: nombre.trim() || "Plantilla sin nombre",
        tipo_estructura: tipoEstructura ?? "libre",
        calentamiento: calentamientoFinal,
        estaciones: estacionesFinal,
      });
      if (error) throw new Error(error.message);
      setPlantillaMsg("Plantilla guardada ✓");
    } catch (err) {
      setPlantillaMsg(err instanceof Error ? err.message : "Error al guardar la plantilla");
    }
    setSavingPlantilla(false);
  }

  function handlePdf() {
    import("@/lib/pdf-generator").then(({ generateCCBPdf }) => {
      generateCCBPdf(
        buildMarkdown({ nombre, fecha, grupos, horaInicio, tipoEstructura: tipoEstructura ?? "libre", calentamiento: calentamientoFinal, replicas: replicasFinal, estaciones: estacionesFinal, notas }),
        {
          documentName: `${nombre}${fecha ? ` — ${new Date(`${fecha}T00:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}` : ""}`,
          filenamePrefix: `Actividad-especial-${fecha || toISODate(new Date())}`,
        }
      );
    });
  }

  function handleWhatsApp() {
    openWhatsApp(formatWhatsAppMessage(
      buildMarkdown({ nombre, fecha, grupos, horaInicio, tipoEstructura: tipoEstructura ?? "libre", calentamiento: calentamientoFinal, replicas: replicasFinal, estaciones: estacionesFinal, notas }),
      "actividad_especial", nombre
    ));
  }

  const todasEstacionesListas = tipoEstructura !== "estaciones" || elegidoPorEstacion.slice(0, numEstaciones).every((e) => e && e.nombre.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.45)" }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex flex-col w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 shrink-0" style={{ backgroundColor: COLOR }}>
          <div>
            <p className="text-sm font-semibold text-white">Actividad especial 🌟</p>
            <p className="text-[11px] text-white/70">Paso {step} de 6</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-white/70 hover:text-white p-1">
            <i className="ti ti-x" style={{ fontSize: 18 }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Paso 1 */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">¿Qué tipo de actividad especial es?</p>
              <button onClick={() => { setTipoEstructura("estaciones"); setStep(2); }}
                className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Como día de escuela con modificaciones <span className="block text-xs text-gray-400 font-normal mt-0.5">Tiene estructura de estaciones (calentamiento + estaciones de juego)</span>
              </button>
              <button onClick={() => { setTipoEstructura("libre"); setStep(2); }}
                className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Formato completamente libre <span className="block text-xs text-gray-400 font-normal mt-0.5">Torneo, festival, evaluación — tú defines la estructura</span>
              </button>
              {plantillas.length > 0 && (
                <div className="pt-2">
                  <p className="text-xs text-gray-400 mb-1.5">O usa una plantilla guardada:</p>
                  <div className="flex flex-wrap gap-2">
                    {plantillas.map((p) => (
                      <button key={p.id} onClick={() => aplicarPlantilla(p)} className="text-xs font-medium px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50">
                        {p.nombre}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Paso 2 */}
          {step === 2 && (
            <div className="space-y-3">
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la actividad (ej: Summer Camp Golf)"
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200" />
              <div>
                <p className="text-xs text-gray-500 mb-1.5">Grupos participantes</p>
                <div className="flex flex-wrap gap-2">
                  {GRUPOS.map((g) => (
                    <button key={g} onClick={() => toggleGrupo(g)} className="text-xs font-semibold px-3 py-1.5 rounded-full border"
                      style={grupos.includes(g) ? { backgroundColor: COLOR, color: "#fff", borderColor: COLOR } : { color: "#6b7280", borderColor: "#e5e7eb" }}>
                      {TIPO_PLAN_LABEL[g]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200" />
                <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="text-sm px-3 py-2 rounded-lg border border-gray-200" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Duración total (min)</label>
                <input type="number" min={10} value={duracionTotal} onChange={(e) => setDuracionTotal(Number(e.target.value) || 0)} className="w-20 text-sm px-2 py-1.5 rounded-lg border border-gray-200" />
                <span className="text-xs text-gray-400">termina {horaFin}</span>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={seReplica} onChange={(e) => toggleReplica(e.target.checked)} />
                ¿El mismo plan se ejecuta con grupos diferentes en horarios distintos el mismo día?
              </label>
              {seReplica && (
                <div className="pl-6 space-y-2">
                  {turnos.map((t, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="time" value={t.hora_inicio} onChange={(e) => updateTurno(i, { hora_inicio: e.target.value })} className="text-sm px-2 py-1.5 rounded-lg border border-gray-200" />
                      <input value={t.nombre_grupo} onChange={(e) => updateTurno(i, { nombre_grupo: e.target.value })} placeholder="Nombre del grupo (ej: Átomos)" className="flex-1 text-sm px-2 py-1.5 rounded-lg border border-gray-200" />
                      <button onClick={() => removeTurno(i)} className="text-gray-300 hover:text-red-500 shrink-0">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                  <button onClick={addTurno} className="text-xs text-blue-600 hover:underline">+ Agregar turno</button>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button onClick={() => setStep(1)} className="flex-1 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Atrás</button>
                <button
                  onClick={() => setStep(tipoEstructura === "estaciones" ? 3 : 5)}
                  disabled={!nombre.trim() || grupos.length === 0}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: COLOR }}
                >
                  Continuar
                </button>
              </div>
            </div>
          )}

          {/* Paso 3 — solo estructura de estaciones */}
          {step === 3 && tipoEstructura === "estaciones" && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={calentIncluye} onChange={(e) => setCalentIncluye(e.target.checked)} />
                ¿Incluye calentamiento activo con juego?
              </label>
              {calentIncluye && (
                <div className="pl-6 space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500">Duración (min)</label>
                    <input type="number" min={5} value={calentDuracion} onChange={(e) => setCalentDuracion(Number(e.target.value) || 10)} className="w-16 text-sm px-2 py-1.5 rounded-lg border border-gray-200" />
                    <button onClick={fetchCalentamiento} disabled={loadingCalent} className="text-xs text-blue-600 hover:underline disabled:opacity-50">
                      {loadingCalent ? "Generando..." : calentEjercicios.length > 0 ? "Regenerar con Paco" : "Generar con Paco"}
                    </button>
                  </div>
                  {calentEjercicios.length > 0 && (
                    <div className="space-y-1.5">
                      {calentEjercicios.map((ej, i) => (
                        <div key={i} className="border border-gray-100 rounded-lg p-2 space-y-1">
                          <div className="flex items-center gap-2">
                            <input value={ej.nombre} onChange={(e) => updateEjercicioCalent(i, { nombre: e.target.value })} className="flex-1 text-xs font-medium px-2 py-1 rounded border border-gray-200" />
                            <input type="number" min={1} value={ej.duracion_min} onChange={(e) => updateEjercicioCalent(i, { duracion_min: Number(e.target.value) || 1 })} className="w-14 text-xs px-2 py-1 rounded border border-gray-200" />
                            <span className="text-[10px] text-gray-400">min</span>
                            <button onClick={() => removeEjercicioCalent(i)} className="text-gray-300 hover:text-red-500 shrink-0">
                              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12" /></svg>
                            </button>
                          </div>
                          <textarea value={ej.descripcion} onChange={(e) => updateEjercicioCalent(i, { descripcion: e.target.value })} rows={1} className="w-full text-xs px-2 py-1 rounded border border-gray-200 resize-none" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div>
                <p className="text-xs text-gray-500 mb-1.5">Número de estaciones</p>
                <div className="flex gap-2">
                  {[1, 2, 3].map((n) => (
                    <button key={n} onClick={() => setNumEstacionesTo(n)} className="w-10 h-10 rounded-lg text-sm font-semibold border"
                      style={numEstaciones === n ? { backgroundColor: COLOR, color: "#fff", borderColor: COLOR } : { color: "#6b7280", borderColor: "#e5e7eb" }}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                {Array.from({ length: numEstaciones }, (_, i) => (
                  <div key={i} className="border border-gray-100 rounded-lg p-3 flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-500 w-16">Estación {i + 1}</span>
                    <div className="flex gap-1.5 flex-1">
                      {CATEGORIAS.map((c) => (
                        <button key={c} onClick={() => setCategoriasEstaciones((prev) => prev.map((x, j) => (j === i ? c : x)))}
                          className="text-xs font-medium px-2 py-1 rounded-full border"
                          style={categoriasEstaciones[i] === c ? { backgroundColor: COLOR, color: "#fff", borderColor: COLOR } : { color: "#6b7280", borderColor: "#e5e7eb" }}>
                          {CATEGORIA_ESTACION_LABEL[c]}
                        </button>
                      ))}
                    </div>
                    <input type="number" min={5} value={duracionesEstaciones[i] ?? 15}
                      onChange={(e) => setDuracionesEstaciones((prev) => prev.map((x, j) => (j === i ? Number(e.target.value) || 0 : x)))}
                      className="w-16 text-xs px-2 py-1.5 rounded-lg border border-gray-200" />
                    <span className="text-[10px] text-gray-400">min</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setStep(2)} className="flex-1 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Atrás</button>
                <button onClick={() => setStep(4)} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: COLOR }}>Continuar</button>
              </div>
            </div>
          )}

          {/* Paso 4 — opciones de Paco por estación */}
          {step === 4 && tipoEstructura === "estaciones" && (
            <div className="space-y-4">
              {Array.from({ length: numEstaciones }, (_, i) => i).map((i) => (
                <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-800">Estación {i + 1} — {CATEGORIA_ESTACION_LABEL[categoriasEstaciones[i]]} ({duracionesEstaciones[i]} min)</p>
                    <button onClick={() => fetchOpciones(i)} disabled={loadingOpciones === i} className="text-xs text-blue-600 hover:underline disabled:opacity-50">
                      {loadingOpciones === i ? "Generando..." : opcionesPorEstacion[i] ? "Otras opciones" : "Generar con Paco"}
                    </button>
                  </div>

                  {elegidoPorEstacion[i] && editandoIdx !== i ? (
                    <div className="rounded-lg p-2.5" style={{ background: "#fef3e2" }}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-800">✓ {elegidoPorEstacion[i]!.nombre}</p>
                        <button onClick={() => setEditandoIdx(i)} className="text-xs text-blue-600 hover:underline">Editar</button>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">{elegidoPorEstacion[i]!.objetivo_pedagogico}</p>
                    </div>
                  ) : elegidoPorEstacion[i] && editandoIdx === i ? (
                    <div className="space-y-1.5 border border-gray-200 rounded-lg p-2.5">
                      <input value={elegidoPorEstacion[i]!.nombre} onChange={(e) => actualizarElegido(i, { nombre: e.target.value })} placeholder="Nombre del juego" className="w-full text-xs font-medium px-2 py-1 rounded border border-gray-200" />
                      <textarea value={elegidoPorEstacion[i]!.objetivo_pedagogico} onChange={(e) => actualizarElegido(i, { objetivo_pedagogico: e.target.value })} rows={2} placeholder="Objetivo pedagógico" className="w-full text-xs px-2 py-1 rounded border border-gray-200 resize-none" />
                      <textarea value={elegidoPorEstacion[i]!.materiales} onChange={(e) => actualizarElegido(i, { materiales: e.target.value })} rows={1} placeholder="Materiales" className="w-full text-xs px-2 py-1 rounded border border-gray-200 resize-none" />
                      <textarea value={elegidoPorEstacion[i]!.instrucciones_profesor} onChange={(e) => actualizarElegido(i, { instrucciones_profesor: e.target.value })} rows={2} placeholder="Instrucciones para el profesor" className="w-full text-xs px-2 py-1 rounded border border-gray-200 resize-none" />
                      <textarea value={elegidoPorEstacion[i]!.explicacion_ninos} onChange={(e) => actualizarElegido(i, { explicacion_ninos: e.target.value })} rows={2} placeholder="Cómo explicárselo a los niños" className="w-full text-xs px-2 py-1 rounded border border-gray-200 resize-none" />
                      <button onClick={() => setEditandoIdx(null)} className="text-xs text-blue-600 hover:underline">Listo</button>
                    </div>
                  ) : opcionesPorEstacion[i] ? (
                    <div className="space-y-1.5">
                      {opcionesPorEstacion[i]!.map((op, oi) => (
                        <button key={oi} onClick={() => elegirOpcion(i, op)} className="w-full text-left border border-gray-200 rounded-lg p-2 hover:bg-gray-50">
                          <p className="text-xs font-semibold text-gray-800">{op.nombre}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">{op.objetivo_pedagogico}</p>
                        </button>
                      ))}
                      <button onClick={() => handlePedirOtras(i)} disabled={loadingOpciones === i} className="text-xs text-blue-600 hover:underline disabled:opacity-50">Pedir otras opciones</button>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">Aún no se han generado opciones para esta estación.</p>
                  )}
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <button onClick={() => setStep(3)} className="flex-1 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Atrás</button>
                <button onClick={() => setStep(5)} disabled={!todasEstacionesListas} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: COLOR }}>Continuar</button>
              </div>
            </div>
          )}

          {/* Paso 5 — plan armado / preview */}
          {step === 5 && (
            <div className="space-y-3">
              {tipoEstructura === "libre" && (
                <>
                  <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: "#fef3e2" }}>
                    <p className="text-xs font-semibold" style={{ color: COLOR }}>Generar con Paco 🦅</p>
                    <textarea value={descripcionPaco} onChange={(e) => setDescripcionPaco(e.target.value)} rows={2}
                      placeholder="Ej: Torneo interno para Competencia y Albatros, con 3 estaciones"
                      className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 resize-none bg-white" />
                    {generarLibreError && <p className="text-xs text-red-600">{generarLibreError}</p>}
                    <button onClick={handleGenerarLibre} disabled={generandoLibre} className="text-sm font-semibold text-white px-4 py-1.5 rounded-lg disabled:opacity-50" style={{ backgroundColor: COLOR }}>
                      {generandoLibre ? "Generando..." : "Generar plan"}
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-500">Estaciones</p>
                      <button onClick={addEstLibre} className="text-xs text-blue-600 hover:underline">+ Agregar estación</button>
                    </div>
                    {estacionesLibres.map((est, ei) => (
                      <div key={ei} className="border border-gray-100 rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <input value={est.nombre} onChange={(e) => updateEstLibre(ei, { nombre: e.target.value })} placeholder="Nombre de la estación" className="flex-1 text-sm font-medium border border-gray-200 rounded px-2 py-1" />
                          <button onClick={() => removeEstLibre(ei)} className="text-gray-300 hover:text-red-500 shrink-0">
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12" /></svg>
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <input value={est.lugar} onChange={(e) => updateEstLibre(ei, { lugar: e.target.value })} placeholder="Lugar" className="flex-1 text-xs border border-gray-200 rounded px-2 py-1" />
                          <input value={est.horario} onChange={(e) => updateEstLibre(ei, { horario: e.target.value })} placeholder="Horario (ej: 30 min)" className="flex-1 text-xs border border-gray-200 rounded px-2 py-1" />
                        </div>
                        <div className="space-y-1.5 pl-2 border-l-2" style={{ borderColor: "#fde4c2" }}>
                          {est.drills.map((d, di) => (
                            <div key={di} className="space-y-1">
                              <div className="flex items-center gap-2">
                                <input value={d.titulo} onChange={(e) => updateDrillLibre(ei, di, { titulo: e.target.value })} placeholder="Título" className="flex-1 text-xs font-medium border border-gray-200 rounded px-2 py-1" />
                                <button onClick={() => removeDrillLibre(ei, di)} className="text-gray-300 hover:text-red-500 shrink-0">
                                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12" /></svg>
                                </button>
                              </div>
                              <textarea value={d.descripcion} onChange={(e) => updateDrillLibre(ei, di, { descripcion: e.target.value })} rows={2} placeholder="Descripción" className="w-full text-xs border border-gray-200 rounded px-2 py-1 resize-none" />
                            </div>
                          ))}
                          <button onClick={() => addDrillLibre(ei)} className="text-xs text-blue-600 hover:underline">+ Agregar drill</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {tipoEstructura === "estaciones" && (() => {
                function renderCronograma(inicio: string) {
                  let cursor = inicio;
                  const bloques: React.ReactNode[] = [];
                  if (calentIncluye) {
                    bloques.push(
                      <div key="calent" className="text-xs text-gray-600 border-l-2 pl-2" style={{ borderColor: COLOR }}>
                        {cursor}–{addMinutes(cursor, calentDuracion)} · Calentamiento
                      </div>
                    );
                    cursor = addMinutes(cursor, calentDuracion);
                  }
                  categoriasEstaciones.slice(0, numEstaciones).forEach((cat, i) => {
                    const ini = cursor;
                    const fin = addMinutes(cursor, duracionesEstaciones[i]);
                    cursor = fin;
                    bloques.push(
                      <div key={i} className="text-xs text-gray-600 border-l-2 pl-2" style={{ borderColor: COLOR }}>
                        {ini}–{fin} · {CATEGORIA_ESTACION_LABEL[cat]} — {elegidoPorEstacion[i]?.nombre}
                      </div>
                    );
                  });
                  return bloques;
                }

                return (
                  <div className="space-y-3">
                    {seReplica && turnos.length > 0 ? (
                      turnos.map((t, ti) => (
                        <div key={ti} className="space-y-1">
                          <p className="text-xs font-semibold text-gray-500">{turnoLabel(t, ti)}</p>
                          {renderCronograma(t.hora_inicio)}
                        </div>
                      ))
                    ) : (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-gray-500">Cronograma</p>
                        {renderCronograma(horaInicio)}
                      </div>
                    )}
                  </div>
                );
              })()}

              <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} placeholder="Notas logísticas (qué preparar antes, cómo organizar el espacio)"
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none" />

              <div className="flex gap-2 pt-2">
                <button onClick={() => setStep(tipoEstructura === "estaciones" ? 4 : 2)} className="flex-1 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Atrás</button>
                <button onClick={() => setStep(6)} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: COLOR }}>Continuar</button>
              </div>
            </div>
          )}

          {/* Paso 6 — opciones finales */}
          {step === 6 && (
            <div className="space-y-3">
              {saveError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{saveError}</p>}
              {!saved ? (
                <button onClick={handlePublicar} disabled={saving} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: COLOR }}>
                  {saving ? "Publicando..." : "Publicar en calendario"}
                </button>
              ) : (
                <>
                  <p className="text-xs text-center font-medium" style={{ color: COLOR }}>Actividad especial publicada ✓</p>
                  <div className="flex gap-2">
                    <button onClick={handlePdf} className="flex-1 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1.5">
                      <i className="ti ti-file-type-pdf" style={{ fontSize: 16 }} /> Descargar PDF
                    </button>
                    <button onClick={handleWhatsApp} className="flex-1 py-2 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-1.5" style={{ backgroundColor: "#25D366" }}>
                      <i className="ti ti-brand-whatsapp" style={{ fontSize: 16 }} /> WhatsApp
                    </button>
                  </div>
                </>
              )}
              <button onClick={handleGuardarPlantilla} disabled={savingPlantilla} className="w-full py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                {savingPlantilla ? "Guardando plantilla..." : "Guardar como plantilla para reusar"}
              </button>
              {plantillaMsg && <p className="text-xs text-center" style={{ color: COLOR }}>{plantillaMsg}</p>}
              {saved && <button onClick={onClose} className="w-full py-2 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50">Cerrar</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
