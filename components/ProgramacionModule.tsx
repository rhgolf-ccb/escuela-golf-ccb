"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import WeeklyPlanPDFTemplate from "./WeeklyPlanPDFTemplate";
import JuvenileClassModal, {
  type SesionJuvenilData,
  type SesionJuvenilLegacy,
  type SesionJuvenilEstaciones,
} from "./JuvenileClassModal";
import CompetenciaClassModal from "./CompetenciaClassModal";

// ── Types ─────────────────────────────────────────────────────────────────────
type TipoPlan   = "juvenil" | "competencia" | "damas";
type DiaSemana  = "martes" | "miercoles" | "jueves" | "viernes" | "sabado" | "domingo";
type TipoSesion = "tiro_largo" | "juego_corto" | "putt" | "campo" | "test_tecnico" | "test_fisico" | "competencia" | "damas_estaciones" | "juvenil_estaciones";
type Lugar      = "campo_practica" | "putting_green" | "campo_infantil" | "campo_pacos_fabios" | "campo_completo";
type ViewMode   = "plan" | "semana" | "mes";

interface Drill {
  titulo: string;
  descripcion: string;
  dificultad_birdies?: string | null;
  dificultad_aguilas?: string | null;
  dificultad_albatros?: string | null;
  dificultad_mas14?: string | null;
  metrica_exito?: string | null;
  variante_presion?: string | null;
  conexion_tecnica?: string | null;
  posicion_objetivo?: string | null;
  error_comun?: string | null;
  sensacion?: string | null;
  repeticiones?: string | null;
}

interface EstacionDamas { nombre: string; lugar: string; duracion_min: number; descripcion: string; }

interface OpcionActividad {
  id: number;
  titulo: string;
  descripcion_corta: string;
  descripcion?: string;
  justificacion: string;
  es_recomendada: boolean;
  recomendada?: boolean;
  drills: Drill[];
}

interface PlanSemanal {
  id: string; semana_inicio: string; tipo_plan: TipoPlan;
  tema_semanal: string; descripcion_tema: string; objetivo_mensual: string | null;
  foco_mes: string | null; created_at: string;
}

interface SesionSemana {
  id: string; plan_id: string; dia_semana: DiaSemana; fecha: string;
  tipo_sesion: TipoSesion; lugar: Lugar;
  hora_inicio: string | null; hora_fin: string | null;
  objetivo: string; drills: Drill[];
  juego_competitivo: string | null; estaciones_damas: EstacionDamas[] | null;
  notas: string | null; asistencia_registrada: boolean;
  sesion_juvenil?: SesionJuvenilData | null;
}

interface CalSesion extends SesionSemana { tipo_plan: TipoPlan; }

interface PreviewSesion {
  dia_semana: DiaSemana; fecha: string;
  tipo_sesion: TipoSesion; lugar: Lugar;
  hora_inicio: string; hora_fin: string;
  objetivo: string; drills: Drill[];
  juego_competitivo: string | null; estaciones_damas: EstacionDamas[] | null; notas: string | null;
  opciones_actividad?: OpcionActividad[] | null;
}

interface SesionForm {
  tipo_sesion: TipoSesion; lugar: Lugar;
  hora_inicio: string; hora_fin: string; objetivo: string;
  drills: Drill[]; juego_competitivo: string;
  estaciones_damas: EstacionDamas[]; notas: string;
}

interface HorarioDefecto { tipo_plan: TipoPlan; dia_semana: DiaSemana; hora_inicio: string; hora_fin: string; }

// ── Constants ─────────────────────────────────────────────────────────────────
const DIAS_POR_TIPO: Record<TipoPlan, DiaSemana[]> = {
  juvenil:     ["martes", "miercoles", "jueves", "sabado", "domingo"],
  competencia: ["martes", "miercoles", "jueves", "sabado"],
  damas:       ["viernes"],
};

