"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import JuvenileClassModal, {
  type SesionJuvenilData,
  type SesionJuvenilLegacy,
  type SesionJuvenilEstaciones,
  type SesionJuvenilEspecial,
} from "./JuvenileClassModal";
import CompetenciaClassModal from "./CompetenciaClassModal";
import DamasClassModal from "./DamasClassModal";
import PacoPlanningModal from "./PacoPlanningModal";
import ActividadEspecialWizard from "./ActividadEspecialWizard";
import PacoPlanWizard from "./PacoPlanWizard";
import EventoDiaSinEscuelaModal from "./EventoDiaSinEscuelaModal";
import { isStaff, type Rol } from "@/lib/roles";
import { formatWhatsAppMessage, openWhatsApp } from "@/lib/whatsapp-formatter";
import { CalendarDays } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
export type TipoPlan   = "juvenil" | "competencia" | "damas";
export type DiaSemana  = "martes" | "miercoles" | "jueves" | "viernes" | "sabado" | "domingo";
export type TipoSesion = "tiro_largo" | "juego_corto" | "putt" | "campo" | "test_tecnico" | "test_fisico" | "trabajo_fisico" | "competencia" | "damas_estaciones" | "juvenil_estaciones";
export type Lugar      = "campo_practica" | "putting_green" | "campo_infantil" | "campo_pacos_fabios" | "campo_completo";
type ViewMode   = "plan" | "semana" | "mes";

