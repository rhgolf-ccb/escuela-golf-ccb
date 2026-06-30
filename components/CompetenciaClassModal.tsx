"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type DiaSemana = "martes" | "miercoles" | "jueves" | "viernes" | "sabado" | "domingo";
type TipoSesion = "tiro_largo" | "juego_corto" | "putt" | "campo" | "test_tecnico" | "test_fisico";
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

interface DrillEdit { titulo: string; descripcion: string; duracion_min: number; repeticiones: string }
interface PreviewData { foco_principal: string; lugar: string; drills: DrillEdit[]; juego_competitivo: string }

const CATEGORIAS: { value: TipoSesion; icon: string; label: string }[] = [
  { value: "tiro_largo",   icon: "🏌️", label: "Tiro largo" },
  { value: "juego_corto",  icon: "⛳", label: "Juego corto" },
  { value: "putt",         icon: "🎯", label: "Putt" },
  { value: "campo",        icon: "🌿", label: "Campo" },
  { value: "test_tecnico", icon: "📋", label: "Test técnico" },
  { value: "test_fisico",  icon: "💪", label: "Test físico" },
];

const LUGAR_LABEL: Record<string, string> = {
  campo_practica:    "Campo de práctica",
  putting_green:     "Putting Green",
  campo_pacos_fabios: "Campo Pacos y Fabios",
  campo_infantil:    "Campo Infantil",
  campo_completo:    "Campo Completo",
};

const ACCENT = "#1e40af";

export default function CompetenciaClassModal({
  planId, dia, diaLabel, fecha, horaInicio, horaFin, sesionExistente, onClose, onSaved,
}: Props) {
  type Mode = "categoria" | "generando" | "preview";
  const [mode, setMode]       = useState<Mode>("categoria");
  const [categoria, setCategoria] = useState<TipoSesion | null>(null);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Editable preview fields
  const [focoEdit, setFocoEdit]     = useState("");
  const [lugarEdit, setLugarEdit]   = useState<Lugar>("campo_practica");
  const [drillsEdit, setDrillsEdit] = useState<DrillEdit[]>([]);
  const [juegoEdit, setJuegoEdit]   = useState("");

  const busy = saving || mode === "generando";

  async function handleSelectCategoria(cat: TipoSesion) {
    setCategoria(cat);
    setMode("generando");
    setError(null);
    try {
      const res = await fetch("/api/suggest-competencia-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoria: cat, dia_semana: dia }),
      });
      const data = await res.json() as Partial<PreviewData> & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Error IA");
      setFocoEdit(data.foco_principal ?? "");
      setLugarEdit((data.lugar ?? "campo_practica") as Lugar);
      setDrillsEdit((data.drills ?? []).slice(0, 3) as DrillEdit[]);
      setJuegoEdit(data.juego_competitivo ?? "");
      setMode("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
      setMode("categoria");
    }
  }

  function handleRegenerear() {
    setMode("categoria");
    setCategoria(null);
    setFocoEdit(""); setDrillsEdit([]); setJuegoEdit("");
    setError(null);
  }

  async function handleSave() {
    if (!categoria) return;
    setSaving(true); setError(null);
    try {
      const payload = {
        plan_id: planId, dia_semana: dia, fecha,
        tipo_sesion: categoria,
        lugar: lugarEdit,
        hora_inicio: horaInicio || null,
        hora_fin: horaFin || null,
        objetivo: focoEdit,
        drills: drillsEdit.map((d) => ({ titulo: d.titulo, descripcion: d.descripcion })),
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
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Competencia · {diaLabel}</p>
            <p className="text-sm font-bold text-gray-900">
              {mode === "categoria" ? "Elige la categoría del día" : mode === "generando" ? "Generando plan..." : "Revisa y guarda"}
            </p>
          </div>
          <button onClick={() => { if (!busy) onClose(); }} disabled={busy} className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* ── Modo: elegir categoría ── */}
        {mode === "categoria" && (
          <div className="px-5 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {CATEGORIAS.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => handleSelectCategoria(cat.value)}
                  className="flex items-center gap-3 p-4 rounded-xl border-2 border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-left transition-all"
                >
                  <span className="text-2xl">{cat.icon}</span>
                  <span className="text-sm font-semibold text-gray-800">{cat.label}</span>
                </button>
              ))}
            </div>
            {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          </div>
        )}

        {/* ── Modo: generando spinner ── */}
        {mode === "generando" && (
          <div className="flex flex-col items-center justify-center py-16 px-5 gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: ACCENT + "15" }}>
              <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24" style={{ color: ACCENT }}>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-800">Generando plan de sesión...</p>
            <p className="text-xs text-gray-400">5–10 segundos</p>
          </div>
        )}

        {/* ── Modo: preview editable ── */}
        {mode === "preview" && (
          <>
            <div className="px-5 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Cabecera día */}
              <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                <span className="font-semibold text-gray-700">{diaLabel} · {new Date(fecha + "T00:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long" })}</span>
                {horaInicio && <span>· {horaInicio}–{horaFin}</span>}
                <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                  {CATEGORIAS.find((c) => c.value === categoria)?.icon} {CATEGORIAS.find((c) => c.value === categoria)?.label}
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
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-2">Drills</label>
                <div className="space-y-3">
                  {drillsEdit.map((drill, i) => (
                    <div key={i} className="border border-gray-100 rounded-xl p-3 bg-gray-50 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ background: ACCENT }}>{i + 1}</div>
                        <input
                          value={drill.titulo}
                          onChange={(e) => setDrillsEdit((prev) => prev.map((d, j) => j === i ? { ...d, titulo: e.target.value } : d))}
                          className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-blue-200 bg-white"
                          placeholder="Título del drill"
                        />
                      </div>
                      <textarea
                        value={drill.descripcion}
                        onChange={(e) => setDrillsEdit((prev) => prev.map((d, j) => j === i ? { ...d, descripcion: e.target.value } : d))}
                        rows={2}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-200 bg-white resize-none"
                        placeholder="Descripción"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Juego competitivo */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">Juego / Reto final <span className="font-normal text-gray-400 normal-case">(opcional)</span></label>
                <input
                  value={juegoEdit}
                  onChange={(e) => setJuegoEdit(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="Ej: 3 series con presión de puntos..."
                />
              </div>

              {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 flex gap-2 border-t border-gray-100 pt-4">
              <button
                onClick={handleRegenerear}
                disabled={busy}
                className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                ← Regenerar
              </button>
              <button
                onClick={handleSave}
                disabled={busy}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:brightness-110 transition-all"
                style={{ background: ACCENT }}
              >
                {saving ? (
                  <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Guardando...</>
                ) : "✓ Guardar sesión"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
