import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getCurrentAppUser } from "@/lib/current-user";
import { Users, Calendar, UserCheck, CalendarCheck, Clock, Trophy, CalendarOff, Star, Pin, ChartBar } from "lucide-react";
import WeatherChip from "@/components/WeatherChip";

export const metadata = { title: "Inicio | Escuela de Golf CCB" };

// Copiados de ProgramacionModule.tsx (mismos valores) — se duplican en vez de
// importarse porque ese módulo es "use client" y arrastra el cliente de
// Supabase del navegador; ningún otro Server Component de este proyecto
// importa constantes desde un módulo cliente, así que se sigue el mismo
// patrón de duplicación que ya usa CalendarioPadresModule.tsx.
type TipoPlan = "juvenil" | "competencia" | "damas";

const TIPO_SESION_LABEL: Record<string, string> = {
  tiro_largo: "Tiro Largo", juego_corto: "Juego Corto", putt: "Putt",
  campo: "Campo", test_tecnico: "Test Técnico", test_fisico: "Test Físico", trabajo_fisico: "Trabajo Físico",
  competencia: "Competencia", damas_estaciones: "Estaciones", juvenil_estaciones: "3 Estaciones",
};
const LUGAR_LABEL: Record<string, string> = {
  campo_practica: "Campo de práctica", putting_green: "Putting Green",
  campo_infantil: "Campo Infantil", campo_pacos_fabios: "Pacos/Fabios",
  campo_completo: "Campo Completo",
};
const TIPO_PLAN_LABEL: Record<TipoPlan, string> = { juvenil: "Juvenil", competencia: "Competencia", damas: "Damas" };
const TIPO_PLAN_COLOR: Record<TipoPlan, string> = { juvenil: "#1B4D2E", competencia: "#1e40af", damas: "#86198f" };

