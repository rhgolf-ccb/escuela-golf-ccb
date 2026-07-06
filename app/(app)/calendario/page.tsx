import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isStaff, type Rol } from "@/lib/roles";
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
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: appUser } = await supabase.from("app_users").select("rol").eq("id", user.id).maybeSingle();
  if (!appUser) redirect("/login");
  const rol = appUser.rol as Rol;
  if (isStaff(rol)) redirect("/programacion");

  const { data: vinculos } = await supabase
    .from("user_estudiantes")
    .select("students(id, full_name, grupo_activo)")
    .eq("user_id", user.id);

  const estudiantes: EstudianteVinculado[] = (vinculos ?? [])
    .map((v) => (Array.isArray(v.students) ? v.students[0] : v.students))
    .filter((s): s is EstudianteVinculado => !!s);

  const eventosBase: EventoCalPadre[] = [];
  const diasSinEscuelaBase: DiaSinEscuelaPadre[] = [];
  let dias: DiaPrograma[] = [];
  let actividades: ActividadEspecialPadre[] = [];

  const admin = createSupabaseAdminClient();

  const { data: eventosRaw } = await admin.from("eventos_calendario").select("id, nombre, fecha_inicio, fecha_fin, descripcion, tipo");
  eventosBase.push(...((eventosRaw ?? []) as EventoCalPadre[]));
  const { data: diasSinEscuelaRaw } = await admin.from("dias_sin_escuela").select("id, fecha_inicio, fecha_fin, motivo");
  diasSinEscuelaBase.push(...((diasSinEscuelaRaw ?? []) as DiaSinEscuelaPadre[]));

  const tipos = Array.from(new Set(estudiantes.map((e) => tipoPlanForGrupo(e.grupo_activo)).filter((t): t is TipoPlan => !!t)));

  if (tipos.length > 0) {
    const inicioVentana = toISODate(addDays(getMonday(new Date()), -14));
    const finVentana = toISODate(addDays(getMonday(new Date()), 35));

    const { data: planes } = await admin
      .from("planes_semanales")
      .select("id, tipo_plan")
      .in("tipo_plan", tipos)
      .gte("semana_inicio", inicioVentana)
      .lte("semana_inicio", finVentana);

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

    const { data: actEsp } = await admin
      .from("actividades_especiales")
      .select("id, nombre, grupos, fecha, hora_inicio, hora_fin")
      .gte("fecha", inicioVentana)
      .lte("fecha", finVentana);

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
