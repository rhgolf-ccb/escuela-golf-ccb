"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatWhatsAppMessage, openWhatsApp } from "@/lib/whatsapp-formatter";
import { TIPO_PLAN_LABEL, toISODate, type TipoPlan, type EstacionLibre, type DrillLibre } from "./ProgramacionModule";

const GRUPOS: TipoPlan[] = ["juvenil", "competencia", "damas"];
const COLOR = "#b45309";

function emptyEstacion(): EstacionLibre {
  return { nombre: "", lugar: "", horario: "", drills: [] };
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

function buildActividadMarkdown(nombre: string, fecha: string, grupos: TipoPlan[], estaciones: EstacionLibre[], notas: string): string {
  const fechaFmt = fecha ? new Date(fecha + "T00:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" }) : "";
  const lines: string[] = [
    `## Grupos participantes`,
    grupos.map((g) => TIPO_PLAN_LABEL[g]).join(", ") || "Sin especificar",
    ``,
  ];
  estaciones.forEach((est) => {
    const meta = [est.horario, est.lugar].filter(Boolean).join(" · ");
    lines.push(`### ${est.nombre}${meta ? ` — ${meta}` : ""}`);
    est.drills.forEach((d) => lines.push(`- **${d.titulo}**: ${d.descripcion}`));
    lines.push("");
  });
  if (notas.trim()) {
    lines.push(`## Notas adicionales`, notas.trim());
  }
  return [`# ${nombre}${fechaFmt ? ` — ${fechaFmt}` : ""}`, ...lines].join("\n");
}

