"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ParentReportModal from "./ParentReportModal";
import PacoContextChat from "./PacoContextChat";
import PlanParaCasaModal from "./PlanParaCasaModal";
import { isStaff, DIRECTOR_COORD_ROLES, type Rol } from "@/lib/roles";

type Tab = "datos" | "tecnicos" | "fisicos" | "hitos" | "notas";
type CritValue = "cumple" | "progreso" | "no" | null;

// Los criterios/benchmarks técnicos y físicos viven en Supabase (protocolo_tests +
// protocolo_benchmarks) — ver ProtocoloTestRow/normalizeGrupoKey/getCriteriosGrupo/
// getPhysicalCategorias más abajo. POSICIONES_NOMBRES y POSICIONES_FASES son taxonomía
// fija P1-P10 independiente del grupo, no varían y no se migraron.

// "Grupo +14" es el valor que calcularGrupoEfectivo()/calcularGrupoFisico() devuelven
// en runtime, pero en Supabase el grupo se guarda como "+14" (igual que en las
// evaluaciones ya existentes). Normalizar antes de cualquier lookup/query.
function normalizeGrupoKey(grupo: string): string {
  return grupo === "Grupo +14" ? "+14" : grupo;
}

type ProtocoloBenchmark = {
  criterio: string;
  descripcion_ok: string | null;
  descripcion_progreso: string | null;
  descripcion_no: string | null;
  orden: number | null;
};

type ProtocoloTestRow = {
  codigo: string;
  nombre: string;
  categoria: string | null;
  instrucciones: string | null;
  orden: number | null;
  protocolo_benchmarks: ProtocoloBenchmark[];
};

export const POSICIONES_NOMBRES: Record<string, string> = {
  P1: "Setup", P2: "Palo paralelo — backswing", P3: "Brazo izq. paralelo",
  P4: "Top backswing", P5: "Brazo der. — inicio downswing", P6: "Palo paralelo — downswing",
  P7: "Impacto", P8: "Palo paralelo — follow through", P9: "Brazo der. — follow through", P10: "Finish completo",
};

const POSICIONES_FASES = [
  { label: "Backswing", posiciones: ["P1","P2","P3","P4"] },
  { label: "Downswing", posiciones: ["P5","P6","P7"] },
  { label: "Follow through", posiciones: ["P8","P9","P10"] },
];

export type PhysicalResult = "cumple" | "progreso" | "bajo" | null;

type PhysicalTestDef = {
  id: string;
  nombre: string;
  rangos: { cumple: string; progreso: string; bajo: string };
  swing?: string;
};

type PhysicalCategoriaDef = {
  label: string;
  tipo: "desarrollo_motor" | "screen" | "potencia";
  tests: PhysicalTestDef[];
};

function categoriaTipo(label: string): "desarrollo_motor" | "screen" | "potencia" {
  if (label.startsWith("Desarrollo Motor")) return "desarrollo_motor";
  if (label.startsWith("Potencia")) return "potencia";
  return "screen";
}

function posicionesDeGrupo(protocolosTecnico: Record<string, ProtocoloTestRow[]>, grupo: string): string[] {
  const tests = protocolosTecnico[normalizeGrupoKey(grupo)] ?? [];
  return tests.slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).map((t) => t.codigo);
}

function getPhysicalCategorias(protocolosFisico: Record<string, ProtocoloTestRow[]>, grupo: string): PhysicalCategoriaDef[] {
  const tests = (protocolosFisico[normalizeGrupoKey(grupo)] ?? []).slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const order: string[] = [];
  const byLabel = new Map<string, PhysicalTestDef[]>();
  tests.forEach((t) => {
    const label = t.categoria ?? "General";
    if (!byLabel.has(label)) { byLabel.set(label, []); order.push(label); }
    const b = t.protocolo_benchmarks[0];
    const swingMatch = t.instrucciones?.match(/^Posición de swing relacionada: (.+)$/);
    byLabel.get(label)!.push({
      id: t.codigo,
      nombre: t.nombre,
      rangos: { cumple: b?.descripcion_ok ?? "", progreso: b?.descripcion_progreso ?? "", bajo: b?.descripcion_no ?? "" },
      swing: swingMatch ? swingMatch[1] : undefined,
    });
  });
  return order.map((label) => ({ label, tipo: categoriaTipo(label), tests: byLabel.get(label)! }));
}

function calcularGrupoEfectivo(student: { birth_date: string | null; grupo_activo: string | null; gender: string | null }): string {
  if (student.grupo_activo === "Competencia") return "Competencia";
  if (student.grupo_activo === "Damas") return "Damas";
  if (!student.birth_date) return "Albatros";
  const hoy = new Date();
  const nac = new Date(student.birth_date);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  if (edad <= 5) return "Birdies";
  if (edad <= 8) return "Águilas";
  if (edad <= 12) return "Albatros";
  return "Grupo +14";
}

function calcularGrupoFisico(student: { birth_date: string | null; grupo_activo: string | null; gender: string | null }): string {
  return calcularGrupoEfectivo(student);
}

type Student = {
  id: string; full_name: string; birth_date: string | null;
  status: "activo" | "inactivo"; grupo_activo: string | null; gender: string | null;
  parent_name: string | null; parent_phone: string | null; parent_email: string | null;
  observations: string | null; enrollment_date: string | null; foto_url: string | null;
  tiene_talega: string | null;
};

type EditForm = {
  full_name: string; birth_date: string; status: "activo" | "inactivo";
  grupo_activo: string; parent_name: string; parent_phone: string;
  parent_email: string; observations: string; tiene_talega: string;
};

type PosState = { na: boolean; criterios: CritValue[]; obsOpen: boolean; obs: string; };

type SwingForm = {
  evaluation_type: "inicial" | "periódica" | "graduación";
  evaluation_date: string;
  positions: Record<string, PosState>;
  professor_comment: string;
};

type SwingEvaluation = {
  id: string; student_id: string; student_name: string; grupo: string;
  evaluation_date: string; evaluation_type: string;
  p1_score: number|null; p2_score: number|null; p3_score: number|null;
  p4_score: number|null; p5_score: number|null; p6_score: number|null;
  p7_score: number|null; p8_score: number|null; p9_score: number|null;
  p10_score: number|null; score_promedio: number|null;
  p1_criterios: CritValue[]|null; p1_obs: string|null; p1_na: boolean;
  p2_criterios: CritValue[]|null; p2_obs: string|null; p2_na: boolean;
  p3_criterios: CritValue[]|null; p3_obs: string|null; p3_na: boolean;
  p4_criterios: CritValue[]|null; p4_obs: string|null; p4_na: boolean;
  p5_criterios: CritValue[]|null; p5_obs: string|null; p5_na: boolean;
  p6_criterios: CritValue[]|null; p6_obs: string|null; p6_na: boolean;
  p7_criterios: CritValue[]|null; p7_obs: string|null; p7_na: boolean;
  p8_criterios: CritValue[]|null; p8_obs: string|null; p8_na: boolean;
  p9_criterios: CritValue[]|null; p9_obs: string|null; p9_na: boolean;
  p10_criterios: CritValue[]|null; p10_obs: string|null; p10_na: boolean;
  ai_analysis: string|null; ai_generated_at: string|null;
  integrated_analysis: string|null; integrated_at: string|null;
  professor_comment: string|null; created_at: string;
};

type AiAnalysis = {
  resumen: string;
  prioridades: { orden: number; posicion: string; titulo: string; descripcion: string; instruccion_profesor: string; conexion_fisica: string|null; drills: string[]; }[];
  fortalezas: string[];
  plan_clase: { minutos: string; actividad: string; tipo: string; }[];
  nota_edad: string;
};

type PhysicalTestState = {
  result: PhysicalResult;
  obs: string;
  na: boolean;
  obsOpen: boolean;
};

type PhysicalForm = {
  evaluation_type: "inicial" | "periódica" | "graduación";
  evaluation_date: string;
  tests: Record<string, PhysicalTestState>;
  professor_comment: string;
};

type PhysicalEvaluation = {
  id: string;
  student_id: string;
  student_name: string;
  grupo: string;
  evaluation_date: string;
  evaluation_type: string;
  tests_data: Record<string, { result: PhysicalResult; obs: string | null; na: boolean }> | null;
  score_promedio: number | null;
  professor_comment: string | null;
  ai_analysis: string | null;
  ai_generated_at: string | null;
  created_at: string;
};

type PhysicalAiAnalysis = {
  resumen: string;
  limitaciones: { test: string; titulo: string; nivel: string; descripcion: string; conexion_swing: string; ejercicios: string[]; }[];
  patron_general?: string | null;
  fortalezas_fisicas?: string[];
  recomendaciones_generales?: string[];
  plan_trabajo?: { semanas: string; objetivo: string; ejercicios: string[]; }[];
  nota_edad?: string;
};

type IntegratedAiAnalysis = {
  resumen_integrado: string;
  prioridades_cruzadas: {
    orden: number;
    titulo: string;
    limitacion_fisica: string;
    error_tecnico: string;
    descripcion: string;
    ejercicio_fisico: string;
    drill_tecnico: string;
    progresion: string;
  }[];
  plan_sesion?: string | null;
  nota_trackman?: string | null;
  // campos legacy para compatibilidad con análisis guardados anteriores
  fortalezas_combinadas?: string[];
  plan_clase_unificado?: { fase: string; minutos: string; actividad: string; tipo: string; }[];
  plan_clase?: { fase: string; minutos: string; actividad: string; tipo: string; }[];
  indicadores_progreso?: string[];
  nota_profesor?: string | null;
  nota_edad?: string | null;
};

type Hito = {
  id: string;
  alumno_id: string;
  titulo: string;
  descripcion: string | null;
  fecha: string;
  foto_url: string | null;
  created_at: string;
};

type HitoForm = {
  titulo: string;
  descripcion: string;
  fecha: string;
  foto: File | null;
};

type TipoImagen = "trackman" | "swing" | "campo" | "otro";

type NotaProfesor = {
  id: string;
  alumno_id: string;
  contenido: string;
  imagen_url: string | null;
  video_url: string | null;
  tipo_imagen: TipoImagen | null;
  profesor_id: string | null;
  profesor_nombre: string | null;
  fecha: string;
  created_at: string;
  origen: string | null;
};

type NotaForm = {
  contenido: string;
  fecha: string;
  imagen: File | null;
  imagenPreview: string | null;
  video: File | null;
  videoPreview: string | null;
  tipo_imagen: TipoImagen | null;
};

const TIPO_IMAGEN_LABELS: Record<TipoImagen, string> = {
  trackman: "Trackman", swing: "Swing", campo: "Campo", otro: "Otro",
};

type TrackmanData = {
  club_speed_mph: number | null;
  ball_speed_mph: number | null;
  smash_factor: number | null;
  launch_angle_deg: number | null;
  spin_rate_rpm: number | null;
  carry_yards: number | null;
  total_yards: number | null;
  attack_angle_deg: number | null;
  club_path_deg: number | null;
  face_angle_deg: number | null;
  face_to_path_deg: number | null;
  club_usado: string | null;
  notas_adicionales: string | null;
};

type TrackmanSession = {
  id: string;
  alumno_id: string;
  fecha: string;
  datos: TrackmanData;
  created_at: string;
};

export function physResultToScore(result: PhysicalResult): number | null {
  if (result === "cumple") return 10;
  if (result === "progreso") return 6;
  if (result === "bajo") return 2;
  return null;
}

function calcPhysPromedio(tests: Record<string, PhysicalTestState>): number | null {
  const scores: number[] = [];
  Object.values(tests).forEach((t) => {
    if (t.na) return;
    const s = physResultToScore(t.result);
    if (s !== null) scores.push(s);
  });
  if (!scores.length) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100) / 100;
}

function defaultPhysicalForm(protocolosFisico: Record<string, ProtocoloTestRow[]>, grupo: string): PhysicalForm {
  const categorias = getPhysicalCategorias(protocolosFisico, grupo);
  const tests: Record<string, PhysicalTestState> = {};
  categorias.forEach((cat) => cat.tests.forEach((t) => { tests[t.id] = { result: null, obs: "", na: false, obsOpen: false }; }));
  return { evaluation_type: "inicial", evaluation_date: new Date().toISOString().split("T")[0], tests, professor_comment: "" };
}

function getCriteriosGrupo(protocolosTecnico: Record<string, ProtocoloTestRow[]>, grupo: string, posicion: string): string[] {
  const test = (protocolosTecnico[normalizeGrupoKey(grupo)] ?? []).find((t) => t.codigo === posicion);
  return (test?.protocolo_benchmarks ?? []).slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).map((b) => b.criterio);
}

function critScore(val: CritValue): number|null {
  if (val === "cumple") return 10;
  if (val === "progreso") return 6;
  if (val === "no") return 2;
  return null;
}

function calcPosScore(criterios: CritValue[]): number|null {
  const scores = criterios.map(critScore).filter((v): v is number => v !== null);
  if (!scores.length) return null;
  return Math.round(scores.reduce((a,b) => a+b, 0) / scores.length * 10) / 10;
}

function calcPromedio(positions: Record<string, PosState>): number|null {
  const scores: number[] = [];
  Object.values(positions).forEach((p) => {
    if (p.na) return;
    const s = calcPosScore(p.criterios);
    if (s !== null) scores.push(s);
  });
  if (!scores.length) return null;
  return Math.round(scores.reduce((a,b) => a+b, 0) / scores.length * 100) / 100;
}

function scoreColor(score: number|null) {
  if (score === null) return { text: "#9CA3AF", bg: "#F9FAFB", bar: "#E5E7EB" };
  if (score >= 8) return { text: "#1D4ED8", bg: "#EFF6FF", bar: "#3B82F6" };
  if (score >= 6) return { text: "#1B4D2E", bg: "#F0FDF4", bar: "#22C55E" };
  if (score >= 4) return { text: "#92400E", bg: "#FFFBEB", bar: "#F59E0B" };
  return { text: "#991B1B", bg: "#FEF2F2", bar: "#EF4444" };
}

function scoreLabel(score: number|null): string {
  if (score === null) return "—";
  if (score >= 8) return "Excelente";
  if (score >= 6) return "Cumple";
  if (score >= 4) return "En progreso";
  return "Bajo";
}

function calcularEdad(birthDate: string|null): string {
  if (!birthDate) return "—";
  const hoy = new Date(); const nac = new Date(birthDate);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return `${edad} años`;
}

function calcularEdadNum(birthDate: string|null): number|null {
  if (!birthDate) return null;
  const hoy = new Date(); const nac = new Date(birthDate);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}

type StudentContextInfo = Pick<Student, "full_name" | "grupo_activo" | "birth_date" | "enrollment_date">;
type AsistenciaResumen = { asistidas: number; total: number; pct: number };

function buildStudentContext(
  student: StudentContextInfo,
  swingEvals: SwingEvaluation[],
  physicalEvals: PhysicalEvaluation[],
  notas: NotaProfesor[],
  asistencia: AsistenciaResumen | null
): string {
  const parts: string[] = [`Nombre: ${student.full_name}`];
  if (student.grupo_activo) parts.push(`Grupo: ${student.grupo_activo}`);
  const edad = calcularEdadNum(student.birth_date);
  if (edad !== null) parts.push(`Edad: ${edad} años`);
  if (student.enrollment_date) parts.push(`Fecha de ingreso a la escuela: ${formatFecha(student.enrollment_date)}`);

  if (swingEvals.length) {
    const bloques = swingEvals
      .map((ev) => {
        const raw = ev as unknown as Record<string, string | number | boolean | null>;
        const lines: string[] = [];
        for (let i = 1; i <= 10; i++) {
          if (raw[`p${i}_na`]) continue;
          const score = raw[`p${i}_score`];
          if (score === null || score === undefined) continue;
          const obs = raw[`p${i}_obs`];
          lines.push(`P${i} (${POSICIONES_NOMBRES[`P${i}`]}): ${score}/10${obs ? ` — ${obs}` : ""}`);
        }
        return lines.length ? `Evaluación del ${ev.evaluation_date} (${ev.evaluation_type}):\n${lines.join("\n")}` : null;
      })
      .filter((b): b is string => !!b);
    if (bloques.length) parts.push(`Tests técnicos (P1-P10) — historial, más reciente primero:\n\n${bloques.join("\n\n")}`);
  }

  if (physicalEvals.length) {
    const bloques = physicalEvals
      .map((ev) => {
        if (!ev.tests_data) return null;
        const lines = Object.entries(ev.tests_data)
          .filter(([, t]) => !t.na && t.result)
          .map(([tid, t]) => `${tid}: ${t.result}${t.obs ? ` — ${t.obs}` : ""}`);
        return lines.length ? `Evaluación del ${ev.evaluation_date} (${ev.evaluation_type}):\n${lines.join("\n")}` : null;
      })
      .filter((b): b is string => !!b);
    if (bloques.length) parts.push(`Tests físicos — historial, más reciente primero:\n\n${bloques.join("\n\n")}`);
  }

  if (notas.length) {
    const lines = notas.map((n) => `- ${n.fecha}: ${n.contenido}`);
    parts.push(`Últimas notas del profesor:\n${lines.join("\n")}`);
  }

  if (asistencia && asistencia.total > 0) {
    parts.push(`Asistencia último mes: ${asistencia.asistidas}/${asistencia.total} sesiones (${asistencia.pct}%)`);
  }

  return parts.join("\n\n");
}

