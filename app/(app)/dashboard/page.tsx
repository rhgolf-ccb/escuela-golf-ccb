import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Users, Calendar, UserCheck, BarChart2, Clock } from "lucide-react";

export const metadata = { title: "Dashboard | Escuela de Golf CCB" };

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  let nombre = "Director";
  if (user) {
    const { data } = await supabase.from("app_users").select("nombre").eq("id", user.id).maybeSingle();
    nombre = data?.nombre?.split(" ")[0] ?? "Director";
  }

  // KPIs desde Supabase
  const { count: totalAlumnos } = await supabase
    .from("students").select("*", { count: "exact", head: true }).eq("status", "activo");

  const { count: totalStaff } = await supabase
    .from("staff_directorio").select("*", { count: "exact", head: true });

  const hoy = new Date().toISOString().split("T")[0];
  const { count: clasesHoy } = await supabase
    .from("sesiones_semana").select("*", { count: "exact", head: true }).eq("fecha", hoy);

  const hora = new Date().getHours();
  const saludo = hora < 12 ? "Buenos días" : hora < 18 ? "Buenas tardes" : "Buenas noches";
  const emoji = hora < 12 ? "☀️" : hora < 18 ? "⛳" : "🌙";

  const kpis = [
    {
      label: "Jugadores Activos",
      value: totalAlumnos ?? 0,
      icon: Users,
      iconBg: "bg-ccb-green",
    },
    {
      label: "Clases Hoy",
      value: clasesHoy ?? 0,
      icon: Calendar,
      iconBg: "bg-blue-500",
    },
    {
      label: "Profesores",
      value: totalStaff ?? 0,
      icon: UserCheck,
      iconBg: "bg-purple-500",
    },
    {
      label: "Módulos Activos",
      value: 12,
      icon: BarChart2,
      iconBg: "bg-orange-500",
    },
  ];

  const accesosRapidos = [
    { label: "Nuevo Alumno",         href: "/alumnos",      color: "bg-ccb-green hover:bg-ccb-green-light" },
    { label: "Programación",         href: "/programacion", color: "bg-blue-500 hover:bg-blue-600" },
    { label: "Reservas",             href: "/reservas",     color: "bg-purple-500 hover:bg-purple-600" },
    { label: "Registrar Asistencia", href: "/programacion", color: "bg-orange-500 hover:bg-orange-600" },
    { label: "Reportes",             href: "/reportes",     color: "bg-teal-500 hover:bg-teal-600" },
    { label: "Staff",                href: "/staff",        color: "bg-pink-500 hover:bg-pink-600" },
  ];

  return (
    <div className="flex flex-col min-h-full">

      {/* HERO */}
      <div className="relative h-52 overflow-hidden bg-sidebar-bg">
        <img
          src="/hero-ccb.jpg"
          alt="Country Club de Bogotá"
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0f1923]/80 via-[#0f1923]/40 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-center px-8">
          <h1 className="text-3xl font-bold text-white drop-shadow">
            {saludo}, {nombre}! {emoji}
          </h1>
          <p className="text-white/80 mt-1 text-sm">
            Aquí tienes el resumen de tu academia hoy.
          </p>
        </div>
      </div>

      {/* CONTENIDO */}
      <div className="flex-1 px-6 py-6 space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div key={kpi.label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex items-center gap-4 animate-fade-in-up">
                <div className={`w-12 h-12 rounded-xl ${kpi.iconBg} flex items-center justify-center shrink-0`}>
                  <Icon size={22} className="text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{kpi.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* MÓDULOS RÁPIDOS */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock size={15} className="text-ccb-green" />
            Accesos rápidos
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {accesosRapidos.map((acc) => (
              <Link
                key={acc.href + acc.label}
                href={acc.href}
                className={`${acc.color} text-white text-xs font-semibold text-center py-3 px-2 rounded-xl transition-colors shadow-sm`}
              >
                {acc.label}
              </Link>
            ))}
          </div>
        </div>

        {/* PLACEHOLDER módulos futuros */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-6 min-h-48 flex items-center justify-center">
            <p className="text-gray-400 text-sm">📅 Agenda del día — próximamente</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 min-h-48 flex items-center justify-center">
            <p className="text-gray-400 text-sm">⚡ Actividad reciente — próximamente</p>
          </div>
        </div>

      </div>
    </div>
  );
}
