import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Users, Calendar, UserCheck, CalendarCheck, Clock } from "lucide-react";

export const metadata = { title: "Dashboard | Escuela de Golf CCB" };

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

const KPI_COLORS = { verde: "#1B4D2E", azul: "#378ADD", morado: "#7F77DD", coral: "#D85A30" };

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  let nombre = "Director";
  if (user) {
    const { data } = await supabase.from("app_users").select("nombre").eq("id", user.id).maybeSingle();
    nombre = data?.nombre?.split(" ")[0] ?? "Director";
  }

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

  const kpis = [
    { label: "Jugadores Activos", value: totalAlumnos ?? 0, icon: Users, color: KPI_COLORS.verde, bg: "#eaf3ee" },
    { label: "Clases Hoy", value: clasesHoy ?? 0, icon: Calendar, color: KPI_COLORS.azul, bg: "#e6f1fb" },
    { label: "Profesores", value: totalStaff ?? 0, icon: UserCheck, color: KPI_COLORS.morado, bg: "#eeedfe" },
    { label: "Reservas", value: totalReservas ?? 0, icon: CalendarCheck, color: KPI_COLORS.coral, bg: "#faece7" },
  ];

  return (
    <div className="flex flex-col min-h-full">

      {/* HERO */}
      <div className="relative h-[150px] sm:h-[200px] overflow-hidden bg-sidebar-bg shrink-0">
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
        <div className="absolute inset-x-0 bottom-0 px-4 sm:px-8 pb-4 sm:pb-5">
          <h1 className="text-xl sm:text-3xl font-bold text-white drop-shadow">
            {saludo}, {nombre}
          </h1>
          <p className="text-white/80 text-xs sm:text-sm mt-0.5">{fechaLabel}</p>
        </div>
      </div>

      {/* CONTENIDO */}
      <div className="flex-1 px-4 sm:px-6 py-5 sm:py-6 space-y-5 sm:space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div
                key={kpi.label}
                className="rounded-xl p-3 sm:p-3.5 shadow-sm"
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

      </div>
    </div>
  );
}