async function fetchFullStudentContext(studentId: string): Promise<string | null> {
  const unMesAtras = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const [studentRes, swingRes, physicalRes, notasRes, asistRes] = await Promise.all([
    supabase.from("students").select("full_name, grupo_activo, birth_date, enrollment_date").eq("id", studentId).single(),
    supabase.from("swing_evaluations").select("*").eq("student_id", studentId).order("evaluation_date", { ascending: false }).limit(5),
    supabase.from("physical_evaluations").select("*").eq("student_id", studentId).order("evaluation_date", { ascending: false }).limit(5),
    supabase.from("notas_profesor").select("*").eq("alumno_id", studentId).order("fecha", { ascending: false }).limit(5),
    supabase.from("reservas").select("asistio, sesiones_semana!inner(fecha)").eq("estudiante_id", studentId).gte("sesiones_semana.fecha", unMesAtras),
  ]);

  const student = studentRes.data as StudentContextInfo | null;
  if (!student) return null;

  const reservasMes = (asistRes.data ?? []) as { asistio: boolean | null }[];
  const asistencia: AsistenciaResumen | null = reservasMes.length
    ? {
        total: reservasMes.length,
        asistidas: reservasMes.filter((r) => r.asistio).length,
        pct: Math.round((reservasMes.filter((r) => r.asistio).length / reservasMes.length) * 100),
      }
    : null;

  return buildStudentContext(
    student,
    (swingRes.data as SwingEvaluation[]) ?? [],
    (physicalRes.data as PhysicalEvaluation[]) ?? [],
    (notasRes.data as NotaProfesor[]) ?? [],
    asistencia
  );
}

function tendenciaTexto(actual: number | null, anterior: number | null): string {
  if (actual === null || anterior === null) return "sin datos suficientes para comparar";
  const diff = actual - anterior;
  if (Math.abs(diff) < 5) return "estable respecto al mes anterior";
  return diff > 0 ? `mejorando (+${diff} pts vs. mes anterior)` : `bajando (${diff} pts vs. mes anterior)`;
}

async function buildParentReportMarkdown(studentId: string, student: StudentContextInfo): Promise<string> {
  const hoy = new Date();
  const hace30 = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const hace60 = new Date(Date.now() - 60 * 86400000).toISOString().split("T")[0];
  const grupo = normalizeGrupoKey(student.grupo_activo ?? calcularGrupoFisico({ birth_date: student.birth_date, grupo_activo: student.grupo_activo, gender: null }));

  const [swingRes, physicalRes, notasRes, asistRecienteRes, asistAnteriorRes, protocolosFisicoRes] = await Promise.all([
    supabase.from("swing_evaluations").select("*").eq("student_id", studentId).order("evaluation_date", { ascending: false }).limit(1),
    supabase.from("physical_evaluations").select("*").eq("student_id", studentId).order("evaluation_date", { ascending: false }).limit(1),
    supabase.from("notas_profesor").select("*").eq("alumno_id", studentId).order("fecha", { ascending: false }).limit(20),
    supabase.from("reservas").select("asistio, sesiones_semana!inner(fecha)").eq("estudiante_id", studentId).gte("sesiones_semana.fecha", hace30),
    supabase.from("reservas").select("asistio, sesiones_semana!inner(fecha)").eq("estudiante_id", studentId).gte("sesiones_semana.fecha", hace60).lt("sesiones_semana.fecha", hace30),
    supabase.from("protocolo_tests").select("codigo, nombre").eq("grupo", grupo).eq("tipo", "fisico"),
  ]);

  const parts: string[] = [`# Reporte de ${student.full_name}`];
  const edad = calcularEdadNum(student.birth_date);
  parts.push(
    `**Grupo:** ${student.grupo_activo ?? grupo}  \n**Edad:** ${edad !== null ? `${edad} años` : "—"}  \n**Fecha del reporte:** ${formatFecha(hoy.toISOString().split("T")[0])}`
  );

  const reciente = (asistRecienteRes.data ?? []) as { asistio: boolean | null }[];
  const anterior = (asistAnteriorRes.data ?? []) as { asistio: boolean | null }[];
  const pctReciente = reciente.length ? Math.round((reciente.filter((r) => r.asistio).length / reciente.length) * 100) : null;
  const pctAnterior = anterior.length ? Math.round((anterior.filter((r) => r.asistio).length / anterior.length) * 100) : null;
  parts.push(
    `## Resumen de asistencia\n${
      pctReciente !== null
        ? `${pctReciente}% (${reciente.filter((r) => r.asistio).length}/${reciente.length} sesiones el último mes) — ${tendenciaTexto(pctReciente, pctAnterior)}`
        : "Sin sesiones registradas en el último mes."
    }`
  );

  const swing = (swingRes.data as SwingEvaluation[])?.[0];
  if (swing) {
    const raw = swing as unknown as Record<string, string | number | boolean | null>;
    const rows: string[] = ["| Posición | Calificación | Observación |", "|---|---|---|"];
    for (let i = 1; i <= 10; i++) {
      if (raw[`p${i}_na`]) continue;
      const score = raw[`p${i}_score`];
      if (score === null || score === undefined) continue;
      const obs = (raw[`p${i}_obs`] as string | null) ?? "";
      rows.push(`| ${POSICIONES_NOMBRES[`P${i}`] ?? `P${i}`} | ${score}/10 | ${obs.replace(/\|/g, "/") || "—"} |`);
    }
    parts.push(`## Resultados de tests técnicos\nÚltima evaluación: ${formatFecha(swing.evaluation_date)}\n\n${rows.join("\n")}`);
  } else {
    parts.push(`## Resultados de tests técnicos\nSin tests técnicos registrados.`);
  }

  const physicalNombres: Record<string, string> = {};
  ((protocolosFisicoRes.data ?? []) as { codigo: string; nombre: string }[]).forEach((t) => (physicalNombres[t.codigo] = t.nombre));
  const physical = (physicalRes.data as PhysicalEvaluation[])?.[0];
  if (physical?.tests_data) {
    const rows: string[] = ["| Screen | Calificación | Observación |", "|---|---|---|"];
    Object.entries(physical.tests_data).forEach(([codigo, t]) => {
      if (t.na) return;
      rows.push(`| ${physicalNombres[codigo] ?? codigo} | ${t.result ?? "—"} | ${(t.obs ?? "").replace(/\|/g, "/") || "—"} |`);
    });
    parts.push(`## Resultados de tests físicos\nÚltima evaluación: ${formatFecha(physical.evaluation_date)}\n\n${rows.join("\n")}`);
  } else {
    parts.push(`## Resultados de tests físicos\nSin tests físicos registrados.`);
  }

  const notas = (notasRes.data as NotaProfesor[]) ?? [];
  const analisisPaco = notas.find((n) => n.origen === "paco");
  if (analisisPaco) parts.push(`## Análisis de Paco\n${analisisPaco.contenido}`);

  const planCasa = notas.find((n) => n.origen === "plan-casa");
  if (planCasa) parts.push(`## Plan de trabajo actual\n${planCasa.contenido}`);

  const notaManual = notas.find((n) => !n.origen);
  if (notaManual) parts.push(`## Nota del profesor más reciente\n${formatFecha(notaManual.fecha)}: ${notaManual.contenido}`);

  return parts.join("\n\n");
}

function formatFecha(dateStr: string|null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
}

const TRACKMAN_LABELS: { key: keyof TrackmanData; label: string; unit: string }[] = [
  { key: "club_usado", label: "Club", unit: "" },
  { key: "club_speed_mph", label: "Club Speed", unit: " mph" },
  { key: "ball_speed_mph", label: "Ball Speed", unit: " mph" },
  { key: "smash_factor", label: "Smash Factor", unit: "" },
  { key: "launch_angle_deg", label: "Launch Angle", unit: "°" },
  { key: "spin_rate_rpm", label: "Spin Rate", unit: " rpm" },
  { key: "carry_yards", label: "Carry", unit: " yds" },
  { key: "total_yards", label: "Total", unit: " yds" },
  { key: "attack_angle_deg", label: "Attack Angle", unit: "°" },
  { key: "club_path_deg", label: "Club Path", unit: "°" },
  { key: "face_angle_deg", label: "Face Angle", unit: "°" },
  { key: "face_to_path_deg", label: "Face to Path", unit: "°" },
  { key: "notas_adicionales", label: "Notas", unit: "" },
];

