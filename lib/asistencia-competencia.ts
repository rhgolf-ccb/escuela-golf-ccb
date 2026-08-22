// La asistencia de Competencia se mide contra una meta, no contra lo que el
// alumno reservó.
//
// El resto de la escuela se mide con presentes / (presentes + ausentes): si
// reservó dos clases y fue a las dos, tiene 100 %. En Competencia eso no dice
// nada, porque ahí lo que se quiere medir es cuánto viene, no si cumple lo que
// prometió — y con ese denominador el mes entero salía en 100 % mientras la
// mitad del grupo no había aparecido.
//
// La semana de Competencia tiene 4 sesiones, pero venir a las 4 no lo logra
// nadie: la meta del club son 3 por semana y eso es el 100 %. De ahí los
// ajustes:
//   · Semana con festivo o sin clase: la meta de esa semana es el número de
//     sesiones que realmente se dictaron, con tope de 3. Una semana sin
//     programación no suma meta y por lo tanto no castiga a nadie.
//   · Sesiones que todavía no han pasado no cuentan (fecha <= hoy): si
//     contaran, el lunes todos estarían en 0 %.
//   · Alumno matriculado a mitad del periodo: solo cuentan las semanas cuyo
//     lunes cae en su fecha de matrícula o después.
//
// Esta es la versión de la regla que usa la interfaz sobre datos ya cargados
// (Reportes, que trabaja con periodos elegidos a mano). La misma regla, fijada
// al mes en curso, vive en la vista `student_metrics`
// (supabase/migrations/20260822_asistencia_meta_competencia.sql), que es la que
// alimentan Alumnos y Paco. Si cambia una, cambia la otra.
//
// Sin "use client" ni imports de Supabase a propósito: son funciones puras
// sobre fechas ISO.

export const META_SEMANAL_COMPETENCIA = 3;

/** Una sesión ya cargada, reducida a lo único que la meta necesita. */
export type SesionParaMeta = {
  /** Fecha de la sesión, ISO (YYYY-MM-DD). */
  fecha: string;
  /** Lunes del plan al que pertenece, ISO. Es como está guardada la programación. */
  semanaInicio: string;
};

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

/**
 * Meta de cada semana: cuántas sesiones ya dictadas tuvo, con tope de 3.
 *
 * Devuelve un mapa lunes ISO → meta. Las semanas sin sesiones dictadas
 * simplemente no aparecen, que es lo mismo que meta 0.
 */
export function metasPorSemana(
  sesionesCompetencia: SesionParaMeta[],
  hoyISO: string,
): Map<string, number> {
  const dictadas = new Map<string, number>();
  for (const s of sesionesCompetencia) {
    if (s.fecha > hoyISO) continue;
    const semana = s.semanaInicio || lunesDe(s.fecha);
    dictadas.set(semana, (dictadas.get(semana) ?? 0) + 1);
  }
  const metas = new Map<string, number>();
  for (const [semana, n] of dictadas) {
    metas.set(semana, Math.min(META_SEMANAL_COMPETENCIA, n));
  }
  return metas;
}

/**
 * Meta del periodo para un alumno: la suma de las semanas que le corresponden.
 *
 * Un alumno sin fecha de matrícula cuenta todas las semanas — es el caso del
 * padrón viejo, que se cargó sin esa fecha, y dejarlo fuera sería peor que
 * asumir que ya estaba.
 */
export function metaDeAlumno(
  metas: Map<string, number>,
  enrollmentDate: string | null | undefined,
): number {
  let total = 0;
  for (const [semana, meta] of metas) {
    if (enrollmentDate && semana < enrollmentDate) continue;
    total += meta;
  }
  return total;
}

/** Meta de una sola semana para un alumno, respetando su fecha de matrícula. */
export function metaDeAlumnoEnSemana(
  metas: Map<string, number>,
  semanaISO: string,
  enrollmentDate: string | null | undefined,
): number {
  if (enrollmentDate && semanaISO < enrollmentDate) return 0;
  return metas.get(semanaISO) ?? 0;
}