function formatHora(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

function duracionMin(inicio: string | null, fin: string | null): number | null {
  if (!inicio || !fin) return null;
  const [h1, m1] = inicio.split(":").map(Number);
  const [h2, m2] = fin.split(":").map(Number);
  return h2 * 60 + m2 - (h1 * 60 + m1);
}

// Ancla a mediodía para que el día calendario no se corra por la zona
// horaria del proceso que renderiza (mismo problema que ya resolvimos
// para el saludo y "hoy" — aquí además se fija explícitamente Bogotá).
function formatFechaEventoCorta(fecha: string): { dia: string; mes: string } {
  const d = new Date(`${fecha}T12:00:00`);
  const dia = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric" }).format(d);
  const mes = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", month: "short" })
    .format(d).replace(".", "").toUpperCase();
  return { dia, mes };
}

const KPI_COLORS = { verde: "#1B4D2E", azul: "#378ADD", morado: "#7F77DD", coral: "#D85A30" };

const ATTENDANCE_LABEL: Record<string, string> = {
  presente: "Presente", justificado: "Justificado", ausente: "Ausente", sin_reserva: "Sin reserva",
};
const ATTENDANCE_COLOR: Record<string, string> = {
  presente: "#16a34a", justificado: "#378ADD", ausente: "#dc2626", sin_reserva: "#9ca3af",
};
const ATTENDANCE_ORDER = ["presente", "justificado", "ausente", "sin_reserva"];

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const currentUser = await getCurrentAppUser();
  const nombre = currentUser?.nombre?.split(" ")[0] ?? "Director";

  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

  const hora = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", hour: "numeric", hourCycle: "h23" }).format(new Date())
  );
  const saludo = hora < 12 ? "Buenos días" : hora < 18 ? "Buenas tardes" : "Buenas noches";

  const diaSemanaLabel = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "long" }).format(new Date());
  const diaMesLabel = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long" }).format(new Date());
  const fechaLabel = `${diaSemanaLabel} ${diaMesLabel}`;

  const [{ count: totalAlumnos }, { count: clasesHoy }, { count: totalStaff }, { count: totalReservas }] = await Promise.all([
    supabase.from("students").select("*", { count: "exact", head: true }).eq("status", "activo"),
    supabase.from("sesiones_semana").select("*", { count: "exact", head: true }).eq("fecha", hoy),
    supabase.from("staff_directorio").select("*", { count: "exact", head: true }),
    supabase.from("reservas").select("*", { count: "exact", head: true }),
  ]);

  const { data: sesionesHoy } = await supabase
    .from("sesiones_semana")
    .select("id, hora_inicio, hora_fin, tipo_sesion, lugar, objetivo, planes_semanales(tipo_plan)")
    .eq("fecha", hoy)
    .order("hora_inicio", { ascending: true });

  const { data: eventosProximos } = await supabase
    .from("eventos_calendario")
    .select("id, nombre, fecha_inicio, fecha_fin, descripcion, tipo")
    .gte("fecha_inicio", hoy)
    .order("fecha_inicio", { ascending: true })
    .limit(5);

  const { data: attendanceRows } = await supabase.from("attendance").select("status");
  const attendanceCounts: Record<string, number> = { presente: 0, justificado: 0, ausente: 0, sin_reserva: 0 };
  for (const row of attendanceRows ?? []) {
    if (row.status && row.status in attendanceCounts) attendanceCounts[row.status]++;
  }
  const totalAsistencia = Object.values(attendanceCounts).reduce((a, b) => a + b, 0);
  const pctAsistencia = totalAsistencia > 0 ? Math.round((attendanceCounts.presente / totalAsistencia) * 100) : 0;

  const kpis = [
    { label: "Jugadores Activos", value: totalAlumnos ?? 0, icon: Users, color: KPI_COLORS.verde, bg: "#eaf3ee" },
    { label: "Clases Hoy", value: clasesHoy ?? 0, icon: Calendar, color: KPI_COLORS.azul, bg: "#e6f1fb" },
    { label: "Profesores", value: totalStaff ?? 0, icon: UserCheck, color: KPI_COLORS.morado, bg: "#eeedfe" },
    { label: "Reservas", value: totalReservas ?? 0, icon: CalendarCheck, color: KPI_COLORS.coral, bg: "#faece7" },
  ];

  return (
    <div className="flex flex-col min-h-full">

      {/* HERO */}
      <div className="relative shrink-0">
        <div className="relative h-[180px] md:h-[300px] overflow-hidden bg-sidebar-bg">
          <img
            src="/hero-ccb.jpg"
            alt="Country Club de Bogotá"
            className="w-full h-full object-cover"
            style={{ objectPosition: "center 70%" }}
          />
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(15,25,35,0.15), rgba(15,25,35,0.75))" }}
          />
          <div className="absolute inset-x-0 bottom-0 px-4 sm:px-8 pb-4 sm:pb-5 md:pb-20">
            <h1 className="text-xl sm:text-3xl font-bold text-white drop-shadow">
              {saludo}, {nombre}
            </h1>
            <p className="text-white/80 text-xs sm:text-sm mt-0.5">{fechaLabel}</p>
          </div>
        </div>
        <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20">
          <WeatherChip />
        </div>
      </div>

      {/* CONTENIDO */}
      <div className="flex-1 px-4 sm:px-6 py-5 sm:py-6 space-y-5 sm:space-y-6">

        {/* KPIs */}
        <div className="relative z-30 grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 md:-mt-20">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div
                key={kpi.label}
                className="rounded-xl p-3 sm:p-3.5 shadow-sm md:shadow-xl"
                style={{ background: kpi.bg }}
              >
                <div
                  className="w-9 h-9 sm:w-11 sm:h-11 rounded-[10px] flex items-center justify-center mb-2"
                  style={{ background: kpi.color }}
                >
                  <Icon size={20} className="text-white" />
                </div>
                <p className="text-2xl font-bold text-gray-900 leading-none">{kpi.value}</p>
                <p className="text-[12px] sm:text-[13px] text-gray-500 mt-1.5">{kpi.label}</p>
              </div>
            );
          })}
        </div>

        {/* SESIONES DEL DÍA */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Clock size={15} className="text-ccb-green" />
              Agenda del día
            </h2>
            <span className="text-xs text-gray-400">{fechaLabel}</span>
          </div>

          {!sesionesHoy || sesionesHoy.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <Calendar size={28} className="mb-2 opacity-40" />
              <p className="text-sm">No hay sesiones programadas para hoy</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sesionesHoy.map((s) => {
                const planRel = Array.isArray(s.planes_semanales) ? s.planes_semanales[0] : s.planes_semanales;
                const tipoPlan = planRel?.tipo_plan as TipoPlan | undefined;
                const color = tipoPlan ? TIPO_PLAN_COLOR[tipoPlan] : "#9ca3af";
                const dur = duracionMin(s.hora_inicio, s.hora_fin);
                return (
                  <div key={s.id} className="flex gap-3">
                    <div className="w-14 shrink-0 text-right">
                      <p className="text-sm font-bold text-gray-800">{formatHora(s.hora_inicio)}</p>
                      {dur !== null && <p className="text-[10px] text-gray-400">{dur} min</p>}
                    </div>
                    <div className="w-1 rounded-full shrink-0" style={{ background: color }} />
                    <div className="flex-1 min-w-0 pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                      <p className="text-sm font-semibold text-gray-900">
                        {tipoPlan ? `${TIPO_PLAN_LABEL[tipoPlan]} — ` : ""}
                        {TIPO_SESION_LABEL[s.tipo_sesion] ?? s.tipo_sesion}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {LUGAR_LABEL[s.lugar] ?? s.lugar}
                        {s.objetivo ? ` · ${s.objetivo}` : ""}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Link
            href="/programacion"
            className="mt-4 flex items-center justify-center gap-1 text-sm font-semibold text-ccb-green hover:underline"
          >
            Ver programación completa →
          </Link>
        </div>

        {/* PRÓXIMOS EVENTOS + RESUMEN DE ASISTENCIA */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">

          {/* PRÓXIMOS EVENTOS */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
              <Trophy size={15} className="text-ccb-green" />
              Próximos eventos
            </h2>

            {!eventosProximos || eventosProximos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400 text-center">
                <CalendarOff size={28} className="mb-2 opacity-40" />
                <p className="text-sm">No hay eventos próximos programados</p>
                <p className="text-xs text-gray-300 mt-1">Los eventos que agregues en Programación aparecerán aquí</p>
              </div>
            ) : (
              <div className="space-y-3">
                {eventosProximos.map((e) => {
                  const { dia, mes } = formatFechaEventoCorta(e.fecha_inicio);
                  const esEspecial = e.tipo === "especial";
                  return (
                    <div key={e.id} className="flex gap-3">
                      <div className="w-12 shrink-0 text-center rounded-lg py-1.5 bg-gray-50">
                        <p className="text-base font-bold text-gray-800 leading-none">{dia}</p>
                        <p className="text-[10px] font-semibold text-gray-400 mt-0.5">{mes}</p>
                      </div>
                      <div className="flex-1 min-w-0 pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-semibold text-gray-900">{e.nombre}</p>
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 shrink-0"
                            style={esEspecial ? { background: "#fef3c7", color: "#92400e" } : { background: "#dbeafe", color: "#1e40af" }}
                          >
                            {esEspecial ? <Star size={9} /> : <Pin size={9} />}
                            {esEspecial ? "Especial" : "Institucional"}
                          </span>
                        </div>
                        {e.descripcion && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{e.descripcion}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* RESUMEN DE ASISTENCIA */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-6">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ChartBar size={15} className="text-ccb-green" />
                Resumen de asistencia
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Periodo registrado</p>
            </div>

            {totalAsistencia === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400 text-center">
                <ChartBar size={28} className="mb-2 opacity-40" />
                <p className="text-sm">Aún no hay registros de asistencia</p>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <p className="text-3xl font-bold text-gray-900 leading-none">{pctAsistencia}%</p>
                  <p className="text-xs text-gray-400 mt-1">Asistencia</p>
                </div>

                <div className="flex h-2.5 rounded-full overflow-hidden mb-4 bg-gray-100">
                  {ATTENDANCE_ORDER.map((key) => {
                    const count = attendanceCounts[key];
                    if (count === 0) return null;
                    return (
                      <div
                        key={key}
                        style={{ width: `${Math.round((count / totalAsistencia) * 100)}%`, background: ATTENDANCE_COLOR[key] }}
                      />
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  {ATTENDANCE_ORDER.map((key) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ATTENDANCE_COLOR[key] }} />
                      <span className="text-xs text-gray-600">{ATTENDANCE_LABEL[key]}</span>
                      <span className="text-xs text-gray-400 ml-auto">{attendanceCounts[key]}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