function TrackmanDataTable({ data, compact = false }: { data: TrackmanData; compact?: boolean }) {
  const rows = TRACKMAN_LABELS.filter((f) => data[f.key] != null);
  if (!rows.length) return <p className="text-xs text-gray-400">Sin datos extraídos</p>;
  if (compact) {
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {rows.map((f) => (
          <span key={f.key} className="text-xs text-gray-600">
            <span className="text-gray-400">{f.label}: </span>
            {String(data[f.key])}{f.unit}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((f, i) => (
            <tr key={f.key} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
              <td className="px-4 py-2.5 text-xs font-medium text-gray-500 w-40">{f.label}</td>
              <td className="px-4 py-2.5 font-semibold text-gray-900">{String(data[f.key])}{f.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function initiales(name: string): string {
  return name.split(" ").slice(0,2).map((n) => n[0]).join("").toUpperCase();
}

function defaultSwingForm(protocolosTecnico: Record<string, ProtocoloTestRow[]>, grupo: string): SwingForm {
  const posiciones = posicionesDeGrupo(protocolosTecnico, grupo);
  const positions: Record<string, PosState> = {};
  posiciones.forEach((p) => {
    const criterios = getCriteriosGrupo(protocolosTecnico, grupo, p);
    positions[p] = { na: false, criterios: criterios.map(() => null), obsOpen: false, obs: "" };
  });
  return { evaluation_type: "inicial", evaluation_date: new Date().toISOString().split("T")[0], positions, professor_comment: "" };
}

export default function StudentProfile({ studentId, currentRol }: { studentId: string; currentRol: Rol | null }) {
  const router = useRouter();
  const [student, setStudent] = useState<Student|null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("datos");
  const [showPacoChat, setShowPacoChat] = useState(false);
  const [pacoContext, setPacoContext] = useState<string | null>(null);
  const [pacoContextLoading, setPacoContextLoading] = useState(false);
  const [parentPdfLoading, setParentPdfLoading] = useState(false);
  const [showPlanCasa, setShowPlanCasa] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<EditForm|null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string|null>(null);
  const [swingEvals, setSwingEvals] = useState<SwingEvaluation[]>([]);
  const [swingLoading, setSwingLoading] = useState(false);
  const [showSwingForm, setShowSwingForm] = useState(false);
  const [swingForm, setSwingForm] = useState<SwingForm|null>(null);
  const [swingSaving, setSwingSaving] = useState(false);
  const [swingSaveError, setSwingSaveError] = useState<string|null>(null);
  const [expandedEval, setExpandedEval] = useState<string|null>(null);
  const [analyzingId, setAnalyzingId] = useState<string|null>(null);
  const [aiResults, setAiResults] = useState<Record<string, AiAnalysis>>({});
  const [physicalEvals, setPhysicalEvals] = useState<PhysicalEvaluation[]>([]);
  const [physicalLoading, setPhysicalLoading] = useState(false);
  const [showPhysicalForm, setShowPhysicalForm] = useState(false);
  const [physicalForm, setPhysicalForm] = useState<PhysicalForm|null>(null);
  const [physicalSaving, setPhysicalSaving] = useState(false);
  const [physicalSaveError, setPhysicalSaveError] = useState<string|null>(null);
  const [expandedPhysical, setExpandedPhysical] = useState<string|null>(null);
  const [analyzingPhysicalId, setAnalyzingPhysicalId] = useState<string|null>(null);
  const [physicalAiResults, setPhysicalAiResults] = useState<Record<string, PhysicalAiAnalysis>>({});
  const [integratedResults, setIntegratedResults] = useState<Record<string, IntegratedAiAnalysis>>({});
  const [analyzingIntegratedId, setAnalyzingIntegratedId] = useState<string|null>(null);
  const [hasPhysicalEvals, setHasPhysicalEvals] = useState(false);
  const [hitos, setHitos] = useState<Hito[]>([]);
  const [hitosLoading, setHitosLoading] = useState(false);
  const [showHitoForm, setShowHitoForm] = useState(false);
  const [hitoForm, setHitoForm] = useState<HitoForm | null>(null);
  const [savingHito, setSavingHito] = useState(false);
  const [hitoSaveError, setHitoSaveError] = useState<string | null>(null);
  const [trackmanSessions, setTrackmanSessions] = useState<TrackmanSession[]>([]);
  const [trackmanFile, setTrackmanFile] = useState<File | null>(null);
  const [trackmanPreview, setTrackmanPreview] = useState<string | null>(null);
  const [analyzingTrackman, setAnalyzingTrackman] = useState(false);
  const [trackmanLatest, setTrackmanLatest] = useState<TrackmanSession | null>(null);
  const [showTrackmanHistory, setShowTrackmanHistory] = useState(false);
  const [trackmanError, setTrackmanError] = useState<string | null>(null);
  const [protocolosTecnico, setProtocolosTecnico] = useState<Record<string, ProtocoloTestRow[]>>({});
  const [protocolosFisico, setProtocolosFisico] = useState<Record<string, ProtocoloTestRow[]>>({});
  // Análisis integrado del perfil (independiente de evaluación específica)
  const [hasSwingEvals, setHasSwingEvals] = useState(false);
  const [hasTrackmanData, setHasTrackmanData] = useState(false);
  const [profileIntegratedResult, setProfileIntegratedResult] = useState<IntegratedAiAnalysis | null>(null);
  const [analyzingProfileIntegrated, setAnalyzingProfileIntegrated] = useState(false);
  const [profileIntegratedError, setProfileIntegratedError] = useState<string | null>(null);
  const [showParentReport, setShowParentReport] = useState(false);
  // Foto de perfil
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoToast, setPhotoToast] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [notas, setNotas] = useState<NotaProfesor[]>([]);
  const [notasLoading, setNotasLoading] = useState(false);
  const [showNotaForm, setShowNotaForm] = useState(false);
  const [notaForm, setNotaForm] = useState<NotaForm | null>(null);
  const [savingNota, setSavingNota] = useState(false);
  const [notaSaveError, setNotaSaveError] = useState<string | null>(null);
  const [editingNotaId, setEditingNotaId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDeleteStudent() {
    if (!student) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/delete-student", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error ?? "No se pudo eliminar el alumno.");
        setDeleting(false);
        return;
      }
      setShowDeleteModal(false);
      setPhotoToast("Alumno eliminado correctamente");
      setTimeout(() => router.push("/alumnos"), 1200);
    } catch {
      setDeleteError("Error de conexión. Intenta de nuevo.");
      setDeleting(false);
    }
  }

  useEffect(() => {
    supabase.from("physical_evaluations")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId)
      .then(({ count }) => { if ((count ?? 0) > 0) setHasPhysicalEvals(true); });
    supabase.from("swing_evaluations")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId)
      .then(({ count }) => { if ((count ?? 0) > 0) setHasSwingEvals(true); });
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
    supabase.from("trackman_sessions")
      .select("id", { count: "exact", head: true })
      .eq("alumno_id", studentId)
      .gte("fecha", thirtyDaysAgo)
      .then(({ count }) => { if ((count ?? 0) > 0) setHasTrackmanData(true); });
  }, [studentId]);

  useEffect(() => {
    if (activeTab !== "hitos") return;
    setHitosLoading(true);
    supabase.from("hitos").select("*").eq("alumno_id", studentId).order("fecha", { ascending: false })
      .then(({ data }) => { setHitos(data ?? []); setHitosLoading(false); });
  }, [activeTab, studentId]);

  useEffect(() => {
    if (activeTab !== "notas") return;
    setNotasLoading(true);
    supabase.from("notas_profesor").select("*").eq("alumno_id", studentId).order("fecha", { ascending: false })
      .then(({ data }) => { setNotas((data as NotaProfesor[]) ?? []); setNotasLoading(false); });
  }, [activeTab, studentId]);

  useEffect(() => {
    if (activeTab !== "tecnicos") return;
    supabase.from("trackman_sessions").select("*").eq("alumno_id", studentId)
      .order("fecha", { ascending: false }).limit(5)
      .then(({ data }) => { setTrackmanSessions(data ?? []); if (data?.[0]) setTrackmanLatest(data[0]); });
  }, [activeTab, studentId]);

  useEffect(() => {
    async function fetchStudent() {
      const { data, error } = await supabase.from("students")
        .select("id,full_name,birth_date,status,grupo_activo,gender,parent_name,parent_phone,parent_email,observations,enrollment_date,foto_url,tiene_talega")
        .eq("id", studentId).single();
      if (!error) setStudent(data);
      setLoading(false);
    }
    fetchStudent();
  }, [studentId]);

  useEffect(() => {
    if (activeTab !== "tecnicos") return;
    async function fetchSwing() {
      setSwingLoading(true);
      const { data, error } = await supabase.from("swing_evaluations").select("*")
        .eq("student_id", studentId).order("evaluation_date", { ascending: false });
      if (!error && data) {
        setSwingEvals(data);
        const aiMap: Record<string, AiAnalysis> = {};
        data.forEach((ev) => {
          if (!ev.ai_analysis) return;
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let p: any = typeof ev.ai_analysis === 'string' ? JSON.parse(ev.ai_analysis) : ev.ai_analysis;
            // Unwrap up to 3 levels of nested JSON in resumen (handles double-encoding from older saves)
            for (let i = 0; i < 3; i++) {
              if (typeof p?.resumen !== 'string' || !p.resumen.trim().startsWith('{')) break;
              try {
                const inner = JSON.parse(p.resumen);
                if (inner?.resumen !== undefined) { p = inner; } else break;
              } catch {
                const match = String(p.resumen).match(/\{[\s\S]*\}/);
                if (match) { try { const inner = JSON.parse(match[0]); if (inner?.resumen !== undefined) { p = inner; } } catch {} }
                break;
              }
            }
            if (p && typeof p === 'object' && typeof p.resumen === 'string' && !p.resumen.trim().startsWith('{')) {
              aiMap[ev.id] = p as AiAnalysis;
            }
          } catch {}
        });
        setAiResults(aiMap);
        const integratedMap: Record<string, IntegratedAiAnalysis> = {};
        data.forEach((ev) => {
          if (!ev.integrated_analysis) return;
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let p: any = typeof ev.integrated_analysis === "string" ? JSON.parse(ev.integrated_analysis) : ev.integrated_analysis;
            // Unwrap hasta 3 niveles de doble-encoding
            for (let i = 0; i < 3; i++) {
              if (typeof p?.resumen_integrado !== "string" || !p.resumen_integrado.trim().startsWith("{")) break;
              try {
                const inner = JSON.parse(p.resumen_integrado);
                if (inner?.resumen_integrado !== undefined) { p = inner; } else break;
              } catch {
                const match = String(p.resumen_integrado).match(/\{[\s\S]*\}/);
                if (match) { try { const inner = JSON.parse(match[0]); if (inner?.resumen_integrado !== undefined) { p = inner; } } catch {} }
                break;
              }
            }
            if (p && typeof p === "object" && typeof p.resumen_integrado === "string" && !p.resumen_integrado.trim().startsWith("{")) integratedMap[ev.id] = p as IntegratedAiAnalysis;
          } catch {}
        });
        setIntegratedResults(integratedMap);
      }
      setSwingLoading(false);
    }
    fetchSwing();
  }, [activeTab, studentId]);

  useEffect(() => {
    if (activeTab !== "fisicos") return;
    async function fetchPhysical() {
      setPhysicalLoading(true);
      const { data, error } = await supabase.from("physical_evaluations").select("*")
        .eq("student_id", studentId).order("evaluation_date", { ascending: false });
      if (!error && data) {
        setPhysicalEvals(data);
        if (data.length > 0) setHasPhysicalEvals(true);
        const aiMap: Record<string, PhysicalAiAnalysis> = {};
        data.forEach((ev) => {
          if (!ev.ai_analysis) return;
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let p: any = typeof ev.ai_analysis === "string" ? JSON.parse(ev.ai_analysis) : ev.ai_analysis;
            for (let i = 0; i < 3; i++) {
              if (typeof p?.resumen !== "string" || !p.resumen.trim().startsWith("{")) break;
              try {
                const inner = JSON.parse(p.resumen);
                if (inner?.resumen !== undefined) { p = inner; } else break;
              } catch {
                const match = String(p.resumen).match(/\{[\s\S]*\}/);
                if (match) { try { const inner = JSON.parse(match[0]); if (inner?.resumen !== undefined) { p = inner; } } catch {} }
                break;
              }
            }
            if (p && typeof p === "object" && typeof p.resumen === "string" && !p.resumen.trim().startsWith("{")) aiMap[ev.id] = p as PhysicalAiAnalysis;
          } catch {}
        });
        setPhysicalAiResults(aiMap);
      }
      setPhysicalLoading(false);
    }
    fetchPhysical();
  }, [activeTab, studentId]);

  useEffect(() => {
    if (activeTab !== "tecnicos" || !student) return;
    const grupos = new Set<string>([normalizeGrupoKey(calcularGrupoEfectivo(student))]);
    swingEvals.forEach((e) => grupos.add(normalizeGrupoKey(e.grupo)));
    const missing = [...grupos].filter((g) => !(g in protocolosTecnico));
    if (missing.length === 0) return;
    supabase.from("protocolo_tests").select("*, protocolo_benchmarks(*)")
      .in("grupo", missing).eq("tipo", "tecnico").eq("activo", true).order("orden")
      .then(({ data }) => {
        const byGrupo: Record<string, ProtocoloTestRow[]> = {};
        missing.forEach((g) => { byGrupo[g] = []; });
        (data ?? []).forEach((row: ProtocoloTestRow & { grupo: string }) => {
          const benchmarks = (row.protocolo_benchmarks ?? []).slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
          (byGrupo[row.grupo] ??= []).push({ ...row, protocolo_benchmarks: benchmarks });
        });
        setProtocolosTecnico((prev) => ({ ...prev, ...byGrupo }));
      });
  }, [activeTab, student, swingEvals, protocolosTecnico]);

  useEffect(() => {
    if (activeTab !== "fisicos" || !student) return;
    const grupos = new Set<string>([normalizeGrupoKey(calcularGrupoFisico(student))]);
    physicalEvals.forEach((e) => grupos.add(normalizeGrupoKey(e.grupo)));
    const missing = [...grupos].filter((g) => !(g in protocolosFisico));
    if (missing.length === 0) return;
    supabase.from("protocolo_tests").select("*, protocolo_benchmarks(*)")
      .in("grupo", missing).eq("tipo", "fisico").eq("activo", true).order("orden")
      .then(({ data }) => {
        const byGrupo: Record<string, ProtocoloTestRow[]> = {};
        missing.forEach((g) => { byGrupo[g] = []; });
        (data ?? []).forEach((row: ProtocoloTestRow & { grupo: string }) => {
          const benchmarks = (row.protocolo_benchmarks ?? []).slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
          (byGrupo[row.grupo] ??= []).push({ ...row, protocolo_benchmarks: benchmarks });
        });
        setProtocolosFisico((prev) => ({ ...prev, ...byGrupo }));
      });
  }, [activeTab, student, physicalEvals, protocolosFisico]);

  function openEdit() {
    if (!student) return;
    setForm({ full_name: student.full_name, birth_date: student.birth_date ?? "", status: student.status, grupo_activo: student.grupo_activo ?? "", parent_name: student.parent_name ?? "", parent_phone: student.parent_phone ?? "", parent_email: student.parent_email ?? "", observations: student.observations ?? "", tiene_talega: student.tiene_talega ?? "" });
    setSaveError(null); setIsEditing(true);
  }
  function closeEdit() { setIsEditing(false); setForm(null); setSaveError(null); }
  function setField<K extends keyof EditForm>(key: K, value: EditForm[K]) { setForm((prev) => prev ? { ...prev, [key]: value } : prev); }

  async function handleSave() {
    if (!form || !student) return;
    setSaving(true); setSaveError(null);
    const payload = { full_name: form.full_name.trim(), birth_date: form.birth_date||null, status: form.status, grupo_activo: form.grupo_activo||null, tiene_talega: form.tiene_talega||null, parent_name: form.parent_name.trim()||null, parent_phone: form.parent_phone.trim()||null, parent_email: form.parent_email.trim()||null, observations: form.observations.trim()||null };
    const { error } = await supabase.from("students").update(payload).eq("id", student.id);
    if (error) { setSaveError(error.message); setSaving(false); return; }
    setStudent((prev) => prev ? { ...prev, ...payload } : prev);
    setSaving(false); closeEdit();
  }

  function openSwingForm() {
    const grupo = calcularGrupoEfectivo(student!);
    setSwingForm(defaultSwingForm(protocolosTecnico, grupo));
    setSwingSaveError(null); setShowSwingForm(true);
  }
  function closeSwingForm() { setShowSwingForm(false); setSwingForm(null); setSwingSaveError(null); }

  function setPosNA(pid: string, na: boolean) {
    setSwingForm((prev) => { if (!prev) return prev; return { ...prev, positions: { ...prev.positions, [pid]: { ...prev.positions[pid], na } } }; });
  }

  function setCrit(pid: string, idx: number, val: CritValue) {
    setSwingForm((prev) => {
      if (!prev) return prev;
      const crits = [...prev.positions[pid].criterios];
      crits[idx] = crits[idx] === val ? null : val;
      return { ...prev, positions: { ...prev.positions, [pid]: { ...prev.positions[pid], criterios: crits } } };
    });
  }

  function toggleObs(pid: string) {
    setSwingForm((prev) => { if (!prev) return prev; return { ...prev, positions: { ...prev.positions, [pid]: { ...prev.positions[pid], obsOpen: !prev.positions[pid].obsOpen } } }; });
  }

  function setObs(pid: string, obs: string) {
    setSwingForm((prev) => { if (!prev) return prev; return { ...prev, positions: { ...prev.positions, [pid]: { ...prev.positions[pid], obs } } }; });
  }

  async function handleSaveSwing() {
    if (!swingForm || !student) return;
    setSwingSaving(true); setSwingSaveError(null);
    const grupo = calcularGrupoEfectivo(student);
    const promedio = calcPromedio(swingForm.positions);
    const id = `swing_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    const posPayload: Record<string, unknown> = {};
    Object.entries(swingForm.positions).forEach(([pid, ps]) => {
      const key = pid.toLowerCase();
      const rawScore = ps.na ? null : calcPosScore(ps.criterios);
posPayload[`${key}_score`] = rawScore !== null ? Math.round(rawScore) : null;
      posPayload[`${key}_criterios`] = ps.na ? null : ps.criterios;
      posPayload[`${key}_obs`] = ps.obs.trim() || null;
      posPayload[`${key}_na`] = ps.na;
    });
    const payload = { id, student_id: student.id, student_name: student.full_name, grupo, evaluation_date: swingForm.evaluation_date, evaluation_type: swingForm.evaluation_type, score_promedio: promedio, professor_comment: swingForm.professor_comment.trim()||null, ...posPayload };
    const { error } = await supabase.from("swing_evaluations").insert(payload);
    if (error) { setSwingSaveError(error.message); setSwingSaving(false); return; }
    const newEval = { ...payload, ai_analysis: null, ai_generated_at: null, created_at: new Date().toISOString() } as unknown as SwingEvaluation;
    setSwingEvals((prev) => [newEval, ...prev]);
    setSwingSaving(false); closeSwingForm(); setExpandedEval(id);
  }

  async function handleAnalyzeAI(ev: SwingEvaluation) {
    if (!student) return;
    setAnalyzingId(ev.id);
    try {
      const res = await fetch("/api/swing-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ student: { ...student, edad: calcularEdadNum(student.birth_date) }, evaluation: ev, physicalTest: null }) });
      const data = await res.json();
      if (data.analysis) {
        setAiResults((prev) => ({ ...prev, [ev.id]: data.analysis }));
        await supabase.from("swing_evaluations").update({ ai_analysis: JSON.stringify(data.analysis), ai_generated_at: new Date().toISOString() }).eq("id", ev.id);
      }
    } catch (err) { console.error("Error IA:", err); }
    setAnalyzingId(null);
  }

  function openPhysicalForm() {
    const g = calcularGrupoFisico(student!);
    setPhysicalForm(defaultPhysicalForm(protocolosFisico, g));
    setPhysicalSaveError(null); setShowPhysicalForm(true);
  }
  function closePhysicalForm() { setShowPhysicalForm(false); setPhysicalForm(null); setPhysicalSaveError(null); }

  function setPhysTestResult(tid: string, result: PhysicalResult) {
    setPhysicalForm((prev) => {
      if (!prev) return prev;
      const cur = prev.tests[tid].result;
      return { ...prev, tests: { ...prev.tests, [tid]: { ...prev.tests[tid], result: cur === result ? null : result } } };
    });
  }
  function setPhysTestNA(tid: string, na: boolean) {
    setPhysicalForm((prev) => { if (!prev) return prev; return { ...prev, tests: { ...prev.tests, [tid]: { ...prev.tests[tid], na } } }; });
  }
  function togglePhysTestObs(tid: string) {
    setPhysicalForm((prev) => { if (!prev) return prev; return { ...prev, tests: { ...prev.tests, [tid]: { ...prev.tests[tid], obsOpen: !prev.tests[tid].obsOpen } } }; });
  }
  function setPhysTestObs(tid: string, obs: string) {
    setPhysicalForm((prev) => { if (!prev) return prev; return { ...prev, tests: { ...prev.tests, [tid]: { ...prev.tests[tid], obs } } }; });
  }

  async function handleSavePhysical() {
    if (!physicalForm || !student) return;
    setPhysicalSaving(true); setPhysicalSaveError(null);
    const g = calcularGrupoFisico(student);
    const promedio = calcPhysPromedio(physicalForm.tests);
    const id = `phys_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const testsData: Record<string, { result: PhysicalResult; obs: string | null; na: boolean }> = {};
    Object.entries(physicalForm.tests).forEach(([tid, ts]) => {
      testsData[tid] = { result: ts.na ? null : ts.result, obs: ts.obs.trim() || null, na: ts.na };
    });
    const payload = { id, student_id: student.id, student_name: student.full_name, grupo: g, evaluation_date: physicalForm.evaluation_date, evaluation_type: physicalForm.evaluation_type, tests_data: testsData, score_promedio: promedio, professor_comment: physicalForm.professor_comment.trim() || null };
    const { error } = await supabase.from("physical_evaluations").insert(payload);
    if (error) { setPhysicalSaveError(error.message); setPhysicalSaving(false); return; }
    const newEval = { ...payload, ai_analysis: null, ai_generated_at: null, created_at: new Date().toISOString() } as PhysicalEvaluation;
    setPhysicalEvals((prev) => [newEval, ...prev]);
    setHasPhysicalEvals(true);
    setPhysicalSaving(false); closePhysicalForm(); setExpandedPhysical(id);
  }

  async function handleAnalyzePhysicalAI(ev: PhysicalEvaluation) {
    if (!student) return;
    setAnalyzingPhysicalId(ev.id);
    try {
      const res = await fetch("/api/physical-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ student: { ...student, edad: calcularEdadNum(student.birth_date) }, evaluation: ev }) });
      const data = await res.json();
      if (data.analysis) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let pa: any = data.analysis;
        for (let i = 0; i < 3; i++) {
          if (typeof pa?.resumen !== "string" || !pa.resumen.trim().startsWith("{")) break;
          try { const inner = JSON.parse(pa.resumen); if (inner?.resumen !== undefined) { pa = inner; } else break; } catch { break; }
        }
        if (pa && typeof pa.resumen === "string" && !pa.resumen.trim().startsWith("{")) {
          setPhysicalAiResults((prev) => ({ ...prev, [ev.id]: pa as PhysicalAiAnalysis }));
          await supabase.from("physical_evaluations").update({ ai_analysis: JSON.stringify(pa), ai_generated_at: new Date().toISOString() }).eq("id", ev.id);
        }
      }
    } catch (err) { console.error("Error IA física:", err); }
    setAnalyzingPhysicalId(null);
  }

  async function handleAnalyzeIntegrated(ev: SwingEvaluation) {
    if (!student) return;
    setAnalyzingIntegratedId(ev.id);
    try {
      let physEvals = physicalEvals;
      if (physEvals.length === 0) {
        const { data: physData } = await supabase.from("physical_evaluations").select("*")
          .eq("student_id", studentId).order("evaluation_date", { ascending: false }).limit(1);
        if (!physData || physData.length === 0) { setAnalyzingIntegratedId(null); return; }
        physEvals = physData;
        setPhysicalEvals(physData);
      }
      const latestPhysical = physEvals[0];
      // Include recent trackman data (last 14 days) if available
      let recentTrackman: TrackmanData | null = null;
      const latestTm = trackmanSessions[0] ?? trackmanLatest;
      if (latestTm) {
        const daysDiff = (Date.now() - new Date(latestTm.fecha).getTime()) / 86400000;
        if (daysDiff <= 14) recentTrackman = latestTm.datos;
      }
      const res = await fetch("/api/integrated-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ student: { ...student, edad: calcularEdadNum(student.birth_date) }, swingEvaluation: ev, physicalEvaluation: latestPhysical, trackman_data: recentTrackman }) });
      const data = await res.json();
      console.log("[integrated] API response status:", res.status, "data:", data);
      if (!res.ok || data.error) {
        console.error("[integrated] API error:", data.error ?? res.status);
      } else if (data.analysis) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let ia: any = data.analysis;
        console.log("[integrated] raw analysis:", ia);
        // Triple-fallback: desenvuelve si resumen_integrado es un JSON anidado
        for (let i = 0; i < 3; i++) {
          if (typeof ia?.resumen_integrado !== "string" || !ia.resumen_integrado.trim().startsWith("{")) break;
          try {
            const inner = JSON.parse(ia.resumen_integrado);
            if (inner?.resumen_integrado !== undefined) {
              ia = inner; // inner tiene la clave correcta → subir un nivel
            } else if (inner?.prioridades_cruzadas !== undefined) {
              // inner ES el análisis pero sin clave resumen_integrado → fusionar
              ia = { resumen_integrado: ia.resumen_integrado, ...inner };
              break;
            } else { break; }
          } catch { break; }
        }
        console.log("[integrated] after unwrap:", ia);
        // Aceptar si resumen_integrado existe como string (aunque empiece con "{" como último recurso)
        if (ia && typeof ia.resumen_integrado === "string") {
          setIntegratedResults((prev) => ({ ...prev, [ev.id]: ia as IntegratedAiAnalysis }));
          await supabase.from("swing_evaluations").update({ integrated_analysis: JSON.stringify(ia), integrated_at: new Date().toISOString() }).eq("id", ev.id);
          console.log("[integrated] saved ok");
        } else {
          console.warn("[integrated] acceptance failed, resumen_integrado:", ia?.resumen_integrado);
        }
      } else {
        console.warn("[integrated] no analysis in response:", data);
      }
    } catch (err) { console.error("[integrated] exception:", err); }
    setAnalyzingIntegratedId(null);
  }

  function trackmanFileToBase64(file: File): Promise<{ data: string; mediaType: string }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const [header, data] = result.split(",");
        const mediaType = header.split(":")[1]?.split(";")[0] ?? "image/jpeg";
        resolve({ data, mediaType });
      };
      reader.onerror = reject;
    });
  }

  function handleTrackmanFileChange(file: File | null) {
    setTrackmanFile(file);
    setTrackmanError(null);
    if (file) {
      const url = URL.createObjectURL(file);
      setTrackmanPreview(url);
    } else {
      setTrackmanPreview(null);
    }
  }

  async function handleTrackmanAnalyze() {
    if (!trackmanFile || !studentId) return;
    setAnalyzingTrackman(true);
    setTrackmanError(null);
    try {
      const { data: b64, mediaType } = await trackmanFileToBase64(trackmanFile);
      const res = await fetch("/api/trackman-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagen_base64: b64, media_type: mediaType, alumno_id: studentId }),
      });
      const result = await res.json();
      if (!res.ok || result.error) { setTrackmanError(result.error ?? "Error al analizar"); }
      else {
        const newSession: TrackmanSession = result.session ?? { id: crypto.randomUUID(), alumno_id: studentId, fecha: new Date().toISOString().split("T")[0], datos: result.datos, created_at: new Date().toISOString() };
        setTrackmanLatest(newSession);
        setTrackmanSessions((prev) => [newSession, ...prev].slice(0, 5));
        setTrackmanFile(null);
        setTrackmanPreview(null);
      }
    } catch (err: unknown) {
      setTrackmanError(err instanceof Error ? err.message : "Error de conexión");
    }
    setAnalyzingTrackman(false);
  }

  function openHitoForm() {
    setHitoForm({ titulo: "", descripcion: "", fecha: new Date().toISOString().split("T")[0], foto: null });
    setHitoSaveError(null);
    setShowHitoForm(true);
  }

  function closeHitoForm() {
    setShowHitoForm(false);
    setHitoForm(null);
    setHitoSaveError(null);
  }

  async function handleSaveHito() {
    if (!hitoForm || !hitoForm.titulo.trim()) return;
    setSavingHito(true);
    setHitoSaveError(null);
    try {
      let foto_url: string | null = null;
      if (hitoForm.foto) {
        const path = `${studentId}/${Date.now()}_${hitoForm.foto.name}`;
        const { error: uploadError } = await supabase.storage.from("student-milestones").upload(path, hitoForm.foto, { contentType: hitoForm.foto.type, upsert: true });
        if (uploadError) throw uploadError;
        foto_url = supabase.storage.from("student-milestones").getPublicUrl(path).data.publicUrl;
      }
      const { data, error } = await supabase.from("hitos").insert({ alumno_id: studentId, titulo: hitoForm.titulo.trim(), descripcion: hitoForm.descripcion.trim() || null, fecha: hitoForm.fecha, foto_url }).select().single();
      if (error) throw error;
      setHitos((prev) => [data, ...prev].sort((a, b) => b.fecha.localeCompare(a.fecha)));
      closeHitoForm();
    } catch (err: unknown) {
      setHitoSaveError(err instanceof Error ? err.message : "Error al guardar el hito");
    }
    setSavingHito(false);
  }

  async function handleDeleteHito(id: string) {
    if (!confirm("¿Eliminar este hito? Esta acción no se puede deshacer.")) return;
    const hito = hitos.find((h) => h.id === id);
    if (hito?.foto_url) {
      const parts = hito.foto_url.split("/student-milestones/");
      if (parts[1]) await supabase.storage.from("student-milestones").remove([parts[1]]);
    }
    await supabase.from("hitos").delete().eq("id", id);
    setHitos((prev) => prev.filter((h) => h.id !== id));
  }

  // ── Notas del profesor ───────────────────────────────────────────────────────
  function openNotaForm(nota?: NotaProfesor) {
    if (nota) {
      setEditingNotaId(nota.id);
      setNotaForm({ contenido: nota.contenido, fecha: nota.fecha, imagen: null, imagenPreview: null, video: null, videoPreview: null, tipo_imagen: nota.tipo_imagen });
    } else {
      setEditingNotaId(null);
      setNotaForm({ contenido: "", fecha: new Date().toISOString().split("T")[0], imagen: null, imagenPreview: null, video: null, videoPreview: null, tipo_imagen: null });
    }
    setNotaSaveError(null);
    setShowNotaForm(true);
  }

  function closeNotaForm() {
    setShowNotaForm(false);
    setNotaForm(null);
    setEditingNotaId(null);
    setNotaSaveError(null);
  }

  async function handleSaveNota() {
    if (!notaForm || !notaForm.contenido.trim()) return;
    setSavingNota(true);
    setNotaSaveError(null);
    try {
      let imagen_url: string | null = editingNotaId
        ? (notas.find((n) => n.id === editingNotaId)?.imagen_url ?? null)
        : null;
      if (notaForm.imagen) {
        const path = `${studentId}/${Date.now()}_${notaForm.imagen.name}`;
        const { error: uploadError } = await supabase.storage
          .from("notas-profesor")
          .upload(path, notaForm.imagen, { contentType: notaForm.imagen.type, upsert: true });
        if (uploadError) throw uploadError;
        imagen_url = supabase.storage.from("notas-profesor").getPublicUrl(path).data.publicUrl;
      }
      let video_url: string | null = editingNotaId
        ? (notas.find((n) => n.id === editingNotaId)?.video_url ?? null)
        : null;
      if (notaForm.video) {
        const path = `${studentId}/videos/${Date.now()}_${notaForm.video.name}`;
        const { error: uploadError } = await supabase.storage
          .from("notas-profesor")
          .upload(path, notaForm.video, { contentType: notaForm.video.type, upsert: true });
        if (uploadError) throw uploadError;
        video_url = supabase.storage.from("notas-profesor").getPublicUrl(path).data.publicUrl;
      }
      const payload = {
        alumno_id: studentId,
        contenido: notaForm.contenido.trim(),
        fecha: notaForm.fecha,
        imagen_url,
        video_url,
        tipo_imagen: notaForm.tipo_imagen,
        profesor_nombre: "Robert Instructor",
      };
      if (editingNotaId) {
        const { data, error } = await supabase.from("notas_profesor").update(payload).eq("id", editingNotaId).select().single();
        if (error) throw error;
        setNotas((prev) => prev.map((n) => n.id === editingNotaId ? (data as NotaProfesor) : n));
      } else {
        const { data, error } = await supabase.from("notas_profesor").insert(payload).select().single();
        if (error) throw error;
        setNotas((prev) => [data as NotaProfesor, ...prev]);
      }
      closeNotaForm();
    } catch (err) {
      setNotaSaveError(err instanceof Error ? err.message : "Error al guardar la nota");
    }
    setSavingNota(false);
  }

  async function handleDeleteNota(id: string) {
    if (!confirm("¿Eliminar esta nota? Esta acción no se puede deshacer.")) return;
    const nota = notas.find((n) => n.id === id);
    if (nota?.imagen_url) {
      const parts = nota.imagen_url.split("/notas-profesor/");
      if (parts[1]) await supabase.storage.from("notas-profesor").remove([parts[1]]);
    }
    if (nota?.video_url) {
      const parts = nota.video_url.split("/notas-profesor/");
      if (parts[1]) await supabase.storage.from("notas-profesor").remove([parts[1]]);
    }
    await supabase.from("notas_profesor").delete().eq("id", id);
    setNotas((prev) => prev.filter((n) => n.id !== id));
  }

  function formatFechaLarga(dateStr: string): string {
    const [y, m, d] = dateStr.split("-").map(Number);
    const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    return `${d} de ${meses[m - 1]} de ${y}`;
  }

  async function fetchImgBase64(url: string): Promise<string | null> {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch { return null; }
  }

  async function handleDownloadPDF() {
    if (!student) return;
    setDownloadingPDF(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const W = 210; const M = 18; const CW = W - 2 * M;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
      const LH = 4.8;
      let y = 0;

      // ── Header verde ─────────────────────────────────
      doc.setFillColor(27, 77, 46);
      doc.rect(0, 0, W, 27, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("ESCUELA DE GOLF — COUNTRY CLUB DE BOGOTÁ", M, 10);
      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      doc.text("Registro de Notas del Profesor", M, 21);
      y = 35;

      // ── Datos del alumno ──────────────────────────────
      doc.setTextColor(20, 20, 20);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(student.full_name, M, y);
      y += 5.5;
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 120);
      const meta = [student.grupo_activo, calcularEdad(student.birth_date), `Generado ${formatFecha(new Date().toISOString().split("T")[0])}`].filter(Boolean).join(" · ");
      doc.text(meta, M, y);
      y += 3.5;
      doc.setDrawColor(27, 77, 46);
      doc.setLineWidth(0.5);
      doc.line(M, y, W - M, y);
      y += 7;

      // ── Notas (orden cronológico — más antigua primero) ───
      const notasOrdenadas = [...notas].reverse();
      const pageH = 297;
      const footerH = 13;

      for (let i = 0; i < notasOrdenadas.length; i++) {
        const nota = notasOrdenadas[i];

        if (y > pageH - footerH - 30) { doc.addPage(); y = M; }

        // Fecha
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(27, 77, 46);
        doc.text(formatFechaLarga(nota.fecha), M, y);

        // Badge tipo
        if (nota.tipo_imagen) {
          doc.setFontSize(7.5);
          doc.setTextColor(100, 30, 130);
          doc.text(`[${TIPO_IMAGEN_LABELS[nota.tipo_imagen]}]`, W - M, y, { align: "right" });
        }
        y += 4.5;

        // Profesor
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(140, 140, 140);
        doc.text(`Profesor: ${nota.profesor_nombre ?? "—"}`, M, y);
        y += 5.5;

        // Contenido
        doc.setFontSize(9.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(35, 35, 35);
        const lines = doc.splitTextToSize(nota.contenido, CW) as string[];
        const textH = lines.length * LH;
        if (y + textH > pageH - footerH - 5) { doc.addPage(); y = M; }
        doc.text(lines, M, y);
        y += textH + 3;

        // Imagen (solo si es imagen, no PDF)
        if (nota.imagen_url && !nota.imagen_url.toLowerCase().includes(".pdf")) {
          const imgBase64 = await fetchImgBase64(nota.imagen_url);
          if (imgBase64) {
            const imgW = 80; const imgH = 60;
            if (y + imgH > pageH - footerH - 5) { doc.addPage(); y = M; }
            try { doc.addImage(imgBase64, "JPEG", M, y, imgW, imgH); y += imgH + 5; } catch { /* skip */ }
          }
        }

        // Video (no se incrusta, solo se referencia)
        if (nota.video_url) {
          if (y > pageH - footerH - 10) { doc.addPage(); y = M; }
          doc.setFontSize(8.5);
          doc.setFont("helvetica", "italic");
          doc.setTextColor(100, 100, 100);
          doc.text(`Video adjunto: ${formatFechaLarga(nota.fecha)}`, M, y);
          y += 5.5;
        }

        // Separador
        if (i < notasOrdenadas.length - 1) {
          if (y > pageH - footerH - 10) { doc.addPage(); y = M; }
          doc.setDrawColor(210, 210, 210);
          doc.setLineWidth(0.25);
          doc.line(M, y, W - M, y);
          y += 8;
        }
      }

      // ── Footer en todas las páginas ───────────────────
      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(160, 160, 160);
        doc.text("Escuela de Golf — Country Club de Bogotá", M, 291);
        doc.text(`Página ${p} de ${totalPages}`, W - M, 291, { align: "right" });
      }

      const nombre = student.full_name.replace(/\s+/g, "_");
      const fecha = new Date().toISOString().split("T")[0];
      doc.save(`Notas_${nombre}_${fecha}.pdf`);
    } catch (err) { console.error("Error al generar PDF:", err); }
    setDownloadingPDF(false);
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError("La imagen no puede superar 5 MB.");
      return;
    }
    setPhotoError(null);
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handlePhotoCancelPreview() {
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoError(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  async function handlePhotoUpload() {
    if (!photoFile || !student) return;
    setUploadingPhoto(true);
    setPhotoError(null);
    try {
      const ext = photoFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${student.id}/profile_${Date.now()}.${ext}`;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const uploadRes = await fetch(
        `${supabaseUrl}/storage/v1/object/student-photos/${path}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${anonKey}`,
            "Content-Type": photoFile.type,
            "x-upsert": "true",
          },
          body: photoFile,
        }
      );
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        throw new Error(err.message || `Error al subir (${uploadRes.status})`);
      }
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/student-photos/${path}`;
      const { error: dbError } = await supabase
        .from("students")
        .update({ foto_url: publicUrl })
        .eq("id", student.id);
      if (dbError) throw new Error(dbError.message);
      setStudent((s) => s ? { ...s, foto_url: publicUrl } : s);
      setPhotoFile(null);
      setPhotoPreview(null);
      if (photoInputRef.current) photoInputRef.current.value = "";
      setPhotoToast("Foto actualizada correctamente");
      setTimeout(() => setPhotoToast(null), 3000);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Error al subir la foto");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleProfileIntegratedAnalysis() {
    if (!student) return;
    setAnalyzingProfileIntegrated(true);
    setProfileIntegratedError(null);
    try {
      const [{ data: swingData }, { data: physData }] = await Promise.all([
        supabase.from("swing_evaluations").select("*").eq("student_id", studentId).order("evaluation_date", { ascending: false }).limit(1),
        supabase.from("physical_evaluations").select("*").eq("student_id", studentId).order("evaluation_date", { ascending: false }).limit(1),
      ]);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
      const { data: tmData } = await supabase.from("trackman_sessions").select("*").eq("alumno_id", studentId).gte("fecha", thirtyDaysAgo).order("fecha", { ascending: false }).limit(1);
      const latestSwing = swingData?.[0] ?? null;
      const latestPhysical = physData?.[0] ?? null;
      const latestTrackman = tmData?.[0] ?? null;
      const res = await fetch("/api/integrated-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student: { ...student, edad: calcularEdadNum(student.birth_date) },
          swingEvaluation: latestSwing,
          physicalEvaluation: latestPhysical,
          trackman_data: latestTrackman?.datos ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setProfileIntegratedError(data.error ?? "Error al generar análisis");
      } else if (data.analysis) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let ia: any = typeof data.analysis === "string"
          ? (() => { try { return JSON.parse(data.analysis); } catch { return { resumen_integrado: data.analysis }; } })()
          : data.analysis;
        // Unwrap up to 5 levels of double-encoding
        for (let i = 0; i < 5; i++) {
          if (!ia || typeof ia !== "object") break;
          const r = ia.resumen_integrado;
          if (typeof r !== "string" || !r.trim().startsWith("{")) break;
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const inner: any = JSON.parse(r);
            if (!inner || typeof inner !== "object") break;
            if (typeof inner.resumen_integrado === "string") { ia = inner; continue; }
            if (inner.prioridades_cruzadas !== undefined) {
              ia = { ...ia, ...inner };
              break;
            }
            ia = inner;
          } catch { break; }
        }
        if (ia && typeof ia === "object") {
          setProfileIntegratedResult(ia as IntegratedAiAnalysis);
        }
      }
    } catch (err) {
      setProfileIntegratedError(err instanceof Error ? err.message : "Error de conexión");
    }
    setAnalyzingProfileIntegrated(false);
  }

  if (loading) return <div className="flex items-center justify-center py-32 text-gray-400"><svg className="animate-spin mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Cargando perfil...</div>;
  if (!student) return <div className="flex flex-col items-center justify-center py-32 text-gray-400"><p>Alumno no encontrado.</p></div>;

  const grupo = calcularGrupoEfectivo(student);
  const grupoFisico = calcularGrupoFisico(student);
  const posicionesActivas = posicionesDeGrupo(protocolosTecnico, grupo);
  const protocolosTecnicoReady = normalizeGrupoKey(grupo) in protocolosTecnico;
  const protocolosFisicoReady = normalizeGrupoKey(grupoFisico) in protocolosFisico;
  const TABS: { key: Tab; label: string }[] = [{ key:"datos", label:"Datos personales" }, { key:"tecnicos", label:"Tests técnicos" }, { key:"fisicos", label:"Tests físicos" }, { key:"notas", label:"Notas del profesor" }, { key:"hitos", label:"Hitos" }];

  // Unwrap double-encoded integrated result for the profile card
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const displayProfileIntegrated: IntegratedAiAnalysis | null = profileIntegratedResult ? (() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cur: any = profileIntegratedResult;
    for (let i = 0; i < 5; i++) {
      if (!cur || typeof cur !== "object") break;
      const r = cur.resumen_integrado;
      if (typeof r !== "string" || !r.trim().startsWith("{")) break;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inner: any = JSON.parse(r);
        if (!inner || typeof inner !== "object") break;
        if (typeof inner.resumen_integrado === "string") { cur = inner; continue; }
        if (inner.prioridades_cruzadas !== undefined) { cur = { ...cur, ...inner }; break; }
        cur = inner;
      } catch { break; }
    }
    return cur as IntegratedAiAnalysis;
  })() : null;

  return (
    <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
      {photoToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg pointer-events-none">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth={2.5}><path d="M20 6L9 17l-5-5"/></svg>
          {photoToast}
        </div>
      )}
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        Volver a alumnos
      </button>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-4">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center justify-center w-16 h-16 rounded-full text-xl font-bold shrink-0" style={{ backgroundColor:"#1B4D2E1A", color:"#1B4D2E" }}>{initiales(student.full_name)}</span>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{student.full_name}</h1>
              {student.grupo_activo ? (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={
                  ["Birdies","Águilas","Albatros","+14"].includes(student.grupo_activo)
                    ? { backgroundColor:"#1a3a2a18", color:"#1a3a2a", border:"1px solid #1a3a2a25" }
                    : student.grupo_activo === "Competencia"
                    ? { backgroundColor:"#7d5a0018", color:"#7d5a00", border:"1px solid #7d5a0025" }
                    : { backgroundColor:"#4a107018", color:"#4a1070", border:"1px solid #4a107025" }
                }>{student.grupo_activo}</span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium text-gray-400 bg-gray-100 border border-gray-200 flex items-center gap-1">
                  <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                  Sin grupo
                </span>
              )}
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${student.status==="activo"?"bg-emerald-50 text-emerald-700 border border-emerald-200":"bg-gray-100 text-gray-500 border border-gray-200"}`}>{student.status}</span>
            </div>
            <p className="text-sm text-gray-500 mt-1">{calcularEdad(student.birth_date)}{student.enrollment_date && <span className="ml-3 text-gray-400">· Ingresó {formatFecha(student.enrollment_date)}</span>}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {currentRol && isStaff(currentRol) && (
              <button
                onClick={async () => {
                  setPacoContextLoading(true);
                  const ctx = await fetchFullStudentContext(studentId);
                  setPacoContext(ctx);
                  setPacoContextLoading(false);
                  setShowPacoChat(true);
                }}
                disabled={pacoContextLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
                style={{ backgroundColor:"#1a3a2a", color:"white" }}
              >
                {pacoContextLoading ? "Cargando contexto..." : "Consultar a Paco 🦅"}
              </button>
            )}
            {currentRol && isStaff(currentRol) && student?.grupo_activo === "Competencia" && (
              <button
                onClick={() => setShowPlanCasa(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Plan para casa 🏠
              </button>
            )}
            {currentRol && isStaff(currentRol) && student && (
              <button
                onClick={async () => {
                  setParentPdfLoading(true);
                  try {
                    const markdown = await buildParentReportMarkdown(studentId, student);
                    const { generateCCBPdf } = await import("@/lib/pdf-generator");
                    generateCCBPdf(markdown, { documentName: `Reporte para Padres — ${student.full_name}`, filenamePrefix: `Reporte-${student.full_name}` });
                  } finally {
                    setParentPdfLoading(false);
                  }
                }}
                disabled={parentPdfLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-60"
              >
                {parentPdfLoading ? "Generando..." : "Reporte para padres PDF"}
              </button>
            )}
            <button onClick={openEdit} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor:"#1B4D2E", color:"white" }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Editar
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 mb-4">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(({ key, label }) => <button key={key} onClick={() => setActiveTab(key)} className="px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all" style={activeTab===key?{ backgroundColor:"#1B4D2E", color:"white" }:{ color:"#374151" }}>{label}</button>)}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">

        {activeTab === "datos" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Foto de perfil */}
            <div className="sm:col-span-2 flex flex-col items-center gap-3 pb-5 border-b border-gray-100">
              {/* Avatar */}
              <div className="relative w-24 h-24 rounded-full overflow-hidden bg-gray-100 ring-2 ring-gray-200 flex items-center justify-center shrink-0">
                {(photoPreview ?? student.foto_url) ? (
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  <img src={(photoPreview ?? student.foto_url) as string} alt={student.full_name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-gray-400 select-none">
                    {student.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
                  </span>
                )}
              </div>

              {/* Confirmar / Cancelar preview */}
              {photoFile ? (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-xs text-gray-500">{photoFile.name}</p>
                  {photoError && <p className="text-xs text-red-500">{photoError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={handlePhotoUpload}
                      disabled={uploadingPhoto}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                      style={{ background: "#1B4D2E" }}
                    >
                      {uploadingPhoto ? "Subiendo..." : "Confirmar"}
                    </button>
                    <button
                      onClick={handlePhotoCancelPreview}
                      disabled={uploadingPhoto}
                      className="px-4 py-1.5 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    className="px-4 py-1.5 rounded-lg text-xs font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    {student.foto_url ? "Cambiar foto" : "Subir foto"}
                  </button>
                  {photoError && <p className="text-xs text-red-500">{photoError}</p>}
                </div>
              )}

              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handlePhotoSelect}
              />
            </div>

            <Field label="Nombre completo" value={student.full_name}/>
            <Field label="Fecha de nacimiento" value={formatFecha(student.birth_date)}/>
            <Field label="Edad" value={calcularEdad(student.birth_date)}/>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Grupo activo</p>
              {student.grupo_activo ? (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold" style={
                  ["Birdies","Águilas","Albatros","+14"].includes(student.grupo_activo)
                    ? { backgroundColor:"#1a3a2a18", color:"#1a3a2a" }
                    : student.grupo_activo === "Competencia"
                    ? { backgroundColor:"#7d5a0018", color:"#7d5a00" }
                    : { backgroundColor:"#4a107018", color:"#4a1070" }
                }>{student.grupo_activo}</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-sm text-gray-400">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                  Sin grupo asignado
                </span>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Talega</p>
              <span className="text-sm text-gray-700">{student.tiene_talega ?? "—"}</span>
            </div>
            <Field label="Estado" value={student.status}/>
            <Field label="Fecha de ingreso" value={formatFecha(student.enrollment_date)}/>
            <div className="sm:col-span-2 border-t border-gray-100 pt-4 mt-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Contacto del acudiente</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Field label="Nombre del acudiente" value={student.parent_name}/>
                <Field label="Teléfono" value={student.parent_phone}/>
                <Field label="Email" value={student.parent_email}/>
              </div>
            </div>
            {student.observations && <div className="sm:col-span-2 border-t border-gray-100 pt-4 mt-2"><p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Observaciones</p><p className="text-sm text-gray-700">{student.observations}</p></div>}
          </div>
        )}

        {activeTab === "tecnicos" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Evaluación técnica de swing</h2>
                <p className="text-xs text-gray-400 mt-0.5">{grupo} · {posicionesActivas.length} posiciones</p>
              </div>
              <button onClick={openSwingForm} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor:"#1B4D2E" }}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
                Nueva evaluación
              </button>
            </div>

            {(swingLoading || !protocolosTecnicoReady) ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <svg className="animate-spin mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                Cargando...
              </div>
            ) : swingEvals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="mb-3"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
                <p className="text-sm font-medium">Sin evaluaciones aún</p>
                <p className="text-xs mt-1">Registra la primera evaluación técnica de swing</p>
              </div>
            ) : (
              <div className="space-y-3">
                {swingEvals.map((ev) => {
                  const isOpen = expandedEval === ev.id;
                  const ai = aiResults[ev.id];
                  const integrated = integratedResults[ev.id];
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const displayIntegrated: IntegratedAiAnalysis | null = integrated ? (() => {
                    let cur: any = integrated;
                    for (let i = 0; i < 3; i++) {
                      const r = cur.resumen_integrado;
                      if (typeof r !== "string" || !r.trim().startsWith("{")) break;
                      try {
                        const inner: any = JSON.parse(r);
                        if (!inner || typeof inner !== "object") break;
                        if (typeof inner.resumen_integrado === "string") { cur = inner; continue; }
                        if (inner.prioridades_cruzadas !== undefined) { cur = { ...cur, ...inner }; break; }
                        cur = inner;
                      } catch { break; }
                    }
                    return cur as IntegratedAiAnalysis;
                  })() : null;
                  const isAnalyzing = analyzingId === ev.id;
                  const isAnalyzingIntegrated = analyzingIntegratedId === ev.id;
                  const posActivas = posicionesDeGrupo(protocolosTecnico, ev.grupo);
                  return (
                    <div key={ev.id} className="border border-gray-100 rounded-xl overflow-hidden">
                      <button onClick={() => setExpandedEval(isOpen ? null : ev.id)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{formatFecha(ev.evaluation_date)}</p>
                          <p className="text-xs text-gray-500 mt-0.5 capitalize">{ev.evaluation_type} · {ev.grupo}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <EvalTypeBadge type={ev.evaluation_type}/>
                          {ev.score_promedio !== null && <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor:scoreColor(ev.score_promedio).bg, color:scoreColor(ev.score_promedio).text }}>{ev.score_promedio.toFixed(1)}/10</span>}
                          {ai && <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700">IA ✓</span>}
                          {integrated && <span className="px-2 py-1 rounded-full text-xs font-medium bg-teal-50 text-teal-700">Integrado ✓</span>}
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className={`text-gray-400 transition-transform ml-1 ${isOpen?"rotate-180":""}`}><path d="M19 9l-7 7-7-7"/></svg>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="border-t border-gray-50">
                          <div className="px-5 pt-5 pb-3">
                            {POSICIONES_FASES.map((fase) => {
                              const fasePosiciones = fase.posiciones.filter((p) => posActivas.includes(p));
                              if (!fasePosiciones.length) return null;
                              return (
                                <div key={fase.label} className="mb-4">
                                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{fase.label}</p>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {fasePosiciones.map((p) => {
                                      const naKey = `${p.toLowerCase()}_na` as keyof SwingEvaluation;
                                      const scoreKey = `${p.toLowerCase()}_score` as keyof SwingEvaluation;
                                      const criteriosKey = `${p.toLowerCase()}_criterios` as keyof SwingEvaluation;
                                      const obsKey = `${p.toLowerCase()}_obs` as keyof SwingEvaluation;
                                      const isNa = ev[naKey] as boolean;
                                      const score = ev[scoreKey] as number|null;
                                      const criterios = ev[criteriosKey] as CritValue[]|null;
                                      const obs = ev[obsKey] as string|null;
                                      const c = scoreColor(isNa ? null : score);
                                      return (
                                        <div key={p} className="rounded-lg p-3" style={{ backgroundColor: isNa ? "#F9FAFB" : c.bg }}>
                                          <div className="flex items-center justify-between mb-1">
                                            <p className="text-xs font-semibold" style={{ color: isNa ? "#9CA3AF" : c.text }}>{p}</p>
                                            {isNa && <span className="text-xs text-gray-400 italic">N/A</span>}
                                          </div>
                                          <p className="text-gray-500 mb-2 leading-tight" style={{ fontSize:"10px" }}>{POSICIONES_NOMBRES[p]}</p>
                                          {!isNa && <>
                                            <p className="text-xl font-bold" style={{ color:c.text }}>{score?.toFixed(1) ?? "—"}</p>
                                            <div className="h-1 rounded-full mt-1.5" style={{ backgroundColor:"#E5E7EB" }}><div className="h-1 rounded-full" style={{ width:score?`${score*10}%`:"0%", backgroundColor:c.bar }}/></div>
                                            <p className="mt-1" style={{ color:c.text, fontSize:"10px" }}>{scoreLabel(score)}</p>
                                            {criterios && <div className="mt-2 space-y-0.5">{criterios.map((crit, i) => <div key={i} className="flex items-center gap-1"><span style={{ fontSize:"10px" }}>{crit==="cumple"?"✅":crit==="progreso"?"⚠️":crit==="no"?"❌":"○"}</span><span style={{ fontSize:"9px", color:"#6B7280", lineHeight:"1.3" }}>{getCriteriosGrupo(protocolosTecnico, ev.grupo, p)[i]?.split("—")[0]?.trim()}</span></div>)}</div>}
                                            {obs && <p className="text-gray-500 mt-2 italic border-t border-gray-100 pt-1" style={{ fontSize:"10px" }}>{obs}</p>}
                                          </>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}

                            {ev.professor_comment && <div className="bg-gray-50 rounded-lg p-3 mb-4"><p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Observaciones generales</p><p className="text-sm text-gray-700">{ev.professor_comment}</p></div>}

                            {!ai && (
                              <button onClick={() => handleAnalyzeAI(ev)} disabled={isAnalyzing} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border-2 border-dashed transition-all" style={{ borderColor:isAnalyzing?"#C4B5FD":"#7C3AED", color:isAnalyzing?"#7C3AED":"#5B21B6", backgroundColor:isAnalyzing?"#F5F3FF":"transparent" }}>
                                {isAnalyzing ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Analizando con IA...</> : <>
                                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
                                  Analizar con IA — guía para el profesor
                                </>}
                              </button>
                            )}
                          </div>

                          {ai && (
                            <div className="border-t border-gray-100 px-5 py-6">
                              <div className="flex items-center justify-between mb-6">
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">Análisis IA — Guía del profesor</p>
                                  {ev.ai_generated_at && <p className="text-xs text-gray-400 mt-0.5">Generado {formatFecha(ev.ai_generated_at.split("T")[0])}</p>}
                                </div>
                                <button onClick={() => handleAnalyzeAI(ev)} disabled={analyzingId !== null} className="text-xs text-gray-500 hover:text-gray-700 underline disabled:opacity-40">
                                  {analyzingId === ev.id ? "Analizando..." : "Regenerar"}
                                </button>
                              </div>

                              <div className="mb-5 pb-5 border-b border-gray-100">
                                <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded text-white mb-3 inline-block" style={{ backgroundColor:"#1B4D2E" }}>Resumen técnico</span>
                                <p className="text-sm text-gray-700 leading-relaxed mt-2">{ai.resumen}</p>
                              </div>

                              {ai.prioridades?.length > 0 && (
                                <div className="mb-5 pb-5 border-b border-gray-100">
                                  <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded text-white mb-4 inline-block" style={{ backgroundColor:"#1B4D2E" }}>Prioridades de trabajo</span>
                                  <div className="space-y-3 mt-3">
                                    {ai.prioridades.map((pr) => {
                                      const bc = pr.orden === 1 ? "#EF4444" : pr.orden === 2 ? "#F97316" : "#22C55E";
                                      return (
                                        <div key={pr.orden} className="rounded-lg bg-gray-50 overflow-hidden" style={{ borderLeft:`3px solid ${bc}` }}>
                                          <div className="px-4 py-3">
                                            <div className="flex items-start gap-2 mb-1">
                                              <span className="text-xs font-bold shrink-0 mt-0.5" style={{ color:bc }}>{pr.orden}.</span>
                                              <p className="text-sm font-semibold text-gray-900">{pr.titulo}</p>
                                            </div>
                                            {pr.posicion && <p className="text-xs text-gray-400 mb-2 ml-4">{pr.posicion}</p>}
                                            <p className="text-sm text-gray-700 leading-relaxed mb-3 ml-4">{pr.descripcion}</p>
                                            <div className="ml-4 bg-white rounded-md px-3 py-2 mb-2 border border-gray-100">
                                              <p className="text-xs font-semibold text-gray-500 mb-1">Para el profesor</p>
                                              <p className="text-xs text-gray-700 leading-relaxed">{pr.instruccion_profesor}</p>
                                            </div>
                                            {pr.conexion_fisica && <p className="text-xs text-gray-500 ml-4 mb-2"><span className="font-semibold">Conexión TPI:</span> {pr.conexion_fisica}</p>}
                                            {pr.drills?.length > 0 && (
                                              <div className="flex flex-wrap gap-1.5 ml-4">
                                                {pr.drills.map((d, i) => <span key={i} className="text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-600 bg-white">{d}</span>)}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {ai.fortalezas?.length > 0 && (
                                <div className="mb-5 pb-5 border-b border-gray-100">
                                  <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded text-white mb-3 inline-block" style={{ backgroundColor:"#1B4D2E" }}>Fortalezas — mantener</span>
                                  <ul className="space-y-1 mt-2">
                                    {ai.fortalezas.map((f, i) => (
                                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                        <span className="text-gray-300 shrink-0 mt-0.5">—</span>
                                        <span>{f}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {ai.plan_clase?.length > 0 && (
                                <div className="mb-5 pb-5 border-b border-gray-100">
                                  <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded text-white mb-3 inline-block" style={{ backgroundColor:"#1B4D2E" }}>Plan próxima clase</span>
                                  <div className="space-y-2 mt-3">
                                    {ai.plan_clase.map((step, i) => {
                                      const badge = step.tipo === "tecnico" ? { bg:"#DBEAFE", color:"#1D4ED8" } : step.tipo === "fisico" ? { bg:"#DCFCE7", color:"#15803D" } : { bg:"#F3E8FF", color:"#7C3AED" };
                                      return (
                                        <div key={i} className="flex items-start gap-3">
                                          <span className="text-xs text-gray-400 font-mono min-w-[44px] pt-0.5">{step.minutos}&apos;</span>
                                          <span className="text-sm text-gray-700 flex-1">{step.actividad}</span>
                                          <span className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor:badge.bg, color:badge.color }}>{step.tipo.replace("_"," ")}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {ai.nota_edad && (
                                <div>
                                  <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded text-white mb-2 inline-block" style={{ backgroundColor:"#1B4D2E" }}>Nota pedagógica</span>
                                  <p className="text-xs text-gray-600 leading-relaxed mt-2">{ai.nota_edad}</p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Análisis integrado técnico + físico */}
                          {!integrated && hasPhysicalEvals && (
                            <div className="border-t border-gray-50 px-5 pt-4 pb-5">
                              <button onClick={() => handleAnalyzeIntegrated(ev)} disabled={analyzingIntegratedId !== null} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border-2 border-dashed transition-all" style={{ borderColor:isAnalyzingIntegrated?"#5EEAD4":"#0D9488", color:isAnalyzingIntegrated?"#0D9488":"#0F766E", backgroundColor:isAnalyzingIntegrated?"#F0FDFA":"transparent" }}>
                                {isAnalyzingIntegrated ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Generando análisis integrado...</> : <>
                                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                                  Análisis integrado técnico + físico TPI
                                </>}
                              </button>
                            </div>
                          )}

                          {integrated && (
                            <div className="border-t border-gray-100 px-5 py-6">
                              <div className="flex items-center justify-between mb-6">
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">Análisis integrado — técnico + físico TPI</p>
                                  {ev.integrated_at && <p className="text-xs text-gray-400 mt-0.5">Generado {formatFecha(ev.integrated_at.split("T")[0])}</p>}
                                </div>
                                <button onClick={() => handleAnalyzeIntegrated(ev)} disabled={analyzingIntegratedId !== null} className="text-xs text-gray-500 hover:text-gray-700 underline disabled:opacity-40">
                                  {isAnalyzingIntegrated ? "Analizando..." : "Regenerar"}
                                </button>
                              </div>

                              <div className="mb-5 pb-5 border-b border-gray-100">
                                <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded text-white mb-3 inline-block" style={{ backgroundColor:"#1B4D2E" }}>Resumen integrado</span>
                                <p className="text-sm text-gray-700 leading-relaxed mt-2">{displayIntegrated!.resumen_integrado}</p>
                              </div>

                              {displayIntegrated!.prioridades_cruzadas?.length > 0 && (
                                <div className="mb-5 pb-5 border-b border-gray-100">
                                  <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded text-white mb-4 inline-block" style={{ backgroundColor:"#1B4D2E" }}>Prioridades cruzadas</span>
                                  <div className="space-y-3 mt-3">
                                    {displayIntegrated!.prioridades_cruzadas.map((pr) => {
                                      const bc = pr.orden === 1 ? "#EF4444" : pr.orden === 2 ? "#F97316" : "#22C55E";
                                      return (
                                        <div key={pr.orden} className="rounded-lg bg-gray-50 overflow-hidden" style={{ borderLeft:`3px solid ${bc}` }}>
                                          <div className="px-4 py-3">
                                            <div className="flex items-start gap-2 mb-2">
                                              <span className="text-xs font-bold shrink-0 mt-0.5" style={{ color:bc }}>{pr.orden}.</span>
                                              <p className="text-sm font-semibold text-gray-900">{pr.titulo}</p>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                                              <div className="bg-white rounded-md px-3 py-2 border border-gray-100">
                                                <p className="text-xs font-semibold text-gray-500 mb-1">Limitación física</p>
                                                <p className="text-xs text-gray-700">{pr.limitacion_fisica}</p>
                                              </div>
                                              <div className="bg-white rounded-md px-3 py-2 border border-gray-100">
                                                <p className="text-xs font-semibold text-gray-500 mb-1">Error técnico</p>
                                                <p className="text-xs text-gray-700">{pr.error_tecnico}</p>
                                              </div>
                                            </div>
                                            <p className="text-sm text-gray-700 leading-relaxed mb-3">{pr.descripcion}</p>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                                              <div className="bg-white rounded-md px-3 py-2 border border-gray-100">
                                                <p className="text-xs font-semibold text-gray-500 mb-1">Ejercicio físico</p>
                                                <p className="text-xs text-gray-700 leading-relaxed">{pr.ejercicio_fisico}</p>
                                              </div>
                                              <div className="bg-white rounded-md px-3 py-2 border border-gray-100">
                                                <p className="text-xs font-semibold text-gray-500 mb-1">Drill técnico</p>
                                                <p className="text-xs text-gray-700 leading-relaxed">{pr.drill_tecnico}</p>
                                              </div>
                                            </div>
                                            <p className="text-xs text-gray-500"><span className="font-semibold">Progresión:</span> {pr.progresion}</p>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {displayIntegrated!.plan_sesion && (
                                <div className="mb-5 pb-5 border-b border-gray-100">
                                  <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded text-white mb-3 inline-block" style={{ backgroundColor:"#1B4D2E" }}>Plan de sesión</span>
                                  <p className="text-sm text-gray-700 leading-relaxed mt-2">{displayIntegrated!.plan_sesion}</p>
                                </div>
                              )}

                              {displayIntegrated!.nota_trackman && (
                                <div className="mb-5 pb-5 border-b border-gray-100">
                                  <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded text-white mb-2 inline-block" style={{ backgroundColor:"#1B4D2E" }}>Nota TrackMan</span>
                                  <p className="text-xs text-gray-600 leading-relaxed mt-2">{displayIntegrated!.nota_trackman}</p>
                                </div>
                              )}

                              {(displayIntegrated!.nota_profesor || displayIntegrated!.nota_edad) && (
                                <div>
                                  <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded text-white mb-2 inline-block" style={{ backgroundColor:"#1B4D2E" }}>Nota pedagógica</span>
                                  <p className="text-xs text-gray-600 leading-relaxed mt-2">{displayIntegrated!.nota_profesor ?? displayIntegrated!.nota_edad}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          {/* Sección Trackman — solo para grupo Competencia */}
          {grupo === "Competencia" && (
            <div className="mt-6 pt-6 border-t border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">Datos Trackman</h3>
                  {trackmanLatest && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                      Última sesión: {formatFecha(trackmanLatest.fecha)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {trackmanSessions.length > 0 && (
                    <button onClick={() => setShowTrackmanHistory((v) => !v)} className="text-xs text-gray-500 hover:text-gray-700 underline">
                      {showTrackmanHistory ? "Ocultar historial" : `Ver historial (${trackmanSessions.length})`}
                    </button>
                  )}
                  <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors" style={{ backgroundColor:"#EFF6FF", color:"#1D4ED8" }}>
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
                    Subir pantallazo Trackman
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => handleTrackmanFileChange(e.target.files?.[0] ?? null)} />
                  </label>
                </div>
              </div>

              {trackmanError && (
                <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg mb-3">{trackmanError}</p>
              )}

              {trackmanPreview && trackmanFile && !analyzingTrackman && (
                <div className="mb-4 p-4 rounded-xl border border-blue-100 bg-blue-50 flex items-start gap-4">
                  <img src={trackmanPreview} alt="preview" className="w-32 h-24 object-cover rounded-lg border border-blue-200 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{trackmanFile.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{(trackmanFile.size / 1024).toFixed(0)} KB</p>
                    <div className="flex gap-2 mt-3">
                      <button onClick={handleTrackmanAnalyze} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ backgroundColor:"#1D4ED8" }}>
                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                        Analizar con IA
                      </button>
                      <button onClick={() => { setTrackmanFile(null); setTrackmanPreview(null); }} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
                    </div>
                  </div>
                </div>
              )}

              {analyzingTrackman && (
                <div className="flex items-center gap-2 py-4 text-blue-600 text-sm">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                  Extrayendo datos del pantallazo...
                </div>
              )}

              {trackmanLatest && !trackmanPreview && (
                <TrackmanDataTable data={trackmanLatest.datos} />
              )}

              {showTrackmanHistory && trackmanSessions.length > 0 && (
                <div className="mt-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Últimas sesiones</p>
                  {trackmanSessions.map((s) => (
                    <div key={s.id} className="rounded-xl border border-gray-100 overflow-hidden">
                      <div className="px-4 py-2.5 bg-gray-50 flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-700">{formatFecha(s.fecha)}</span>
                        {s.datos.club_usado && <span className="text-xs text-gray-500">{s.datos.club_usado}</span>}
                      </div>
                      <div className="px-4 py-3">
                        <TrackmanDataTable data={s.datos} compact />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          </div>
        )}

        {activeTab === "fisicos" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Evaluación física TPI</h2>
                <p className="text-xs text-gray-400 mt-0.5">{grupoFisico} · {getPhysicalCategorias(protocolosFisico, grupoFisico).reduce((acc, c) => acc + c.tests.length, 0)} tests</p>
              </div>
              <button onClick={openPhysicalForm} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor:"#1B4D2E" }}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
                Nueva evaluación
              </button>
            </div>

            {(physicalLoading || !protocolosFisicoReady) ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <svg className="animate-spin mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                Cargando...
              </div>
            ) : physicalEvals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="mb-3"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
                <p className="text-sm font-medium">Sin evaluaciones físicas aún</p>
                <p className="text-xs mt-1">Registra el primer screen TPI de este alumno</p>
              </div>
            ) : (
              <div className="space-y-3">
                {physicalEvals.map((ev) => {
                  const isOpen = expandedPhysical === ev.id;
                  const ai = physicalAiResults[ev.id];
                  const isAnalyzing = analyzingPhysicalId === ev.id;
                  const categorias = getPhysicalCategorias(protocolosFisico, ev.grupo);
                  const testsData = ev.tests_data || {};
                  return (
                    <div key={ev.id} className="border border-gray-100 rounded-xl overflow-hidden">
                      <button onClick={() => setExpandedPhysical(isOpen ? null : ev.id)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{formatFecha(ev.evaluation_date)}</p>
                          <p className="text-xs text-gray-500 mt-0.5 capitalize">{ev.evaluation_type} · {ev.grupo}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <EvalTypeBadge type={ev.evaluation_type}/>
                          {ev.score_promedio !== null && <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor:scoreColor(ev.score_promedio).bg, color:scoreColor(ev.score_promedio).text }}>{ev.score_promedio.toFixed(1)}/10</span>}
                          {ai && <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700">IA ✓</span>}
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className={`text-gray-400 transition-transform ml-1 ${isOpen?"rotate-180":""}`}><path d="M19 9l-7 7-7-7"/></svg>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="border-t border-gray-50">
                          <div className="px-5 pt-5 pb-3">
                            {categorias.map((cat) => {
                              const tipoBadge = cat.tipo === "desarrollo_motor" ? { bg:"#FEF3C7", color:"#92400E" } : cat.tipo === "potencia" ? { bg:"#FEE2E2", color:"#991B1B" } : { bg:"#EFF6FF", color:"#1D4ED8" };
                              return (
                                <div key={cat.label} className="mb-5">
                                  <div className="flex items-center gap-2 mb-3">
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor:tipoBadge.bg, color:tipoBadge.color }}>{cat.label}</span>
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {cat.tests.map((testDef) => {
                                      const td = testsData[testDef.id];
                                      const isNa = td?.na ?? false;
                                      const result = td?.result ?? null;
                                      const score = isNa ? null : physResultToScore(result);
                                      const c = scoreColor(score);
                                      const obs = td?.obs;
                                      return (
                                        <div key={testDef.id} className="rounded-lg p-3" style={{ backgroundColor: isNa ? "#F9FAFB" : c.bg }}>
                                          <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-semibold" style={{ color: isNa ? "#9CA3AF" : c.text }}>{testDef.id}</span>
                                            {isNa && <span className="text-xs text-gray-400 italic">N/A</span>}
                                            {!isNa && result && <span style={{ fontSize:"14px" }}>{result==="cumple"?"✅":result==="progreso"?"⚠️":"❌"}</span>}
                                          </div>
                                          <p className="text-gray-600 leading-tight mb-1" style={{ fontSize:"10px" }}>{testDef.nombre}</p>
                                          {!isNa && result && <>
                                            <p className="text-xs font-semibold capitalize mt-1" style={{ color:c.text }}>{result}</p>
                                            <div className="h-1 rounded-full mt-1" style={{ backgroundColor:"#E5E7EB" }}><div className="h-1 rounded-full" style={{ width:score?`${score*10}%`:"0%", backgroundColor:c.bar }}/></div>
                                            <p className="mt-1 text-gray-500" style={{ fontSize:"9px" }}>{result === "cumple" ? testDef.rangos.cumple : result === "progreso" ? testDef.rangos.progreso : testDef.rangos.bajo}</p>
                                            {obs && <p className="text-gray-400 mt-1 italic border-t border-gray-100 pt-1" style={{ fontSize:"9px" }}>{obs}</p>}
                                          </>}
                                          {!isNa && !result && <p className="text-xs text-gray-400 italic mt-1">No evaluado</p>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}

                            {ev.professor_comment && <div className="bg-gray-50 rounded-lg p-3 mb-4"><p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Observaciones generales</p><p className="text-sm text-gray-700">{ev.professor_comment}</p></div>}

                            {!ai && (
                              <button onClick={() => handleAnalyzePhysicalAI(ev)} disabled={isAnalyzing} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border-2 border-dashed transition-all" style={{ borderColor:isAnalyzing?"#C4B5FD":"#7C3AED", color:isAnalyzing?"#7C3AED":"#5B21B6", backgroundColor:isAnalyzing?"#F5F3FF":"transparent" }}>
                                {isAnalyzing ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Analizando con IA...</> : <>
                                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
                                  Analizar con IA — ejercicios correctivos
                                </>}
                              </button>
                            )}
                          </div>

                          {ai && (
                            <div className="border-t border-gray-100 px-5 py-6">
                              <div className="flex items-center justify-between mb-6">
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">Análisis IA — Guía del profesor</p>
                                  {ev.ai_generated_at && <p className="text-xs text-gray-400 mt-0.5">Generado {formatFecha(ev.ai_generated_at.split("T")[0])}</p>}
                                </div>
                                <button onClick={() => handleAnalyzePhysicalAI(ev)} disabled={analyzingPhysicalId !== null} className="text-xs text-gray-500 hover:text-gray-700 underline disabled:opacity-40">
                                  {analyzingPhysicalId === ev.id ? "Analizando..." : "Regenerar"}
                                </button>
                              </div>

                              <div className="mb-5 pb-5 border-b border-gray-100">
                                <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded text-white mb-3 inline-block" style={{ backgroundColor:"#1B4D2E" }}>Estado físico general</span>
                                <p className="text-sm text-gray-700 leading-relaxed mt-2">{ai.resumen}</p>
                              </div>

                              {ai.patron_general && (
                                <div className="mb-5 pb-5 border-b border-gray-100">
                                  <div className="bg-amber-50 rounded-lg p-3">
                                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Patrón identificado</p>
                                    <p className="text-sm text-amber-900 leading-relaxed">{ai.patron_general}</p>
                                  </div>
                                </div>
                              )}

                              {ai.limitaciones?.length > 0 && (
                                <div className="mb-5 pb-5 border-b border-gray-100">
                                  <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded text-white mb-4 inline-block" style={{ backgroundColor:"#1B4D2E" }}>Limitaciones — prioridades</span>
                                  <div className="space-y-3 mt-3">
                                    {ai.limitaciones.map((lim, i) => {
                                      const bc = lim.nivel === "bajo" ? "#EF4444" : "#F97316";
                                      return (
                                        <div key={i} className="rounded-lg bg-gray-50 overflow-hidden" style={{ borderLeft:`3px solid ${bc}` }}>
                                          <div className="px-4 py-3">
                                            <div className="flex items-start gap-2 mb-1">
                                              <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor:lim.nivel==="bajo"?"#FEE2E2":"#FEF3C7", color:lim.nivel==="bajo"?"#991B1B":"#92400E" }}>{lim.test}</span>
                                              <p className="text-sm font-semibold text-gray-900">{lim.titulo}</p>
                                            </div>
                                            {lim.conexion_swing && <p className="text-xs text-gray-400 mb-2 ml-1">Afecta: {lim.conexion_swing}</p>}
                                            <p className="text-sm text-gray-700 leading-relaxed mb-3">{lim.descripcion}</p>
                                            {lim.ejercicios?.length > 0 && (
                                              <div className="flex flex-wrap gap-1.5">
                                                {lim.ejercicios.map((e, j) => <span key={j} className="text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-600 bg-white">{e}</span>)}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {((ai.recomendaciones_generales?.length ?? 0) > 0 || (ai.fortalezas_fisicas?.length ?? 0) > 0) && (
                                <div className="mb-5 pb-5 border-b border-gray-100">
                                  <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded text-white mb-3 inline-block" style={{ backgroundColor:"#1B4D2E" }}>Recomendaciones generales</span>
                                  <ul className="space-y-1 mt-2">
                                    {(ai.recomendaciones_generales ?? ai.fortalezas_fisicas ?? []).map((f, i) => (
                                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                        <span className="text-gray-300 shrink-0 mt-0.5">—</span>
                                        <span>{f}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {(ai.plan_trabajo?.length ?? 0) > 0 && (
                                <div className="mb-5 pb-5 border-b border-gray-100">
                                  <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded text-white mb-3 inline-block" style={{ backgroundColor:"#1B4D2E" }}>Plan de trabajo</span>
                                  <div className="space-y-3 mt-3">
                                    {ai.plan_trabajo!.map((step, i) => (
                                      <div key={i} className="rounded-lg bg-gray-50 overflow-hidden" style={{ borderLeft:"3px solid #1B4D2E" }}>
                                        <div className="px-4 py-3">
                                          <p className="text-xs font-semibold text-gray-700 mb-2">Semanas {step.semanas} — {step.objetivo}</p>
                                          <ul className="space-y-1">
                                            {step.ejercicios?.map((e, j) => (
                                              <li key={j} className="text-xs text-gray-700 flex items-start gap-1.5">
                                                <span className="text-gray-300 shrink-0 mt-0.5">·</span>{e}
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {ai.nota_edad && (
                                <div>
                                  <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded text-white mb-2 inline-block" style={{ backgroundColor:"#1B4D2E" }}>Nota pedagógica</span>
                                  <p className="text-xs text-gray-600 leading-relaxed mt-2">{ai.nota_edad}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {activeTab === "hitos" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">Hitos del alumno</h2>
              <button onClick={openHitoForm} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors" style={{ backgroundColor:"#1B4D2E", color:"white" }}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
                Registrar hito
              </button>
            </div>

            {hitosLoading ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <svg className="animate-spin mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                Cargando...
              </div>
            ) : hitos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="mb-3"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
                <p className="text-sm font-medium">Sin hitos aún</p>
                <p className="text-xs mt-1">Registra el primer logro de este alumno</p>
              </div>
            ) : (
              <div className="space-y-3">
                {hitos.map((h) => (
                  <div key={h.id} className="flex flex-col md:flex-row items-start gap-4 p-4 rounded-xl border border-gray-100 bg-white hover:border-gray-200 transition-colors">
                    {h.foto_url ? (
                      <img src={h.foto_url} alt={h.titulo} className="order-1 w-full h-48 md:w-20 md:h-20 rounded-lg object-cover shrink-0 border border-gray-100" />
                    ) : (
                      <div className="order-1 hidden md:flex w-20 h-20 rounded-lg shrink-0 items-center justify-center" style={{ backgroundColor:"#F0FDF4" }}>
                        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#1B4D2E" strokeWidth={1.5}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
                      </div>
                    )}
                    <div className="order-2 flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{h.titulo}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatFecha(h.fecha)}</p>
                      {h.descripcion && <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{h.descripcion}</p>}
                    </div>
                    <button onClick={() => handleDeleteHito(h.id)} className="order-3 shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors">
                      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "notas" && (
          <div>
            <div className="flex items-center justify-between mb-5 gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-gray-900">Notas del profesor</h2>
              <div className="flex gap-2">
                <button
                  onClick={handleDownloadPDF}
                  disabled={downloadingPDF || notas.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  {downloadingPDF
                    ? <><svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Generando...</>
                    : <><svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Descargar PDF</>}
                </button>
                <button
                  onClick={() => openNotaForm()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{ backgroundColor: "#1B4D2E", color: "white" }}
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
                  Nueva nota
                </button>
              </div>
            </div>

            {notasLoading ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <svg className="animate-spin mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                Cargando notas...
              </div>
            ) : notas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="mb-3"><path d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                <p className="text-sm font-medium">Sin notas aún</p>
                <p className="text-xs mt-1">Registra la primera observación de clase</p>
              </div>
            ) : (
              <div className="space-y-4">
                {notas.map((nota) => (
                  <div key={nota.id} className="rounded-xl border border-gray-100 bg-white p-4 hover:border-gray-200 transition-colors">
                    {/* Header de la card */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <span className="text-sm font-bold" style={{ color: "#1B4D2E" }}>
                          📅 {formatFecha(nota.fecha)}
                        </span>
                        {nota.profesor_nombre && (
                          <span className="text-xs text-gray-400 ml-2">👤 {nota.profesor_nombre}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {nota.tipo_imagen && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#f3e5f5", color: "#6a1b9a" }}>
                            🏷️ {TIPO_IMAGEN_LABELS[nota.tipo_imagen]}
                          </span>
                        )}
                        {nota.video_url && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: "#1a3a2a" }}>
                            🎥 Video
                          </span>
                        )}
                        <button onClick={() => openNotaForm(nota)} className="p-1.5 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Editar">
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button onClick={() => handleDeleteNota(nota.id)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors" title="Eliminar">
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
                        </button>
                      </div>
                    </div>

                    {/* Contenido */}
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{nota.contenido}</p>

                    {/* Imagen */}
                    {nota.imagen_url && (
                      <div className="mt-3">
                        {nota.imagen_url.toLowerCase().endsWith(".pdf") ? (
                          <a href={nota.imagen_url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            Ver PDF Trackman
                          </a>
                        ) : (
                          <img
                            src={nota.imagen_url}
                            alt="Imagen adjunta"
                            className="w-48 h-36 object-cover rounded-lg border border-gray-100 cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => setLightboxUrl(nota.imagen_url)}
                          />
                        )}
                      </div>
                    )}

                    {/* Video */}
                    {nota.video_url && (
                      <video src={nota.video_url} controls className="mt-3 w-full rounded-lg border border-gray-100" style={{ maxHeight: 300 }} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Card análisis integrado del perfil — visible cuando hay al menos un tipo de datos */}
      {(hasSwingEvals || hasPhysicalEvals || hasTrackmanData) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Análisis integrado del perfil</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Combina:{" "}
                {[hasSwingEvals && "técnico", hasPhysicalEvals && "físico TPI", hasTrackmanData && "Trackman (30 días)"].filter(Boolean).join(" · ")}
              </p>
            </div>
            {profileIntegratedResult && (
              <button onClick={handleProfileIntegratedAnalysis} disabled={analyzingProfileIntegrated} className="text-xs text-gray-500 hover:text-gray-700 underline disabled:opacity-40">
                {analyzingProfileIntegrated ? "Generando..." : "Regenerar"}
              </button>
            )}
          </div>

          {!profileIntegratedResult && (
            <button onClick={handleProfileIntegratedAnalysis} disabled={analyzingProfileIntegrated} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border-2 border-dashed transition-all" style={{ borderColor: analyzingProfileIntegrated ? "#5EEAD4" : "#0D9488", color: analyzingProfileIntegrated ? "#0D9488" : "#0F766E", backgroundColor: analyzingProfileIntegrated ? "#F0FDFA" : "transparent" }}>
              {analyzingProfileIntegrated ? (
                <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Generando análisis integrado...</>
              ) : (
                <><svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>Generar análisis integrado</>
              )}
            </button>
          )}

          {profileIntegratedError && (
            <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg mt-2">{profileIntegratedError}</p>
          )}

          {displayProfileIntegrated && (
            <div className="mt-4 space-y-5">
              <div className="pb-5 border-b border-gray-100">
                <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded text-white mb-3 inline-block" style={{ backgroundColor:"#1B4D2E" }}>Resumen integrado</span>
                <p className="text-sm text-gray-700 leading-relaxed mt-2">{displayProfileIntegrated.resumen_integrado}</p>
              </div>

              {(displayProfileIntegrated.prioridades_cruzadas?.length ?? 0) > 0 && (
                <div className="pb-5 border-b border-gray-100">
                  <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded text-white mb-4 inline-block" style={{ backgroundColor:"#1B4D2E" }}>Prioridades cruzadas</span>
                  <div className="space-y-3 mt-3">
                    {displayProfileIntegrated.prioridades_cruzadas!.map((pr) => {
                      const bc = pr.orden === 1 ? "#EF4444" : pr.orden === 2 ? "#F97316" : "#22C55E";
                      return (
                        <div key={pr.orden} className="rounded-lg bg-gray-50 overflow-hidden" style={{ borderLeft:`3px solid ${bc}` }}>
                          <div className="px-4 py-3">
                            <div className="flex items-start gap-2 mb-2">
                              <span className="text-xs font-bold shrink-0 mt-0.5" style={{ color:bc }}>{pr.orden}.</span>
                              <p className="text-sm font-semibold text-gray-900">{pr.titulo}</p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                              <div className="bg-white rounded-md px-3 py-2 border border-gray-100">
                                <p className="text-xs font-semibold text-gray-500 mb-1">Limitación física</p>
                                <p className="text-xs text-gray-700">{pr.limitacion_fisica}</p>
                              </div>
                              <div className="bg-white rounded-md px-3 py-2 border border-gray-100">
                                <p className="text-xs font-semibold text-gray-500 mb-1">Error técnico</p>
                                <p className="text-xs text-gray-700">{pr.error_tecnico}</p>
                              </div>
                            </div>
                            <p className="text-sm text-gray-700 leading-relaxed mb-3">{pr.descripcion}</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                              <div className="bg-white rounded-md px-3 py-2 border border-gray-100">
                                <p className="text-xs font-semibold text-gray-500 mb-1">Ejercicio físico</p>
                                <p className="text-xs text-gray-700 leading-relaxed">{pr.ejercicio_fisico}</p>
                              </div>
                              <div className="bg-white rounded-md px-3 py-2 border border-gray-100">
                                <p className="text-xs font-semibold text-gray-500 mb-1">Drill técnico</p>
                                <p className="text-xs text-gray-700 leading-relaxed">{pr.drill_tecnico}</p>
                              </div>
                            </div>
                            <p className="text-xs text-gray-500"><span className="font-semibold">Progresión:</span> {pr.progresion}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {displayProfileIntegrated.plan_sesion && (
                <div className="pb-5 border-b border-gray-100">
                  <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded text-white mb-3 inline-block" style={{ backgroundColor:"#1B4D2E" }}>Plan de sesión</span>
                  <p className="text-sm text-gray-700 leading-relaxed mt-2">{displayProfileIntegrated.plan_sesion}</p>
                </div>
              )}

              {displayProfileIntegrated.nota_trackman && (
                <div className="pb-5 border-b border-gray-100">
                  <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded text-white mb-2 inline-block" style={{ backgroundColor:"#1B4D2E" }}>Nota TrackMan</span>
                  <p className="text-xs text-gray-600 leading-relaxed mt-2">{displayProfileIntegrated.nota_trackman}</p>
                </div>
              )}

              {(displayProfileIntegrated.nota_profesor || displayProfileIntegrated.nota_edad) && (
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded text-white mb-2 inline-block" style={{ backgroundColor:"#1B4D2E" }}>Nota pedagógica</span>
                  <p className="text-xs text-gray-600 leading-relaxed mt-2">{displayProfileIntegrated.nota_profesor ?? displayProfileIntegrated.nota_edad}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Botón Informe para padres */}
      {(hasSwingEvals || hasPhysicalEvals || hasTrackmanData) && student && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => setShowParentReport(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm transition-all hover:brightness-110"
            style={{ background: "#1B4D2E" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Informe para padres
          </button>
        </div>
      )}

      {showParentReport && student && (
        <ParentReportModal
          studentId={String(student.id)}
          studentName={student.full_name}
          hasSwingEvals={hasSwingEvals}
          hasPhysicalEvals={hasPhysicalEvals}
          hasTrackmanData={hasTrackmanData}
          onClose={() => setShowParentReport(false)}
        />
      )}

      {/* ── Lightbox imagen nota ─────────────────────── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.85)" }}
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img src={lightboxUrl} alt="Imagen adjunta" className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl" />
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white text-gray-700 flex items-center justify-center shadow-lg hover:bg-gray-100 transition-colors text-sm font-bold"
            >✕</button>
          </div>
        </div>
      )}

      {/* ── Modal nueva / editar nota ─────────────────── */}
      {showNotaForm && notaForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4" style={{ backgroundColor: "rgba(0,0,0,0.45)" }} onClick={(e) => { if (e.target === e.currentTarget) closeNotaForm(); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">{editingNotaId ? "Editar nota" : "Nueva nota del profesor"}</h2>
              <button onClick={closeNotaForm} className="text-gray-400 hover:text-gray-600">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Nota */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nota <span className="text-red-400">*</span></label>
                <textarea
                  value={notaForm.contenido}
                  onChange={(e) => setNotaForm((f) => f ? { ...f, contenido: e.target.value } : f)}
                  rows={5}
                  placeholder="Observaciones de la clase, aspectos técnicos notados, comportamiento, progreso..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none"
                />
              </div>

              {/* Fecha */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Fecha</label>
                <input
                  type="date"
                  value={notaForm.fecha}
                  onChange={(e) => setNotaForm((f) => f ? { ...f, fecha: e.target.value } : f)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
              </div>

              {/* Imagen */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Imagen o PDF <span className="text-gray-400 font-normal">(opcional — JPG, PNG, WEBP, PDF · máx 10 MB)</span>
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (!file) return;
                    if (file.size > 10 * 1024 * 1024) { setNotaSaveError("El archivo no puede superar 10 MB."); return; }
                    setNotaSaveError(null);
                    const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
                    setNotaForm((f) => f ? { ...f, imagen: file, imagenPreview: preview } : f);
                  }}
                  className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                />
                {notaForm.imagenPreview && (
                  <img src={notaForm.imagenPreview} alt="Preview" className="mt-2 h-28 w-auto rounded-lg border border-gray-100 object-cover" />
                )}
                {notaForm.imagen && !notaForm.imagenPreview && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    {notaForm.imagen.name}
                  </div>
                )}
              </div>

              {/* Video */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 10l4.553-2.276A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14M5 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/></svg>
                  Subir video <span className="text-gray-400 font-normal">(opcional — MP4, MOV, AVI, WEBM · máx 100 MB)</span>
                </label>
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/x-msvideo,video/webm"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (!file) return;
                    if (file.size > 100 * 1024 * 1024) { setNotaSaveError("El video no puede superar 100 MB."); return; }
                    setNotaSaveError(null);
                    const preview = URL.createObjectURL(file);
                    setNotaForm((f) => f ? { ...f, video: file, videoPreview: preview } : f);
                  }}
                  className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                />
                {notaForm.videoPreview && (
                  <video src={notaForm.videoPreview} controls className="mt-2 w-full rounded-lg border border-gray-100" style={{ maxHeight: 200 }} />
                )}
              </div>

              {/* Tipo de imagen */}
              {notaForm.imagen && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tipo de archivo</label>
                  <select
                    value={notaForm.tipo_imagen ?? ""}
                    onChange={(e) => setNotaForm((f) => f ? { ...f, tipo_imagen: (e.target.value || null) as TipoImagen | null } : f)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-600"
                  >
                    <option value="">— Seleccionar tipo —</option>
                    <option value="trackman">Trackman</option>
                    <option value="swing">Swing</option>
                    <option value="campo">Campo</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
              )}

              {notaSaveError && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{notaSaveError}</p>}
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button onClick={closeNotaForm} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={handleSaveNota}
                disabled={savingNota || !notaForm.contenido.trim()}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: "#1B4D2E" }}
              >
                {savingNota ? "Guardando..." : editingNotaId ? "Guardar cambios" : "Guardar nota"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showHitoForm && hitoForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4" style={{ backgroundColor:"rgba(0,0,0,0.45)" }} onClick={(e) => { if (e.target===e.currentTarget) closeHitoForm(); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Registrar hito</h2>
              <button onClick={closeHitoForm} className="text-gray-400 hover:text-gray-600"><svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12"/></svg></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Título <span className="text-red-400">*</span></label>
                <input type="text" value={hitoForm.titulo} onChange={(e) => setHitoForm((f) => f ? { ...f, titulo: e.target.value } : f)} placeholder="ej: Primer eagle, Handicap −5, Primer torneo..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Descripción <span className="text-gray-400 font-normal">(opcional)</span></label>
                <textarea value={hitoForm.descripcion} onChange={(e) => setHitoForm((f) => f ? { ...f, descripcion: e.target.value } : f)} placeholder="Detalles del logro..." rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Fecha del logro</label>
                <input type="date" value={hitoForm.fecha} onChange={(e) => setHitoForm((f) => f ? { ...f, fecha: e.target.value } : f)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Foto del logro <span className="text-gray-400 font-normal">(opcional)</span></label>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const file = e.target.files?.[0] ?? null; setHitoForm((f) => f ? { ...f, foto: file } : f); }} className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100" />
                {hitoForm.foto && <p className="text-xs text-gray-400 mt-1.5">{hitoForm.foto.name} ({(hitoForm.foto.size / 1024).toFixed(0)} KB)</p>}
              </div>
              {hitoSaveError && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{hitoSaveError}</p>}
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={closeHitoForm} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={handleSaveHito} disabled={savingHito || !hitoForm.titulo.trim()} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition-opacity" style={{ backgroundColor:"#1B4D2E" }}>
                {savingHito ? "Guardando..." : "Guardar hito"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isEditing && form && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4" style={{ backgroundColor:"rgba(0,0,0,0.45)" }} onClick={(e) => { if (e.target===e.currentTarget) closeEdit(); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100"><h2 className="text-base font-semibold text-gray-900">Editar perfil</h2><button onClick={closeEdit} className="text-gray-400 hover:text-gray-600" disabled={saving}><svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
            <div className="px-6 py-5 space-y-4">
              <FormField label="Nombre completo" required><input type="text" value={form.full_name} onChange={(e) => setField("full_name", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]"/></FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Fecha de nacimiento"><input type="date" value={form.birth_date} onChange={(e) => setField("birth_date", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E]"/></FormField>
                <FormField label="Estado"><select value={form.status} onChange={(e) => setField("status", e.target.value as "activo"|"inactivo")} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] bg-white"><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select></FormField>
              </div>
              <FormField label="Grupo activo" hint="Los grupos juveniles se calculan normalmente por edad. Asigna manualmente solo cuando sea necesario."><select value={form.grupo_activo} onChange={(e) => setField("grupo_activo", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] bg-white"><option value="">Sin grupo / automático por edad</option><option value="Birdies">Birdies</option><option value="Águilas">Águilas</option><option value="Albatros">Albatros</option><option value="+14">+14</option><option value="Competencia">Competencia</option><option value="Damas">Damas</option></select></FormField>
              <FormField label="Talega"><select value={form.tiene_talega} onChange={(e) => setField("tiene_talega", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] bg-white"><option value="">— (no especificado)</option><option value="Sí">Sí</option><option value="No">No</option></select></FormField>
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Acudiente</p>
                <div className="space-y-4">
                  <FormField label="Nombre"><input type="text" value={form.parent_name} onChange={(e) => setField("parent_name", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E]"/></FormField>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="Teléfono"><input type="tel" value={form.parent_phone} onChange={(e) => setField("parent_phone", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E]"/></FormField>
                    <FormField label="Email"><input type="email" value={form.parent_email} onChange={(e) => setField("parent_email", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E]"/></FormField>
                  </div>
                </div>
              </div>
              <FormField label="Observaciones"><textarea value={form.observations} onChange={(e) => setField("observations", e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] resize-none"/></FormField>
              {saveError && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">Error: {saveError}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={closeEdit} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">Cancelar</button>
              <button onClick={handleSave} disabled={saving||!form.full_name.trim()} className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor:"#1B4D2E" }}>
                {saving && <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>}
                {saving?"Guardando...":"Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSwingForm && swingForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4" style={{ backgroundColor:"rgba(0,0,0,0.45)" }} onClick={(e) => { if (e.target===e.currentTarget) closeSwingForm(); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div><h2 className="text-base font-semibold text-gray-900">Nueva evaluación técnica de swing</h2><p className="text-xs text-gray-400 mt-0.5">{student.full_name} · {grupo}</p></div>
              <button onClick={closeSwingForm} className="text-gray-400 hover:text-gray-600" disabled={swingSaving}><svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12"/></svg></button>
            </div>
            <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[72vh]">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Tipo" required>
                  <select value={swingForm.evaluation_type} onChange={(e) => setSwingForm((prev) => prev?{...prev,evaluation_type:e.target.value as SwingForm["evaluation_type"]}:prev)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] bg-white">
                    <option value="inicial">Inicial</option><option value="periódica">Periódica</option><option value="graduación">Graduación</option>
                  </select>
                </FormField>
                <FormField label="Fecha" required>
                  <input type="date" value={swingForm.evaluation_date} onChange={(e) => setSwingForm((prev) => prev?{...prev,evaluation_date:e.target.value}:prev)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E]"/>
                </FormField>
              </div>

              {Object.entries(swingForm.positions).map(([pid, ps]) => {
                const criterios = getCriteriosGrupo(protocolosTecnico, grupo, pid);
                const posScore = calcPosScore(ps.criterios);
                return (
                  <div key={pid} className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor:"#E6F1FB", color:"#185FA5" }}>{pid}</span>
                        <span className="text-sm font-medium text-gray-800">{POSICIONES_NOMBRES[pid]}</span>
                        {!ps.na && posScore !== null && <span className="text-xs font-bold" style={{ color:scoreColor(posScore).text }}>{posScore.toFixed(1)}/10</span>}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setPosNA(pid, false)} className={`text-xs px-3 py-1 rounded-full border transition-all ${!ps.na?"bg-blue-50 text-blue-700 border-blue-200 font-medium":"border-gray-200 text-gray-400"}`}>Evaluar</button>
                        <button onClick={() => setPosNA(pid, true)} className={`text-xs px-3 py-1 rounded-full border transition-all ${ps.na?"bg-gray-100 text-gray-500 border-gray-300":"border-gray-200 text-gray-400"}`}>N/A</button>
                      </div>
                    </div>
                    {!ps.na && (
                      <div className="px-4 py-3">
                        <div className="space-y-2">
                          {criterios.map((crit, i) => (
                            <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                              <span className="text-xs text-gray-700 flex-1 pr-3">{crit}</span>
                              <div className="flex gap-1.5">
                                {(["cumple","progreso","no"] as CritValue[]).map((val) => {
  const isActive = ps.criterios[i]===val;
  const s = { cumple:{ac:"bg-emerald-50 border-emerald-300",ic:"✅"}, progreso:{ac:"bg-amber-50 border-amber-300",ic:"⚠️"}, no:{ac:"bg-red-50 border-red-300",ic:"❌"} }[val as "cumple"|"progreso"|"no"];
  return <button key={val} onClick={() => setCrit(pid, i, val)} className={`w-8 h-7 rounded border flex items-center justify-center text-sm transition-all ${isActive ? s.ac + " shadow-sm" : "border-gray-300 bg-gray-100 hover:bg-gray-200"}`}>{s.ic}</button>;
})}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2">
                          {!ps.obsOpen ? (
                            <button onClick={() => toggleObs(pid)} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 mt-1">
                              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14"/></svg>
                              Agregar observación
                            </button>
                          ) : (
                            <div className="mt-2">
                              <p className="text-xs text-gray-400 mb-1">Observación del profesor</p>
                              <textarea value={ps.obs} onChange={(e) => setObs(pid, e.target.value)} rows={2} placeholder="Ej: tiende a levantar el codo derecho, mejoró vs sesión anterior..." className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-[#1B4D2E] bg-gray-50"/>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {ps.na && <div className="px-4 py-3 border-t border-gray-50"><p className="text-xs text-gray-400 italic">Pendiente — se evaluará en próxima sesión</p></div>}
                  </div>
                );
              })}

              <FormField label="Observaciones generales">
                <textarea value={swingForm.professor_comment} onChange={(e) => setSwingForm((prev) => prev?{...prev,professor_comment:e.target.value}:prev)} rows={3} placeholder="Observaciones generales sobre la sesión..." className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] resize-none"/>
              </FormField>

              <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
                <span className="text-sm text-gray-600">Promedio evaluación</span>
                <span className="text-xl font-bold" style={{ color:scoreColor(calcPromedio(swingForm.positions)).text }}>
                  {calcPromedio(swingForm.positions)!==null?`${calcPromedio(swingForm.positions)?.toFixed(1)}/10`:"—"}
                </span>
              </div>

              {swingSaveError && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">Error: {swingSaveError}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={closeSwingForm} disabled={swingSaving} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">Cancelar</button>
              <button onClick={handleSaveSwing} disabled={swingSaving||!swingForm.evaluation_date} className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor:"#1B4D2E" }}>
                {swingSaving && <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>}
                {swingSaving?"Guardando...":"Guardar evaluación"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPhysicalForm && physicalForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4" style={{ backgroundColor:"rgba(0,0,0,0.45)" }} onClick={(e) => { if (e.target===e.currentTarget) closePhysicalForm(); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div><h2 className="text-base font-semibold text-gray-900">Nueva evaluación física TPI</h2><p className="text-xs text-gray-400 mt-0.5">{student.full_name} · {grupoFisico}</p></div>
              <button onClick={closePhysicalForm} className="text-gray-400 hover:text-gray-600" disabled={physicalSaving}><svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12"/></svg></button>
            </div>
            <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[72vh]">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Tipo" required>
                  <select value={physicalForm.evaluation_type} onChange={(e) => setPhysicalForm((prev) => prev?{...prev,evaluation_type:e.target.value as PhysicalForm["evaluation_type"]}:prev)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] bg-white">
                    <option value="inicial">Inicial</option><option value="periódica">Periódica</option><option value="graduación">Graduación</option>
                  </select>
                </FormField>
                <FormField label="Fecha" required>
                  <input type="date" value={physicalForm.evaluation_date} onChange={(e) => setPhysicalForm((prev) => prev?{...prev,evaluation_date:e.target.value}:prev)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E]"/>
                </FormField>
              </div>

              {getPhysicalCategorias(protocolosFisico, grupoFisico).map((cat) => {
                const tipoBadge = cat.tipo === "desarrollo_motor" ? { bg:"#FEF3C7", color:"#92400E" } : cat.tipo === "potencia" ? { bg:"#FEE2E2", color:"#991B1B" } : { bg:"#EFF6FF", color:"#1D4ED8" };
                return (
                  <div key={cat.label}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor:tipoBadge.bg, color:tipoBadge.color }}>{cat.label}</span>
                    </div>
                    <div className="space-y-2">
                      {cat.tests.map((testDef) => {
                        const ts = physicalForm.tests[testDef.id];
                        if (!ts) return null;
                        return (
                          <div key={testDef.id} className="border border-gray-100 rounded-xl overflow-hidden">
                            <div className="flex items-start justify-between px-4 py-3 bg-gray-50">
                              <div className="flex-1 min-w-0 mr-3">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor:"#E6F1FB", color:"#185FA5" }}>{testDef.id}</span>
                                  <span className="text-sm font-medium text-gray-800">{testDef.nombre}</span>
                                </div>
                                {testDef.swing && <p className="text-xs text-gray-400">Swing: {testDef.swing}</p>}
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <button onClick={() => setPhysTestNA(testDef.id, false)} className={`text-xs px-2.5 py-1 rounded-full border transition-all ${!ts.na?"bg-blue-50 text-blue-700 border-blue-200 font-medium":"border-gray-200 text-gray-400"}`}>Evaluar</button>
                                <button onClick={() => setPhysTestNA(testDef.id, true)} className={`text-xs px-2.5 py-1 rounded-full border transition-all ${ts.na?"bg-gray-100 text-gray-500 border-gray-300":"border-gray-200 text-gray-400"}`}>N/A</button>
                              </div>
                            </div>
                            {!ts.na && (
                              <div className="px-4 py-3">
                                <div className="grid grid-cols-3 gap-2 mb-2">
                                  {(["cumple","progreso","bajo"] as PhysicalResult[]).map((val) => {
                                    const isActive = ts.result === val;
                                    const styles = {
                                      cumple: { active:"bg-emerald-50 border-emerald-300 text-emerald-700", icon:"✅", label:"Cumple", hint:testDef.rangos.cumple },
                                      progreso: { active:"bg-amber-50 border-amber-300 text-amber-700", icon:"⚠️", label:"En progreso", hint:testDef.rangos.progreso },
                                      bajo: { active:"bg-red-50 border-red-300 text-red-700", icon:"❌", label:"Bajo", hint:testDef.rangos.bajo },
                                    }[val as "cumple"|"progreso"|"bajo"];
                                    return (
                                      <button key={val} onClick={() => setPhysTestResult(testDef.id, val)} className={`rounded-lg border p-2 text-left transition-all ${isActive ? styles.active+" shadow-sm" : "border-gray-200 bg-gray-50 hover:bg-gray-100"}`}>
                                        <div className="flex items-center gap-1 mb-0.5">
                                          <span style={{ fontSize:"12px" }}>{styles.icon}</span>
                                          <span className="text-xs font-medium">{styles.label}</span>
                                        </div>
                                        <p className="text-gray-400 leading-tight" style={{ fontSize:"9px" }}>{styles.hint}</p>
                                      </button>
                                    );
                                  })}
                                </div>
                                <div className="mt-1">
                                  {!ts.obsOpen ? (
                                    <button onClick={() => togglePhysTestObs(testDef.id)} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14"/></svg>
                                      Agregar observación
                                    </button>
                                  ) : (
                                    <div>
                                      <p className="text-xs text-gray-400 mb-1">Observación</p>
                                      <textarea value={ts.obs} onChange={(e) => setPhysTestObs(testDef.id, e.target.value)} rows={2} placeholder="Ej: compensación leve en rodilla derecha..." className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-[#1B4D2E] bg-gray-50"/>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            {ts.na && <div className="px-4 py-3 border-t border-gray-50"><p className="text-xs text-gray-400 italic">Pendiente — se evaluará en próxima sesión</p></div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <FormField label="Observaciones generales">
                <textarea value={physicalForm.professor_comment} onChange={(e) => setPhysicalForm((prev) => prev?{...prev,professor_comment:e.target.value}:prev)} rows={3} placeholder="Observaciones generales sobre la sesión..." className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] resize-none"/>
              </FormField>

              <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
                <span className="text-sm text-gray-600">Promedio evaluación</span>
                <span className="text-xl font-bold" style={{ color:scoreColor(calcPhysPromedio(physicalForm.tests)).text }}>
                  {calcPhysPromedio(physicalForm.tests)!==null?`${calcPhysPromedio(physicalForm.tests)?.toFixed(1)}/10`:"—"}
                </span>
              </div>

              {physicalSaveError && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">Error: {physicalSaveError}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={closePhysicalForm} disabled={physicalSaving} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">Cancelar</button>
              <button onClick={handleSavePhysical} disabled={physicalSaving||!physicalForm.evaluation_date} className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor:"#1B4D2E" }}>
                {physicalSaving && <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>}
                {physicalSaving?"Guardando...":"Guardar evaluación"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPacoChat && student && pacoContext !== null && (
        <PacoContextChat
          studentId={studentId}
          studentName={student.full_name}
          studentGrupo={student.grupo_activo}
          studentContext={pacoContext}
          onClose={() => setShowPacoChat(false)}
        />
      )}

      {showPlanCasa && student && (
        <PlanParaCasaModal
          studentId={studentId}
          studentName={student.full_name}
          parentPhone={student.parent_phone}
          onClose={() => setShowPlanCasa(false)}
        />
      )}

      {currentRol && isStaff(currentRol) && DIRECTOR_COORD_ROLES.includes(currentRol) && student && (
        <div className="mt-10 pt-6 border-t border-gray-100 flex justify-center">
          <button
            onClick={() => { setDeleteError(null); setShowDeleteModal(true); }}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-600 transition-colors"
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>
            Eliminar alumno
          </button>
        </div>
      )}

      {showDeleteModal && student && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => !deleting && setShowDeleteModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-red-50 shrink-0">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#dc2626" strokeWidth={2}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>
              </div>
              <h2 className="font-bold text-gray-900 text-base">Eliminar alumno</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-gray-600">
                ¿Estás seguro de que quieres eliminar a <span className="font-semibold text-gray-900">{student.full_name}</span>? Esta acción no se puede deshacer y eliminará todos sus datos incluyendo tests, notas y asistencia.
              </p>
              {deleteError && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">Error: {deleteError}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowDeleteModal(false)} disabled={deleting} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50">Cancelar</button>
              <button
                onClick={handleDeleteStudent}
                disabled={deleting}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
                style={{ backgroundColor: "#dc2626" }}
              >
                {deleting && <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>}
                {deleting ? "Eliminando..." : "Eliminar definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EvalTypeBadge({ type }: { type: string }) {
  const map: Record<string,{bg:string;color:string}> = { inicial:{bg:"#C9A84C20",color:"#8B6914"}, "periódica":{bg:"#EFF6FF",color:"#1D4ED8"}, "graduación":{bg:"#F5F3FF",color:"#6D28D9"} };
  const s = map[type] ?? { bg:"#F3F4F6", color:"#6B7280" };
  return <span className="px-2.5 py-1 rounded-full text-xs font-medium capitalize" style={{ backgroundColor:s.bg, color:s.color }}>{type.charAt(0).toUpperCase()+type.slice(1)}</span>;
}

function Field({ label, value }: { label: string; value: string|null|undefined }) {
  return <div><p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p><p className="text-sm text-gray-800">{value||"—"}</p></div>;
}

function FormField({ label, children, required, hint }: { label: string; children: React.ReactNode; required?: boolean; hint?: string; }) {
  return <div><label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}{required&&<span className="text-red-400 ml-0.5">*</span>}</label>{children}{hint&&<p className="text-xs text-gray-400 mt-1">{hint}</p>}</div>;
}
