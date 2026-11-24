// Asistencia contra una meta semanal, no contra lo que el alumno reservó.
//
// Los grupos sin meta se miden con presentes / (presentes + ausentes): si
// reservó dos clases y fue a las dos, tiene 100 %. Para los grupos con meta eso
// no dice nada, porque lo que se quiere medir es cuánto viene, no si cumple lo
// que reservó — con ese denominador el mes entero salía en 100 % mientras la
// mitad del grupo no había aparecido.
//
// Metas del club (nov-2026; Competencia desde ago-2026):
//   · Birdies y Águilas: 2 clases por semana = 100 %.
//   · Albatros y Competencia: 3 clases por semana = 100 %.
//   · +14 y Damas: sin meta, siguen contra lo reservado.
//
// Reglas:
//   · Cuentan las sesiones del plan del alumno (Birdies → birdies; Águilas y
//     Albatros → juvenil; Competencia → competencia). Una clase suelta en otro
//     plan no suma ni arriba ni abajo.
//   · Semana con festivo o con menos programación: la meta de esa semana es el
//     número de sesiones que realmente se dictaron, con tope en la meta del
//     grupo. Una semana sin programación no suma meta y no castiga a nadie.
//   · Una sesión suspendida (lluvia, campo cerrado) no se dictó: no suma meta.
//   · Sesiones que todavía no han pasado no cuentan (fecha <= hoy): si
//     contaran, el lunes todos estarían en 0 %.
//   · Alumno matriculado a mitad del periodo: solo cuentan las semanas cuyo
//     lunes cae en su fecha de matrícula o después.
//
// Esta es la versión de la regla que usa la interfaz sobre datos ya cargados
// (Reportes, que trabaja con periodos elegidos a mano). La misma regla, fijada
// al mes en curso, vive en la vista `student_metrics`
// (supabase/migrations/20261124_asistencia_meta_por_grupo.sql), que es la que
// alimentan Alumnos y Paco. Si cambia una, cambia la otra.
//
// Sin "use client" ni imports de Supabase a propósito: son funciones puras.

import { calcularGrupo, tipoPlanDeGrupo, type GrupoAlumno } from "@/lib/grupos";

export const META_SEMANAL_POR_GRUPO: Partial<Record<GrupoAlumno, number>> = {
  Birdies: 2,
  "Águilas": 2,
  Albatros: 3,
  Competencia: 3,
};

/** Para notas al pie y tooltips. */
export const TEXTO_METAS = "Birdies y Águilas 2 clases por semana; Albatros y Competencia 3";

export type AlumnoParaMeta = {
  birth_date: string | null;
  gender: string | null;
  grupo_activo: string | null;
  enrollment_date?: string | null;
};

/** Meta semanal del grupo del alumno, o null si su grupo no se mide contra meta. */
export function metaSemanalDe(alumno: AlumnoParaMeta): number | null {
  const grupo = calcularGrupo(alumno.birth_date, alumno.gender, alumno.grupo_activo);
  return (grupo && META_SEMANAL_POR_GRUPO[grupo]) ?? null;
}

/**
 * Porcentaje de asistencia contra la meta, con tope en 100.
 *
 * Una semana puede tener más sesiones que la meta: el que va a todas cumplió,
 * no cumplió un 133 %. Sin el tope, venir de más se veía como un dato raro en
 * la tabla y descuadraba el promedio del grupo contra el de cada alumno.
 */
export function pctContraMeta(presentes: number, meta: number): number {
  if (meta <= 0) return 0;
  return Math.min(100, Math.round((presentes / meta) * 100));
}

/**
 * Lunes de la semana de una fecha ISO, en ISO.
 *
 * Se calcula en UTC a mediodía y no con el Date local del navegador: partir de
 * medianoche local hace que en husos al oeste de Greenwich la fecha retroceda un
 * día al serializarla, y la semana entera se corre.
 */
export function lunesDe(fechaISO: string): string {
  const d = new Date(fechaISO + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0 = domingo
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

/** Una sesión ya cargada, reducida a lo que la meta necesita. */
export type SesionParaMeta = {
  id: string;
  /** Fecha de la sesión, ISO (YYYY-MM-DD). */
  fecha: string;
  tipoPlan: string | null | undefined;
  /** Lunes del plan al que pertenece, ISO. Es como está guardada la programación. */
  semanaInicio: string | null | undefined;
  suspendida?: boolean | null;
};

/**
 * Arma, para un conjunto de sesiones del periodo, todo lo que hace falta para
 * medir a cualquier alumno contra su meta.
 */
export function crearMedidorMeta(sesiones: SesionParaMeta[], hoyISO: string) {
  const planDeSesion = new Map<string, string>();
  const semanaDeSesion = new Map<string, string>();
  // tipo_plan → (lunes → sesiones dictadas esa semana)
  const dictadas = new Map<string, Map<string, number>>();

  for (const s of sesiones) {
    if (!s.tipoPlan) continue;
    const semana = s.semanaInicio || lunesDe(s.fecha);
    planDeSesion.set(s.id, s.tipoPlan);
    semanaDeSesion.set(s.id, semana);
    if (s.fecha > hoyISO || s.suspendida) continue;
    let porSemana = dictadas.get(s.tipoPlan);
    if (!porSemana) { porSemana = new Map(); dictadas.set(s.tipoPlan, porSemana); }
    porSemana.set(semana, (porSemana.get(semana) ?? 0) + 1);
  }

  function planDe(alumno: AlumnoParaMeta): string | null {
    return tipoPlanDeGrupo(calcularGrupo(alumno.birth_date, alumno.gender, alumno.grupo_activo));
  }

  function semanaCuenta(alumno: AlumnoParaMeta, semana: string): boolean {
    return !alumno.enrollment_date || semana >= alumno.enrollment_date;
  }

  /** Meta de una semana para el alumno (0 si no aplica). */
  function metaEnSemana(alumno: AlumnoParaMeta, semana: string): number {
    const tope = metaSemanalDe(alumno);
    const plan = planDe(alumno);
    if (!tope || !plan || !semanaCuenta(alumno, semana)) return 0;
    return Math.min(tope, dictadas.get(plan)?.get(semana) ?? 0);
  }

  /** Meta del periodo completo para el alumno: suma de sus semanas. */
  function metaDe(alumno: AlumnoParaMeta): number {
    const tope = metaSemanalDe(alumno);
    const plan = planDe(alumno);
    if (!tope || !plan) return 0;
    let total = 0;
    for (const [semana, n] of dictadas.get(plan) ?? []) {
      if (semanaCuenta(alumno, semana)) total += Math.min(tope, n);
    }
    return total;
  }

  /**
   * ¿Esta asistencia cuenta para la meta del alumno? Solo sesiones de su plan y
   * de semanas que también le suman meta, para que el numerador no crezca sin
   * que crezca el denominador.
   */
  function cuentaParaMeta(alumno: AlumnoParaMeta, sesionId: string): boolean {
    const plan = planDe(alumno);
    if (!plan || planDeSesion.get(sesionId) !== plan) return false;
    return semanaCuenta(alumno, semanaDeSesion.get(sesionId) ?? "");
  }

  return {
    mideContraMeta: (alumno: AlumnoParaMeta) => metaSemanalDe(alumno) !== null,
    metaDe,
    metaEnSemana,
    cuentaParaMeta,
  };
}

export type MedidorMeta = ReturnType<typeof crearMedidorMeta>;
