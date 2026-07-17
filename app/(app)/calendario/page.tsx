import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getCurrentAppUser } from "@/lib/current-user";
import { isStaff } from "@/lib/roles";
import CalendarioPadresModule, {
  type DiaPrograma, type EventoCalPadre, type DiaSinEscuelaPadre, type ActividadEspecialPadre, type EstudianteVinculado,
} from "@/components/CalendarioPadresModule";

export const metadata = {
  title: "Calendario | Escuela de Golf CCB",
};

type TipoPlan = "juvenil" | "competencia" | "damas";

const CATEGORIA_LABEL: Record<string, string> = { juego_largo: "Juego Largo", juego_corto: "Juego Corto", putt: "Putt" };
const ESPECIAL_LABEL: Record<string, string> = {
  test_tecnico: "Test Técnico", test_fisico: "Test Físico", campo_pacos: "Campo Pacos y Fabios", campo_infantil: "Campo Infantil",
};

function tipoPlanForGrupo(grupo: string | null): TipoPlan | null {
  if (grupo === "Competencia") return "competencia";
  if (grupo === "Damas") return "damas";
  if (grupo && ["Birdies", "Águilas", "Albatros", "+14"].includes(grupo)) return "juvenil";
  return null;
}

// Extrae SOLO los nombres de estación/actividad de una sesión — nunca la
// descripción/instrucciones del drill, que es contenido interno del profesor.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function estacionesDeSesion(s: any): string[] {
  if (Array.isArray(s.estaciones_damas) && s.estaciones_damas.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return s.estaciones_damas.map((e: any) => e.nombre);
  }
  if (s.sesion_juvenil) {
    const sj = s.sesion_juvenil;
    if (sj.tipo === "estaciones" && Array.isArray(sj.estaciones)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return sj.estaciones.map((e: any) => CATEGORIA_LABEL[e.categoria] ?? e.categoria);
    }
    if (sj.tipo === "especial") return [ESPECIAL_LABEL[sj.tipo_especial] ?? sj.tipo_especial];
    if (Array.isArray(sj.actividades)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return sj.actividades.map((a: any) => a.nombre);
    }
  }
  if (Array.isArray(s.drills) && s.drills.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return s.drills.map((d: any) => d.titulo);
  }
  return [];
}

function toISODate(d: Date): string { return d.toISOString().split("T")[0]; }
function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  date.setHours(0, 0, 0, 0);
  return date;
}
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

export default async function CalendarioPage() {
  const currentUser = await getCurrentAppUser();
  if (!currentUser) redirect("/login");
  if (isStaff(currentUser.rol)) redirect("/programacion");

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  // Las tres consultas son independientes entre sí — van en paralelo en vez
  // de en cadena (eventos/días sin escuela son institucionales, no dependen
  // del alumno vinculado).
  const [{ data: vinculos }, { data: eventosRaw }, { data: diasSinEscuelaRaw }] = await Promise.all([
    supabase.from("user_estudiantes").select("students(id, full_name, grupo_activo)").eq("user_id", currentUser.id),
    admin.from("eventos_calendario").select("id, nombre, fecha_inicio, fecha_fin, descripcion, tipo"),
    admin.from("dias_sin_escuela").select("id, fecha_inicio, fecha_fin, motivo"),
  ]);

  const estudiantes: EstudianteVinculado[] = (vinculos ?? [])
    .map((v) => (Array.isArray(v.students) ? v.students[0] : v.students))
    .filter((s): s is EstudianteVinculado => !!s);

  const eventosBase = (eventosRaw ?? []) as EventoCalPadre[];
  const diasSinEscuelaBase = (diasSinEscuelaRaw ?? []) as DiaSinEscuelaPadre[];
  let dias: DiaPrograma[] = [];
  let actividades: ActividadEspecialPadre[] = [];

  const tipos = Array.from(new Set(estudiantes.map((e) => tipoPlanForGrupo(e.grupo_activo)).filter((t): t is TipoPlan => !!t)));

  if (tipos.length > 0) {
    const inicioVentana = toISODate(addDays(getMonday(new Date()), -14));
    const finVentana = toISODate(addDays(getMonday(new Date()), 35));

    // planes y actividades especiales tampoco dependen entre sí — en paralelo.
    const [{ data: planes }, { data: actEsp }] = await Promise.all([
      admin
        .from("planes_semanales")
        .select("id, tipo_plan")
        .in("tipo_plan", tipos)
        .gte("semana_inicio", inicioVentana)
        .lte("semana_inicio", finVentana),
      admin
        .from("actividades_especiales")
        .select("id, nombre, grupos, fecha, hora_inicio, hora_fin")
        .gte("fecha", inicioVentana)
        .lte("fecha", finVentana),
    ]);

    if (planes?.length) {
      const planMap = Object.fromEntries(planes.map((p) => [p.id, p.tipo_plan as TipoPlan]));
      const { data: seses } = await admin
        .from("sesiones_semana")
        .select("plan_id, dia_semana, fecha, tipo_sesion, lugar, hora_inicio, hora_fin, objetivo, drills, sesion_juvenil, estaciones_damas")
        .in("plan_id", planes.map((p) => p.id));

      dias = (seses ?? []).map((s) => ({
        grupo: planMap[s.plan_id],
        dia_semana: s.dia_semana,
        fecha: s.fecha,
        tipo_sesion: s.tipo_sesion,
        lugar: s.lugar,
        hora_inicio: s.hora_inicio,
        hora_fin: s.hora_fin,
        objetivo: s.objetivo,
        estaciones: estacionesDeSesion(s),
      }));
    }

    actividades = (actEsp ?? [])
      .filter((a) => (a.grupos as string[]).some((g) => tipos.includes(g as TipoPlan)))
      .map((a) => ({ id: a.id, nombre: a.nombre, grupos: a.grupos as TipoPlan[], fecha: a.fecha, hora_inicio: a.hora_inicio, hora_fin: a.hora_fin }));
  }

  return (
    <CalendarioPadresModule
      estudiantes={estudiantes}
      dias={dias}
      actividades={actividades}
      eventos={eventosBase}
      diasSinEscuela={diasSinEscuelaBase}
    />
  );
}