export interface Drill {
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

// categoria/drills son nuevos (planeación manual guiada, ver DamasClassModal) —
// nombre/lugar/duracion_min/descripcion siguen siendo lo único que dato viejo
// trae, por eso quedan obligatorios y sesionesToEstaciones los sigue leyendo
// igual que antes cuando no hay drills.
export interface EstacionDamas {
  nombre: string; lugar: string; duracion_min: number; descripcion: string;
  categoria?: string;
  drills?: { titulo: string; descripcion: string; id?: string; series_repeticiones?: string | null }[];
}

export interface DrillLibre { titulo: string; descripcion: string; }

// Un drill/ejercicio dentro de una estación de Competencia — series_repeticiones
// solo aplica a ejercicios de Trabajo físico (vienen de ejercicios_fisicos, no
// de la biblioteca de drills técnicos).
export interface DrillEstacionCompetencia extends DrillLibre {
  series_repeticiones?: string | null;
}

// Estación individual dentro de una sesión de Competencia con más de una
// categoría combinada (ej. Juego corto + Trabajo físico el mismo día) —
// cada una guarda su propio lugar, foco, drills/ejercicios y reto, por separado.
export interface EstacionCompetencia {
  categoria: TipoSesion;
  objetivo: string;
  lugar: Lugar;
  drills: DrillEstacionCompetencia[];
  juego_competitivo: string | null;
}
export interface EstacionLibre { nombre: string; lugar: string; horario: string; drills: DrillLibre[]; }

export type CategoriaEstacionEspecial = "juego_largo" | "juego_corto" | "putt";
export interface JuegoEstructurado {
  nombre: string; objetivo_pedagogico: string; materiales: string;
  instrucciones_profesor: string; explicacion_ninos: string; reglas: string[];
}
export interface EstacionEstructurada {
  categoria: CategoriaEstacionEspecial; duracion_min: number; juego: JuegoEstructurado;
}
export interface EjercicioCalentamiento { nombre: string; duracion_min: number; descripcion: string; }
export interface Calentamiento { incluye: boolean; duracion_min: number; ejercicios: EjercicioCalentamiento[]; }
export interface ReplicaTurno { hora_inicio: string; nombre_grupo: string; }
export interface Replicas { turnos: ReplicaTurno[]; }

export interface ActividadEspecial {
  id: string; nombre: string; grupos: TipoPlan[]; fecha: string;
  hora_inicio: string | null; hora_fin: string | null;
  tipo_estructura: "estaciones" | "libre";
  estaciones: (EstacionLibre | EstacionEstructurada)[];
  calentamiento: Calentamiento | null; replicas: Replicas | null;
  notas: string | null; created_at: string;
}

export const CATEGORIA_ESTACION_LABEL: Record<CategoriaEstacionEspecial, string> = {
  juego_largo: "Juego Largo", juego_corto: "Juego Corto", putt: "Putt",
};

export function esEstacionEstructurada(e: EstacionLibre | EstacionEstructurada): e is EstacionEstructurada {
  return "juego" in e;
}

export interface EventoCalendario {
  id: string; nombre: string; fecha_inicio: string; fecha_fin: string | null;
  descripcion: string | null; tipo: "especial" | "institucional";
}
export interface DiaSinEscuela { id: string; fecha_inicio: string; fecha_fin: string; motivo: string | null; }

export function fechaEnRango(fecha: string, inicio: string, fin: string | null): boolean {
  return fecha >= inicio && fecha <= (fin ?? inicio);
}

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

export interface PlanSemanal {
  id: string; semana_inicio: string; tipo_plan: TipoPlan;
  tema_semanal: string; descripcion_tema: string; objetivo_mensual: string | null;
  foco_mes: string | null; created_at: string;
}

export interface SesionSemana {
  id: string; plan_id: string; dia_semana: DiaSemana; fecha: string;
  tipo_sesion: TipoSesion; lugar: Lugar;
  hora_inicio: string | null; hora_fin: string | null;
  objetivo: string; drills: Drill[];
  juego_competitivo: string | null; estaciones_damas: EstacionDamas[] | null;
  estaciones_competencia?: EstacionCompetencia[] | null;
  notas: string | null; asistencia_registrada: boolean;
  sesion_juvenil?: SesionJuvenilData | null;
}

interface CalSesion extends SesionSemana { tipo_plan: TipoPlan; cupo_maximo?: number; }

interface CalEventReserva {
  id: string;
  estado: string;
  students: { full_name: string };
}

export interface PreviewSesion {
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

export interface HorarioDefecto { tipo_plan: TipoPlan; dia_semana: DiaSemana; hora_inicio: string; hora_fin: string; }

// ── Constants ─────────────────────────────────────────────────────────────────
export const DIAS_POR_TIPO: Record<TipoPlan, DiaSemana[]> = {
  juvenil:     ["martes", "miercoles", "jueves", "sabado", "domingo"],
  competencia: ["martes", "miercoles", "jueves", "sabado"],
  damas:       ["viernes"],
};

const CAL_DIAS: DiaSemana[] = ["martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

export const DIA_LABEL: Record<DiaSemana, string> = {
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

export const TIPO_SESION_LABEL: Record<TipoSesion, string> = {
  tiro_largo: "Tiro Largo", juego_corto: "Juego Corto", putt: "Putt",
  campo: "Campo", test_tecnico: "Test Técnico", test_fisico: "Test Físico", trabajo_fisico: "Trabajo Físico",
  competencia: "Competencia", damas_estaciones: "Estaciones", juvenil_estaciones: "3 Estaciones",
};

const TIPO_SESION_COLOR: Record<TipoSesion, { bg: string; text: string }> = {
  tiro_largo:      { bg: "#dbeafe", text: "#1e40af" },
  juego_corto:     { bg: "#dcfce7", text: "#166534" },
  putt:            { bg: "#fef9c3", text: "#854d0e" },
  campo:           { bg: "#f0fdf4", text: "#15803d" },
  test_tecnico:    { bg: "#fce7f3", text: "#9d174d" },
  test_fisico:     { bg: "#ede9fe", text: "#6d28d9" },
  trabajo_fisico:  { bg: "#fee2e2", text: "#991b1b" },
  competencia:     { bg: "#fff7ed", text: "#9a3412" },
  damas_estaciones:    { bg: "#fdf2f8", text: "#86198f" },
  juvenil_estaciones:  { bg: "#f0faf2", text: "#1B4D2E" },
};

export const LUGAR_LABEL: Record<Lugar, string> = {
  campo_practica: "Campo de práctica", putting_green: "Putting Green",
  campo_infantil: "Campo Infantil", campo_pacos_fabios: "Pacos/Fabios",
  campo_completo: "Campo Completo",
};

export const TIPO_PLAN_LABEL: Record<TipoPlan, string> = {
  juvenil: "Juvenil", competencia: "Competencia", damas: "Damas",
};

// ── Opciones de combobox para "Editar tema semanal" — constantes editables
// para ampliar la lista de sugerencias sin tocar el resto del componente. El
// profesor puede elegir una o escribir su propio texto (datalist nativo).
const TEMA_SEMANAL_OPCIONES: Record<TipoPlan, string[]> = {
  juvenil: ["Semana estándar 3 estaciones", "Semana de tests", "Semana de campo", "Semana de fundamentos", "Semana pre-torneo"],
  competencia: ["Semana estándar", "Semana de tests", "Semana de campo", "Semana pre-torneo", "Semana de recuperación"],
  damas: ["Semana estándar 3 estaciones", "Semana de tests", "Semana de campo", "Semana de fundamentos"],
};
const DESCRIPCION_TEMA_OPCIONES: Record<TipoPlan, string[]> = {
  juvenil: ["Consolidar fundamentos técnicos por grupo de edad", "Preparación física y técnica general", "Evaluación de progreso trimestral"],
  competencia: ["Afinar consistencia de cara al torneo", "Trabajo técnico y físico combinado", "Evaluación de progreso trimestral"],
  damas: ["Rotación estándar de las 3 estaciones", "Enfoque en consistencia de contacto", "Evaluación de progreso trimestral"],
};
const OBJETIVO_MENSUAL_OPCIONES: Record<TipoPlan, string[]> = {
  juvenil: ["Consistencia de contacto", "Control de distancias", "Lectura de greens", "Coordinación y equilibrio", "Fundamentos de swing"],
  competencia: ["Consistencia de contacto", "Control de distancias", "Lectura de greens", "Precisión en approach", "Velocidad de swing"],
  damas: ["Consistencia de contacto", "Control de distancias", "Lectura de greens", "Confianza en juego corto"],
};

const TIPO_PLAN_COLOR: Record<TipoPlan, string> = {
  juvenil: "#1B4D2E", competencia: "#1e40af", damas: "#86198f",
};

// Colores de marca por grupo — usados en la vista de dos columnas (día/detalle).
// Distintos de TIPO_PLAN_COLOR (que sigue controlando las tabs existentes).
const GROUP_COLOR_HEX: Record<TipoPlan, string> = {
  juvenil: "#1B4D2E", competencia: "#7d5a00", damas: "#4a1070",
};

// Calendar event colours — dark solid backgrounds with white text
const CAL_COLOR: Record<TipoPlan, { bg: string; border: string; text: string; dot: string }> = {
  juvenil:     { bg: "#1B4D2E", border: "#1B4D2E", text: "#ffffff", dot: "#1B4D2E" },
  competencia: { bg: "#b7950b", border: "#8a6f08", text: "#ffffff", dot: "#b7950b" },
  damas:       { bg: "#6a1b9a", border: "#4a1070", text: "#ffffff", dot: "#6a1b9a" },
};

// Calendar grid constants
const CAL_HOUR_START = 7;
const CAL_HOUR_END   = 18;
const CAL_FULL_H     = 80;  // px for occupied hour rows
const CAL_THIN_H     = 16;  // px for collapsed empty-hour rows
const CAL_HOURS      = Array.from({ length: CAL_HOUR_END - CAL_HOUR_START }, (_, i) => CAL_HOUR_START + i);
// Event colors (dark/solid for contrast)
export const CAL_EVENT: Record<string, { bg: string; text: string }> = {
  juvenil:     { bg: "#1B4D2E", text: "#ffffff" },
  competencia: { bg: "#7d5a00", text: "#ffffff" },
  damas:       { bg: "#4a1070", text: "#ffffff" },
};

// ── Date helpers ──────────────────────────────────────────────────────────────
function getMonday(d: Date): Date {
  const date = new Date(d); const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  date.setHours(0, 0, 0, 0); return date;
}
export function toISODate(d: Date): string { return d.toISOString().split("T")[0]; }
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
export function getFechaForDia(monday: Date, dia: DiaSemana): string { return toISODate(addDays(monday, DIA_OFFSET[dia])); }
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
const CATEGORIA_LABEL_MAP: Record<string, string> = {
  juego_largo: "Juego Largo", juego_corto: "Juego Corto", putt: "Putt",
  fisico: "Físico", campo_infantil: "Campo Infantil",
};
const ESPECIAL_LABEL_MAP: Record<string, string> = {
  test_tecnico: "Test Técnico P1-P10", test_fisico: "Test Físico TPI",
  campo_pacos: "Campo Pacos y Fabios", campo_infantil: "Campo Infantil",
};

// NOTA: JuvenilSessionDetail / ActionButtons / JuvenilPDFHidden (accordion + PDF
// html2canvas por sesión individual) se retiraron en el rediseño de dos columnas —
// reemplazados por el adaptador sesionesToEstaciones() + generateCCBPdf() más abajo.

// ── Adaptador: normaliza las 3 formas de sesión (estaciones_damas, sesion_juvenil
// en sus 3 variantes, y drills genéricos de Competencia) a una vista uniforme de
// "estación con drills" para la columna de detalle del día.
export type EstacionView = {
  nombre: string;
  lugar: string | null;
  horario: string | null;
  numero?: number;
  reto?: string | null;
  drills: { nombre: string; descripcion: string; repeticiones?: string | null; dificultad?: string | null }[];
};

function sesionesToEstaciones(diaySesiones: SesionSemana[], tipoPlan: TipoPlan): EstacionView[] {
  const views: EstacionView[] = [];
  // Sábado y domingo de Juvenil guardan 2 filas físicas (una por horario) con el
  // MISMO contenido por construcción (ver publish-plan-semanal) — solo se procesa
  // la primera para no duplicar las estaciones en pantalla/PDF/WhatsApp.
  const sesionesAProcesar = tipoPlan === "juvenil" ? diaySesiones.slice(0, 1) : diaySesiones;
  for (const sesion of sesionesAProcesar) {
    const horario = sesion.hora_inicio ? `${formatHora(sesion.hora_inicio)}${sesion.hora_fin ? `–${formatHora(sesion.hora_fin)}` : ""}` : null;
    const lugar = LUGAR_LABEL[sesion.lugar] ?? null;

    if (sesion.estaciones_damas && sesion.estaciones_damas.length > 0) {
      sesion.estaciones_damas.forEach((est) => {
        views.push({
          nombre: est.nombre,
          lugar: est.lugar,
          horario: `${est.duracion_min} min`,
          // Estaciones armadas con el flujo guiado traen drills reales de la
          // biblioteca — se listan individualmente. Dato viejo (texto libre,
          // sin drills) sigue mostrando el bloque único de siempre.
          drills: est.drills && est.drills.length > 0
            ? est.drills.map((d) => ({ nombre: d.titulo, descripcion: d.descripcion, repeticiones: d.series_repeticiones ?? null }))
            : [{ nombre: "Actividad principal", descripcion: est.descripcion }],
        });
      });
      continue;
    }

    if (sesion.estaciones_competencia && sesion.estaciones_competencia.length > 0) {
      sesion.estaciones_competencia.forEach((est, idx) => {
        views.push({
          nombre: TIPO_SESION_LABEL[est.categoria] ?? est.categoria,
          lugar: LUGAR_LABEL[est.lugar] ?? est.lugar ?? lugar,
          horario,
          numero: idx + 1,
          reto: est.juego_competitivo ?? null,
          drills: est.drills.map((d) => ({ nombre: d.titulo, descripcion: d.descripcion, repeticiones: d.series_repeticiones ?? null })),
        });
      });
      continue;
    }

    if (tipoPlan === "juvenil" && sesion.sesion_juvenil) {
      const jdAny = sesion.sesion_juvenil as unknown as { tipo?: string };
      if (jdAny.tipo === "estaciones") {
        const est = sesion.sesion_juvenil as SesionJuvenilEstaciones;
        est.estaciones.forEach((e, idx) => {
          views.push({
            nombre: CATEGORIA_LABEL_MAP[e.categoria] ?? e.categoria,
            lugar, horario,
            numero: idx + 1,
            reto: e.desafio ?? null,
            drills: (e.drills ?? []).map((d) => ({ nombre: d.titulo, descripcion: d.descripcion })),
          });
        });
      } else if (jdAny.tipo === "especial") {
        const esp = sesion.sesion_juvenil as SesionJuvenilEspecial;
        views.push({
          nombre: ESPECIAL_LABEL_MAP[esp.tipo_especial] ?? esp.tipo_especial,
          lugar, horario,
          drills: esp.notas ? [{ nombre: "Notas", descripcion: esp.notas }] : [],
        });
      } else {
        const leg = sesion.sesion_juvenil as SesionJuvenilLegacy;
        views.push({
          nombre: leg.nombre_clase || TIPO_SESION_LABEL[sesion.tipo_sesion],
          lugar, horario,
          drills: (leg.actividades ?? []).map((a) => ({ nombre: a.nombre, descripcion: a.como_se_juega, repeticiones: `${a.duracion_min} min` })),
        });
      }
      continue;
    }

    if (sesion.drills && sesion.drills.length > 0) {
      views.push({
        nombre: TIPO_SESION_LABEL[sesion.tipo_sesion],
        lugar, horario,
        drills: sesion.drills.map((d) => ({
          nombre: d.titulo,
          descripcion: d.descripcion,
          repeticiones: d.repeticiones,
          dificultad: d.dificultad_birdies || d.dificultad_aguilas || d.dificultad_albatros || d.dificultad_mas14 || undefined,
        })),
      });
    } else if (sesion.objetivo) {
      views.push({ nombre: TIPO_SESION_LABEL[sesion.tipo_sesion], lugar, horario, drills: [] });
    }
  }
  return views;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProgramacionModule({ currentRol }: { currentRol: Rol | null }) {
  const router = useRouter();
  const [showPacoPlanning, setShowPacoPlanning] = useState(false);
  const [showActividadEspecial, setShowActividadEspecial] = useState(false);
  const [calEspeciales, setCalEspeciales] = useState<ActividadEspecial[]>([]);
  const [calEspecialDetail, setCalEspecialDetail] = useState<ActividadEspecial | null>(null);
  const [calEventos, setCalEventos] = useState<EventoCalendario[]>([]);
  const [calDiasSinEscuela, setCalDiasSinEscuela] = useState<DiaSinEscuela[]>([]);
  const [showEventoWizard, setShowEventoWizard] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [pendingDiaWizard, setPendingDiaWizard] = useState<{ grupo: TipoPlan; dia: DiaSemana; fecha: string } | null>(null);
  const [wizardActividadInit, setWizardActividadInit] = useState<{ grupos: TipoPlan[]; fecha: string } | null>(null);

  // Plan state
  const [semana, setSemana]       = useState<Date>(() => getMonday(new Date()));
  const [activeTab, setActiveTab] = useState<TipoPlan>("juvenil");
  const [plan, setPlan]           = useState<PlanSemanal | null>(null);
  const [sesiones, setSesiones]   = useState<SesionSemana[]>([]);
  const [loading, setLoading]     = useState(false);
  const [selectedDia, setSelectedDia] = useState<DiaSemana | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  // Default schedules
  const [horariosDefecto, setHorariosDefecto] = useState<HorarioDefecto[]>([]);

  // Calendar state
  const [viewMode, setViewMode]               = useState<ViewMode>("plan");
  const [calSesiones, setCalSesiones]         = useState<CalSesion[]>([]);
  const [calLoading, setCalLoading]           = useState(false);
  const [mesCal, setMesCal]                   = useState<Date>(() => new Date());
  const [calEventDetail, setCalEventDetail]   = useState<CalSesion | null>(null);
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null);
  const [calEventReservas, setCalEventReservas] = useState<{
    loading: boolean; cupoMaximo: number;
    confirmados: CalEventReserva[]; enEspera: number;
  } | null>(null);

  // Crear plan Competencia (sin IA — sesiones vacías con horario por defecto)
  const [creandoPlan, setCreandoPlan]           = useState(false);

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

  // Juvenile class modal (estaciones o día especial)
  const [juvClassCtx, setJuvClassCtx] = useState<{
    dia: DiaSemana; fecha: string; sesion: SesionSemana | null;
    horaInicio?: string; horaFin?: string;
  } | null>(null);

  // Damas class modal (estaciones o día especial) — mismo patrón que Juvenil/Competencia
  const [damasClassCtx, setDamasClassCtx] = useState<{
    dia: DiaSemana; fecha: string; sesion: SesionSemana | null;
    horaInicio?: string; horaFin?: string;
  } | null>(null);

  function openJuvModal(dia: DiaSemana, fecha: string, sesion: SesionSemana | null, extra?: { hi?: string; hf?: string }) {
    setJuvClassCtx({ dia, fecha, sesion, horaInicio: extra?.hi, horaFin: extra?.hf });
  }

  function openCompModal(dia: DiaSemana, fecha: string, sesion: SesionSemana | null, extra?: { hi?: string; hf?: string }) {
    setCompClassCtx({ dia, fecha, sesion, horaInicio: extra?.hi, horaFin: extra?.hf });
  }

  function openDamasModal(dia: DiaSemana, fecha: string, sesion: SesionSemana | null, extra?: { hi?: string; hf?: string }) {
    setDamasClassCtx({ dia, fecha, sesion, horaInicio: extra?.hi, horaFin: extra?.hf });
  }

  // ── Wizard "Planificar con Paco" ──────────────────────────────────────────
  function handleWizardSemanaCompleta(grupoElegido: TipoPlan) {
    setShowWizard(false);
    setActiveTab(grupoElegido);
    setShowPacoPlanning(true);
  }

  function handleWizardDiaEspecifico(grupoElegido: TipoPlan, dia: DiaSemana, fecha: string) {
    setShowWizard(false);
    setSemana(getMonday(new Date(`${fecha}T00:00:00`)));
    setActiveTab(grupoElegido);
    setPendingDiaWizard({ grupo: grupoElegido, dia, fecha });
  }

  function handleWizardActividadEspecial(grupos: TipoPlan[], fecha: string) {
    setShowWizard(false);
    setWizardActividadInit({ grupos, fecha });
    setShowActividadEspecial(true);
  }

  function handleWizardEventos() {
    setShowWizard(false);
    setShowEventoWizard(true);
  }

  // Abre el modal del día correcto en cuanto el plan de la semana/grupo elegido termina de cargar.
  useEffect(() => {
    if (!pendingDiaWizard) return;
    if (activeTab !== pendingDiaWizard.grupo) return;
    if (loading) return;
    if (!plan) {
      showToast(`Sin plan ${TIPO_PLAN_LABEL[pendingDiaWizard.grupo]} esta semana — créalo primero en Vista Plan`);
      setPendingDiaWizard(null);
      return;
    }
    const { dia, fecha, grupo: grupoPendiente } = pendingDiaWizard;
    const sesionExistente = sesiones.find((s) => s.dia_semana === dia) ?? null;
    if (grupoPendiente === "juvenil") openJuvModal(dia, fecha, sesionExistente);
    else if (grupoPendiente === "competencia") openCompModal(dia, fecha, sesionExistente);
    else openDamasModal(dia, fecha, sesionExistente);
    setPendingDiaWizard(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDiaWizard, activeTab, loading, plan, sesiones]);

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
    setLoading(true);
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
    setCalEspeciales([]);
    setCalLoading(true);
    const inicio = toISODate(semana);
    const fin = toISODate(addDays(semana, 6));
    const [{ data: plans }, { data: especiales }, { data: eventos }, { data: diasSinEscuela }] = await Promise.all([
      supabase.from("planes_semanales").select("id, tipo_plan").eq("semana_inicio", inicio).eq("tipo_plan", activeTab),
      supabase.from("actividades_especiales").select("*").contains("grupos", [activeTab]).gte("fecha", inicio).lte("fecha", fin),
      supabase.from("eventos_calendario").select("*"),
      supabase.from("dias_sin_escuela").select("*"),
    ]);
    setCalEspeciales((especiales as ActividadEspecial[]) ?? []);
    setCalEventos((eventos as EventoCalendario[]) ?? []);
    setCalDiasSinEscuela((diasSinEscuela as DiaSinEscuela[]) ?? []);
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
    setCalEspeciales([]);
    setCalLoading(true);
    const { start, end } = getMesRange(mesCal);
    const [{ data: plans }, { data: especiales }, { data: eventos }, { data: diasSinEscuela }] = await Promise.all([
      supabase.from("planes_semanales").select("id, tipo_plan")
        .gte("semana_inicio", toISODate(start)).lte("semana_inicio", toISODate(end)).eq("tipo_plan", activeTab),
      supabase.from("actividades_especiales").select("*").contains("grupos", [activeTab])
        .gte("fecha", toISODate(start)).lte("fecha", toISODate(end)),
      supabase.from("eventos_calendario").select("*"),
      supabase.from("dias_sin_escuela").select("*"),
    ]);
    setCalEspeciales((especiales as ActividadEspecial[]) ?? []);
    setCalEventos((eventos as EventoCalendario[]) ?? []);
    setCalDiasSinEscuela((diasSinEscuela as DiaSinEscuela[]) ?? []);
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

  // ── Fetch reservas for calendar event detail ──────────────────────────────
  useEffect(() => {
    if (!calEventDetail) { setCalEventReservas(null); return; }
    setCalEventReservas({ loading: true, cupoMaximo: 15, confirmados: [], enEspera: 0 });
    (async () => {
      const [{ data: sesData }, { data: resData }] = await Promise.all([
        supabase.from("sesiones_semana").select("cupo_maximo").eq("id", calEventDetail.id).single(),
        supabase.from("reservas").select("id, estado, students(full_name)").eq("sesion_id", calEventDetail.id)
          .order("estado").order("posicion_espera", { ascending: true, nullsFirst: false }).order("created_at"),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (resData ?? []) as any[];
      const normalized: CalEventReserva[] = rows.map((r) => ({
        id: r.id,
        estado: r.estado,
        students: Array.isArray(r.students) ? r.students[0] : r.students,
      }));
      const confs = normalized.filter((r) => r.estado === "confirmado");
      const espCount = normalized.filter((r) => r.estado === "en_espera").length;
      setCalEventReservas({ loading: false, cupoMaximo: (sesData as { cupo_maximo: number } | null)?.cupo_maximo ?? 15, confirmados: confs, enEspera: espCount });
    })();
  }, [calEventDetail]);

  // ── Week / month nav ──────────────────────────────────────────────────────
  const prevWeek  = () => setSemana((s) => addDays(s, -7));
  const nextWeek  = () => setSemana((s) => addDays(s, 7));
  const goToday   = () => setSemana(getMonday(new Date()));
  const prevMonth = () => setMesCal((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setMesCal((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

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
  // Crea (o reutiliza) el plan de la semana para el grupo elegido y abre de
  // una vez el flujo guiado del primer día aplicable — sin sembrar filas
  // vacías en sesiones_semana: cada día se crea recién cuando el profesor lo
  // guarda desde el modal correspondiente, así nunca queda una fila "fantasma"
  // sin contenido real.
  async function handleCrearPlan(tipoPlan: TipoPlan) {
    setCreandoPlan(true);
    try {
      const { data: newPlan, error: planErr } = await supabase.from("planes_semanales")
        .upsert(
          { semana_inicio: toISODate(semana), tipo_plan: tipoPlan, tema_semanal: `Semana ${TIPO_PLAN_LABEL[tipoPlan]}`, descripcion_tema: "", objetivo_mensual: null, foco_mes: null },
          { onConflict: "semana_inicio,tipo_plan" }
        )
        .select().single();
      if (planErr || !newPlan) throw new Error(planErr?.message || "Error al crear plan");
      showToast(`Plan ${TIPO_PLAN_LABEL[tipoPlan]} creado ✓`);
      await fetchPlan();
      const primerDia = DIAS_POR_TIPO[tipoPlan][0];
      const fecha = getFechaForDia(semana, primerDia);
      if (tipoPlan === "juvenil") openJuvModal(primerDia, fecha, null);
      else if (tipoPlan === "competencia") openCompModal(primerDia, fecha, null);
      else openDamasModal(primerDia, fecha, null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al crear");
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
      if (editSesionCtx.sesion) {
        const { error } = await supabase.from("sesiones_semana").update(payload).eq("id", editSesionCtx.sesion.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("sesiones_semana").insert(payload);
        if (error) {
          if (error.code === "23505") throw new Error("Ya existe una sesión en ese día y hora. Edita la sesión existente en lugar de crear una nueva.");
          throw new Error(error.message);
        }
      }
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

  // ── Calendar cell click ───────────────────────────────────────────────────
  function handleCalCellClick(dia: DiaSemana, hour: number) {
    if (!plan) { showToast(`Sin plan ${TIPO_PLAN_LABEL[activeTab]} esta semana — créalo en Vista Plan`); return; }
    const hourStr = `${hour.toString().padStart(2, "0")}:00`;
    if (activeTab === "juvenil") {
      const endHour = Math.min(hour + 1, 18);
      const endStr = `${endHour.toString().padStart(2, "0")}:00`;
      openJuvModal(dia, getFechaForDia(semana, dia), null, { hi: hourStr, hf: endStr });
    } else if (activeTab === "competencia") {
      // El horario de Competencia sale de horarios_defecto, no de la celda
      // clickeada — evita crear sesiones con hora_fin en null (rompería el
      // NOT NULL de sesiones_semana) y respeta el horario fijo del grupo.
      const defaultH = getDefaultHoras("competencia", dia, []);
      const endHour = Math.min(hour + 1, 18);
      openCompModal(dia, getFechaForDia(semana, dia), null, defaultH ?? { hi: hourStr, hf: `${endHour.toString().padStart(2, "0")}:00` });
    } else {
      // Damas: mismo criterio que Competencia — la hora sale de
      // horarios_defecto, nunca de la celda clickeada.
      const defaultH = getDefaultHoras("damas", dia, []);
      const endHour = Math.min(hour + 1, 18);
      openDamasModal(dia, getFechaForDia(semana, dia), null, defaultH ?? { hi: hourStr, hf: `${endHour.toString().padStart(2, "0")}:00` });
    }
  }

  function handleWhatsApp() {
    if (!plan) return;
    const lines = [`## Objetivo`, `${plan.tema_semanal}${plan.descripcion_tema ? `: ${plan.descripcion_tema}` : ""}`, ``, `## Horario de la semana`];
    for (const s of sesiones) lines.push(`- ${DIA_LABEL[s.dia_semana]} ${formatDiaFecha(s.fecha)}: ${s.objetivo || TIPO_SESION_LABEL[s.tipo_sesion]}`);
    openWhatsApp(formatWhatsAppMessage(lines.join("\n"), "programacion_semanal", `Programación ${TIPO_PLAN_LABEL[activeTab]} — ${formatWeekRange(semana)}`));
  }

  // ── PDF semana / PDF día (generateCCBPdf centralizado) ────────────────────
  function buildDiaMarkdown(dia: DiaSemana, fecha: string, estaciones: EstacionView[]): string {
    const lines: string[] = [`## ${DIA_LABEL[dia]} — ${formatDiaFecha(fecha)}`];
    if (estaciones.length === 0) lines.push("Sin programación para este día.");
    estaciones.forEach((est) => {
      const meta = [est.horario, est.lugar].filter(Boolean).join(" · ");
      lines.push(`**${est.nombre}**${meta ? ` · ${meta}` : ""}`);
      est.drills.forEach((d) => lines.push(`- ${d.nombre}: ${d.descripcion}${d.repeticiones ? ` (${d.repeticiones})` : ""}`));
      if (est.reto) lines.push(`🏆 Desafío: ${est.reto}`);
      lines.push("");
    });
    return lines.join("\n");
  }

  async function handlePdfSemana() {
    if (!plan) return;
    const fechaInicio = formatDiaFecha(toISODate(semana));
    const fechaFin = formatDiaFecha(toISODate(addDays(semana, 6)));
    const bloques = diasRequeridos
      .map((dia) => {
        const diaySesiones = sesiones.filter((s) => s.dia_semana === dia);
        if (!diaySesiones.length) return null;
        return buildDiaMarkdown(dia, getFechaForDia(semana, dia), sesionesToEstaciones(diaySesiones, activeTab));
      })
      .filter((b): b is string => !!b);
    const { generateCCBPdf } = await import("@/lib/pdf-generator");
    generateCCBPdf(bloques.join("\n\n---\n\n"), {
      documentName: `Programación Semanal ${TIPO_PLAN_LABEL[activeTab]} — semana del ${fechaInicio} al ${fechaFin}`,
      filenamePrefix: `Programacion-${activeTab}-${toISODate(semana)}`,
    });
  }

  async function handlePdfDia() {
    if (!plan || !selectedDia) return;
    const diaySesiones = sesiones.filter((s) => s.dia_semana === selectedDia);
    const fecha = getFechaForDia(semana, selectedDia);
    const markdown = buildDiaMarkdown(selectedDia, fecha, sesionesToEstaciones(diaySesiones, activeTab));
    const { generateCCBPdf } = await import("@/lib/pdf-generator");
    generateCCBPdf(markdown, {
      documentName: `Programación ${TIPO_PLAN_LABEL[activeTab]} — ${DIA_LABEL[selectedDia]} ${formatDiaFecha(fecha)}`,
      filenamePrefix: `Programacion-${activeTab}-${fecha}`,
    });
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const diasRequeridos = DIAS_POR_TIPO[activeTab];
  const accentColor    = TIPO_PLAN_COLOR[activeTab];
  const groupColor     = GROUP_COLOR_HEX[activeTab];

  // ── Selección de día (vista de dos columnas) ──────────────────────────────
  useEffect(() => {
    if (diasRequeridos.length === 0) { setSelectedDia(null); return; }
    const conSesion = diasRequeridos.find((d) => sesiones.some((s) => s.dia_semana === d));
    setSelectedDia(conSesion ?? diasRequeridos[0]);
    setMobileDetailOpen(false);
    // Se reinicia solo al cambiar de grupo o de semana — no en cada refetch de
    // sesiones, para no perder la selección del profesor mientras edita el día.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, plan?.id]);

  function selectDia(dia: DiaSemana) {
    setSelectedDia(dia);
    setMobileDetailOpen(true);
  }

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
          <div className="flex items-center justify-center py-12" style={{ color: "#5f7a63" }}>
            <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
            Cargando...
          </div>
        )}
        {!calLoading && (
          <div className="relative">
          <p className="md:hidden text-[11px] font-medium px-3 pt-2 pb-1" style={{ color: "#5f7a63" }}>
            Desliza para ver más días →
          </p>
          <div className="overflow-x-auto">
          <div style={{ minWidth: 640 }}>
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
                      <span className="text-xs font-bold rounded-full px-1.5 inline-block mt-0.5" style={{ background: "#1B4D2E", color: "#ffffff" }}>
                        {formatDiaFecha(fecha)}
                      </span>
                    ) : (
                      <p className="text-xs mt-0.5" style={{ color: "#1a3a1a" }}>{formatDiaFecha(fecha)}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Días sin escuela / eventos del calendario */}
            {(calDiasSinEscuela.length > 0 || calEventos.length > 0) && (
              <div className="grid" style={{ gridTemplateColumns: "60px repeat(6, 1fr)", borderBottom: "1px solid #d4e0d2" }}>
                <div style={{ borderRight: "1px solid #d4e0d2" }} />
                {CAL_DIAS.map((dia) => {
                  const fecha = getFechaForDia(semana, dia);
                  const sinEscuela = calDiasSinEscuela.find((d) => fechaEnRango(fecha, d.fecha_inicio, d.fecha_fin));
                  const eventosDia = calEventos.filter((e) => fechaEnRango(fecha, e.fecha_inicio, e.fecha_fin));
                  return (
                    <div key={dia} style={{ borderRight: "1px solid #d4e0d2", padding: "2px 4px", minHeight: sinEscuela || eventosDia.length ? 24 : 0, background: sinEscuela ? "#e5e7eb" : "transparent" }}>
                      {sinEscuela && <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "#4b5563" }} title={sinEscuela.motivo ?? undefined}>Sin escuela</p>}
                      {eventosDia.map((e) => (
                        <p key={e.id} style={{ margin: 0, fontSize: 10, fontWeight: 600, color: e.tipo === "especial" ? "#b45309" : "#1565c0" }} title={e.descripcion ?? undefined}>
                          {e.tipo === "especial" ? "🌟" : "📌"} {e.nombre}
                        </p>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {/* All-day band for sessions without a scheduled time */}
            {(calSesiones.some((s) => !s.hora_inicio) || calEspeciales.some((e) => !e.hora_inicio)) && (
              <div className="grid" style={{ gridTemplateColumns: "60px repeat(6, 1fr)", background: "#f5f8f4", borderBottom: "1px solid #d4e0d2" }}>
                <div style={{ borderRight: "1px solid #d4e0d2", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6, paddingBlock: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#5f7a63", writingMode: "vertical-rl", transform: "rotate(180deg)" }}>sin hora</span>
                </div>
                {CAL_DIAS.map((dia) => {
                  const fechaDia = getFechaForDia(semana, dia);
                  const untimedSes = calSesiones.filter((s) => s.dia_semana === dia && !s.hora_inicio);
                  const untimedEsp = calEspeciales.filter((e) => e.fecha === fechaDia && !e.hora_inicio);
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
                      {untimedEsp.map((esp) => (
                        <div key={esp.id} style={{ background: "#b45309", borderRadius: 4, padding: "2px 5px", cursor: "pointer", overflow: "hidden" }}
                          onClick={() => setCalEspecialDetail(esp)}>
                          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            🌟 {esp.nombre}
                          </p>
                        </div>
                      ))}
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
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#5f7a63" }}>{fmtCalHour(h)}</span>
                    </div>
                  ))}
                </div>

                {/* Day columns */}
                {CAL_DIAS.map((dia) => {
                  const daySes = calSesiones.filter((s) => s.dia_semana === dia);
                  const fechaDia = getFechaForDia(semana, dia);
                  const dayEsp = calEspeciales.filter((e) => e.fecha === fechaDia && !!e.hora_inicio);
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
                      {/* Actividades especiales */}
                      {dayEsp.map((esp, ei) => {
                        const top    = sesTop(esp.hora_inicio!);
                        const height = esp.hora_fin ? sesH(esp.hora_inicio!, esp.hora_fin) : ROW_H;
                        const overlap = daySes.length + ei;
                        return (
                          <div
                            key={esp.id}
                            style={{
                              position: "absolute",
                              top: top + 2, height: Math.max(height - 4, 24),
                              left: `${3 + overlap * 5}px`, right: `${3 + overlap * 5}px`,
                              background: "#b45309", borderRadius: 5,
                              padding: "3px 6px", overflow: "hidden",
                              cursor: "pointer", zIndex: 20 + ei,
                            }}
                            onClick={(e) => { e.stopPropagation(); setCalEspecialDetail(esp); }}
                          >
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>
                              🌟 {esp.nombre}
                            </p>
                            <p style={{ margin: "1px 0 0", fontSize: 11, color: "#fff", opacity: 0.85 }}>
                              {esp.hora_inicio!.slice(0, 5)}{esp.hora_fin ? `–${esp.hora_fin.slice(0, 5)}` : ""}
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
          </div>
          <div
            className="md:hidden pointer-events-none absolute top-0 bottom-0 right-0 w-6"
            style={{ background: "linear-gradient(to right, transparent, rgba(15,25,35,0.15))" }}
          />
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
    const selectedDayEspeciales = selectedCalDate ? calEspeciales.filter((e) => e.fecha === selectedCalDate) : [];

    return (
      <div className="rounded-xl overflow-hidden shadow-sm" style={{ background: "#f0f5f0" }}>
        {/* Month nav */}
        <div className="flex items-center justify-between px-5 py-3" style={{ background: "#e8f0e6", borderBottom: "1px solid #d4e0d2" }}>
          <button onClick={prevMonth} className="p-1.5 rounded-lg transition-colors" style={{ color: "#5f7a63" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#d4e8d0")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <h3 className="font-bold capitalize" style={{ color: "#1B4D2E" }}>
            {firstDay.toLocaleDateString("es-CO", { month: "long", year: "numeric" })}
          </h3>
          <button onClick={nextMonth} className="p-1.5 rounded-lg transition-colors" style={{ color: "#5f7a63" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#d4e8d0")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>

        {calLoading && <div className="py-12 text-center text-sm" style={{ color: "#5f7a63" }}>Cargando...</div>}

        {!calLoading && (
          <>
            <div className="relative">
            <p className="md:hidden text-[11px] font-medium px-1 pt-1 pb-1" style={{ color: "#5f7a63" }}>
              Desliza para ver el mes completo →
            </p>
            <div className="overflow-x-auto">
            <div style={{ minWidth: 560 }}>
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
                const dayEsp = calEspeciales.filter((e) => e.fecha === dateStr);
                const dayEventos = calEventos.filter((e) => fechaEnRango(dateStr, e.fecha_inicio, e.fecha_fin));
                const sinEscuela = calDiasSinEscuela.find((d) => fechaEnRango(dateStr, d.fecha_inicio, d.fecha_fin));
                const isSelected = selectedCalDate === dateStr;

                return (
                  <div
                    key={i}
                    onClick={() => setSelectedCalDate(isSelected ? null : dateStr)}
                    title={sinEscuela?.motivo ?? undefined}
                    style={{
                      minHeight: 100,
                      background: sinEscuela ? "#e5e7eb" : isSelected ? "#dff0e0" : "#f7faf6",
                      borderBottom: "1px solid #dde8db",
                      borderRight: "1px solid #dde8db",
                      padding: "6px",
                      cursor: "pointer",
                      opacity: !isCurrentMonth ? 0.4 : 1,
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => { if (!isSelected && !sinEscuela) (e.currentTarget as HTMLElement).style.background = "#eef5ec"; }}
                    onMouseLeave={(e) => { if (!isSelected && !sinEscuela) (e.currentTarget as HTMLElement).style.background = "#f7faf6"; }}
                  >
                    <div style={{
                      width: 24, height: 24,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      borderRadius: "50%",
                      background: isToday ? "#1B4D2E" : "transparent",
                      color: isToday ? "#ffffff" : "#1a3a1a",
                      fontSize: 12, fontWeight: 700, marginBottom: 4,
                    }}>
                      {date.getDate()}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {sinEscuela && <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "#4b5563" }}>Sin escuela</p>}
                      {dayEventos.map((e) => (
                        <div key={e.id} style={{
                          background: e.tipo === "especial" ? "#b45309" : "#1565c0", color: "#fff",
                          borderRadius: 3, padding: "2px 5px",
                          fontSize: 11, fontWeight: 600, lineHeight: 1.35,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {e.tipo === "especial" ? "🌟" : "📌"} {e.nombre}
                        </div>
                      ))}
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
                        <div style={{ fontSize: 10, color: "#5f7a63", paddingLeft: 2, fontWeight: 600 }}>
                          +{daySes.length - 3} más
                        </div>
                      )}
                      {dayEsp.map((esp) => (
                        <div key={esp.id} style={{
                          background: "#b45309", color: "#fff",
                          borderRadius: 3, padding: "2px 5px",
                          fontSize: 11, fontWeight: 600, lineHeight: 1.35,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          🌟 {esp.nombre}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
            </div>
            <div
              className="md:hidden pointer-events-none absolute top-0 bottom-0 right-0 w-6"
              style={{ background: "linear-gradient(to right, transparent, rgba(15,25,35,0.15))" }}
            />
            </div>

            {/* Selected day detail */}
            {selectedCalDate && (
              <div style={{ borderTop: "1px solid #d4e0d2", padding: "16px 20px" }}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold capitalize" style={{ color: "#1B4D2E" }}>
                    {new Date(selectedCalDate + "T00:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}
                  </h4>
                  <button onClick={() => setSelectedCalDate(null)} className="text-xs" style={{ color: "#5f7a63" }}>✕</button>
                </div>
                {selectedDayEspeciales.length > 0 && (
                  <div className="space-y-2 mb-2">
                    {selectedDayEspeciales.map((esp) => (
                      <div key={esp.id} className="flex items-start gap-3 p-3 rounded-lg cursor-pointer" style={{ background: "#b4530918", border: "1px solid #b4530930" }}
                        onClick={() => setCalEspecialDetail(esp)}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-xs font-bold" style={{ color: "#b45309" }}>🌟 {esp.nombre}</span>
                            {esp.hora_inicio && <span className="text-[10px]" style={{ color: "#5f7a63" }}>{formatHora(esp.hora_inicio)}–{formatHora(esp.hora_fin)}</span>}
                          </div>
                          <p className="text-xs" style={{ color: "#8a5a1a" }}>{esp.grupos.map((g) => TIPO_PLAN_LABEL[g]).join(", ")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {selectedDaySesiones.length === 0 && selectedDayEspeciales.length === 0
                  ? <p className="text-xs italic" style={{ color: "#5f7a63" }}>Sin sesiones de {TIPO_PLAN_LABEL[activeTab]} este día</p>
                  : selectedDaySesiones.length > 0 && (
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
                                <span className="text-[10px]" style={{ color: "#5f7a63" }}>{LUGAR_LABEL[ses.lugar]}</span>
                                {ses.hora_inicio && <span className="text-[10px]" style={{ color: "#5f7a63" }}>{formatHora(ses.hora_inicio)}–{formatHora(ses.hora_fin)}</span>}
                              </div>
                              {ses.objetivo && <p className="text-xs line-clamp-2" style={{ color: "#5f7a63" }}>{ses.objetivo}</p>}
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
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-ccb-green flex items-center justify-center shrink-0">
          <CalendarDays size={22} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ccb-green">Programación</h1>
          <p className="text-sm text-(--text-muted) mt-0.5">Planificación de clases y calendario de la Escuela</p>
        </div>
      </div>

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
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${viewMode === mode ? "bg-ccb-green text-white" : "text-gray-600 hover:text-gray-900"}`}
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
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 mb-5">
        <div className="flex gap-1">
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
        {currentRol && isStaff(currentRol) && (
          <div className="flex gap-2 mb-2 shrink-0">
            <button
              onClick={() => setShowWizard(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: "#1B4D2E" }}
            >
              Planificar con Paco 🦅
            </button>
          </div>
        )}
      </div>

      {/* ── Action bar (create/delete plan) ── */}
      {viewMode === "plan" && !loading && (
        <div className="flex items-center justify-end mb-4 gap-2">
          {!plan ? (
            <button
              onClick={() => handleCrearPlan(activeTab)}
              disabled={creandoPlan}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm hover:brightness-110 transition-all disabled:opacity-50"
              style={{ background: accentColor }}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              Crear plan
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
            <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "#1B4D2E" }}>
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
            <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "#1B4D2E" }}>
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
              onClick={() => handleCrearPlan(activeTab)}
              disabled={creandoPlan}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm hover:brightness-110 transition-all disabled:opacity-50"
              style={{ background: accentColor }}
            >
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              Crear plan
            </button>
            {activeTab !== "competencia" && (
              <p className="text-xs text-gray-400 mt-3">o usa <strong>Planificar con Paco 🦅</strong> arriba si prefieres que la IA arme la semana.</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-4" style={{ height: "calc(100dvh - 300px)", minHeight: 440 }}>
            {/* ── Columna izquierda: lista de días (220px fija en desktop) ── */}
            <div
              className={`${mobileDetailOpen ? "hidden md:flex" : "flex"} md:w-[220px] w-full shrink-0 flex-col bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden`}
            >
              <div className="flex-1 overflow-y-auto">
                {diasRequeridos.map((dia) => {
                  const diaySesiones = sesiones.filter((s) => s.dia_semana === dia);
                  const fecha = getFechaForDia(semana, dia);
                  const isSelected = selectedDia === dia;
                  return (
                    <button
                      key={dia}
                      onClick={() => selectDia(dia)}
                      className="w-full text-left px-3.5 py-3 border-b border-gray-50 transition-colors hover:bg-gray-50 block"
                      style={isSelected ? { borderLeft: `3px solid ${groupColor}`, backgroundColor: "#f0f5f0" } : { borderLeft: "3px solid transparent" }}
                    >
                      <p className="text-sm font-bold text-gray-900">{DIA_LABEL[dia]}</p>
                      <p className="text-xs text-gray-400 mb-1.5">{formatDiaFecha(fecha)}</p>
                      {diaySesiones.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {diaySesiones.slice(0, 3).map((ses) => (
                            <span key={ses.id} className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white" style={{ backgroundColor: groupColor }}>
                              {(ses.objetivo || TIPO_SESION_LABEL[ses.tipo_sesion]).slice(0, 20)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">Sin programación</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Columna derecha: detalle del día seleccionado ── */}
            <div className={`${mobileDetailOpen ? "flex" : "hidden md:flex"} flex-1 flex-col bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden min-w-0`}>
              {selectedDia && (() => {
                const dia = selectedDia;
                const diaySesiones = sesiones.filter((s) => s.dia_semana === dia);
                const fecha = getFechaForDia(semana, dia);
                const estaciones = sesionesToEstaciones(diaySesiones, activeTab);
                const totalDrills = estaciones.reduce((acc, e) => acc + e.drills.length, 0);
                const primeraSesion = diaySesiones[0] ?? null;
                const btnClass = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors";

                function openEditDia() {
                  // Los 3 grupos usan siempre su modal especializado, exista o
                  // no sesión previa — así "editar" reabre el mismo flujo
                  // guiado con los valores cargados (planeación manual
                  // guiada). Si la sesión existente viene de un flujo viejo
                  // (Paco, o datos legacy) y no calza con la forma estricta
                  // del modal, este cae a su pantalla inicial ("¿qué tipo de
                  // día?") en vez de romperse — el profesor arma ese día de
                  // nuevo si decide editarlo, sin perder nada si no lo toca.
                  if (activeTab === "competencia") openCompModal(dia, fecha, primeraSesion);
                  else if (activeTab === "juvenil") openJuvModal(dia, fecha, primeraSesion);
                  else openDamasModal(dia, fecha, primeraSesion);
                }

                return (
                  <>
                    <div className="px-5 py-4 border-b border-gray-100 shrink-0">
                      <button onClick={() => setMobileDetailOpen(false)} className="md:hidden flex items-center gap-1 text-xs text-gray-500 mb-2">
                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 18l-6-6 6-6"/></svg>
                        Volver
                      </button>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <h2 className="text-lg font-bold text-gray-900">{DIA_LABEL[dia]}</h2>
                          <p className="text-xs text-gray-400">{formatDiaFecha(fecha)} · {estaciones.length} estaciones · {totalDrills} drills</p>
                          {activeTab === "juvenil" && (dia === "sabado" || dia === "domingo") && diaySesiones.length > 1 && (
                            <p className="text-xs font-medium mt-1" style={{ color: groupColor }}>
                              Aplica para ambos horarios: 9:15 AM y 10:00 AM
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          <button onClick={handlePdfSemana} className={btnClass}>
                            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                            PDF semana
                          </button>
                          <button onClick={handlePdfDia} className={btnClass}>
                            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                            PDF día
                          </button>
                          <button onClick={handleWhatsApp} className={btnClass}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                            WhatsApp
                          </button>
                          <button onClick={openEditDia} className={btnClass}>
                            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            Editar
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-5 py-4">
                      {diaySesiones.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                          <p className="text-sm font-semibold text-gray-600 mb-1">No hay programación para este día</p>
                          <p className="text-xs text-gray-400 mb-4">Paco puede generarla, o puedes agregarla manualmente.</p>
                          <div className="flex items-center gap-3">
                            <button onClick={() => setShowPacoPlanning(true)} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: "#1B4D2E" }}>
                              Pedir a Paco que la genere
                            </button>
                            <button onClick={openEditDia} className="text-xs font-medium text-gray-500 hover:text-gray-700 underline">
                              Agregar manualmente
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {estaciones.length === 0 && (
                            <div className="text-center py-6">
                              <p className="text-xs text-gray-400 mb-2">Esta sesión todavía no tiene drills o detalle cargado.</p>
                              <button onClick={openEditDia} className="text-xs font-medium text-gray-500 hover:text-gray-700 underline">
                                Editar para agregar contenido
                              </button>
                            </div>
                          )}
                          {estaciones.map((est, i) => (
                            <div key={i} className="border border-gray-100 rounded-xl p-4">
                              <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: groupColor }} />
                                <p className="text-sm font-bold text-gray-900">
                                  {estaciones.length > 1 && est.numero && (
                                    <span style={{ color: groupColor }}>Estación {est.numero} — </span>
                                  )}
                                  {est.nombre}
                                </p>
                                {est.horario && <span className="text-xs text-gray-400">{est.horario}</span>}
                                {est.lugar && (
                                  <span className="flex items-center gap-1 text-xs text-gray-400">
                                    <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
                                    {est.lugar}
                                  </span>
                                )}
                              </div>
                              {est.drills.length > 0 && (
                                <div className="space-y-2">
                                  {est.drills.map((d, di) => (
                                    <div key={di} className="flex gap-2.5 bg-gray-50 rounded-lg p-2.5">
                                      <span className="text-[10px] font-bold text-white rounded w-4 h-4 flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: groupColor }}>{di + 1}</span>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-gray-800">{d.nombre}</p>
                                        {d.descripcion && <p className="text-xs text-gray-600 mt-0.5">{d.descripcion}</p>}
                                        {(d.repeticiones || d.dificultad) && (
                                          <div className="flex gap-1.5 mt-1.5 flex-wrap">
                                            {d.repeticiones && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">{d.repeticiones}</span>}
                                            {d.dificultad && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${groupColor}18`, color: groupColor }}>{d.dificultad}</span>}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {est.reto && (
                                <div className="mt-3 flex items-start gap-1.5 rounded-lg px-2.5 py-2" style={{ backgroundColor: `${groupColor}12` }}>
                                  <span className="text-xs shrink-0">🏆</span>
                                  <p className="text-xs font-medium" style={{ color: groupColor }}>{est.reto}</p>
                                </div>
                              )}
                            </div>
                          ))}

                          {diaySesiones.map((sesion) => (
                            <div key={sesion.id} className="flex items-center justify-between gap-2 pt-1">
                              <button
                                onClick={() => router.push(`/programacion/sesion/${sesion.id}`)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${sesion.asistencia_registrada ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "text-white"}`}
                                style={sesion.asistencia_registrada ? {} : { background: accentColor }}
                              >
                                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                {sesion.asistencia_registrada ? "Ver asistencia" : "Pasar asistencia"}
                              </button>
                              <button onClick={() => setConfirmDeleteSesion(sesion)} className="text-xs font-medium text-red-500 hover:text-red-700">
                                Eliminar sesión
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )
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
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tema semanal</label>
                <input
                  list="tema-semanal-opciones"
                  value={temaForm.tema_semanal}
                  onChange={(e) => setTemaForm((f) => ({ ...f, tema_semanal: e.target.value }))}
                  placeholder="Elige una opción o escribe la tuya..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
                <datalist id="tema-semanal-opciones">
                  {TEMA_SEMANAL_OPCIONES[activeTab].map((op) => <option key={op} value={op} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Descripción</label>
                <input
                  list="descripcion-tema-opciones"
                  value={temaForm.descripcion_tema}
                  onChange={(e) => setTemaForm((f) => ({ ...f, descripcion_tema: e.target.value }))}
                  placeholder="Elige una opción o escribe la tuya..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
                <datalist id="descripcion-tema-opciones">
                  {DESCRIPCION_TEMA_OPCIONES[activeTab].map((op) => <option key={op} value={op} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Objetivo mensual</label>
                <input
                  list="objetivo-mensual-opciones"
                  value={temaForm.objetivo_mensual}
                  onChange={(e) => setTemaForm((f) => ({ ...f, objetivo_mensual: e.target.value }))}
                  placeholder="Elige una opción o escribe la tuya..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
                <datalist id="objetivo-mensual-opciones">
                  {OBJETIVO_MENSUAL_OPCIONES[activeTab].map((op) => <option key={op} value={op} />)}
                </datalist>
              </div>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
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

            {/* Session info */}
            <div className="px-5 py-3 space-y-2 border-b border-gray-100">
              <div className="flex gap-3 text-xs text-gray-500">
                <span>{LUGAR_LABEL[calEventDetail.lugar]}</span>
                {calEventDetail.hora_inicio && <><span>·</span><span>{formatHora(calEventDetail.hora_inicio)}–{formatHora(calEventDetail.hora_fin)}</span></>}
              </div>
              {calEventDetail.objetivo && <p className="text-sm text-gray-700">{calEventDetail.objetivo}</p>}
            </div>

            {/* Reservas section */}
            <div className="px-5 py-3 border-b border-gray-100">
              {calEventReservas?.loading ? (
                <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
                  <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                  Cargando inscritos...
                </div>
              ) : calEventReservas ? (
                <>
                  {/* Cupo badge + bar */}
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-bold text-gray-700">
                      {calEventReservas.confirmados.length}/{calEventReservas.cupoMaximo} cupos
                    </span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min((calEventReservas.confirmados.length / calEventReservas.cupoMaximo) * 100, 100)}%`,
                          background: calEventReservas.confirmados.length >= calEventReservas.cupoMaximo ? "#dc2626" : calEventReservas.confirmados.length / calEventReservas.cupoMaximo >= 0.8 ? "#92400e" : "#1B4D2E",
                        }}
                      />
                    </div>
                  </div>

                  {calEventReservas.confirmados.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">Sin inscritos todavía</p>
                  ) : (
                    <>
                      <div className="space-y-1 mb-1">
                        {calEventReservas.confirmados.slice(0, 5).map((r) => (
                          <div key={r.id} className="flex items-center gap-2">
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                              style={{ background: CAL_COLOR[calEventDetail.tipo_plan].border }}
                            >
                              {r.students.full_name.trim().split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
                            </div>
                            <span className="text-xs text-gray-700 truncate">{r.students.full_name}</span>
                          </div>
                        ))}
                      </div>
                      {calEventReservas.confirmados.length > 5 && (
                        <p className="text-xs text-gray-400">+ {calEventReservas.confirmados.length - 5} más</p>
                      )}
                      {calEventReservas.enEspera > 0 && (
                        <p className="text-xs text-amber-600 font-semibold mt-1">En espera: {calEventReservas.enEspera}</p>
                      )}
                    </>
                  )}
                </>
              ) : null}
            </div>

            {/* Actions */}
            <div className="px-5 py-3 space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={() => { router.push(`/reservas?sesion=${calEventDetail.id}`); setCalEventDetail(null); }}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-1"
                  style={{ background: CAL_COLOR[calEventDetail.tipo_plan].border }}
                >
                  Ver en Reservas →
                </button>
                <button
                  onClick={() => { router.push(`/reservas?sesion=${calEventDetail.id}`); setCalEventDetail(null); }}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1"
                >
                  + Inscribir alumno
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { router.push(`/programacion/sesion/${calEventDetail.id}`); setCalEventDetail(null); }}
                  className="flex-1 py-1.5 rounded-xl text-xs font-medium text-gray-500 hover:bg-gray-50 border border-gray-100"
                >
                  Pasar asistencia
                </button>
                <button
                  onClick={() => {
                    setCalEventDetail(null);
                    setActiveTab(calEventDetail.tipo_plan);
                    setViewMode("plan");
                    if (calEventDetail.tipo_plan === "juvenil") {
                      setTimeout(() => openJuvModal(calEventDetail.dia_semana, calEventDetail.fecha, calEventDetail as unknown as SesionSemana), 100);
                    } else if (calEventDetail.tipo_plan === "competencia") {
                      // Igual que en openEditDia: Competencia siempre usa su asistente
                      // propio (aunque venga de este popup del calendario semana/mes),
                      // porque es el único que sabe combinar categorías en estaciones
                      // separadas — el editor genérico las colapsaría a una sola.
                      setTimeout(() => openCompModal(calEventDetail.dia_semana, calEventDetail.fecha, calEventDetail as unknown as SesionSemana), 100);
                    } else {
                      setTimeout(() => openDamasModal(calEventDetail.dia_semana, calEventDetail.fecha, calEventDetail as unknown as SesionSemana), 100);
                    }
                  }}
                  className="flex-1 py-1.5 rounded-xl text-xs font-medium text-gray-500 hover:bg-gray-50 border border-gray-100"
                >
                  Editar sesión
                </button>
              </div>
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

      {/* ══ MODAL: Clase Juvenil ═════════════════════════════════════════════ */}
      {juvClassCtx && plan && (
        <JuvenileClassModal
          planId={plan.id}
          dia={juvClassCtx.dia}
          diaLabel={DIA_LABEL[juvClassCtx.dia]}
          fecha={juvClassCtx.fecha}
          horaInicio={juvClassCtx.horaInicio}
          horaFin={juvClassCtx.horaFin}
          sesionExistente={juvClassCtx.sesion ?? undefined}
          horariosDefecto={horariosDefecto}
          onClose={() => setJuvClassCtx(null)}
          onSaved={async () => {
            setJuvClassCtx(null);
            showToast("Clase guardada ✓");
            await fetchPlan();
            if (viewMode === "semana") fetchCalSemana();
          }}
        />
      )}

      {/* ══ MODAL: Clase Competencia ═════════════════════════════════════════ */}
      {compClassCtx && plan && (
        <CompetenciaClassModal
          planId={plan.id}
          dia={compClassCtx.dia}
          diaLabel={DIA_LABEL[compClassCtx.dia]}
          fecha={compClassCtx.fecha}
          horaInicio={compClassCtx.horaInicio}
          horaFin={compClassCtx.horaFin}
          sesionExistente={compClassCtx.sesion ?? undefined}
          horariosDefecto={horariosDefecto}
          onClose={() => setCompClassCtx(null)}
          onSaved={async () => {
            setCompClassCtx(null);
            showToast("Sesión guardada ✓");
            await fetchPlan();
            if (viewMode === "semana") fetchCalSemana();
          }}
        />
      )}

      {/* ══ MODAL: Clase Damas ═══════════════════════════════════════════════ */}
      {damasClassCtx && plan && (
        <DamasClassModal
          planId={plan.id}
          dia={damasClassCtx.dia}
          diaLabel={DIA_LABEL[damasClassCtx.dia]}
          fecha={damasClassCtx.fecha}
          horaInicio={damasClassCtx.horaInicio}
          horaFin={damasClassCtx.horaFin}
          sesionExistente={damasClassCtx.sesion ?? undefined}
          horariosDefecto={horariosDefecto}
          onClose={() => setDamasClassCtx(null)}
          onSaved={async () => {
            setDamasClassCtx(null);
            showToast("Sesión guardada ✓");
            await fetchPlan();
            if (viewMode === "semana") fetchCalSemana();
          }}
        />
      )}

      {/* ══ MODAL: Planificar con Paco ══════════════════════════════════════ */}
      {showPacoPlanning && (
        <PacoPlanningModal
          tipoPlan={activeTab}
          semana={semana}
          planExistente={plan}
          sesionesExistentes={sesiones}
          horariosDefecto={horariosDefecto}
          onClose={() => setShowPacoPlanning(false)}
          onPublished={async () => {
            setShowPacoPlanning(false);
            showToast("Programación publicada por Paco ✓");
            await fetchPlan();
            if (viewMode === "semana") fetchCalSemana();
            else if (viewMode === "mes") fetchCalMes();
          }}
        />
      )}

      {/* ══ MODAL: Nueva actividad especial ══════════════════════════════════ */}
      {showActividadEspecial && (
        <ActividadEspecialWizard
          fechaSugerida={wizardActividadInit?.fecha ?? toISODate(semana)}
          gruposSugeridos={wizardActividadInit?.grupos ?? [activeTab]}
          onClose={() => { setShowActividadEspecial(false); setWizardActividadInit(null); }}
          onCreated={() => {
            showToast("Actividad especial creada ✓");
            if (viewMode === "semana") fetchCalSemana();
            else if (viewMode === "mes") fetchCalMes();
          }}
        />
      )}

      {/* ══ MODAL: Planificar con Paco — selector ═════════════════════════════ */}
      {showWizard && (
        <PacoPlanWizard
          fechaSugerida={toISODate(semana)}
          onClose={() => setShowWizard(false)}
          onSemanaCompleta={handleWizardSemanaCompleta}
          onDiaEspecifico={handleWizardDiaEspecifico}
          onActividadEspecial={handleWizardActividadEspecial}
          onEventos={handleWizardEventos}
        />
      )}

      {/* ══ MODAL: Evento / día sin escuela ════════════════════════════════════ */}
      {showEventoWizard && (
        <EventoDiaSinEscuelaModal
          fechaSugerida={toISODate(semana)}
          onClose={() => setShowEventoWizard(false)}
          onCreated={() => {
            showToast("Guardado en el calendario ✓");
            if (viewMode === "semana") fetchCalSemana();
            else if (viewMode === "mes") fetchCalMes();
          }}
        />
      )}

      {/* ══ MODAL: Detalle actividad especial ════════════════════════════════ */}
      {calEspecialDetail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setCalEspecialDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5" style={{ backgroundColor: "#b45309" }}>
              <p className="text-sm font-semibold text-white">🌟 {calEspecialDetail.nombre}</p>
              <button onClick={() => setCalEspecialDetail(null)} className="text-white/70 hover:text-white p-1">
                <i className="ti ti-x" style={{ fontSize: 18 }} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "#8a5a1a" }}>
                <span className="font-semibold">{calEspecialDetail.grupos.map((g) => TIPO_PLAN_LABEL[g]).join(", ")}</span>
                <span>·</span>
                <span>{formatDiaFecha(calEspecialDetail.fecha)}</span>
                {calEspecialDetail.hora_inicio && <><span>·</span><span>{formatHora(calEspecialDetail.hora_inicio)}{calEspecialDetail.hora_fin ? `–${formatHora(calEspecialDetail.hora_fin)}` : ""}</span></>}
              </div>
              {calEspecialDetail.replicas && calEspecialDetail.replicas.turnos.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gray-500">Turnos</p>
                  {calEspecialDetail.replicas.turnos.map((t, i) => (
                    <p key={i} className="text-xs text-gray-600">Turno {i + 1} — {t.nombre_grupo || "Sin nombre"} ({formatHora(t.hora_inicio)})</p>
                  ))}
                </div>
              )}
              {calEspecialDetail.calentamiento?.incluye && (
                <div className="border border-gray-100 rounded-lg p-3" style={{ background: "#fffbeb" }}>
                  <p className="text-sm font-semibold text-gray-800">🔥 Calentamiento — {calEspecialDetail.calentamiento.duracion_min} min</p>
                  {calEspecialDetail.calentamiento.ejercicios.map((ej, i) => (
                    <p key={i} className="text-xs text-gray-600 mt-1">{ej.nombre} ({ej.duracion_min} min): {ej.descripcion}</p>
                  ))}
                </div>
              )}
              {calEspecialDetail.estaciones.map((est, i) => (
                <div key={i} className="border border-gray-100 rounded-lg p-3">
                  {esEstacionEstructurada(est) ? (
                    <>
                      <p className="text-sm font-semibold text-gray-800">{CATEGORIA_ESTACION_LABEL[est.categoria]} — {est.juego.nombre}</p>
                      <p className="text-xs text-gray-400 mb-1.5">{est.duracion_min} min</p>
                      <p className="text-xs text-gray-600"><span className="font-medium">Objetivo:</span> {est.juego.objetivo_pedagogico}</p>
                      <p className="text-xs text-gray-600 mt-1"><span className="font-medium">Materiales:</span> {est.juego.materiales}</p>
                      <p className="text-xs text-gray-600 mt-1"><span className="font-medium">Instrucciones:</span> {est.juego.instrucciones_profesor}</p>
                      {est.juego.reglas.length > 0 && (
                        <ol className="text-xs text-gray-600 mt-1 list-decimal pl-4">
                          {est.juego.reglas.map((r, ri) => <li key={ri}>{r}</li>)}
                        </ol>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-gray-800">{est.nombre}</p>
                      <p className="text-xs text-gray-400 mb-1.5">{[est.horario, est.lugar].filter(Boolean).join(" · ")}</p>
                      {est.drills.map((d, di) => (
                        <p key={di} className="text-xs text-gray-600"><span className="font-medium">{d.titulo}</span>{d.descripcion ? `: ${d.descripcion}` : ""}</p>
                      ))}
                    </>
                  )}
                </div>
              ))}
              {calEspecialDetail.notas && <p className="text-xs text-gray-500 italic">{calEspecialDetail.notas}</p>}
              {currentRol && isStaff(currentRol) && (
                <button
                  onClick={async () => {
                    await supabase.from("actividades_especiales").delete().eq("id", calEspecialDetail.id);
                    setCalEspecialDetail(null);
                    showToast("Actividad especial eliminada");
                    if (viewMode === "semana") fetchCalSemana();
                    else if (viewMode === "mes") fetchCalMes();
                  }}
                  className="text-xs text-red-500 hover:underline"
                >
                  Eliminar actividad
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