const CAL_DIAS: DiaSemana[] = ["martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

const DIA_LABEL: Record<DiaSemana, string> = {
  martes: "Martes", miercoles: "Miércoles", jueves: "Jueves",
  viernes: "Viernes", sabado: "Sábado", domingo: "Domingo",
};
const DIA_LABEL_SHORT: Record<DiaSemana, string> = {
  martes: "Mar", miercoles: "Mié", jueves: "Jue",
  viernes: "Vie", sabado: "Sáb", domingo: "Dom",
};

const DIA_OFFSET: Record<DiaSemana, number> = {
  martes: 1, miercoles: 2, jueves: 3, viernes: 4, sabado: 5, domingo: 6,
};

const TIPO_SESION_LABEL: Record<TipoSesion, string> = {
  tiro_largo: "Tiro Largo", juego_corto: "Juego Corto", putt: "Putt",
  campo: "Campo", test_tecnico: "Test Técnico", test_fisico: "Test Físico",
  competencia: "Competencia", damas_estaciones: "Estaciones", juvenil_estaciones: "3 Estaciones",
};

const TIPO_SESION_COLOR: Record<TipoSesion, { bg: string; text: string }> = {
  tiro_largo:      { bg: "#dbeafe", text: "#1e40af" },
  juego_corto:     { bg: "#dcfce7", text: "#166534" },
  putt:            { bg: "#fef9c3", text: "#854d0e" },
  campo:           { bg: "#f0fdf4", text: "#15803d" },
  test_tecnico:    { bg: "#fce7f3", text: "#9d174d" },
  test_fisico:     { bg: "#ede9fe", text: "#6d28d9" },
  competencia:     { bg: "#fff7ed", text: "#9a3412" },
  damas_estaciones:    { bg: "#fdf2f8", text: "#86198f" },
  juvenil_estaciones:  { bg: "#f0faf2", text: "#1B4D2E" },
};

const LUGAR_LABEL: Record<Lugar, string> = {
  campo_practica: "Campo de práctica", putting_green: "Putting Green",
  campo_infantil: "Campo Infantil", campo_pacos_fabios: "Pacos/Fabios",
  campo_completo: "Campo Completo",
};

const TIPO_PLAN_LABEL: Record<TipoPlan, string> = {
  juvenil: "Juvenil", competencia: "Competencia", damas: "Damas",
};

const TIPO_PLAN_COLOR: Record<TipoPlan, string> = {
  juvenil: "#1B4D2E", competencia: "#1e40af", damas: "#86198f",
};

// Calendar event colours — dark solid backgrounds with white text
const CAL_COLOR: Record<TipoPlan, { bg: string; border: string; text: string; dot: string }> = {
  juvenil:     { bg: "#2d5a27", border: "#1a3a18", text: "#ffffff", dot: "#2d5a27" },
  competencia: { bg: "#b7950b", border: "#8a6f08", text: "#ffffff", dot: "#b7950b" },
  damas:       { bg: "#6a1b9a", border: "#4a1070", text: "#ffffff", dot: "#6a1b9a" },
};

const FOCOS_MES = [
  "Control de distancia", "Postura y setup", "Juego corto",
  "Putting", "Swing completo", "Preparación para torneo", "Evaluación general",
];

const TEMAS_CHIP: Record<TipoPlan, string[]> = {
  juvenil:     ["🏌️ Swing", "⛳ Juego corto", "🎯 Putt", "🌿 Campo", "🎮 Juego libre", "📋 Test técnico", "💪 Test físico"],
  competencia: ["Tiro largo", "Juego corto", "Putt", "Salida al campo", "Test técnico", "Test físico", "Competencia/Torneo"],
  damas:       ["Tiro largo", "Juego corto", "Putt", "Salida al campo", "Test técnico", "Test físico", "Competencia/Torneo"],
};

const GRUPOS_EVAL: Record<TipoPlan, string[]> = {
  juvenil: ["Birdies", "Águilas", "Albatros", "+14"],
  competencia: ["Competencia"],
  damas: ["Damas"],
};

// Day badge colors for Competencia preview
const COMP_DIA_BADGE: Partial<Record<DiaSemana, { bg: string; text: string }>> = {
  martes:    { bg: "#dcfce7", text: "#166534" },
  miercoles: { bg: "#dbeafe", text: "#1e40af" },
  jueves:    { bg: "#ede9fe", text: "#6d28d9" },
  sabado:    { bg: "#fef3c7", text: "#92400e" },
};

// Calendar grid constants
const CAL_HOUR_START = 7;
const CAL_HOUR_END   = 18;
const CAL_FULL_H     = 80;  // px for occupied hour rows
const CAL_THIN_H     = 16;  // px for collapsed empty-hour rows
const CAL_HOURS      = Array.from({ length: CAL_HOUR_END - CAL_HOUR_START }, (_, i) => CAL_HOUR_START + i);
// Event colors (dark/solid for contrast)
const CAL_EVENT: Record<string, { bg: string; text: string }> = {
  juvenil:     { bg: "#1a3a2a", text: "#ffffff" },
  competencia: { bg: "#7d5a00", text: "#ffffff" },
  damas:       { bg: "#4a1070", text: "#ffffff" },
};

// ── Date helpers ──────────────────────────────────────────────────────────────
function getMonday(d: Date): Date {
  const date = new Date(d); const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  date.setHours(0, 0, 0, 0); return date;
}
function toISODate(d: Date): string { return d.toISOString().split("T")[0]; }
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function getFechaForDia(monday: Date, dia: DiaSemana): string { return toISODate(addDays(monday, DIA_OFFSET[dia])); }
function formatWeekRange(monday: Date): string {
  const dom = addDays(monday, 6);
  return `${monday.toLocaleDateString("es-CO", { day: "numeric", month: "long" })} — ${dom.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}`;
}
function formatDiaFecha(fecha: string): string {
  return new Date(fecha + "T00:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}
function formatHora(t: string | null): string { return t ? t.slice(0, 5) : ""; }

// Calendar helpers
function fmtCalHour(h: number): string {
  if (h === 12) return "12p";
  return h > 12 ? `${h - 12}p` : `${h}a`;
}
function getMesRange(mesCal: Date): { start: Date; end: Date } {
  const first = new Date(mesCal.getFullYear(), mesCal.getMonth(), 1);
  const last  = new Date(mesCal.getFullYear(), mesCal.getMonth() + 1, 0);
  const start = getMonday(first);
  const lastDow = last.getDay();
  const end = addDays(last, lastDow === 0 ? 0 : 7 - lastDow);
  return { start, end };
}

// ── Form defaults ─────────────────────────────────────────────────────────────
function defaultDrill(): Drill {
  return { titulo: "", descripcion: "", dificultad_birdies: "", dificultad_aguilas: "", dificultad_albatros: "", dificultad_mas14: "" };
}
function defaultEstacion(): EstacionDamas { return { nombre: "", lugar: "", duracion_min: 20, descripcion: "" }; }
function defaultSesionForm(tipoPlan: TipoPlan): SesionForm {
  return {
    tipo_sesion: tipoPlan === "damas" ? "damas_estaciones" : "tiro_largo",
    lugar: "campo_practica", hora_inicio: "", hora_fin: "", objetivo: "",
    drills: [], juego_competitivo: "",
    estaciones_damas: tipoPlan === "damas" ? [defaultEstacion(), defaultEstacion(), defaultEstacion()] : [],
    notas: "",
  };
}

// ── Juvenil session detail (nuevo formato con actividades) ───────────────────
const CATEGORIA_EMOJI: Record<string, string> = {
  juego_largo: "🏌️", juego_corto: "⛳", putt: "🎯",
};
const CATEGORIA_LABEL_MAP: Record<string, string> = {
  juego_largo: "Juego Largo", juego_corto: "Juego Corto", putt: "Putt",
};
const ESPECIAL_LABEL_MAP: Record<string, string> = {
  test_tecnico: "Test Técnico P1-P10", test_fisico: "Test Físico TPI",
  campo_pacos: "Campo Pacos y Fabios", campo_infantil: "Campo Infantil",
};
const ESPECIAL_EMOJI_MAP: Record<string, string> = {
  test_tecnico: "📋", test_fisico: "💪", campo_pacos: "🌿", campo_infantil: "👶",
};

function JuvenilSessionDetail({
  sesion, jd, onEdit, onDelete, onPdf, onAsistencia, generatingPdf, accentColor,
}: {
  sesion: SesionSemana;
  jd: SesionJuvenilData;
  onEdit: () => void;
  onDelete: () => void;
  onPdf: () => void;
  onAsistencia: () => void;
  generatingPdf: boolean;
  accentColor: string;
}) {
  const GREEN = "#1B4D2E";
  const [expandedSt, setExpandedSt] = useState<Set<number>>(new Set());
  const jdAny = jd as unknown as { tipo?: string };

  // Legacy format (old AI-generated sessions)
  if (!jdAny.tipo) {
    const leg = jd as SesionJuvenilLegacy;
    return (
      <div className="space-y-3">
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-sm font-bold text-green-900">🎮 {leg.nombre_clase}</p>
          <p className="text-xs text-gray-600 mt-1 italic">"{leg.objetivo_simple}"</p>
        </div>
        <div className="space-y-1.5">
          {leg.actividades?.map((act, i) => (
            <div key={i} className="flex items-center gap-2 border border-gray-100 rounded-lg px-3 py-2 bg-gray-50">
              <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded shrink-0" style={{ background: GREEN }}>{i + 1}</span>
              <span className="text-sm font-medium text-gray-800 truncate">{act.nombre}</span>
              <span className="text-[10px] text-gray-400 shrink-0 ml-auto">· {act.duracion_min} min</span>
            </div>
          ))}
        </div>
        <ActionButtons sesion={sesion} onAsistencia={onAsistencia} onEdit={onEdit} onPdf={onPdf} generatingPdf={generatingPdf} onDelete={onDelete} accentColor={accentColor} />
      </div>
    );
  }

  // New especial format
  if (jdAny.tipo === "especial") {
    const esp = jd as { tipo: "especial"; tipo_especial: string };
    return (
      <div className="space-y-3">
        <div className="rounded-xl border-2 p-4 flex items-center gap-3" style={{ borderColor: "#7c3aed", background: "#f5f3ff" }}>
          <span className="text-3xl">{ESPECIAL_EMOJI_MAP[esp.tipo_especial] ?? "⭐"}</span>
          <div>
            <p className="text-sm font-bold" style={{ color: "#7c3aed" }}>{ESPECIAL_LABEL_MAP[esp.tipo_especial] ?? esp.tipo_especial}</p>
            <p className="text-xs text-gray-500 mt-0.5">Día especial Juvenil</p>
          </div>
        </div>
        <ActionButtons sesion={sesion} onAsistencia={onAsistencia} onEdit={onEdit} onPdf={onPdf} generatingPdf={generatingPdf} onDelete={onDelete} accentColor={accentColor} />
      </div>
    );
  }

  // New estaciones format
  const est = jd as SesionJuvenilEstaciones;
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide px-1">3 Estaciones</p>
      {est.estaciones.map((e, i) => {
        const isOpen = expandedSt.has(i);
        return (
          <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setExpandedSt((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <span className="text-base flex-shrink-0">{CATEGORIA_EMOJI[e.categoria]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase">{CATEGORIA_LABEL_MAP[e.categoria]}</p>
                <p className="text-sm font-semibold text-gray-900 truncate">{e.juego.nombre}</p>
              </div>
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth={2}
                className={`flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                <path d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isOpen && (
              <div className="px-3 pb-3 pt-2 space-y-2 border-t border-gray-100">
                <p className="text-xs text-gray-600">{e.juego.como_se_juega}</p>
                <p className="text-[11px] text-blue-700 bg-blue-50 rounded px-2 py-1">
                  🐦 <strong>Fácil:</strong> {e.juego.adaptacion_facil}
                </p>
                <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1">
                  🦅 <strong>Retador:</strong> {e.juego.adaptacion_retadora}
                </p>
              </div>
            )}
          </div>
        );
      })}
      <ActionButtons sesion={sesion} onAsistencia={onAsistencia} onEdit={onEdit} onPdf={onPdf} generatingPdf={generatingPdf} onDelete={onDelete} accentColor={accentColor} />
    </div>
  );
}

function ActionButtons({ sesion, onAsistencia, onEdit, onPdf, generatingPdf, onDelete, accentColor }: {
  sesion: SesionSemana; onAsistencia: () => void; onEdit: () => void;
  onPdf: () => void; generatingPdf: boolean; onDelete: () => void; accentColor: string;
}) {
  return (
    <div className="pt-2 border-t border-gray-100 flex flex-wrap gap-2">
      <button onClick={onAsistencia}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${sesion.asistencia_registrada ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "text-white"}`}
        style={sesion.asistencia_registrada ? {} : { background: accentColor }}>
        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        {sesion.asistencia_registrada ? "Ver asistencia" : "Pasar asistencia"}
      </button>
      <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
        ✏️ Cambiar
      </button>
      <button onClick={onPdf} disabled={generatingPdf}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
        <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        {generatingPdf ? "..." : "PDF padres"}
      </button>
      <button onClick={onDelete} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50">
        🗑️ Eliminar
      </button>
    </div>
  );
}

// ── Juvenil PDF hidden template ────────────────────────────────────────────────
function JuvenilPDFHidden({ sesion }: { sesion: SesionSemana }) {
  const jd = sesion.sesion_juvenil!;
  const GREEN = "#1B4D2E";
  const fechaFmt = new Date(sesion.fecha + "T00:00:00").toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const LUGAR_PDF: Record<string, string> = {
    campo_practica: "Campo de práctica", putting_green: "Putting Green",
    campo_infantil: "Campo Infantil", campo_pacos_fabios: "Pacos y Fabios", campo_completo: "Campo Completo",
  };
  const lugar = LUGAR_PDF[sesion.lugar] ?? sesion.lugar;
  const jdAny = jd as unknown as { tipo?: string };

  // ── Legacy format ──────────────────────────────────────────────────────
  if (!jdAny.tipo) {
    const leg = jd as SesionJuvenilLegacy;
    return (
      <div style={{ width: 794, padding: "48px 56px", fontFamily: "Arial, sans-serif", background: "#fff", color: "#1a1a1a" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "#4b7c52", textTransform: "uppercase", marginBottom: 8 }}>Escuela de Golf CCB</div>
          <div style={{ fontSize: 28, fontWeight: "bold", color: GREEN, marginBottom: 6 }}>{leg.nombre_clase}</div>
          <div style={{ fontSize: 13, color: "#555" }}>Grupo Juvenil · Birdies · Águilas · Albatros</div>
          <div style={{ marginTop: 10, fontSize: 13, color: "#333" }}>{fechaFmt} · {sesion.hora_inicio?.slice(0, 5)}–{sesion.hora_fin?.slice(0, 5)} · {lugar}</div>
          <div style={{ width: 60, height: 3, background: GREEN, margin: "16px auto 0" }} />
        </div>
        <div style={{ background: "#f0faf2", border: `2px solid ${GREEN}`, borderRadius: 8, padding: "14px 18px", marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: "bold", color: GREEN, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Hoy trabajamos:</div>
          <div style={{ fontSize: 15, color: "#1a3a1a", lineHeight: 1.5, fontStyle: "italic" }}>"{leg.objetivo_simple}"</div>
        </div>
        {leg.actividades?.map((act, i) => (
          <div key={i} style={{ marginBottom: 20, borderLeft: "4px solid #a7d7b0", paddingLeft: 16 }}>
            <div style={{ fontSize: 13, fontWeight: "bold", color: GREEN, marginBottom: 4 }}>Actividad {i + 1} · {act.duracion_min} min — {act.nombre}</div>
            <div style={{ fontSize: 12, color: "#333", lineHeight: 1.7, marginBottom: 8 }}>{act.como_se_juega}</div>
            {act.adaptacion_birdies && <div style={{ background: "#dbeafe", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#1e40af", marginBottom: 4 }}><strong>Birdies (4-5a):</strong> {act.adaptacion_birdies}</div>}
            {act.adaptacion_albatros && <div style={{ background: "#fef9c3", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#854d0e" }}><strong>Albatros (9-12a):</strong> {act.adaptacion_albatros}</div>}
          </div>
        ))}
        <div style={{ marginTop: 32, paddingTop: 14, borderTop: "1px solid #ddd", textAlign: "center", fontSize: 10, color: "#888" }}>Escuela de Golf CCB · {fechaFmt}<br />¡Hoy aprendemos jugando! ⛳</div>
      </div>
    );
  }

  // ── New especial format ────────────────────────────────────────────────
  if (jdAny.tipo === "especial") {
    const esp = jd as { tipo: "especial"; tipo_especial: string };
    const espLabel: Record<string, string> = {
      test_tecnico: "Test Técnico P1-P10", test_fisico: "Test Físico TPI",
      campo_pacos: "Campo Pacos y Fabios", campo_infantil: "Campo Infantil",
    };
    return (
      <div style={{ width: 794, padding: "48px 56px", fontFamily: "Arial, sans-serif", background: "#fff", color: "#1a1a1a" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "#4b7c52", textTransform: "uppercase", marginBottom: 8 }}>Escuela de Golf CCB</div>
          <div style={{ fontSize: 28, fontWeight: "bold", color: GREEN, marginBottom: 6 }}>Día Especial — {espLabel[esp.tipo_especial] ?? esp.tipo_especial}</div>
          <div style={{ fontSize: 13, color: "#555" }}>Grupo Juvenil · {fechaFmt}</div>
          <div style={{ width: 60, height: 3, background: GREEN, margin: "16px auto 0" }} />
        </div>
        <div style={{ marginTop: 32, paddingTop: 14, borderTop: "1px solid #ddd", textAlign: "center", fontSize: 10, color: "#888" }}>Escuela de Golf CCB · ¡Hoy aprendemos jugando! ⛳</div>
      </div>
    );
  }

  // ── New estaciones format ──────────────────────────────────────────────
  const est = jd as SesionJuvenilEstaciones;
  const catLabel: Record<string, string> = { juego_largo: "Juego Largo 🏌️", juego_corto: "Juego Corto ⛳", putt: "Putt 🎯" };
  return (
    <div style={{ width: 794, padding: "48px 56px", fontFamily: "Arial, sans-serif", background: "#fff", color: "#1a1a1a" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: "#4b7c52", textTransform: "uppercase", marginBottom: 8 }}>Escuela de Golf CCB</div>
        <div style={{ fontSize: 28, fontWeight: "bold", color: GREEN, marginBottom: 6 }}>Clase Juvenil — 3 Estaciones</div>
        <div style={{ fontSize: 13, color: "#555" }}>Birdies · Águilas · Albatros</div>
        <div style={{ marginTop: 10, fontSize: 13, color: "#333" }}>{fechaFmt} · {sesion.hora_inicio?.slice(0, 5)}–{sesion.hora_fin?.slice(0, 5)} · {lugar}</div>
        <div style={{ width: 60, height: 3, background: GREEN, margin: "16px auto 0" }} />
      </div>
      {est.estaciones.map((e, i) => (
        <div key={i} style={{ marginBottom: 24, borderLeft: "4px solid #a7d7b0", paddingLeft: 16 }}>
          <div style={{ fontSize: 11, fontWeight: "bold", color: "#4b7c52", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
            Estación {i + 1} — {catLabel[e.categoria] ?? e.categoria}
          </div>
          <div style={{ fontSize: 16, fontWeight: "bold", color: GREEN, marginBottom: 8 }}>{e.juego.nombre}</div>
          <div style={{ fontSize: 12, color: "#333", lineHeight: 1.7, marginBottom: 8 }}>{e.juego.como_se_juega}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1, background: "#dbeafe", borderRadius: 6, padding: "6px 10px", fontSize: 11, color: "#1e40af" }}>
              <strong>Birdies (fácil):</strong> {e.juego.adaptacion_facil}
            </div>
            <div style={{ flex: 1, background: "#fef9c3", borderRadius: 6, padding: "6px 10px", fontSize: 11, color: "#854d0e" }}>
              <strong>Albatros (retador):</strong> {e.juego.adaptacion_retadora}
            </div>
          </div>
        </div>
      ))}
      <div style={{ marginTop: 32, paddingTop: 14, borderTop: "1px solid #ddd", textAlign: "center", fontSize: 10, color: "#888" }}>
        Escuela de Golf CCB · {fechaFmt}<br />¡Hoy aprendemos jugando! ⛳
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProgramacionModule() {
  const router = useRouter();
  const padresPdfRef = useRef<HTMLDivElement>(null);

  // Plan state
  const [semana, setSemana]       = useState<Date>(() => getMonday(new Date()));
  const [activeTab, setActiveTab] = useState<TipoPlan>("juvenil");
  const [plan, setPlan]           = useState<PlanSemanal | null>(null);
  const [sesiones, setSesiones]   = useState<SesionSemana[]>([]);
  const [loading, setLoading]     = useState(false);
  const [expandedDias, setExpandedDias] = useState<Set<string>>(new Set());

  // Default schedules
  const [horariosDefecto, setHorariosDefecto] = useState<HorarioDefecto[]>([]);

  // Calendar state
  const [viewMode, setViewMode]               = useState<ViewMode>("plan");
  const [calSesiones, setCalSesiones]         = useState<CalSesion[]>([]);
  const [calLoading, setCalLoading]           = useState(false);
  const [mesCal, setMesCal]                   = useState<Date>(() => new Date());
  const [calEventDetail, setCalEventDetail]   = useState<CalSesion | null>(null);
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null);

  // Create plan modal (3-step IA wizard)
  const [showCrearModal, setShowCrearModal]     = useState(false);
  const [iaStep, setIaStep]                     = useState<1 | 2 | 3>(1);
  const [focoMesChip, setFocoMesChip]           = useState("");
  const [focoMesCustom, setFocoMesCustom]       = useState("");
  const [temaChip, setTemaChip]                 = useState("");
  const [temaCustom, setTemaCustom]             = useState("");
  const [incluirContexto, setIncluirContexto]   = useState(false);
  const [aiPreview, setAiPreview]               = useState<{ descripcion_tema: string; sesiones: PreviewSesion[]; sesion_juvenil?: SesionJuvenilData | null } | null>(null);
  const [generatingAI, setGeneratingAI]         = useState(false);
  const [savingGenerado, setSavingGenerado]     = useState(false);
  const [creandoPlan, setCreandoPlan]           = useState(false);
  const [planError, setPlanError]               = useState<string | null>(null);
  const [expandedDrillKeys, setExpandedDrillKeys] = useState<Set<string>>(new Set());
  const [generatingPdfPadres, setGeneratingPdfPadres] = useState(false);

  // AI suggestions — paso 1 (foco) y paso 2 (tema)
  const [suggestingFocos, setSuggestingFocos]   = useState(false);
  const [suggestedFocos, setSuggestedFocos]     = useState<{ titulo: string; descripcion_corta: string }[]>([]);
  const [suggestingTemas, setSuggestingTemas]   = useState(false);
  const [suggestedTemas, setSuggestedTemas]     = useState<{ titulo: string; descripcion_corta: string }[]>([]);

  // Preview — selected option index per sesion (for Competencia Martes)
  const [selectedOpcionIdx, setSelectedOpcionIdx] = useState<Record<number, number>>({});

  // Biblioteca de drills — panel dentro del wizard paso 3
  const [bibliotecaPanel, setBibliotecaPanel] = useState<{
    sesionIdx: number; loading: boolean;
    drills: { id: string; titulo: string; descripcion: string; posicion_swing: string[] | null; nivel_recomendado: string[] | null; lugar: string; duracion_minutos: number | null; repeticiones: string | null; error_que_corrige: string | null; sensacion_buscada: string | null; metrica_exito: string | null }[];
  } | null>(null);

  // Competencia day-by-day modal
  const [compClassCtx, setCompClassCtx] = useState<{
    dia: DiaSemana; fecha: string; sesion: SesionSemana | null;
    horaInicio?: string; horaFin?: string;
  } | null>(null);

  // Delete plan
  const [confirmDeletePlan, setConfirmDeletePlan] = useState(false);
  const [deletingPlan, setDeletingPlan]           = useState(false);

  // Edit tema modal
  const [showEditTema, setShowEditTema] = useState(false);
  const [temaForm, setTemaForm] = useState({ tema_semanal: "", descripcion_tema: "", objetivo_mensual: "" });
  const [savingTema, setSavingTema] = useState(false);

  // Edit sesion modal
  const [editSesionCtx, setEditSesionCtx] = useState<{ dia: DiaSemana; fecha: string; sesion: SesionSemana | null } | null>(null);
  const [sesionForm, setSesionForm]   = useState<SesionForm | null>(null);
  const [savingSesion, setSavingSesion] = useState(false);
  const [sesionError, setSesionError]   = useState<string | null>(null);

  // Delete sesion
  const [confirmDeleteSesion, setConfirmDeleteSesion] = useState<SesionSemana | null>(null);
  const [deletingSesion, setDeletingSesion]           = useState(false);
  const [openMenuId, setOpenMenuId]                   = useState<string | null>(null);
  const [lugarMenuId, setLugarMenuId]                 = useState<string | null>(null);

  // Juvenile class modal (3-estaciones o día especial)
  const [juvClassCtx, setJuvClassCtx] = useState<{
    dia: DiaSemana; fecha: string; sesion: SesionSemana | null;
    horaInicio?: string; horaFin?: string;
  } | null>(null);

  function openJuvModal(dia: DiaSemana, fecha: string, sesion: SesionSemana | null, extra?: { hi?: string; hf?: string }) {
    setJuvClassCtx({ dia, fecha, sesion, horaInicio: extra?.hi, horaFin: extra?.hf });
  }

  function openCompModal(dia: DiaSemana, fecha: string, sesion: SesionSemana | null, extra?: { hi?: string; hf?: string }) {
    setCompClassCtx({ dia, fecha, sesion, horaInicio: extra?.hi, horaFin: extra?.hf });
  }

  async function handleUpdateLugar(sesionId: string, newLugar: Lugar) {
    await supabase.from("sesiones_semana").update({ lugar: newLugar }).eq("id", sesionId);
    setLugarMenuId(null);
    await fetchPlan();
    if (viewMode === "semana") fetchCalSemana();
  }

  // PDF para sesión individual Juvenil
  const [juvPdfSesion, setJuvPdfSesion] = useState<SesionSemana | null>(null);
  const juvPdfRef = useRef<HTMLDivElement>(null);
  const [generatingJuvPdf, setGeneratingJuvPdf] = useState(false);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  // ── Load horarios_defecto once ────────────────────────────────────────────
  useEffect(() => {
    supabase.from("horarios_defecto").select("tipo_plan, dia_semana, hora_inicio, hora_fin")
      .then(({ data }) => { if (data) setHorariosDefecto(data as HorarioDefecto[]); });
  }, []);

  // ── Fetch plan (for active tab & week) ───────────────────────────────────
  const fetchPlan = useCallback(async () => {
    setLoading(true); setExpandedDias(new Set());
    const { data: planData } = await supabase
      .from("planes_semanales").select("*")
      .eq("semana_inicio", toISODate(semana)).eq("tipo_plan", activeTab).maybeSingle();
    if (planData) {
      setPlan(planData as PlanSemanal);
      const { data: sesData } = await supabase
        .from("sesiones_semana").select("*").eq("plan_id", planData.id).order("hora_inicio");
      setSesiones((sesData as SesionSemana[]) ?? []);
    } else { setPlan(null); setSesiones([]); }
    setLoading(false);
  }, [semana, activeTab]);

  useEffect(() => { fetchPlan(); }, [fetchPlan]);

  // ── Fetch calendar data ───────────────────────────────────────────────────
  const fetchCalSemana = useCallback(async () => {
    setCalSesiones([]);
    setCalLoading(true);
    const { data: plans } = await supabase
      .from("planes_semanales").select("id, tipo_plan")
      .eq("semana_inicio", toISODate(semana))
      .eq("tipo_plan", activeTab);
    if (!plans?.length) { setCalSesiones([]); setCalLoading(false); return; }
    const planMap = Object.fromEntries(plans.map((p) => [p.id, p.tipo_plan as TipoPlan]));
    const { data: seses } = await supabase
      .from("sesiones_semana").select("*").in("plan_id", plans.map((p) => p.id)).order("hora_inicio");
    setCalSesiones(
      (seses ?? []).map((s) => {
        const ss = s as SesionSemana;
        return planMap[ss.plan_id] ? { ...ss, tipo_plan: planMap[ss.plan_id] } : null;
      }).filter(Boolean) as CalSesion[]
    );
    setCalLoading(false);
  }, [semana, activeTab]);

  const fetchCalMes = useCallback(async () => {
    setCalSesiones([]);
    setCalLoading(true);
    const { start, end } = getMesRange(mesCal);
    const { data: plans } = await supabase
      .from("planes_semanales").select("id, tipo_plan")
      .gte("semana_inicio", toISODate(start)).lte("semana_inicio", toISODate(end))
      .eq("tipo_plan", activeTab);
    if (!plans?.length) { setCalSesiones([]); setCalLoading(false); return; }
    const planMap = Object.fromEntries(plans.map((p) => [p.id, p.tipo_plan as TipoPlan]));
    const { data: seses } = await supabase
      .from("sesiones_semana").select("*")
      .in("plan_id", plans.map((p) => p.id))
      .gte("fecha", toISODate(start)).lte("fecha", toISODate(end));
    setCalSesiones(
      (seses ?? []).map((s) => {
        const ss = s as SesionSemana;
        return planMap[ss.plan_id] ? { ...ss, tipo_plan: planMap[ss.plan_id] } : null;
      }).filter(Boolean) as CalSesion[]
    );
    setCalLoading(false);
  }, [mesCal, activeTab]);

  useEffect(() => {
    if (viewMode === "semana") fetchCalSemana();
    else if (viewMode === "mes") fetchCalMes();
  }, [viewMode, fetchCalSemana, fetchCalMes]);

  // ── Week / month nav ──────────────────────────────────────────────────────
  const prevWeek  = () => setSemana((s) => addDays(s, -7));
  const nextWeek  = () => setSemana((s) => addDays(s, 7));
  const goToday   = () => setSemana(getMonday(new Date()));
  const prevMonth = () => setMesCal((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setMesCal((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  function toggleDia(dia: string) {
    setExpandedDias((prev) => { const n = new Set(prev); n.has(dia) ? n.delete(dia) : n.add(dia); return n; });
  }

  // ── Default hours helper ──────────────────────────────────────────────────
  function getDefaultHoras(tipoPlan: TipoPlan, dia: DiaSemana, takenHoras: string[]): { hi: string; hf: string } | null {
    const slots = horariosDefecto
      .filter((h) => h.tipo_plan === tipoPlan && h.dia_semana === dia)
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
    for (const s of slots) {
      if (!takenHoras.includes(s.hora_inicio.slice(0, 5))) return { hi: s.hora_inicio.slice(0, 5), hf: s.hora_fin.slice(0, 5) };
    }
    return slots[0] ? { hi: slots[0].hora_inicio.slice(0, 5), hf: slots[0].hora_fin.slice(0, 5) } : null;
  }

  // ── Create plan helpers ───────────────────────────────────────────────────
  function resetCrearModal() {
    setIaStep(1);
    setFocoMesChip(""); setFocoMesCustom("");
    setTemaChip(""); setTemaCustom("");
    setIncluirContexto(false); setAiPreview(null); setPlanError(null);
    setExpandedDrillKeys(new Set());
    setSuggestedFocos([]); setSuggestingFocos(false);
    setSuggestedTemas([]); setSuggestingTemas(false);
    setSelectedOpcionIdx({});
  }

  function updatePreviewSesion(i: number, updates: Partial<PreviewSesion>) {
    setAiPreview((prev) => {
      if (!prev) return prev;
      const list = [...prev.sesiones]; list[i] = { ...list[i], ...updates };
      return { ...prev, sesiones: list };
    });
  }

  function updatePreviewDrill(si: number, di: number, updates: Partial<Drill>) {
    setAiPreview((prev) => {
      if (!prev) return prev;
      const list = [...prev.sesiones];
      const drills = [...(list[si].drills ?? [])];
      drills[di] = { ...drills[di], ...updates };
      list[si] = { ...list[si], drills };
      return { ...prev, sesiones: list };
    });
  }

  function toggleDrillKey(key: string) {
    setExpandedDrillKeys((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  async function handleSugerirFocos() {
    setSuggestingFocos(true); setSuggestedFocos([]);
    try {
      const mesActual = new Date().toLocaleString("es-CO", { month: "long", year: "numeric" });
      const res = await fetch("/api/suggest-focus", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo_plan: activeTab, mes_actual: mesActual, modo: "foco" }),
      });
      const data = await res.json();
      if (res.ok && data.sugerencias) setSuggestedFocos(data.sugerencias);
    } catch { /* silencioso */ }
    finally { setSuggestingFocos(false); }
  }

  async function handleSugerirTemas() {
    const focoMes = focoMesChip || focoMesCustom.trim();
    setSuggestingTemas(true); setSuggestedTemas([]);
    try {
      const semanaNum = Math.ceil((semana.getDate() + new Date(semana.getFullYear(), semana.getMonth(), 1).getDay()) / 7);
      const res = await fetch("/api/suggest-focus", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo_plan: activeTab, foco_mes: focoMes, semana_numero_del_mes: semanaNum, modo: "tema" }),
      });
      const data = await res.json();
      if (res.ok && data.sugerencias) setSuggestedTemas(data.sugerencias);
    } catch { /* silencioso */ }
    finally { setSuggestingTemas(false); }
  }

  async function handleAbrirBiblioteca(sesionIdx: number, tipoSesion: string) {
    if (bibliotecaPanel?.sesionIdx === sesionIdx) { setBibliotecaPanel(null); return; }
    setBibliotecaPanel({ sesionIdx, loading: true, drills: [] });
    const catMap: Record<string, string> = {
      tiro_largo: "tecnico", juego_corto: "juego_corto", putt: "putting",
      campo: "campo", test_tecnico: "tecnico", competencia: "campo",
    };
    const cat = catMap[tipoSesion] ?? "tecnico";
    const { data } = await supabase.from("drills").select(
      "id,titulo,descripcion,posicion_swing,nivel_recomendado,lugar,duracion_minutos,repeticiones,error_que_corrige,sensacion_buscada,metrica_exito"
    ).eq("categoria", cat).eq("aprobado", true).order("rating", { ascending: false }).limit(20);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setBibliotecaPanel({ sesionIdx, loading: false, drills: (data ?? []) as any });
  }

  function handleUsarDrillBiblioteca(sesionIdx: number, drill: NonNullable<typeof bibliotecaPanel>["drills"][0]) {
    updatePreviewSesion(sesionIdx, {
      drills: [...(aiPreview?.sesiones[sesionIdx]?.drills ?? []), {
        titulo: drill.titulo,
        descripcion: drill.descripcion,
        posicion_objetivo: drill.posicion_swing?.join(", ") ?? null,
        error_comun: drill.error_que_corrige ?? null,
        sensacion: drill.sensacion_buscada ?? null,
        repeticiones: drill.repeticiones ?? null,
        metrica_exito: drill.metrica_exito ?? null,
        variante_presion: null, conexion_tecnica: null,
        dificultad_birdies: null, dificultad_aguilas: null,
        dificultad_albatros: null, dificultad_mas14: null,
      }],
    });
  }

  function handleSelectOpcion(si: number, optIdx: number) {
    if (!aiPreview) return;
    const s = aiPreview.sesiones[si];
    const opt = s.opciones_actividad?.[optIdx];
    if (!opt) return;
    setSelectedOpcionIdx((prev) => ({ ...prev, [si]: optIdx }));
    updatePreviewSesion(si, { drills: opt.drills });
  }

  async function handleGenerarIA() {
    const tema = temaChip || temaCustom.trim();
    if (!tema) { setPlanError("Selecciona o escribe un tema."); return; }
    const focoMes = focoMesChip || focoMesCustom.trim();

    setPlanError(null); setGeneratingAI(true); setIaStep(3);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contextoGrupo: Record<string, any> = {};
      if (incluirContexto) {
        const { data: swingData } = await supabase
          .from("swing_evaluations").select("grupo, score_promedio, evaluation_date")
          .in("grupo", GRUPOS_EVAL[activeTab]).order("evaluation_date", { ascending: false }).limit(5);
        if (swingData?.length) contextoGrupo.evaluaciones_recientes = swingData;
      }
      const res = await fetch("/api/weekly-plan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo_plan: activeTab, tema_semanal: tema, foco_mes: focoMes, semana_inicio: toISODate(semana), contexto_grupo: contextoGrupo }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("[IA] Error del endpoint:", data.error, "| stop_reason:", data.stop_reason, "| output_tokens:", data.output_tokens, "| Raw:", data.raw);
        const detail = data.stop_reason === "max_tokens"
          ? `Truncado por tokens (${data.output_tokens} generados). Intenta un tema más corto.`
          : (data.error || "Error de IA");
        throw new Error(detail);
      }
      const initialOpcionIdx: Record<number, number> = {};
      const sesionesConFecha = (data.sesiones as PreviewSesion[]).map((s, si) => {
        let sesion: PreviewSesion = {
          ...s,
          fecha: getFechaForDia(semana, s.dia_semana),
          hora_inicio: s.hora_inicio ?? "",
          hora_fin: s.hora_fin ?? "",
        };
        if (sesion.opciones_actividad && sesion.opciones_actividad.length > 0) {
          const recIdx = sesion.opciones_actividad.findIndex((o) => o.es_recomendada);
          const defIdx = recIdx >= 0 ? recIdx : 0;
          initialOpcionIdx[si] = defIdx;
          sesion = { ...sesion, drills: sesion.opciones_actividad[defIdx]?.drills ?? [] };
        }
        return sesion;
      });
      setSelectedOpcionIdx(initialOpcionIdx);
      setAiPreview({ descripcion_tema: data.descripcion_tema ?? "", sesiones: sesionesConFecha, sesion_juvenil: data.sesion_juvenil ?? null });
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Error desconocido");
      setIaStep(activeTab === "juvenil" ? 1 : 2);
    } finally { setGeneratingAI(false); }
  }

  async function handleCrearPlanComp() {
    setPlanError(null); setCreandoPlan(true);
    try {
      const { data: newPlan, error: planErr } = await supabase.from("planes_semanales")
        .upsert(
          { semana_inicio: toISODate(semana), tipo_plan: "competencia", tema_semanal: "Semana de Competencia", descripcion_tema: "", objetivo_mensual: null, foco_mes: null },
          { onConflict: "semana_inicio,tipo_plan" }
        )
        .select().single();
      if (planErr || !newPlan) throw new Error(planErr?.message || "Error al crear plan");
      const { count } = await supabase.from("sesiones_semana").select("id", { count: "exact", head: true }).eq("plan_id", newPlan.id);
      if (!count) for (const dia of DIAS_POR_TIPO["competencia"]) {
        const defaultH = getDefaultHoras("competencia", dia as DiaSemana, []);
        await supabase.from("sesiones_semana").insert({
          plan_id: newPlan.id, dia_semana: dia, fecha: getFechaForDia(semana, dia as DiaSemana),
          tipo_sesion: "tiro_largo", lugar: "campo_practica", objetivo: "", drills: [],
          hora_inicio: defaultH?.hi || null, hora_fin: defaultH?.hf || null, estaciones_damas: null,
        });
      }
      setShowCrearModal(false); resetCrearModal();
      showToast("Plan Competencia creado ✓"); await fetchPlan();
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Error al crear");
    } finally { setCreandoPlan(false); }
  }

  async function handleGuardarPlanIA() {
    if (!aiPreview) return;
    const tema = temaChip || temaCustom.trim();
    const focoMes = focoMesChip || focoMesCustom.trim() || null;
    setSavingGenerado(true); setPlanError(null);
    try {
      const { data: newPlan, error: planErr } = await supabase.from("planes_semanales")
        .upsert(
          { semana_inicio: toISODate(semana), tipo_plan: activeTab, tema_semanal: tema, descripcion_tema: aiPreview.descripcion_tema, objetivo_mensual: focoMes, foco_mes: focoMes },
          { onConflict: "semana_inicio,tipo_plan" }
        )
        .select().single();
      if (planErr || !newPlan) throw new Error(planErr?.message || "Error al crear plan");
      // Delete existing sessions so IA-generated ones replace them cleanly
      await supabase.from("sesiones_semana").delete().eq("plan_id", newPlan.id);
      if (activeTab === "juvenil" && aiPreview.sesion_juvenil) {
        const JUVENIL_SLOTS: { dia: DiaSemana; hi: string; hf: string }[] = [
          { dia: "martes",    hi: "16:30", hf: "17:30" },
          { dia: "miercoles", hi: "16:30", hf: "17:30" },
          { dia: "jueves",    hi: "16:30", hf: "17:30" },
          { dia: "sabado",    hi: "09:15", hf: "10:00" },
          { dia: "sabado",    hi: "10:00", hf: "11:00" },
          { dia: "domingo",   hi: "09:15", hf: "10:00" },
          { dia: "domingo",   hi: "10:00", hf: "11:00" },
        ];
        for (const slot of JUVENIL_SLOTS) {
          await supabase.from("sesiones_semana").insert({
            plan_id: newPlan.id,
            dia_semana: slot.dia,
            fecha: getFechaForDia(semana, slot.dia),
            tipo_sesion: "campo",
            lugar: "campo_practica",
            hora_inicio: slot.hi,
            hora_fin: slot.hf,
            objetivo: (aiPreview.sesion_juvenil as SesionJuvenilLegacy).objetivo_simple ?? "",
            drills: (aiPreview.sesion_juvenil as SesionJuvenilLegacy).actividades?.map((a) => ({
              titulo: a.nombre,
              descripcion: a.como_se_juega,
              dificultad_birdies: a.adaptacion_birdies || null,
              dificultad_aguilas: null,
              dificultad_albatros: a.adaptacion_albatros || null,
              dificultad_mas14: null,
            })) ?? [],
            juego_competitivo: (aiPreview.sesion_juvenil as SesionJuvenilLegacy).actividad_estrella || null,
            estaciones_damas: null,
            notas: null,
            sesion_juvenil: aiPreview.sesion_juvenil,
          });
        }
      } else {
        for (const s of aiPreview.sesiones) {
          await supabase.from("sesiones_semana").insert({
            plan_id: newPlan.id, dia_semana: s.dia_semana, fecha: s.fecha,
            tipo_sesion: s.tipo_sesion, lugar: s.lugar,
            hora_inicio: s.hora_inicio || null, hora_fin: s.hora_fin || null,
            objetivo: s.objetivo || "", drills: s.drills || [],
            juego_competitivo: s.juego_competitivo || null,
            estaciones_damas: s.estaciones_damas || null, notas: s.notas || null,
          });
        }
      }
      setShowCrearModal(false); resetCrearModal();
      showToast("Plan generado con IA ✓");
      await fetchPlan(); if (viewMode === "semana") fetchCalSemana();
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Error al guardar");
    } finally { setSavingGenerado(false); }
  }

  async function handleCrearVacio() {
    const tema = temaChip || temaCustom.trim();
    if (!tema) { setPlanError("Selecciona o escribe un tema."); return; }
    setPlanError(null); setCreandoPlan(true);
    try {
      const focoMes = focoMesChip || focoMesCustom.trim() || null;
      const { data: newPlan, error: planErr } = await supabase.from("planes_semanales")
        .upsert(
          { semana_inicio: toISODate(semana), tipo_plan: activeTab, tema_semanal: tema, descripcion_tema: "", objetivo_mensual: focoMes, foco_mes: focoMes },
          { onConflict: "semana_inicio,tipo_plan" }
        )
        .select().single();
      if (planErr || !newPlan) throw new Error(planErr?.message || "Error al crear plan");
      // Only insert placeholder sessions if none exist yet
      const { count } = await supabase.from("sesiones_semana").select("id", { count: "exact", head: true }).eq("plan_id", newPlan.id);
      if (!count) for (const dia of DIAS_POR_TIPO[activeTab]) {
        const defaultH = getDefaultHoras(activeTab, dia, []);
        await supabase.from("sesiones_semana").insert({
          plan_id: newPlan.id, dia_semana: dia, fecha: getFechaForDia(semana, dia),
          tipo_sesion: activeTab === "damas" ? "damas_estaciones" : "tiro_largo",
          lugar: "campo_practica", objetivo: "", drills: [],
          hora_inicio: defaultH?.hi || null, hora_fin: defaultH?.hf || null,
          estaciones_damas: activeTab === "damas" ? [] : null,
        });
      }
      setShowCrearModal(false); resetCrearModal();
      showToast("Plan creado ✓"); await fetchPlan();
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Error al crear");
    } finally { setCreandoPlan(false); }
  }

  // ── Edit tema ─────────────────────────────────────────────────────────────
  function openEditTema() {
    if (!plan) return;
    setTemaForm({ tema_semanal: plan.tema_semanal, descripcion_tema: plan.descripcion_tema, objetivo_mensual: plan.objetivo_mensual ?? "" });
    setShowEditTema(true);
  }
  async function handleSaveTema() {
    if (!plan) return;
    setSavingTema(true);
    await supabase.from("planes_semanales").update({
      tema_semanal: temaForm.tema_semanal.trim(), descripcion_tema: temaForm.descripcion_tema.trim(),
      objetivo_mensual: temaForm.objetivo_mensual.trim() || null,
    }).eq("id", plan.id);
    setPlan((p) => p ? { ...p, ...temaForm, objetivo_mensual: temaForm.objetivo_mensual || null } : p);
    setSavingTema(false); setShowEditTema(false); showToast("Tema actualizado ✓");
  }

  // ── Edit sesion ───────────────────────────────────────────────────────────
  function openEditSesion(dia: DiaSemana, sesion: SesionSemana | null, defaultHora?: string) {
    const fecha = getFechaForDia(semana, dia);
    let form: SesionForm;
    if (sesion) {
      form = {
        tipo_sesion: sesion.tipo_sesion, lugar: sesion.lugar,
        hora_inicio: formatHora(sesion.hora_inicio), hora_fin: formatHora(sesion.hora_fin),
        objetivo: sesion.objetivo, drills: sesion.drills ?? [],
        juego_competitivo: sesion.juego_competitivo ?? "",
        estaciones_damas: sesion.estaciones_damas ?? [], notas: sesion.notas ?? "",
      };
    } else {
      form = defaultSesionForm(activeTab);
      if (defaultHora) {
        const [h, m] = defaultHora.split(":").map(Number);
        form.hora_inicio = defaultHora;
        form.hora_fin = `${Math.min(h + 2, 18).toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
      } else {
        const taken = sesiones.filter((s) => s.dia_semana === dia).map((s) => formatHora(s.hora_inicio));
        const defaultH = getDefaultHoras(activeTab, dia, taken);
        if (defaultH) { form.hora_inicio = defaultH.hi; form.hora_fin = defaultH.hf; }
      }
    }
    setEditSesionCtx({ dia, fecha, sesion }); setSesionForm(form); setSesionError(null);
  }

  async function handleSaveSesion() {
    if (!sesionForm || !editSesionCtx || !plan) return;
    setSavingSesion(true); setSesionError(null);
    try {
      const payload = {
        plan_id: plan.id, dia_semana: editSesionCtx.dia, fecha: editSesionCtx.fecha,
        tipo_sesion: sesionForm.tipo_sesion, lugar: sesionForm.lugar,
        hora_inicio: sesionForm.hora_inicio || null, hora_fin: sesionForm.hora_fin || null,
        objetivo: sesionForm.objetivo.trim(), drills: sesionForm.drills,
        juego_competitivo: sesionForm.juego_competitivo.trim() || null,
        estaciones_damas: activeTab === "damas" ? sesionForm.estaciones_damas : null,
        notas: sesionForm.notas.trim() || null,
      };
      if (editSesionCtx.sesion) await supabase.from("sesiones_semana").update(payload).eq("id", editSesionCtx.sesion.id);
      else await supabase.from("sesiones_semana").insert(payload);
      setEditSesionCtx(null); setSesionForm(null);
      showToast("Sesión guardada ✓");
      await fetchPlan();
      if (viewMode === "semana") fetchCalSemana();
    } catch (err) {
      setSesionError(err instanceof Error ? err.message : "Error al guardar");
    } finally { setSavingSesion(false); }
  }

  async function handleDeleteSesion(sesion: SesionSemana) {
    setDeletingSesion(true);
    await supabase.from("sesiones_semana").delete().eq("id", sesion.id);
    setConfirmDeleteSesion(null);
    showToast("Sesión eliminada");
    await fetchPlan();
    if (viewMode === "semana") fetchCalSemana();
    setDeletingSesion(false);
  }

  async function handleBorrarPlan() {
    if (!plan) return;
    setDeletingPlan(true);
    await supabase.from("sesiones_semana").delete().eq("plan_id", plan.id);
    await supabase.from("planes_semanales").delete().eq("id", plan.id);
    setConfirmDeletePlan(false);
    setPlan(null); setSesiones([]);
    showToast("Plan eliminado");
    if (viewMode === "semana") fetchCalSemana();
    if (viewMode === "mes") fetchCalMes();
    setDeletingPlan(false);
  }

  // ── Juvenile PDF ─────────────────────────────────────────────────────────
  async function handleJuvPdf(sesion: SesionSemana) {
    setJuvPdfSesion(sesion);
    await new Promise((r) => setTimeout(r, 120));
    if (!juvPdfRef.current) return;
    setGeneratingJuvPdf(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);
      const canvas = await html2canvas(juvPdfRef.current, { scale: 2, backgroundColor: "#fff", useCORS: true, logging: false });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = (canvas.height * pdfW) / canvas.width;
      const pageH = pdf.internal.pageSize.getHeight();
      let y = 0;
      while (y < pdfH) { if (y > 0) pdf.addPage(); pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, -y, pdfW, pdfH); y += pageH; }
      pdf.save(`Clase_Juvenil_${sesion.fecha}.pdf`);
    } finally {
      setGeneratingJuvPdf(false);
      setJuvPdfSesion(null);
    }
  }

  // ── Calendar cell click ───────────────────────────────────────────────────
  function handleCalCellClick(dia: DiaSemana, hour: number) {
    if (!plan) { showToast(`Sin plan ${TIPO_PLAN_LABEL[activeTab]} esta semana — créalo en Vista Plan`); return; }
    const hourStr = `${hour.toString().padStart(2, "0")}:00`;
    if (activeTab === "juvenil") {
      const endHour = Math.min(hour + 1, 18);
      const endStr = `${endHour.toString().padStart(2, "0")}:00`;
      openJuvModal(dia, getFechaForDia(semana, dia), null, { hi: hourStr, hf: endStr });
    } else {
      openEditSesion(dia, null, hourStr);
    }
  }

  // ── PDF semanal ───────────────────────────────────────────────────────────
  async function handlePdfSemanal() {
    if (!plan) return;
    const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);
    const el = document.getElementById("plan-pdf-content"); if (!el) return;
    const canvas = await html2canvas(el, { scale: 1.8, backgroundColor: "#fff", useCORS: true });
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = (canvas.height * pdfW) / canvas.width;
    const pageH = pdf.internal.pageSize.getHeight();
    let y = 0;
    while (y < pdfH) { if (y > 0) pdf.addPage(); pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, -y, pdfW, pdfH); y += pageH; }
    pdf.save(`Plan_${activeTab}_${toISODate(semana)}.pdf`);
  }

  async function handlePdfPadres() {
    if (!plan) return;
    const el = padresPdfRef.current; if (!el) return;
    setGeneratingPdfPadres(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#fff", useCORS: true, logging: false });
      // A4 landscape: 297mm × 210mm
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pdfW = pdf.internal.pageSize.getWidth();   // 297
      const pdfH = pdf.internal.pageSize.getHeight();  // 210
      const ratio = canvas.width / canvas.height;
      let imgW = pdfW;
      let imgH = pdfW / ratio;
      if (imgH > pdfH) { imgH = pdfH; imgW = pdfH * ratio; }
      const offsetX = (pdfW - imgW) / 2;
      const offsetY = (pdfH - imgH) / 2;
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", offsetX, offsetY, imgW, imgH);
      pdf.save(`Programacion_${TIPO_PLAN_LABEL[activeTab]}_${toISODate(semana)}.pdf`);
    } finally { setGeneratingPdfPadres(false); }
  }

  function handleWhatsApp() {
    if (!plan) return;
    const lines = [`Programación *${TIPO_PLAN_LABEL[activeTab]}* · Semana del ${formatWeekRange(semana)}`, ``, `*Tema:* ${plan.tema_semanal}`, plan.descripcion_tema || null, ``].filter(Boolean) as string[];
    for (const s of sesiones) lines.push(`• *${DIA_LABEL[s.dia_semana]} ${formatDiaFecha(s.fecha)}:* ${s.objetivo || TIPO_SESION_LABEL[s.tipo_sesion]}`);
    lines.push(``, `Escuela de Golf CCB`);
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const diasRequeridos = DIAS_POR_TIPO[activeTab];
  const planCompleto   = plan !== null && diasRequeridos.every((d) => sesiones.some((s) => s.dia_semana === d && s.objetivo.trim() !== ""));
  const accentColor    = TIPO_PLAN_COLOR[activeTab];
  const busy           = generatingAI || savingGenerado || creandoPlan || deletingPlan;

  // ── Calendar week view ────────────────────────────────────────────────────
  function renderWeekCal() {
    const ROW_H  = 50;
    const HOURS  = Array.from({ length: CAL_HOUR_END - CAL_HOUR_START }, (_, i) => CAL_HOUR_START + i);
    const TOTAL_H = HOURS.length * ROW_H;

    function sesTop(hora: string): number {
      const [h, m] = hora.split(":").map(Number);
      return (h - CAL_HOUR_START) * ROW_H + (m / 60) * ROW_H;
    }
    function sesH(hi: string, hf: string): number {
      const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
      return Math.max(((toMin(hf) - toMin(hi)) / 60) * ROW_H, 24);
    }

    return (
      <div className="rounded-xl overflow-hidden shadow-sm" style={{ background: "#f0f5f0" }}>
        {calLoading && (
          <div className="flex items-center justify-center py-12" style={{ color: "#5a7a5a" }}>
            <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
            Cargando...
          </div>
        )}
        {!calLoading && (
          <div>
            {/* Day headers */}
            <div className="grid" style={{ gridTemplateColumns: "60px repeat(6, 1fr)", background: "#e8f0e6", borderBottom: "1px solid #d4e0d2" }}>
              <div style={{ borderRight: "1px solid #d4e0d2" }} />
              {CAL_DIAS.map((dia) => {
                const fecha = getFechaForDia(semana, dia);
                const isToday = fecha === toISODate(new Date());
                return (
                  <div key={dia} className="py-2.5 text-center" style={{ borderRight: "1px solid #d4e0d2" }}>
                    <p className="text-xs font-bold" style={{ color: "#1a3a1a" }}>{DIA_LABEL_SHORT[dia]}</p>
                    {isToday ? (
                      <span className="text-xs font-bold rounded-full px-1.5 inline-block mt-0.5" style={{ background: "#1a3a2a", color: "#ffffff" }}>
                        {formatDiaFecha(fecha)}
                      </span>
                    ) : (
                      <p className="text-xs mt-0.5" style={{ color: "#1a3a1a" }}>{formatDiaFecha(fecha)}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* All-day band for sessions without a scheduled time */}
            {calSesiones.some((s) => !s.hora_inicio) && (
              <div className="grid" style={{ gridTemplateColumns: "60px repeat(6, 1fr)", background: "#f5f8f4", borderBottom: "1px solid #d4e0d2" }}>
                <div style={{ borderRight: "1px solid #d4e0d2", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6, paddingBlock: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#6a8a6a", writingMode: "vertical-rl", transform: "rotate(180deg)" }}>sin hora</span>
                </div>
                {CAL_DIAS.map((dia) => {
                  const untimedSes = calSesiones.filter((s) => s.dia_semana === dia && !s.hora_inicio);
                  return (
                    <div key={dia} style={{ borderRight: "1px solid #d4e0d2", padding: "3px 4px", minHeight: 30, display: "flex", flexDirection: "column", gap: 2 }}>
                      {untimedSes.map((ses) => {
                        const c = CAL_EVENT[ses.tipo_plan] ?? { bg: "#334155", text: "#fff" };
                        return (
                          <div key={ses.id} style={{ background: c.bg, borderRadius: 4, padding: "2px 5px", cursor: "pointer", overflow: "hidden" }}
                            onClick={() => setCalEventDetail(ses)}>
                            <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {TIPO_SESION_LABEL[ses.tipo_sesion]}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Scrollable grid body */}
            <div style={{ overflowY: "auto", maxHeight: 520 }}>
              <div className="grid" style={{ gridTemplateColumns: "60px repeat(6, 1fr)", height: TOTAL_H }}>

                {/* Hour column */}
                <div style={{ position: "relative", height: TOTAL_H, background: "#e8f0e6", borderRight: "1px solid #d4e0d2" }}>
                  {HOURS.map((h) => (
                    <div key={h} style={{
                      position: "absolute", top: (h - CAL_HOUR_START) * ROW_H, left: 0, right: 0, height: ROW_H,
                      borderBottom: "1px solid #dde8db",
                      display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
                      paddingRight: 6, paddingTop: 4,
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#3a5a3a" }}>{fmtCalHour(h)}</span>
                    </div>
                  ))}
                </div>

                {/* Day columns */}
                {CAL_DIAS.map((dia) => {
                  const daySes = calSesiones.filter((s) => s.dia_semana === dia);
                  return (
                    <div key={dia} style={{ position: "relative", height: TOTAL_H, borderLeft: "1px solid #dde8db", background: "#f7faf6" }}>
                      {/* Hour grid lines */}
                      {HOURS.map((h) => (
                        <div
                          key={h}
                          style={{
                            position: "absolute", top: (h - CAL_HOUR_START) * ROW_H, left: 0, right: 0, height: ROW_H,
                            borderBottom: "1px solid #dde8db",
                            cursor: "pointer", transition: "background 0.1s",
                          }}
                          onClick={() => handleCalCellClick(dia, h)}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#eef5ec")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        />
                      ))}
                      {/* Sessions */}
                      {daySes.map((ses, si) => {
                        if (!ses.hora_inicio) return null;
                        const top    = sesTop(ses.hora_inicio);
                        const height = ses.hora_fin ? sesH(ses.hora_inicio, ses.hora_fin) : ROW_H;
                        const c      = CAL_EVENT[ses.tipo_plan] ?? { bg: "#334155", text: "#fff" };
                        const overlap = daySes.filter((s2, j) => j < si && s2.hora_inicio === ses.hora_inicio).length;
                        return (
                          <div
                            key={ses.id}
                            style={{
                              position: "absolute",
                              top: top + 2, height: Math.max(height - 4, 24),
                              left: `${3 + overlap * 5}px`, right: `${3 + overlap * 5}px`,
                              background: c.bg, borderRadius: 5,
                              padding: "3px 6px", overflow: "hidden",
                              cursor: "pointer", zIndex: 10 + si,
                            }}
                            onClick={(e) => { e.stopPropagation(); setCalEventDetail(ses); }}
                          >
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: c.text, lineHeight: 1.2 }}>
                              {TIPO_PLAN_LABEL[ses.tipo_plan]}
                            </p>
                            <p style={{ margin: "1px 0 0", fontSize: 11, color: c.text, opacity: 0.85 }}>
                              {ses.hora_inicio.slice(0, 5)}{ses.hora_fin ? `–${ses.hora_fin.slice(0, 5)}` : ""} · {LUGAR_LABEL[ses.lugar]?.split(" ")[0] ?? ""}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Calendar month view ───────────────────────────────────────────────────
  function renderMesCal() {
    const year = mesCal.getFullYear(); const month = mesCal.getMonth();
    const firstDay = new Date(year, month, 1); const lastDay = new Date(year, month + 1, 0);
    const todayStr = toISODate(new Date());
    let startDow = firstDay.getDay() - 1; if (startDow < 0) startDow = 6;
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    const HEADERS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

    const selectedDaySesiones = selectedCalDate ? calSesiones.filter((s) => s.fecha === selectedCalDate) : [];

    return (
      <div className="rounded-xl overflow-hidden shadow-sm" style={{ background: "#f0f5f0" }}>
        {/* Month nav */}
        <div className="flex items-center justify-between px-5 py-3" style={{ background: "#e8f0e6", borderBottom: "1px solid #d4e0d2" }}>
          <button onClick={prevMonth} className="p-1.5 rounded-lg transition-colors" style={{ color: "#3a5a3a" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#d4e8d0")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <h3 className="font-bold capitalize" style={{ color: "#1a3a2a" }}>
            {firstDay.toLocaleDateString("es-CO", { month: "long", year: "numeric" })}
          </h3>
          <button onClick={nextMonth} className="p-1.5 rounded-lg transition-colors" style={{ color: "#3a5a3a" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#d4e8d0")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>

        {calLoading && <div className="py-12 text-center text-sm" style={{ color: "#5a7a5a" }}>Cargando...</div>}

        {!calLoading && (
          <>
            {/* Day headers */}
            <div className="grid grid-cols-7" style={{ background: "#e8f0e6", borderBottom: "1px solid #d4e0d2" }}>
              {HEADERS.map((h) => (
                <div key={h} className="py-2 text-center text-[11px] font-bold uppercase" style={{ color: "#1a3a1a" }}>{h}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7">
              {cells.map((date, i) => {
                if (!date) return (
                  <div key={i} style={{ minHeight: 100, background: "#f0f5f0", borderBottom: "1px solid #dde8db", borderRight: "1px solid #dde8db" }} />
                );
                const dateStr = toISODate(date);
                const isToday = dateStr === todayStr;
                const isCurrentMonth = date.getMonth() === month;
                const daySes = calSesiones.filter((s) => s.fecha === dateStr);
                const isSelected = selectedCalDate === dateStr;

                return (
                  <div
                    key={i}
                    onClick={() => setSelectedCalDate(isSelected ? null : dateStr)}
                    style={{
                      minHeight: 100,
                      background: isSelected ? "#dff0e0" : "#f7faf6",
                      borderBottom: "1px solid #dde8db",
                      borderRight: "1px solid #dde8db",
                      padding: "6px",
                      cursor: "pointer",
                      opacity: !isCurrentMonth ? 0.4 : 1,
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "#eef5ec"; }}
                    onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "#f7faf6"; }}
                  >
                    <div style={{
                      width: 24, height: 24,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      borderRadius: "50%",
                      background: isToday ? "#1a3a2a" : "transparent",
                      color: isToday ? "#ffffff" : "#1a3a1a",
                      fontSize: 12, fontWeight: 700, marginBottom: 4,
                    }}>
                      {date.getDate()}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {daySes.slice(0, 3).map((s, j) => {
                        const c = CAL_EVENT[s.tipo_plan] ?? { bg: "#334155", text: "#fff" };
                        return (
                          <div key={j} style={{
                            background: c.bg, color: c.text,
                            borderRadius: 3, padding: "2px 5px",
                            fontSize: 11, fontWeight: 600, lineHeight: 1.35,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {s.hora_inicio ? s.hora_inicio.slice(0, 5) + " " : ""}{TIPO_PLAN_LABEL[s.tipo_plan]}
                          </div>
                        );
                      })}
                      {daySes.length > 3 && (
                        <div style={{ fontSize: 10, color: "#5a7a5a", paddingLeft: 2, fontWeight: 600 }}>
                          +{daySes.length - 3} más
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Selected day detail */}
            {selectedCalDate && (
              <div style={{ borderTop: "1px solid #d4e0d2", padding: "16px 20px" }}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold capitalize" style={{ color: "#1a3a2a" }}>
                    {new Date(selectedCalDate + "T00:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}
                  </h4>
                  <button onClick={() => setSelectedCalDate(null)} className="text-xs" style={{ color: "#5a7a5a" }}>✕</button>
                </div>
                {selectedDaySesiones.length === 0
                  ? <p className="text-xs italic" style={{ color: "#5a7a5a" }}>Sin sesiones de {TIPO_PLAN_LABEL[activeTab]} este día</p>
                  : (
                    <div className="space-y-2">
                      {selectedDaySesiones.map((ses) => {
                        const c = CAL_EVENT[ses.tipo_plan] ?? { bg: "#334155", text: "#fff" };
                        const tc = TIPO_SESION_COLOR[ses.tipo_sesion];
                        return (
                          <div key={ses.id} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: c.bg + "18", border: `1px solid ${c.bg}30` }}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-xs font-bold" style={{ color: c.bg }}>{TIPO_PLAN_LABEL[ses.tipo_plan]}</span>
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: tc.bg, color: tc.text }}>{TIPO_SESION_LABEL[ses.tipo_sesion]}</span>
                                <span className="text-[10px]" style={{ color: "#5a7a5a" }}>{LUGAR_LABEL[ses.lugar]}</span>
                                {ses.hora_inicio && <span className="text-[10px]" style={{ color: "#5a7a5a" }}>{formatHora(ses.hora_inicio)}–{formatHora(ses.hora_fin)}</span>}
                              </div>
                              {ses.objetivo && <p className="text-xs line-clamp-2" style={{ color: "#2a4a2a" }}>{ses.objetivo}</p>}
                            </div>
                            <button onClick={() => router.push(`/programacion/sesion/${ses.id}`)} className="text-[10px] font-semibold shrink-0" style={{ color: c.bg }}>
                              Asistencia →
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )
                }
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg pointer-events-none">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#4ade80" strokeWidth={2.5}><path d="M3 10l4 4 9-9"/></svg>
          {toast}
        </div>
      )}

      {/* ── Header: view toggle + navigator ── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        {/* View toggle */}
        <div className="flex gap-0.5 bg-gray-100 rounded-xl p-1">
          {([["plan", "Plan"], ["semana", "Semana"], ["mes", "Mes"]] as const).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${viewMode === mode ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Navigator */}
        {viewMode !== "mes" ? (
          <div className="flex items-center gap-2">
            <button onClick={prevWeek} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 18l-6-6 6-6"/></svg>
              Ant.
            </button>
            <div className="text-center">
              <p className="text-sm font-bold text-gray-900 leading-tight">{formatWeekRange(semana)}</p>
              <button onClick={goToday} className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors">esta semana</button>
            </div>
            <button onClick={nextWeek} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              Sig.
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button onClick={prevMonth} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <p className="text-sm font-bold text-gray-900 capitalize">{mesCal.toLocaleDateString("es-CO", { month: "long", year: "numeric" })}</p>
            <button onClick={nextMonth} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        )}
      </div>

      {/* ── Tabs (always visible) ── */}
      <div className="flex gap-1 border-b border-gray-200 mb-5">
        {(["juvenil", "competencia", "damas"] as TipoPlan[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg transition-all border-b-2 -mb-px ${activeTab === tab ? "border-current" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            style={activeTab === tab ? { color: TIPO_PLAN_COLOR[tab], borderColor: TIPO_PLAN_COLOR[tab] } : {}}
          >
            {TIPO_PLAN_LABEL[tab]}
          </button>
        ))}
      </div>

      {/* ── Action bar (create/delete plan) ── */}
      {viewMode === "plan" && !loading && (
        <div className="flex items-center justify-end mb-4 gap-2">
          {!plan ? (
            <button
              onClick={() => { if (activeTab === "competencia") { handleCrearPlanComp(); } else { resetCrearModal(); setShowCrearModal(true); } }}
              disabled={creandoPlan}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm hover:brightness-110 transition-all disabled:opacity-50"
              style={{ background: accentColor }}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              {activeTab === "competencia" ? "Crear plan" : "Planificar con IA"}
            </button>
          ) : (
            <>
              <button
                onClick={openEditTema}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Editar plan
              </button>
              <button
                onClick={() => setConfirmDeletePlan(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
              >
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6"/></svg>
                Borrar plan
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Calendar ── */}
      {viewMode === "semana" && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "#1a3a2a" }}>
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: CAL_EVENT[activeTab]?.bg ?? "#334" }} />
              {TIPO_PLAN_LABEL[activeTab]}
            </span>
            <span className="text-xs text-gray-400">· clic en celda vacía para agregar sesión</span>
          </div>
          {renderWeekCal()}
        </div>
      )}

      {viewMode === "mes" && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "#1a3a2a" }}>
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: CAL_EVENT[activeTab]?.bg ?? "#334" }} />
              {TIPO_PLAN_LABEL[activeTab]}
            </span>
          </div>
          {renderMesCal()}
        </div>
      )}

      {/* ── Plan list view ── */}
      {viewMode === "plan" && (
        loading ? (
          <div className="flex items-center justify-center py-24 text-gray-400">
            <svg className="animate-spin mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
            Cargando...
          </div>
        ) : !plan ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: accentColor + "15" }}>
              <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke={accentColor} strokeWidth={1.5}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            </div>
            <p className="text-base font-semibold text-gray-700 mb-1">Sin plan para esta semana</p>
            <p className="text-sm text-gray-400 mb-6">No hay plan {TIPO_PLAN_LABEL[activeTab]} para la semana seleccionada.</p>
            <button
              onClick={() => { if (activeTab === "competencia") { handleCrearPlanComp(); } else { resetCrearModal(); setShowCrearModal(true); } }}
              disabled={creandoPlan}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm hover:brightness-110 transition-all disabled:opacity-50"
              style={{ background: accentColor }}
            >
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              {activeTab === "competencia" ? "Crear plan" : "Planificar con IA"}
            </button>
          </div>
        ) : (
          <div id="plan-pdf-content">
            {/* Tema card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full" style={{ background: accentColor }} />
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Tema semanal · {TIPO_PLAN_LABEL[activeTab]}</span>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900 mb-1">{plan.tema_semanal}</h2>
                  {plan.descripcion_tema && <p className="text-sm text-gray-600">{plan.descripcion_tema}</p>}
                  {plan.objetivo_mensual && (
                    <div className="mt-3 flex items-start gap-2 bg-gray-50 rounded-lg px-3 py-2">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth={2} className="mt-0.5 shrink-0"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                      <span className="text-xs text-gray-500"><span className="font-semibold">Objetivo mensual:</span> {plan.objetivo_mensual}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  <button onClick={handleWhatsApp} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    WhatsApp
                  </button>
                  <button onClick={handlePdfPadres} disabled={generatingPdfPadres} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                    {generatingPdfPadres ? "..." : "PDF padres"}
                  </button>
                  {planCompleto && (
                    <button onClick={handlePdfSemanal} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                      PDF instructor
                    </button>
                  )}
                  <button onClick={openEditTema} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
                    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Day cards — supports multiple sessions per day */}
            <div className="space-y-3">
              {diasRequeridos.map((dia) => {
                const diaySesiones = sesiones.filter((s) => s.dia_semana === dia);
                const fecha = getFechaForDia(semana, dia);
                const isExpanded = expandedDias.has(dia);

                return (
                  <div key={dia} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    {/* Card header */}
                    <div
                      className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => diaySesiones.length > 0 && toggleDia(dia)}
                    >
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="w-20 shrink-0">
                          <p className="text-sm font-bold text-gray-900">{DIA_LABEL[dia]}</p>
                          <p className="text-xs text-gray-400">{formatDiaFecha(fecha)}</p>
                        </div>
                        {diaySesiones.length > 0 ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            {diaySesiones.slice(0, 2).map((ses) => {
                              const tc = TIPO_SESION_COLOR[ses.tipo_sesion];
                              return (
                                <span key={ses.id} className="flex items-center gap-1.5">
                                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: tc.bg, color: tc.text }}>{TIPO_SESION_LABEL[ses.tipo_sesion]}</span>
                                  {ses.hora_inicio && <span className="text-xs text-gray-400">{formatHora(ses.hora_inicio)}</span>}
                                </span>
                              );
                            })}
                            {diaySesiones.length > 2 && <span className="text-xs text-gray-400">+{diaySesiones.length - 2}</span>}
                            {diaySesiones.some((s) => s.asistencia_registrada) && (
                              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                                <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="#059669" strokeWidth={2.5}><path d="M3 10l4 4 9-9"/></svg>
                                Asistencia ✓
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300 italic">Sin sesión definida</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (activeTab === "juvenil") {
                              openJuvModal(dia, fecha, null);
                            } else if (activeTab === "competencia") {
                              openCompModal(dia, fecha, null);
                            } else {
                              openEditSesion(dia, null);
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          {(activeTab === "juvenil" || activeTab === "competencia") ? "+ Asignar" : "+ Agregar"}
                        </button>
                        {diaySesiones.length > 0 && (
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className={`text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}><path d="M19 9l-7 7-7-7"/></svg>
                        )}
                      </div>
                    </div>

                    {/* Expanded: all sessions for this day */}
                    {isExpanded && diaySesiones.length > 0 && (
                      <div className="border-t border-gray-50">
                        {diaySesiones.map((sesion, idx) => {
                          const tc = TIPO_SESION_COLOR[sesion.tipo_sesion];
                          return (
                            <div key={sesion.id} className={`px-5 pb-5 ${idx > 0 ? "border-t border-gray-50" : ""}`}>
                              <div className="pt-4 space-y-4">
                                {/* Session meta */}
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: tc.bg, color: tc.text }}>{TIPO_SESION_LABEL[sesion.tipo_sesion]}</span>
                                  {activeTab === "juvenil" ? (
                                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        onClick={() => setLugarMenuId(lugarMenuId === sesion.id ? null : sesion.id)}
                                        className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors flex items-center gap-1"
                                      >
                                        {LUGAR_LABEL[sesion.lugar]}
                                        <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M19 9l-7 7-7-7"/></svg>
                                      </button>
                                      {lugarMenuId === sesion.id && (
                                        <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[200px]">
                                          {(["campo_practica", "putting_green", "campo_pacos_fabios", "campo_infantil"] as Lugar[]).map((l) => (
                                            <button
                                              key={l}
                                              onClick={() => handleUpdateLugar(sesion.id, l)}
                                              className={`w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${sesion.lugar === l ? "font-semibold text-green-700" : "text-gray-700"}`}
                                            >
                                              {sesion.lugar === l && <svg width="10" height="10" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={2.5}><path d="M3 10l4 4 9-9"/></svg>}
                                              {LUGAR_LABEL[l]}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{LUGAR_LABEL[sesion.lugar]}</span>
                                  )}
                                  {sesion.hora_inicio && <span className="text-xs text-gray-400">{formatHora(sesion.hora_inicio)}–{formatHora(sesion.hora_fin)}</span>}
                                  <div className="relative ml-auto" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      onClick={() => { setLugarMenuId(null); setOpenMenuId(openMenuId === sesion.id ? null : sesion.id); }}
                                      className="flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-gray-700 border border-gray-200 rounded px-2 py-1 hover:bg-gray-50 transition-colors"
                                    >
                                      Opciones <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M19 9l-7 7-7-7"/></svg>
                                    </button>
                                    {openMenuId === sesion.id && (
                                      <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[160px]">
                                        <button
                                          onClick={() => {
                                            setOpenMenuId(null);
                                            if (activeTab === "juvenil") {
                                              openJuvModal(dia, fecha, sesion);
                                            } else if (activeTab === "competencia") {
                                              openCompModal(dia, fecha, sesion);
                                            } else {
                                              openEditSesion(dia, sesion);
                                            }
                                          }}
                                          className="w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                        >
                                          {(activeTab === "juvenil" || activeTab === "competencia") ? "🔄 Cambiar actividad" : "✏️ Editar sesión"}
                                        </button>
                                        <button
                                          onClick={() => { setOpenMenuId(null); setConfirmDeleteSesion(sesion); }}
                                          className="w-full text-left px-4 py-2.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                                        >
                                          🗑️ Eliminar sesión
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {sesion.objetivo && (
                                  <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Objetivo</p>
                                    <p className="text-sm text-gray-700">{sesion.objetivo}</p>
                                  </div>
                                )}

                                {sesion.estaciones_damas && sesion.estaciones_damas.length > 0 && (
                                  <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Estaciones</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                      {sesion.estaciones_damas.map((est, i) => (
                                        <div key={i} className="bg-fuchsia-50 border border-fuchsia-100 rounded-lg p-3">
                                          <p className="text-xs font-bold text-fuchsia-800 mb-0.5">Est. {i + 1}: {est.nombre}</p>
                                          <p className="text-xs text-fuchsia-700 mb-1">{est.lugar} · {est.duracion_min} min</p>
                                          <p className="text-xs text-gray-600">{est.descripcion}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {activeTab === "juvenil" && sesion.sesion_juvenil ? (
                                  <JuvenilSessionDetail
                                    sesion={sesion}
                                    jd={sesion.sesion_juvenil}
                                    onEdit={() => openJuvModal(dia, fecha, sesion)}
                                    onDelete={() => setConfirmDeleteSesion(sesion)}
                                    onPdf={() => handleJuvPdf(sesion)}
                                    onAsistencia={() => router.push(`/programacion/sesion/${sesion.id}`)}
                                    generatingPdf={generatingJuvPdf && juvPdfSesion?.id === sesion.id}
                                    accentColor={accentColor}
                                  />
                                ) : null}

                                {!(activeTab === "juvenil" && sesion.sesion_juvenil) && sesion.drills && sesion.drills.length > 0 && (
                                  <div>
                                    {/* Generic drills (Competencia / Damas legacy) */}
                                    <>
                                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Drills ({sesion.drills.length})</p>
                                        <div className="space-y-3">
                                          {sesion.drills.map((drill, i) => (
                                            <div key={i} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                                              <p className="text-sm font-semibold text-gray-900 mb-1">{i + 1}. {drill.titulo}</p>
                                              <p className="text-xs text-gray-600 mb-2">{drill.descripcion}</p>
                                              {activeTab === "juvenil" && (drill.dificultad_birdies || drill.dificultad_aguilas || drill.dificultad_albatros || drill.dificultad_mas14) && (
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                                  {[
                                                    { label: "Birdies", val: drill.dificultad_birdies, color: "#dbeafe", tc: "#1e40af" },
                                                    { label: "Águilas", val: drill.dificultad_aguilas, color: "#dcfce7", tc: "#166534" },
                                                    { label: "Albatros", val: drill.dificultad_albatros, color: "#fef9c3", tc: "#854d0e" },
                                                    { label: "+14", val: drill.dificultad_mas14, color: "#ede9fe", tc: "#6d28d9" },
                                                  ].filter((x) => x.val).map((x) => (
                                                    <div key={x.label} className="rounded-md p-2" style={{ background: x.color }}>
                                                      <p className="text-[10px] font-bold mb-0.5" style={{ color: x.tc }}>{x.label}</p>
                                                      <p className="text-[11px] text-gray-700">{x.val}</p>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                              {activeTab === "competencia" && (drill.metrica_exito || drill.variante_presion || drill.conexion_tecnica) && (
                                                <div className="space-y-1.5 mt-1">
                                                  {drill.metrica_exito && <div className="flex items-start gap-2 bg-blue-50 rounded px-2 py-1.5"><span className="text-[10px] font-bold text-blue-700 shrink-0 mt-0.5">META</span><span className="text-[11px] text-blue-900">{drill.metrica_exito}</span></div>}
                                                  {drill.variante_presion && <div className="flex items-start gap-2 bg-orange-50 rounded px-2 py-1.5"><span className="text-[10px] font-bold text-orange-700 shrink-0 mt-0.5">PRESIÓN</span><span className="text-[11px] text-orange-900">{drill.variante_presion}</span></div>}
                                                  {drill.conexion_tecnica && <div className="flex items-start gap-2 bg-purple-50 rounded px-2 py-1.5"><span className="text-[10px] font-bold text-purple-700 shrink-0 mt-0.5">TÉCNICA</span><span className="text-[11px] text-purple-900">{drill.conexion_tecnica}</span></div>}
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </>
                                  </div>
                                )}

                                {!(activeTab === "juvenil" && sesion.sesion_juvenil) && (
                                  <>
                                    {sesion.juego_competitivo && (
                                      <div className="bg-orange-50 border border-orange-100 rounded-lg p-3">
                                        <p className="text-xs font-semibold text-orange-700 mb-1">🏆 Juego competitivo</p>
                                        <p className="text-xs text-gray-700">{sesion.juego_competitivo}</p>
                                      </div>
                                    )}

                                    {sesion.notas && (
                                      <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3">
                                        <p className="text-xs font-semibold text-yellow-700 mb-1">📝 Notas</p>
                                        <p className="text-xs text-gray-700">{sesion.notas}</p>
                                      </div>
                                    )}

                                    <div className="pt-2 border-t border-gray-100">
                                      <button
                                        onClick={() => router.push(`/programacion/sesion/${sesion.id}`)}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${sesion.asistencia_registrada ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "text-white"}`}
                                        style={sesion.asistencia_registrada ? {} : { background: accentColor }}
                                      >
                                        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                        {sesion.asistencia_registrada ? "Ver asistencia" : "Pasar asistencia"}
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}

      {/* ══ MODAL: Agente IA — wizard 3 pasos ═════════════════════════════════ */}
      {showCrearModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => { if (!busy) { setShowCrearModal(false); resetCrearModal(); } }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-6" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">Planificar con IA — {TIPO_PLAN_LABEL[activeTab]}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{formatWeekRange(semana)}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  {[1, 2].map((s) => {
                    const isActive = s === 1 ? iaStep >= 1 : iaStep >= 3;
                    const isDone   = s === 1 ? iaStep >= 3 : false;
                    return (
                      <div key={s} className="flex items-center">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${isActive ? "text-white" : "bg-gray-100 text-gray-400"}`} style={isActive ? { background: accentColor } : {}}>
                          {isDone ? <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={3}><path d="M3 10l4 4 9-9"/></svg> : s}
                        </div>
                        {s < 2 && <div className={`w-5 h-0.5 mx-0.5 ${isDone ? "bg-current opacity-40" : "bg-gray-200"}`} style={isDone ? { color: accentColor } : {}} />}
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => { if (!busy) { setShowCrearModal(false); resetCrearModal(); } }} disabled={busy} className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            </div>

            {/* ── PASO 1 (Juvenil): Tema del día ── */}
            {iaStep === 1 && activeTab === "juvenil" && (
              <>
                <div className="px-6 py-6 space-y-4">
                  <div>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">Paso 1 de 2</p>
                    <h3 className="text-base font-bold text-gray-900">¿Cuál es el tema del día?</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {TEMAS_CHIP.juvenil.map((t) => (
                      <button key={t}
                        onClick={() => { setTemaChip(t === temaChip ? "" : t); setTemaCustom(""); }}
                        className="px-3 py-2 rounded-full text-sm font-semibold border transition-all"
                        style={temaChip === t ? { background: accentColor, color: "#fff", borderColor: accentColor } : { background: "#f9fafb", color: "#374151", borderColor: "#e5e7eb" }}
                      >{t}</button>
                    ))}
                  </div>
                  {planError && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{planError}</p>}
                </div>
                <div className="px-6 pb-6 flex flex-col gap-2">
                  <button
                    onClick={handleGenerarIA}
                    disabled={generatingAI}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:brightness-110 transition-all"
                    style={{ background: accentColor }}
                  >
                    {generatingAI
                      ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Generando...</>
                      : "⚡ Generar clase →"
                    }
                  </button>
                  <button onClick={handleCrearVacio} disabled={creandoPlan} className="text-xs text-gray-400 hover:text-gray-600 underline-offset-2 hover:underline disabled:opacity-50 transition-colors text-center">
                    {creandoPlan ? "Creando..." : "o crear plan vacío sin IA"}
                  </button>
                </div>
              </>
            )}

            {/* ── PASO 1 (Damas): Foco del mes ── */}
            {iaStep === 1 && activeTab === "damas" && (
              <>
                <div className="px-6 py-6 space-y-4">
                  <div>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">Paso 1 de 3</p>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-bold text-gray-900">¿Cuál es el foco de este mes?</h3>
                      <button
                        onClick={handleSugerirFocos}
                        disabled={suggestingFocos}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-50"
                        style={{ borderColor: accentColor + "60", color: accentColor, background: accentColor + "08" }}
                      >
                        {suggestingFocos
                          ? <><svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Sugiriendo...</>
                          : <><svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>Sugerir con IA</>
                        }
                      </button>
                    </div>

                    {/* AI suggestions cards */}
                    {suggestedFocos.length > 0 && (
                      <div className="mb-4">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Sugerencias del agente</p>
                        <div className="grid grid-cols-2 gap-2">
                          {suggestedFocos.map((sf, idx) => (
                            <button
                              key={idx}
                              onClick={() => { setFocoMesChip(sf.titulo); setFocoMesCustom(""); }}
                              className="text-left rounded-xl border p-3 transition-all"
                              style={focoMesChip === sf.titulo
                                ? { borderColor: accentColor, background: accentColor + "10" }
                                : { borderColor: "#e5e7eb", background: "#f9fafb" }}
                            >
                              <p className="text-xs font-bold text-gray-900 mb-0.5">{sf.titulo}</p>
                              <p className="text-[10px] text-gray-500 leading-snug">{sf.descripcion_corta}</p>
                            </button>
                          ))}
                        </div>
                        <div className="my-3 flex items-center gap-2"><div className="flex-1 h-px bg-gray-200"/><span className="text-[10px] text-gray-400 font-medium">o usa estas opciones</span><div className="flex-1 h-px bg-gray-200"/></div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 mb-3">
                      {FOCOS_MES.map((f) => (
                        <button key={f}
                          onClick={() => { setFocoMesChip(f === focoMesChip ? "" : f); setFocoMesCustom(""); }}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
                          style={focoMesChip === f ? { background: accentColor, color: "#fff", borderColor: accentColor } : { background: "#f9fafb", color: "#374151", borderColor: "#e5e7eb" }}
                        >{f}</button>
                      ))}
                    </div>
                    <input
                      value={focoMesCustom}
                      onChange={(e) => { setFocoMesCustom(e.target.value); setFocoMesChip(""); }}
                      placeholder="o escribe el foco del mes..."
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                    />
                  </div>
                  {planError && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{planError}</p>}
                </div>
                <div className="px-6 pb-6">
                  <button
                    onClick={() => {
                      const foco = focoMesChip || focoMesCustom.trim();
                      if (!foco) { setPlanError("Selecciona o escribe el foco del mes."); return; }
                      setPlanError(null); setIaStep(2);
                    }}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:brightness-110"
                    style={{ background: accentColor }}
                  >
                    Siguiente →
                  </button>
                </div>
              </>
            )}

            {/* ── PASO 2: Tema de la semana ── */}
            {iaStep === 2 && (
              <>
                <div className="px-6 py-6 space-y-5">
                  <div>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">Paso 2 de 3</p>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-base font-bold text-gray-900">¿Qué aspecto trabajamos esta semana?</h3>
                      <button
                        onClick={handleSugerirTemas}
                        disabled={suggestingTemas}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-50"
                        style={{ borderColor: accentColor + "60", color: accentColor, background: accentColor + "08" }}
                      >
                        {suggestingTemas
                          ? <><svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Sugiriendo...</>
                          : <><svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>Sugerir con IA</>
                        }
                      </button>
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold mb-4" style={{ background: accentColor + "18", color: accentColor }}>
                      <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                      Foco del mes: <span className="font-bold">{focoMesChip || focoMesCustom}</span>
                    </div>

                    {/* AI suggestions cards */}
                    {suggestedTemas.length > 0 && (
                      <div className="mb-4">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Sugerencias del agente</p>
                        <div className="grid grid-cols-2 gap-2">
                          {suggestedTemas.map((st, idx) => (
                            <button
                              key={idx}
                              onClick={() => { setTemaChip(st.titulo); setTemaCustom(""); }}
                              className="text-left rounded-xl border p-3 transition-all"
                              style={temaChip === st.titulo
                                ? { borderColor: accentColor, background: accentColor + "10" }
                                : { borderColor: "#e5e7eb", background: "#f9fafb" }}
                            >
                              <p className="text-xs font-bold text-gray-900 mb-0.5">{st.titulo}</p>
                              <p className="text-[10px] text-gray-500 leading-snug">{st.descripcion_corta}</p>
                            </button>
                          ))}
                        </div>
                        <div className="my-3 flex items-center gap-2"><div className="flex-1 h-px bg-gray-200"/><span className="text-[10px] text-gray-400 font-medium">o usa estas opciones</span><div className="flex-1 h-px bg-gray-200"/></div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 mb-3">
                      {TEMAS_CHIP[activeTab].map((t) => (
                        <button key={t}
                          onClick={() => { setTemaChip(t === temaChip ? "" : t); setTemaCustom(""); }}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
                          style={temaChip === t ? { background: accentColor, color: "#fff", borderColor: accentColor } : { background: "#f9fafb", color: "#374151", borderColor: "#e5e7eb" }}
                        >{t}</button>
                      ))}
                    </div>
                    <input
                      value={temaCustom}
                      onChange={(e) => { setTemaCustom(e.target.value); setTemaChip(""); }}
                      placeholder="o escribe el tema de la semana..."
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                    />
                  </div>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input type="checkbox" checked={incluirContexto} onChange={(e) => setIncluirContexto(e.target.checked)} className="w-4 h-4 rounded accent-green-700" />
                    <span className="text-sm text-gray-700">Considerar evaluaciones recientes del grupo en las sugerencias</span>
                  </label>
                  {planError && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{planError}</p>}
                </div>
                <div className="px-6 pb-4 flex gap-2">
                  <button onClick={() => { setPlanError(null); setIaStep(1); }} className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">← Atrás</button>
                  <button
                    onClick={handleGenerarIA}
                    disabled={generatingAI}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:brightness-110 transition-all"
                    style={{ background: accentColor }}
                  >
                    {generatingAI ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Generando...</> : "⚡ Generar plan →"}
                  </button>
                </div>
                <div className="px-6 pb-4 text-center">
                  <button onClick={handleCrearVacio} disabled={creandoPlan} className="text-xs text-gray-400 hover:text-gray-600 underline-offset-2 hover:underline disabled:opacity-50 transition-colors">
                    {creandoPlan ? "Creando..." : "o crear plan vacío sin IA"}
                  </button>
                </div>
              </>
            )}

            {/* ── PASO 3: Generando spinner ── */}
            {iaStep === 3 && generatingAI && (
              <div className="flex flex-col items-center justify-center py-20 px-6">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: accentColor + "15" }}>
                  <svg className="animate-spin h-7 w-7" fill="none" viewBox="0 0 24 24" style={{ color: accentColor }}><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                </div>
                <p className="text-base font-semibold text-gray-800 mb-1">Generando plan pedagógico...</p>
                <p className="text-sm text-gray-400">Esto toma 5–15 segundos</p>
              </div>
            )}

            {/* ── PASO 3: Preview editable ── */}
            {iaStep === 3 && !generatingAI && aiPreview && (
              <>
                <div className="flex items-center justify-between px-6 py-3 bg-green-50 border-b border-green-100">
                  <div className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#166534" strokeWidth={2.5}><path d="M3 10l4 4 9-9"/></svg>
                    <span className="text-xs font-semibold text-green-800">Plan generado — revisa y edita antes de guardar</span>
                  </div>
                  <p className="text-[11px] text-green-700">
                    {activeTab === "juvenil"
                      ? ((aiPreview.sesion_juvenil as SesionJuvenilLegacy | null)?.nombre_clase ?? "1 clase")
                      : `${aiPreview.sesiones.length} sesiones`}
                  </p>
                </div>
                {aiPreview.descripcion_tema && (
                  <div className="px-6 py-3 bg-gray-50 border-b border-gray-100">
                    <p className="text-xs text-gray-500 italic">{aiPreview.descripcion_tema}</p>
                  </div>
                )}
                {/* ── Preview Juvenil: clase compacta ── */}
                {activeTab === "juvenil" && aiPreview.sesion_juvenil && (() => {
                  const leg = aiPreview.sesion_juvenil as SesionJuvenilLegacy;
                  return (
                    <div className="px-4 py-4 max-h-[65vh] overflow-y-auto space-y-3">
                      <div className="p-4 rounded-xl border border-green-200 bg-green-50">
                        <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide mb-1">Clase generada · todas las sesiones de la semana</p>
                        <h4 className="text-sm font-bold text-gray-900">{leg.nombre_clase}</h4>
                        <p className="text-xs text-gray-600 mt-1">{leg.objetivo_simple}</p>
                      </div>
                      {leg.actividades?.map((act, idx) => (
                        <div key={idx} className="p-4 rounded-xl border border-gray-200 bg-white space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-green-100 text-green-800 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                            <p className="text-sm font-bold text-gray-900 flex-1">{act.nombre}</p>
                            <span className="text-xs text-gray-400 flex-shrink-0">{act.duracion_min} min</span>
                          </div>
                          <p className="text-xs text-gray-600 pl-7">{act.como_se_juega}</p>
                          {act.adaptacion_birdies && <p className="text-[11px] text-blue-600 pl-7">🐦 Birdies: {act.adaptacion_birdies}</p>}
                          {act.adaptacion_albatros && <p className="text-[11px] text-purple-600 pl-7">🦅 Albatros: {act.adaptacion_albatros}</p>}
                        </div>
                      ))}
                      {leg.actividad_estrella && (
                        <div className="p-3 rounded-xl border-2 border-amber-300 bg-amber-50">
                          <p className="text-xs font-bold text-amber-700">⭐ Actividad estrella: {leg.actividad_estrella}</p>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {/* ── Preview sesiones (Competencia / Damas) ── */}
                <div className="px-4 py-4 max-h-[65vh] overflow-y-auto space-y-3">
                  {aiPreview.sesiones.map((s, i) => {
                    const tc = TIPO_SESION_COLOR[s.tipo_sesion];
                    const diaBadge = activeTab === "competencia" ? COMP_DIA_BADGE[s.dia_semana] : null;
                    const hasOpciones = activeTab === "competencia" && s.opciones_actividad && s.opciones_actividad.length > 0;
                    const recIdx = s.opciones_actividad?.findIndex((o) => o.es_recomendada) ?? -1;
                    const curOpcionIdx = selectedOpcionIdx[i] ?? (recIdx >= 0 ? recIdx : 0);

                    return (
                      <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
                        {/* Session header row */}
                        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 flex-wrap">
                          {diaBadge ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: diaBadge.bg, color: diaBadge.text }}>{DIA_LABEL_SHORT[s.dia_semana]}</span>
                          ) : (
                            <span className="font-bold text-sm text-gray-900">{DIA_LABEL[s.dia_semana]}</span>
                          )}
                          {diaBadge && <span className="font-bold text-sm text-gray-900">{DIA_LABEL[s.dia_semana]}</span>}
                          <span className="text-xs text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5">{formatDiaFecha(s.fecha)}</span>
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: tc.bg, color: tc.text }}>{TIPO_SESION_LABEL[s.tipo_sesion]}</span>
                          {s.hora_inicio && <span className="text-xs text-gray-400">{s.hora_inicio.slice(0, 5)}–{s.hora_fin.slice(0, 5)}</span>}
                        </div>
                        <div className="px-4 py-3 space-y-3">
                          {/* Lugar + tipo */}
                          <div className="grid grid-cols-2 gap-2">
                            <select value={s.tipo_sesion} onChange={(e) => updatePreviewSesion(i, { tipo_sesion: e.target.value as TipoSesion })} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-green-500">
                              {(Object.keys(TIPO_SESION_LABEL) as TipoSesion[]).map((t) => <option key={t} value={t}>{TIPO_SESION_LABEL[t]}</option>)}
                            </select>
                            <select value={s.lugar} onChange={(e) => updatePreviewSesion(i, { lugar: e.target.value as Lugar })} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-green-500">
                              {(Object.keys(LUGAR_LABEL) as Lugar[]).map((l) => <option key={l} value={l}>{LUGAR_LABEL[l]}</option>)}
                            </select>
                          </div>

                          {/* Opciones de actividad — Competencia Martes */}
                          {hasOpciones && (
                            <div>
                              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Tipo de sesión — elige una opción:</p>
                              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(s.opciones_actividad!.length, 3)}, 1fr)` }}>
                                {s.opciones_actividad!.map((opt, optIdx) => {
                                  const isSelected = curOpcionIdx === optIdx;
                                  return (
                                    <button
                                      key={opt.id}
                                      onClick={() => handleSelectOpcion(i, optIdx)}
                                      className="text-left rounded-lg border p-2.5 transition-all text-left"
                                      style={isSelected
                                        ? { borderColor: "#16a34a", background: "#f0fdf4" }
                                        : { borderColor: "#e5e7eb", background: "#fff" }}
                                    >
                                      {opt.es_recomendada && (
                                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-green-700 bg-green-100 rounded-full px-1.5 py-0.5 mb-1.5">
                                          <svg width="8" height="8" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={3}><path d="M3 10l4 4 9-9"/></svg>
                                          Recomendada
                                        </span>
                                      )}
                                      <p className="text-[11px] font-bold text-gray-900 leading-tight">{opt.titulo}</p>
                                      <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">{opt.descripcion_corta}</p>
                                      {opt.justificacion && (
                                        <p className="text-[10px] mt-1 leading-snug italic" style={{ color: opt.es_recomendada ? "#16a34a" : "#9ca3af" }}>
                                          {opt.justificacion}
                                        </p>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Foco / objetivo */}
                          <textarea value={s.objetivo} onChange={(e) => updatePreviewSesion(i, { objetivo: e.target.value })} rows={2} placeholder="Foco principal del día..." className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-green-500" />
                          {/* Drills */}
                          {s.drills && s.drills.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Drills</p>
                                <button
                                  onClick={() => handleAbrirBiblioteca(i, s.tipo_sesion)}
                                  className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border transition-all"
                                  style={bibliotecaPanel?.sesionIdx === i
                                    ? { borderColor: "#1B4D2E", background: "#1B4D2E", color: "#fff" }
                                    : { borderColor: "#e5e7eb", background: "#f9fafb", color: "#374151" }}
                                >
                                  <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
                                  {bibliotecaPanel?.sesionIdx === i ? "Cerrar" : "Ver biblioteca"}
                                </button>
                              </div>
                              {s.drills.map((drill, j) => {
                                const dk = `${i}-${j}`;
                                const isOpen = expandedDrillKeys.has(dk);
                                return (
                                  <div key={j} className="border border-gray-100 rounded-lg overflow-hidden">
                                    <div className="flex items-start gap-2 px-3 py-2.5 bg-gray-50/60">
                                      <div className="flex-1 min-w-0 space-y-1.5">
                                        <input
                                          value={drill.titulo}
                                          onChange={(e) => updatePreviewDrill(i, j, { titulo: e.target.value })}
                                          placeholder="Título del drill"
                                          className="w-full bg-transparent text-xs font-semibold text-gray-800 border-0 border-b border-gray-200 pb-0.5 focus:outline-none focus:border-green-500"
                                        />
                                        <input
                                          value={drill.descripcion}
                                          onChange={(e) => updatePreviewDrill(i, j, { descripcion: e.target.value })}
                                          placeholder="Descripción..."
                                          className="w-full bg-transparent text-xs text-gray-500 border-0 focus:outline-none"
                                        />
                                      </div>
                                      {activeTab === "juvenil" && (
                                        <button
                                          onClick={() => toggleDrillKey(dk)}
                                          className="shrink-0 text-[10px] font-semibold text-blue-600 hover:text-blue-800 whitespace-nowrap"
                                        >
                                          {isOpen ? "▲ variantes" : "▼ variantes"}
                                        </button>
                                      )}
                                    </div>
                                    {/* Juvenil variantes accordion */}
                                    {activeTab === "juvenil" && isOpen && (
                                      <div className="grid grid-cols-2 gap-1.5 p-2.5 bg-white border-t border-gray-100">
                                        {[
                                          { key: "dificultad_birdies" as const, label: "Birdies", bg: "#dbeafe", tc: "#1e40af" },
                                          { key: "dificultad_aguilas" as const, label: "Águilas", bg: "#dcfce7", tc: "#166534" },
                                          { key: "dificultad_albatros" as const, label: "Albatros", bg: "#fef9c3", tc: "#854d0e" },
                                          { key: "dificultad_mas14" as const, label: "+14", bg: "#ede9fe", tc: "#6d28d9" },
                                        ].map(({ key, label, bg, tc: tcolor }) => (
                                          <div key={key} className="rounded p-1.5" style={{ background: bg }}>
                                            <p className="text-[9px] font-bold mb-1" style={{ color: tcolor }}>{label}</p>
                                            <textarea
                                              rows={2}
                                              value={drill[key] ?? ""}
                                              onChange={(e) => updatePreviewDrill(i, j, { [key]: e.target.value })}
                                              className="w-full bg-white rounded text-[10px] px-1.5 py-1 resize-none border-0 focus:outline-none focus:ring-1 focus:ring-blue-300"
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {/* Competencia — nuevos campos pedagógicos */}
                                    {activeTab === "competencia" && (drill.posicion_objetivo || drill.error_comun || drill.sensacion || drill.repeticiones || drill.metrica_exito) && (
                                      <div className="space-y-1 p-2.5 bg-white border-t border-gray-100">
                                        {drill.posicion_objetivo != null && (
                                          <div className="flex items-center gap-2 bg-green-50 rounded px-2 py-1">
                                            <span className="text-[9px] font-bold text-green-700 shrink-0 w-14">POSICIÓN</span>
                                            <input value={drill.posicion_objetivo ?? ""} onChange={(e) => updatePreviewDrill(i, j, { posicion_objetivo: e.target.value })} className="flex-1 bg-transparent text-[10px] text-green-900 border-0 focus:outline-none" />
                                          </div>
                                        )}
                                        {drill.metrica_exito != null && (
                                          <div className="flex items-center gap-2 bg-blue-50 rounded px-2 py-1">
                                            <span className="text-[9px] font-bold text-blue-700 shrink-0 w-14">META</span>
                                            <input value={drill.metrica_exito ?? ""} onChange={(e) => updatePreviewDrill(i, j, { metrica_exito: e.target.value })} className="flex-1 bg-transparent text-[10px] text-blue-900 border-0 focus:outline-none" />
                                          </div>
                                        )}
                                        {drill.error_comun != null && (
                                          <div className="flex items-center gap-2 bg-red-50 rounded px-2 py-1">
                                            <span className="text-[9px] font-bold text-red-600 shrink-0 w-14">ERROR</span>
                                            <input value={drill.error_comun ?? ""} onChange={(e) => updatePreviewDrill(i, j, { error_comun: e.target.value })} className="flex-1 bg-transparent text-[10px] text-red-900 border-0 focus:outline-none" />
                                          </div>
                                        )}
                                        {drill.sensacion != null && (
                                          <div className="flex items-center gap-2 bg-purple-50 rounded px-2 py-1">
                                            <span className="text-[9px] font-bold text-purple-700 shrink-0 w-14">SENSACIÓN</span>
                                            <input value={drill.sensacion ?? ""} onChange={(e) => updatePreviewDrill(i, j, { sensacion: e.target.value })} className="flex-1 bg-transparent text-[10px] text-purple-900 border-0 focus:outline-none" />
                                          </div>
                                        )}
                                        {drill.repeticiones != null && (
                                          <div className="flex items-center gap-2 bg-gray-50 rounded px-2 py-1">
                                            <span className="text-[9px] font-bold text-gray-600 shrink-0 w-14">REPS</span>
                                            <input value={drill.repeticiones ?? ""} onChange={(e) => updatePreviewDrill(i, j, { repeticiones: e.target.value })} className="flex-1 bg-transparent text-[10px] text-gray-700 border-0 focus:outline-none" />
                                          </div>
                                        )}
                                        {/* Backward compat: mostrar campos viejos si no hay nuevos */}
                                        {!drill.posicion_objetivo && drill.variante_presion != null && (
                                          <div className="flex items-center gap-2 bg-orange-50 rounded px-2 py-1">
                                            <span className="text-[9px] font-bold text-orange-700 shrink-0 w-14">PRESIÓN</span>
                                            <input value={drill.variante_presion ?? ""} onChange={(e) => updatePreviewDrill(i, j, { variante_presion: e.target.value })} className="flex-1 bg-transparent text-[10px] text-orange-900 border-0 focus:outline-none" />
                                          </div>
                                        )}
                                        {!drill.posicion_objetivo && drill.conexion_tecnica != null && (
                                          <div className="flex items-center gap-2 bg-purple-50 rounded px-2 py-1">
                                            <span className="text-[9px] font-bold text-purple-700 shrink-0 w-14">TÉCNICA</span>
                                            <input value={drill.conexion_tecnica ?? ""} onChange={(e) => updatePreviewDrill(i, j, { conexion_tecnica: e.target.value })} className="flex-1 bg-transparent text-[10px] text-purple-900 border-0 focus:outline-none" />
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {/* Panel biblioteca de drills */}
                          {bibliotecaPanel?.sesionIdx === i && (
                            <div className="border border-green-200 bg-green-50 rounded-xl p-3 space-y-2">
                              <p className="text-[11px] font-bold text-green-800 uppercase tracking-wide">📚 Biblioteca — drills aprobados</p>
                              {bibliotecaPanel.loading ? (
                                <p className="text-xs text-gray-400 py-2 text-center">Cargando...</p>
                              ) : bibliotecaPanel.drills.length === 0 ? (
                                <p className="text-xs text-gray-500 py-2 text-center italic">No hay drills aprobados para este tipo de sesión</p>
                              ) : (
                                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                  {bibliotecaPanel.drills.map(bd => (
                                    <div key={bd.id} className="flex items-start gap-2 bg-white rounded-lg p-2.5 border border-green-100">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[11px] font-bold text-gray-800 leading-snug">{bd.titulo}</p>
                                        <p className="text-[10px] text-gray-500 leading-snug truncate">{bd.descripcion}</p>
                                        <div className="flex gap-1 mt-1">
                                          {bd.posicion_swing?.map(p => (
                                            <span key={p} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{background:"#e8f5e9",color:"#2d5a27"}}>{p}</span>
                                          ))}
                                          {bd.duracion_minutos && <span className="text-[9px] text-gray-400">⏱ {bd.duracion_minutos}min</span>}
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => handleUsarDrillBiblioteca(i, bd)}
                                        className="shrink-0 text-[10px] font-bold px-2 py-1.5 rounded-lg bg-green-700 text-white hover:bg-green-800 transition-colors whitespace-nowrap"
                                      >↩ Usar</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Estaciones damas */}
                          {s.estaciones_damas && s.estaciones_damas.length > 0 && (
                            <div className="space-y-1.5">
                              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Estaciones</p>
                              {s.estaciones_damas.map((est, k) => (
                                <div key={k} className="flex gap-2 bg-fuchsia-50 rounded-lg px-3 py-2">
                                  <span className="text-[10px] font-bold text-fuchsia-800 shrink-0 w-28">{est.nombre}</span>
                                  <span className="text-[10px] text-gray-500 flex-1">{est.descripcion}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Juego competitivo */}
                          {s.juego_competitivo !== null && (
                            <div>
                              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Juego competitivo</p>
                              <input
                                value={s.juego_competitivo ?? ""}
                                onChange={(e) => updatePreviewSesion(i, { juego_competitivo: e.target.value || null })}
                                className="w-full border border-orange-200 bg-orange-50 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="px-5 pb-5 pt-3 border-t border-gray-100 space-y-2">
                  {planError && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{planError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setAiPreview(null); setIaStep(activeTab === "competencia" ? 1 : activeTab === "juvenil" ? 1 : 2); }}
                      className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      ← Regenerar
                    </button>
                    <button
                      onClick={handleGuardarPlanIA}
                      disabled={savingGenerado}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:brightness-110 transition-all"
                      style={{ background: accentColor }}
                    >
                      {savingGenerado ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Guardando...</> : "✓ Guardar plan completo"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ MODAL: Editar tema ════════════════════════════════════════════════ */}
      {showEditTema && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowEditTema(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Editar tema semanal</h2>
              <button onClick={() => setShowEditTema(false)} className="text-gray-400 hover:text-gray-600"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Tema semanal</label><input value={temaForm.tema_semanal} onChange={(e) => setTemaForm((f) => ({ ...f, tema_semanal: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" /></div>
              <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Descripción</label><textarea value={temaForm.descripcion_tema} onChange={(e) => setTemaForm((f) => ({ ...f, descripcion_tema: e.target.value }))} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none" /></div>
              <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Objetivo mensual</label><input value={temaForm.objetivo_mensual} onChange={(e) => setTemaForm((f) => ({ ...f, objetivo_mensual: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" /></div>
            </div>
            <div className="px-6 pb-5 flex gap-2">
              <button onClick={handleSaveTema} disabled={savingTema} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: accentColor }}>{savingTema ? "Guardando..." : "Guardar cambios"}</button>
              <button onClick={() => setShowEditTema(false)} className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Editar / crear sesión ══════════════════════════════════════ */}
      {editSesionCtx && sesionForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => { if (!savingSesion) { setEditSesionCtx(null); setSesionForm(null); } }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <div>
                <h2 className="font-bold text-gray-900">{editSesionCtx.sesion ? "Editar sesión" : "Nueva sesión"} — {DIA_LABEL[editSesionCtx.dia]}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{formatDiaFecha(editSesionCtx.fecha)}</p>
              </div>
              <button onClick={() => { setEditSesionCtx(null); setSesionForm(null); }} className="text-gray-400 hover:text-gray-600"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg></button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Tipo de sesión</label>
                  <select value={sesionForm.tipo_sesion} onChange={(e) => setSesionForm((f) => f ? { ...f, tipo_sesion: e.target.value as TipoSesion } : f)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 bg-white">
                    {(Object.keys(TIPO_SESION_LABEL) as TipoSesion[]).map((t) => <option key={t} value={t}>{TIPO_SESION_LABEL[t]}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Lugar</label>
                  <select value={sesionForm.lugar} onChange={(e) => setSesionForm((f) => f ? { ...f, lugar: e.target.value as Lugar } : f)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 bg-white">
                    {(Object.keys(LUGAR_LABEL) as Lugar[]).map((l) => <option key={l} value={l}>{LUGAR_LABEL[l]}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Hora inicio</label><input type="time" value={sesionForm.hora_inicio} onChange={(e) => setSesionForm((f) => f ? { ...f, hora_inicio: e.target.value } : f)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" /></div>
                <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Hora fin</label><input type="time" value={sesionForm.hora_fin} onChange={(e) => setSesionForm((f) => f ? { ...f, hora_fin: e.target.value } : f)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" /></div>
              </div>
              <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Objetivo</label>
                <textarea value={sesionForm.objetivo} onChange={(e) => setSesionForm((f) => f ? { ...f, objetivo: e.target.value } : f)} placeholder="Qué van a lograr al finalizar esta sesión..." rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none" />
              </div>

              {activeTab === "damas" && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-gray-700">Estaciones ({sesionForm.estaciones_damas.length})</label>
                    <button onClick={() => setSesionForm((f) => f ? { ...f, estaciones_damas: [...f.estaciones_damas, defaultEstacion()] } : f)} className="text-xs text-fuchsia-700 font-medium hover:underline">+ Agregar</button>
                  </div>
                  <div className="space-y-3">
                    {sesionForm.estaciones_damas.map((est, i) => (
                      <div key={i} className="border border-fuchsia-100 bg-fuchsia-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2"><span className="text-xs font-bold text-fuchsia-800">Est. {i + 1}</span><button onClick={() => setSesionForm((f) => f ? { ...f, estaciones_damas: f.estaciones_damas.filter((_, j) => j !== i) } : f)} className="text-xs text-red-400">Eliminar</button></div>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <input placeholder="Nombre" value={est.nombre} onChange={(e) => setSesionForm((f) => { if (!f) return f; const d = [...f.estaciones_damas]; d[i] = { ...d[i], nombre: e.target.value }; return { ...f, estaciones_damas: d }; })} className="border border-gray-200 rounded px-2 py-1.5 text-xs" />
                          <input placeholder="Lugar/área" value={est.lugar} onChange={(e) => setSesionForm((f) => { if (!f) return f; const d = [...f.estaciones_damas]; d[i] = { ...d[i], lugar: e.target.value }; return { ...f, estaciones_damas: d }; })} className="border border-gray-200 rounded px-2 py-1.5 text-xs" />
                        </div>
                        <div className="flex items-center gap-2 mb-2"><input type="number" min={5} max={60} value={est.duracion_min} onChange={(e) => setSesionForm((f) => { if (!f) return f; const d = [...f.estaciones_damas]; d[i] = { ...d[i], duracion_min: +e.target.value }; return { ...f, estaciones_damas: d }; })} className="w-20 border border-gray-200 rounded px-2 py-1.5 text-xs" /><span className="text-xs text-gray-400">min</span></div>
                        <textarea placeholder="Descripción..." value={est.descripcion} onChange={(e) => setSesionForm((f) => { if (!f) return f; const d = [...f.estaciones_damas]; d[i] = { ...d[i], descripcion: e.target.value }; return { ...f, estaciones_damas: d }; })} rows={2} className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs resize-none" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab !== "damas" && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-gray-700">Drills ({sesionForm.drills.length})</label>
                    <button onClick={() => setSesionForm((f) => f ? { ...f, drills: [...f.drills, defaultDrill()] } : f)} className="text-xs font-medium hover:underline" style={{ color: accentColor }}>+ Agregar drill</button>
                  </div>
                  <div className="space-y-3">
                    {sesionForm.drills.map((drill, i) => (
                      <div key={i} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                        <div className="flex items-center justify-between mb-2"><span className="text-xs font-semibold text-gray-600">Drill {i + 1}</span><button onClick={() => setSesionForm((f) => f ? { ...f, drills: f.drills.filter((_, j) => j !== i) } : f)} className="text-xs text-red-400">Eliminar</button></div>
                        <input placeholder="Título del drill" value={drill.titulo} onChange={(e) => setSesionForm((f) => { if (!f) return f; const d = [...f.drills]; d[i] = { ...d[i], titulo: e.target.value }; return { ...f, drills: d }; })} className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs mb-2 focus:outline-none focus:ring-1 focus:ring-green-500" />
                        <textarea placeholder="Descripción y ejecución..." value={drill.descripcion} onChange={(e) => setSesionForm((f) => { if (!f) return f; const d = [...f.drills]; d[i] = { ...d[i], descripcion: e.target.value }; return { ...f, drills: d }; })} rows={2} className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs mb-2 resize-none focus:outline-none focus:ring-1 focus:ring-green-500" />
                        {activeTab === "juvenil" && (
                          <div className="grid grid-cols-2 gap-2">
                            {[{ key: "dificultad_birdies" as const, label: "Birdies", color: "#dbeafe" }, { key: "dificultad_aguilas" as const, label: "Águilas", color: "#dcfce7" }, { key: "dificultad_albatros" as const, label: "Albatros", color: "#fef9c3" }, { key: "dificultad_mas14" as const, label: "+14", color: "#ede9fe" }].map(({ key, label, color }) => (
                              <div key={key} className="rounded p-1.5" style={{ background: color }}>
                                <p className="text-[10px] font-bold text-gray-500 mb-1">{label}</p>
                                <textarea placeholder={`Adaptación ${label}...`} value={drill[key] ?? ""} onChange={(e) => setSesionForm((f) => { if (!f) return f; const d = [...f.drills]; d[i] = { ...d[i], [key]: e.target.value }; return { ...f, drills: d }; })} rows={2} className="w-full bg-white border border-gray-200 rounded px-1.5 py-1 text-[11px] resize-none" />
                              </div>
                            ))}
                          </div>
                        )}
                        {activeTab === "competencia" && (
                          <div className="space-y-2 mt-1">
                            {[{ key: "metrica_exito" as const, label: "Métrica de éxito", color: "#eff6ff" }, { key: "variante_presion" as const, label: "Variante de presión", color: "#fff7ed" }, { key: "conexion_tecnica" as const, label: "Conexión técnica", color: "#faf5ff" }].map(({ key, label, color }) => (
                              <div key={key} className="rounded p-1.5" style={{ background: color }}>
                                <p className="text-[10px] font-bold text-gray-500 mb-1">{label}</p>
                                <textarea placeholder="..." value={drill[key] ?? ""} onChange={(e) => setSesionForm((f) => { if (!f) return f; const d = [...f.drills]; d[i] = { ...d[i], [key]: e.target.value }; return { ...f, drills: d }; })} rows={2} className="w-full bg-white border border-gray-200 rounded px-1.5 py-1 text-[11px] resize-none" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab !== "damas" && (
                <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Juego competitivo <span className="text-gray-400 font-normal">(opcional)</span></label>
                  <textarea value={sesionForm.juego_competitivo} onChange={(e) => setSesionForm((f) => f ? { ...f, juego_competitivo: e.target.value } : f)} placeholder="Actividad competitiva al final..." rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none" />
                </div>
              )}
              <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Notas <span className="text-gray-400 font-normal">(opcional)</span></label>
                <textarea value={sesionForm.notas} onChange={(e) => setSesionForm((f) => f ? { ...f, notas: e.target.value } : f)} placeholder="Observaciones adicionales..." rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none" />
              </div>
              {sesionError && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{sesionError}</p>}
            </div>
            <div className="px-6 pb-5 flex gap-2 border-t border-gray-100 pt-4">
              <button onClick={handleSaveSesion} disabled={savingSesion} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: accentColor }}>{savingSesion ? "Guardando..." : "Guardar sesión"}</button>
              <button onClick={() => { setEditSesionCtx(null); setSesionForm(null); }} className="px-5 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Detalle evento calendario ════════════════════════════════ */}
      {calEventDetail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setCalEventDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100" style={{ borderLeft: `4px solid ${CAL_COLOR[calEventDetail.tipo_plan].border}` }}>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-bold" style={{ color: CAL_COLOR[calEventDetail.tipo_plan].border }}>{TIPO_PLAN_LABEL[calEventDetail.tipo_plan]}</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: TIPO_SESION_COLOR[calEventDetail.tipo_sesion].bg, color: TIPO_SESION_COLOR[calEventDetail.tipo_sesion].text }}>{TIPO_SESION_LABEL[calEventDetail.tipo_sesion]}</span>
                </div>
                <p className="text-sm font-bold text-gray-900">{DIA_LABEL[calEventDetail.dia_semana]} · {formatDiaFecha(calEventDetail.fecha)}</p>
              </div>
              <button onClick={() => setCalEventDetail(null)} className="text-gray-400 hover:text-gray-600"><svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex gap-3 text-xs text-gray-500">
                <span>{LUGAR_LABEL[calEventDetail.lugar]}</span>
                {calEventDetail.hora_inicio && <><span>·</span><span>{formatHora(calEventDetail.hora_inicio)}–{formatHora(calEventDetail.hora_fin)}</span></>}
              </div>
              {calEventDetail.objetivo && <p className="text-sm text-gray-700">{calEventDetail.objetivo}</p>}
              {calEventDetail.drills?.length > 0 && <p className="text-xs text-gray-400">{calEventDetail.drills.length} drills: {calEventDetail.drills.map((d) => d.titulo).join(" · ")}</p>}
              {calEventDetail.juego_competitivo && <div className="bg-orange-50 rounded-lg px-3 py-2"><p className="text-xs font-semibold text-orange-700 mb-0.5">🏆 Juego competitivo</p><p className="text-xs text-gray-700">{calEventDetail.juego_competitivo}</p></div>}
            </div>
            <div className="px-5 pb-4 flex gap-2">
              <button
                onClick={() => { router.push(`/programacion/sesion/${calEventDetail.id}`); setCalEventDetail(null); }}
                className="flex-1 py-2 rounded-xl text-xs font-semibold text-white"
                style={{ background: CAL_COLOR[calEventDetail.tipo_plan].border }}
              >
                Pasar asistencia →
              </button>
              <button
                onClick={() => {
                  setCalEventDetail(null);
                  setActiveTab(calEventDetail.tipo_plan);
                  setViewMode("plan");
                  if (calEventDetail.tipo_plan === "juvenil") {
                    setTimeout(() => openJuvModal(calEventDetail.dia_semana, calEventDetail.fecha, calEventDetail as unknown as SesionSemana), 100);
                  } else {
                    setTimeout(() => openEditSesion(calEventDetail.dia_semana, calEventDetail), 100);
                  }
                }}
                className="px-3 py-2 rounded-xl text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Editar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Confirmar eliminar sesión ════════════════════════════════ */}
      {confirmDeleteSesion && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setConfirmDeleteSesion(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#dc2626" strokeWidth={2}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6"/></svg>
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Eliminar sesión</h3>
                <p className="text-xs text-gray-500 mt-0.5">{DIA_LABEL[confirmDeleteSesion.dia_semana]} · {TIPO_SESION_LABEL[confirmDeleteSesion.tipo_sesion]}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-5">¿Eliminar esta sesión? Esta acción no se puede deshacer.</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleDeleteSesion(confirmDeleteSesion)}
                disabled={deletingSesion}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deletingSesion ? "Eliminando..." : "Sí, eliminar"}
              </button>
              <button
                onClick={() => setConfirmDeleteSesion(null)}
                className="px-5 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Confirmar borrar plan ═════════════════════════════════════ */}
      {confirmDeletePlan && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { if (!deletingPlan) setConfirmDeletePlan(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#dc2626" strokeWidth={2}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6"/></svg>
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Borrar plan semanal</h3>
                <p className="text-xs text-gray-500 mt-0.5">{TIPO_PLAN_LABEL[activeTab]} · {formatWeekRange(semana)}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-5">Esto eliminará el plan y <strong>todas las sesiones</strong> de la semana. Esta acción no se puede deshacer.</p>
            <div className="flex gap-2">
              <button
                onClick={handleBorrarPlan}
                disabled={deletingPlan}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deletingPlan ? "Borrando..." : "Sí, borrar todo"}
              </button>
              <button
                onClick={() => setConfirmDeletePlan(false)}
                disabled={deletingPlan}
                className="px-5 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hidden PDF padres — template landscape A4 ────────────────────── */}
      <div ref={padresPdfRef} style={{ position: "absolute", left: "-9999px", top: 0 }}>
        {plan && (
          <WeeklyPlanPDFTemplate
            plan={plan}
            sesiones={sesiones}
            tipoPlan={activeTab}
            semana={semana}
          />
        )}
      </div>

      {/* ── Hidden PDF sesión juvenil individual ─────────────────────────── */}
      <div ref={juvPdfRef} style={{ position: "absolute", left: "-9999px", top: 0, pointerEvents: "none" }}>
        {juvPdfSesion?.sesion_juvenil && (
          <JuvenilPDFHidden sesion={juvPdfSesion} />
        )}
      </div>

      {/* ══ MODAL: Clase Juvenil IA ══════════════════════════════════════════ */}
      {juvClassCtx && plan && (
        <JuvenileClassModal
          planId={plan.id}
          dia={juvClassCtx.dia}
          diaLabel={DIA_LABEL[juvClassCtx.dia]}
          fecha={juvClassCtx.fecha}
          horaInicio={juvClassCtx.horaInicio}
          horaFin={juvClassCtx.horaFin}
          sesionExistente={juvClassCtx.sesion ?? undefined}
          onClose={() => setJuvClassCtx(null)}
          onSaved={async () => {
            setJuvClassCtx(null);
            showToast("Clase guardada ✓");
            await fetchPlan();
            if (viewMode === "semana") fetchCalSemana();
          }}
        />
      )}

      {/* ══ MODAL: Clase Competencia IA ══════════════════════════════════════ */}
      {compClassCtx && plan && (
        <CompetenciaClassModal
          planId={plan.id}
          dia={compClassCtx.dia}
          diaLabel={DIA_LABEL[compClassCtx.dia]}
          fecha={compClassCtx.fecha}
          horaInicio={compClassCtx.horaInicio}
          horaFin={compClassCtx.horaFin}
          sesionExistente={compClassCtx.sesion ?? undefined}
          onClose={() => setCompClassCtx(null)}
          onSaved={async () => {
            setCompClassCtx(null);
            showToast("Sesión guardada ✓");
            await fetchPlan();
            if (viewMode === "semana") fetchCalSemana();
          }}
        />
      )}
    </div>
  );
}
