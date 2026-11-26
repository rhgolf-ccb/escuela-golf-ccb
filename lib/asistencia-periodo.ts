// Asistencia de uno o varios alumnos en un periodo, leída de Supabase y medida
// con la regla de lib/asistencia-meta.ts (la misma de Reportes y de la vista
// `student_metrics`): los grupos con meta semanal se miden contra ella, +14 y
// Damas contra lo que reservaron.
//
// La usan la ficha del alumno (contexto de Paco e informe a padres) y el
// análisis de grupo, para que ninguno de los dos vuelva a dar un 100 % a quien
// reservó poco y fue a todo lo que reservó.

import { supabase } from "@/lib/supabase";
import { crearMedidorMeta, metaSemanalDe, pctContraMeta, type AlumnoParaMeta } from "@/lib/asistencia-meta";

/**
 * `total` es la meta del periodo (Birdies/Águilas 2 por semana, Albatros y
 * Competencia 3) o, en +14 y Damas, las clases que reservó. `porMeta` dice cuál.
 */
export type AsistenciaResumen = { asistidas: number; total: number; pct: number; porMeta: boolean };

export type AlumnoAsistencia = AlumnoParaMeta & { id: string };

const PAGE_SIZE = 1000;

/** Fecha local del navegador en ISO (YYYY-MM-DD), sin pasar por UTC. */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Los últimos 30 días, hoy incluido, como [desde, hasta) para asistenciaPeriodo. */
export function ultimoMes(): { desde: string; hasta: string } {
  return { desde: isoLocal(new Date(Date.now() - 30 * 86400000)), hasta: isoLocal(new Date(Date.now() + 86400000)) };
}

type SesionRow = {
  id: string;
  fecha: string;
  suspendida: boolean | null;
  planes_semanales: { tipo_plan: string; semana_inicio: string | null } | null;
};
type ReservaRow = { estudiante_id: string; sesion_id: string; asistio: boolean | null };

/**
 * Asistencia entre `desde` (incluido) y `hasta` (excluido) de cada alumno. El
 * mapa no trae a los alumnos sin nada que medir en el periodo (sin meta que
 * cumplir ni reservas).
 *
 * Las reservas van paginadas: un grupo grande en un mes pasa de 1000 filas.
 * Las sesiones del periodo no: un mes son unas decenas.
 */
export async function asistenciaPeriodo(
  alumnos: AlumnoAsistencia[],
  desde: string,
  hasta: string
): Promise<Map<string, AsistenciaResumen>> {
  const resultado = new Map<string, AsistenciaResumen>();
  if (!alumnos.length) return resultado;
  const algunoConMeta = alumnos.some((a) => metaSemanalDe(a) !== null);
  const ids = alumnos.map((a) => a.id);

  const cargarReservas = async (): Promise<ReservaRow[]> => {
    const rows: ReservaRow[] = [];
    for (let i = 0; ; i += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("reservas")
        .select("estudiante_id, sesion_id, asistio, sesiones_semana!inner(fecha)")
        .in("estudiante_id", ids)
        .gte("sesiones_semana.fecha", desde)
        .lt("sesiones_semana.fecha", hasta)
        .order("id")
        .range(i, i + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as unknown as ReservaRow[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) return rows;
    }
  };

  const [sesiones, reservas] = await Promise.all([
    algunoConMeta
      ? supabase
          .from("sesiones_semana")
          .select("id,fecha,suspendida,planes_semanales(tipo_plan,semana_inicio)")
          .gte("fecha", desde)
          .lt("fecha", hasta)
          .then(({ data, error }) => {
            if (error) throw new Error(error.message);
            return (data ?? []) as unknown as SesionRow[];
          })
      : Promise.resolve([] as SesionRow[]),
    cargarReservas(),
  ]);

  const medidor = crearMedidorMeta(
    sesiones.map((s) => ({
      id: s.id, fecha: s.fecha, suspendida: s.suspendida,
      tipoPlan: s.planes_semanales?.tipo_plan, semanaInicio: s.planes_semanales?.semana_inicio,
    })),
    isoLocal(new Date())
  );

  const reservasPorAlumno = new Map<string, ReservaRow[]>();
  for (const r of reservas) {
    const arr = reservasPorAlumno.get(r.estudiante_id);
    if (arr) arr.push(r); else reservasPorAlumno.set(r.estudiante_id, [r]);
  }

  for (const alumno of alumnos) {
    const rv = reservasPorAlumno.get(alumno.id) ?? [];
    if (medidor.mideContraMeta(alumno)) {
      const total = medidor.metaDe(alumno);
      if (total === 0) continue;
      const asistidas = rv.filter((r) => r.asistio === true && medidor.cuentaParaMeta(alumno, r.sesion_id)).length;
      resultado.set(alumno.id, { asistidas, total, pct: pctContraMeta(asistidas, total), porMeta: true });
    } else {
      if (!rv.length) continue;
      const asistidas = rv.filter((r) => r.asistio).length;
      resultado.set(alumno.id, { asistidas, total: rv.length, pct: Math.round((asistidas / rv.length) * 100), porMeta: false });
    }
  }
  return resultado;
}

/** "30% (3 de 10 clases de la meta semanal del grupo)" o "50% (1/2 sesiones reservadas)". */
export function textoAsistencia(a: AsistenciaResumen): string {
  return a.porMeta
    ? `${a.pct}% (${a.asistidas} de ${a.total} clases de la meta semanal del grupo)`
    : `${a.pct}% (${a.asistidas}/${a.total} sesiones reservadas)`;
}