export default function ActividadEspecialModal({
  fechaSugerida, gruposSugeridos, onClose, onCreated,
}: {
  fechaSugerida: string; gruposSugeridos: TipoPlan[]; onClose: () => void; onCreated: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [grupos, setGrupos] = useState<TipoPlan[]>(gruposSugeridos);
  const [fecha, setFecha] = useState(fechaSugerida);
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");
  const [estaciones, setEstaciones] = useState<EstacionLibre[]>([emptyEstacion()]);
  const [notas, setNotas] = useState("");

  const [descripcionPaco, setDescripcionPaco] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggleGrupo(g: TipoPlan) {
    setGrupos((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  function updateEstacion(idx: number, patch: Partial<EstacionLibre>) {
    setEstaciones((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }
  function addEstacion() {
    setEstaciones((prev) => [...prev, emptyEstacion()]);
  }
  function removeEstacion(idx: number) {
    setEstaciones((prev) => prev.filter((_, i) => i !== idx));
  }
  function addDrill(estIdx: number) {
    setEstaciones((prev) => prev.map((e, i) => (i === estIdx ? { ...e, drills: [...e.drills, { titulo: "", descripcion: "" }] } : e)));
  }
  function updateDrill(estIdx: number, drillIdx: number, patch: Partial<DrillLibre>) {
    setEstaciones((prev) => prev.map((e, i) => (i === estIdx ? { ...e, drills: e.drills.map((d, j) => (j === drillIdx ? { ...d, ...patch } : d)) } : e)));
  }
  function removeDrill(estIdx: number, drillIdx: number) {
    setEstaciones((prev) => prev.map((e, i) => (i === estIdx ? { ...e, drills: e.drills.filter((_, j) => j !== drillIdx) } : e)));
  }

  async function handleGenerarConPaco() {
    if (!descripcionPaco.trim()) {
      setGenerateError("Describe qué quieres hacer en esta actividad.");
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    try {
      const drillsCtx = await buildDrillsContext();
      const res = await fetch("/api/actividad-especial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descripcion: descripcionPaco.trim(), grupos, fecha, drills_ctx: drillsCtx }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al generar la actividad");
      setNombre(data.nombre ?? "");
      setEstaciones(
        (data.estaciones ?? []).map((e: Partial<EstacionLibre>) => ({
          nombre: e.nombre ?? "", lugar: e.lugar ?? "", horario: e.horario ?? "",
          drills: (e.drills ?? []).map((d: Partial<DrillLibre>) => ({ titulo: d.titulo ?? "", descripcion: d.descripcion ?? "" })),
        }))
      );
      if (data.notas) setNotas(data.notas);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Error al generar la actividad");
    }
    setGenerating(false);
  }

  async function handleGuardar() {
    if (!nombre.trim()) { setSaveError("Ponle un nombre a la actividad."); return; }
    if (!fecha) { setSaveError("Selecciona una fecha."); return; }
    if (grupos.length === 0) { setSaveError("Selecciona al menos un grupo participante."); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const { error } = await supabase.from("actividades_especiales").insert({
        nombre: nombre.trim(),
        grupos,
        fecha,
        hora_inicio: horaInicio || null,
        hora_fin: horaFin || null,
        estaciones,
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

  function handlePdf() {
    import("@/lib/pdf-generator").then(({ generateCCBPdf }) => {
      generateCCBPdf(buildActividadMarkdown(nombre, fecha, grupos, estaciones, notas), {
        documentName: `${nombre}${fecha ? ` — ${new Date(fecha + "T00:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}` : ""}`,
        filenamePrefix: `Actividad-especial-${fecha || toISODate(new Date())}`,
      });
    });
  }

  function handleWhatsApp() {
    openWhatsApp(formatWhatsAppMessage(buildActividadMarkdown(nombre, fecha, grupos, estaciones, notas), "actividad_especial", nombre));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.45)" }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex flex-col w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 shrink-0" style={{ backgroundColor: COLOR }}>
          <p className="text-sm font-semibold text-white">Nueva actividad especial 🌟</p>
          <button onClick={onClose} aria-label="Cerrar" className="text-white/70 hover:text-white p-1">
            <i className="ti ti-x" style={{ fontSize: 18 }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Generar con Paco */}
          <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: "#fef3e2" }}>
            <p className="text-xs font-semibold" style={{ color: COLOR }}>Generar con Paco 🦅</p>
            <textarea
              value={descripcionPaco}
              onChange={(e) => setDescripcionPaco(e.target.value)}
              rows={2}
              placeholder="Ej: Torneo interno para Competencia y Albatros el sábado en la mañana, con 3 estaciones"
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none resize-none bg-white"
            />
            {generateError && <p className="text-xs text-red-600">{generateError}</p>}
            <button
              onClick={handleGenerarConPaco}
              disabled={generating}
              className="text-sm font-semibold text-white px-4 py-1.5 rounded-lg disabled:opacity-50"
              style={{ backgroundColor: COLOR }}
            >
              {generating ? "Generando..." : "Generar plan"}
            </button>
          </div>

          {/* Datos generales */}
          <div className="space-y-2">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la actividad (ej: Torneo interno)"
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
            <div className="flex flex-wrap gap-2">
              {GRUPOS.map((g) => (
                <button key={g} onClick={() => toggleGrupo(g)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full border"
                  style={grupos.includes(g) ? { backgroundColor: COLOR, color: "#fff", borderColor: COLOR } : { color: "#6b7280", borderColor: "#e5e7eb" }}>
                  {TIPO_PLAN_LABEL[g]}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200" />
              <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="text-sm px-3 py-2 rounded-lg border border-gray-200" />
              <input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className="text-sm px-3 py-2 rounded-lg border border-gray-200" />
            </div>
          </div>

          {/* Estaciones */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500">Estaciones</p>
              <button onClick={addEstacion} className="text-xs text-blue-600 hover:underline">+ Agregar estación</button>
            </div>
            {estaciones.map((est, ei) => (
              <div key={ei} className="border border-gray-100 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input value={est.nombre} onChange={(e) => updateEstacion(ei, { nombre: e.target.value })} placeholder="Nombre de la estación"
                    className="flex-1 text-sm font-medium border border-gray-200 rounded px-2 py-1" />
                  <button onClick={() => removeEstacion(ei)} className="text-gray-300 hover:text-red-500 shrink-0">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="flex gap-2">
                  <input value={est.lugar} onChange={(e) => updateEstacion(ei, { lugar: e.target.value })} placeholder="Lugar"
                    className="flex-1 text-xs border border-gray-200 rounded px-2 py-1" />
                  <input value={est.horario} onChange={(e) => updateEstacion(ei, { horario: e.target.value })} placeholder="Horario (ej: 30 min)"
                    className="flex-1 text-xs border border-gray-200 rounded px-2 py-1" />
                </div>
                <div className="space-y-1.5 pl-2 border-l-2" style={{ borderColor: "#fde4c2" }}>
                  {est.drills.map((d, di) => (
                    <div key={di} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <input value={d.titulo} onChange={(e) => updateDrill(ei, di, { titulo: e.target.value })} placeholder="Título del drill"
                          className="flex-1 text-xs font-medium border border-gray-200 rounded px-2 py-1" />
                        <button onClick={() => removeDrill(ei, di)} className="text-gray-300 hover:text-red-500 shrink-0">
                          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12" /></svg>
                        </button>
                      </div>
                      <textarea value={d.descripcion} onChange={(e) => updateDrill(ei, di, { descripcion: e.target.value })} rows={2} placeholder="Descripción"
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1 resize-none" />
                    </div>
                  ))}
                  <button onClick={() => addDrill(ei)} className="text-xs text-blue-600 hover:underline">+ Agregar drill</button>
                </div>
              </div>
            ))}
          </div>

          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} placeholder="Notas adicionales (opcional)"
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none" />
        </div>

        <div className="px-5 py-4 border-t border-gray-100 shrink-0 space-y-2">
          {saveError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{saveError}</p>}
          {!saved ? (
            <button onClick={handleGuardar} disabled={saving}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: COLOR }}>
              {saving ? "Guardando..." : "Guardar actividad especial"}
            </button>
          ) : (
            <>
              <p className="text-xs text-center font-medium" style={{ color: COLOR }}>Actividad especial creada ✓</p>
              <div className="flex gap-2">
                <button onClick={handlePdf} className="flex-1 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1.5">
                  <i className="ti ti-file-type-pdf" style={{ fontSize: 16 }} /> Descargar PDF
                </button>
                <button onClick={handleWhatsApp} className="flex-1 py-2 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-1.5" style={{ backgroundColor: "#25D366" }}>
                  <i className="ti ti-brand-whatsapp" style={{ fontSize: 16 }} /> WhatsApp
                </button>
              </div>
              <button onClick={onClose} className="w-full py-2 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50">Cerrar</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
