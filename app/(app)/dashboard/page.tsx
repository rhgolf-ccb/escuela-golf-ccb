import Image from "next/image";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getCurrentAppUser } from "@/lib/current-user";
import { Users, Calendar, UserCheck, CalendarCheck, Trophy, CalendarOff, Star, Pin, ChartBar, ChevronDown, type LucideIcon } from "lucide-react";
import WeatherChip from "@/components/WeatherChip";
import DashboardAgendaCard, { type AgendaSesion } from "@/components/DashboardAgendaCard";
import {
  GLASS_CARD, GLASS_PANEL, GLASS_TITLE, GLASS_SUBTITLE, GLASS_MUTED, GLASS_ICON, GLASS_DIVIDER,
} from "@/lib/dashboard-glass";

export const metadata = { title: "Inicio | Escuela de Golf CCB" };

type TipoPlan = "juvenil" | "competencia" | "damas";

// Copiado de ProgramacionModule.tsx (mismo valor) — se duplica en vez de
// importarse porque ese módulo es "use client" y arrastra el cliente de
// Supabase del navegador; ningún otro Server Component de este proyecto
// importa constantes desde un módulo cliente, así que se sigue el mismo
// patrón de duplicación que ya usa CalendarioPadresModule.tsx.
function getMondayISO(fechaISO: string): string {
  const d = new Date(`${fechaISO}T12:00:00`);
  const dia = d.getDay();
  d.setDate(d.getDate() + (dia === 0 ? -6 : 1 - dia));
  return d.toISOString().split("T")[0];
}

function addDaysISO(fechaISO: string, n: number): string {
  const d = new Date(`${fechaISO}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
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

type ModuleCard = { label: string; value: number; icon: LucideIcon };

function ModuleCards({ cards, className }: { cards: ModuleCard[]; className: string }) {
  return (
    <div className={className}>
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className={`${GLASS_CARD} p-3`}>
            <Icon size={18} style={{ color: GLASS_ICON }} />
            <p className="text-2xl font-bold leading-none mt-2" style={{ color: GLASS_TITLE }}>
              {card.value}
            </p>
            <p className="text-[12px] mt-1" style={{ color: GLASS_SUBTITLE }}>
              {card.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// La asistencia real vive en reservas.asistio (boolean nullable), que sólo
// distingue presente / ausente / sin marcar. La tabla `attendance` con sus
// cuatro estados está muerta (RLS sin políticas, filas huérfanas, nadie
// escribe en ella), así que aquí no se usa.
type EstadoAsistencia = "presente" | "ausente" | "sin_marcar";

const ATTENDANCE_LABEL: Record<EstadoAsistencia, string> = {
  presente: "Presente", ausente: "Ausente", sin_marcar: "Sin marcar",
};
const ATTENDANCE_COLOR: Record<EstadoAsistencia, string> = {
  presente: "#16a34a", ausente: "#dc2626", sin_marcar: "#9ca3af",
};
const ATTENDANCE_ORDER: EstadoAsistencia[] = ["presente", "ausente", "sin_marcar"];

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

  const semanaInicio = getMondayISO(hoy);
  const semanaFin = addDaysISO(semanaInicio, 6);

  const formatoDiaMes = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota", day: "numeric", month: "short",
  });
  const rangoSemanaLabel = `Semana del ${formatoDiaMes.format(new Date(`${semanaInicio}T12:00:00`))
    .replace(".", "")} al ${formatoDiaMes.format(new Date(`${semanaFin}T12:00:00`)).replace(".", "")}`;

  const { data: sesionesSemanaRaw } = await supabase
    .from("sesiones_semana")
    .select("id, fecha, hora_inicio, hora_fin, tipo_sesion, lugar, objetivo, planes_semanales(tipo_plan)")
    .gte("fecha", semanaInicio)
    .lte("fecha", semanaFin)
    .order("fecha", { ascending: true })
    .order("hora_inicio", { ascending: true });

  const sesionesSemana: AgendaSesion[] = (sesionesSemanaRaw ?? []).map((s) => {
    const planRel = Array.isArray(s.planes_semanales) ? s.planes_semanales[0] : s.planes_semanales;
    return {
      id: s.id,
      fecha: s.fecha,
      hora_inicio: s.hora_inicio,
      hora_fin: s.hora_fin,
      tipo_sesion: s.tipo_sesion,
      lugar: s.lugar,
      objetivo: s.objetivo,
      tipo_plan: (planRel?.tipo_plan as TipoPlan | undefined) ?? null,
    };
  });
  const sesionesHoy = sesionesSemana.filter((s) => s.fecha === hoy);

  const { data: eventosProximos } = await supabase
    .from("eventos_calendario")
    .select("id, nombre, fecha_inicio, fecha_fin, descripcion, tipo")
    .gte("fecha_inicio", hoy)
    .order("fecha_inicio", { ascending: true })
    .limit(5);

  // Asistencia de la semana en curso: se une con sesiones_semana por sesion_id
  // para poder filtrar por fecha (reservas no guarda la fecha de la sesión).
  const { data: reservasSemana, error: asistenciaError } = await supabase
    .from("reservas")
    .select("asistio, sesiones_semana!inner(fecha)")
    .gte("sesiones_semana.fecha", semanaInicio)
    .lte("sesiones_semana.fecha", semanaFin);

  if (asistenciaError) {
    console.error("Dashboard: no se pudo leer la asistencia de la semana:", asistenciaError.message);
  }

  const attendanceCounts: Record<EstadoAsistencia, number> = { presente: 0, ausente: 0, sin_marcar: 0 };
  for (const row of reservasSemana ?? []) {
    if (row.asistio === true) attendanceCounts.presente++;
    else if (row.asistio === false) attendanceCounts.ausente++;
    else attendanceCounts.sin_marcar++;
  }
  const totalReservasSemana = Object.values(attendanceCounts).reduce((a, b) => a + b, 0);
  // Las reservas sin marcar no entran en el denominador: no sabemos si el
  // jugador asistió o no.
  const totalMarcado = attendanceCounts.presente + attendanceCounts.ausente;
  // null ≠ 0: null es "no pude leer", 0 es "nadie asistió".
  const pctAsistencia = asistenciaError
    ? null
    : totalMarcado > 0
      ? Math.round((attendanceCounts.presente / totalMarcado) * 100)
      : 0;

  const kpis: ModuleCard[] = [
    { label: "Jugadores Activos", value: totalAlumnos ?? 0, icon: Users },
    { label: "Clases Hoy", value: clasesHoy ?? 0, icon: Calendar },
    { label: "Profesores", value: totalStaff ?? 0, icon: UserCheck },
    { label: "Reservas", value: totalReservas ?? 0, icon: CalendarCheck },
  ];

  return (
    <div className="flex flex-col min-h-full">

      {/* FONDO — la foto acompaña todo el scroll del dashboard.
          Se ancla al área de <main> (lg:left-60, el ancho del sidebar sticky)
          en vez de a todo el viewport, así no hace falta subir el z-index del
          Navbar. background-attachment: fixed no sirve aquí: Safari iOS lo
          ignora y perderíamos la optimización de next/image. */}
      <div className="fixed inset-y-0 left-0 right-0 lg:left-60 z-0 bg-sidebar-bg pointer-events-none">
        <Image
          src="/hero-ccb.jpg"
          alt="Country Club de Bogotá"
          fill
          preload
          sizes="100vw"
          quality={85}
          className="object-cover"
          // 70 % baja el encuadre del cielo hacia el campo (mismo valor que
          // usaba el hero de altura fija).
          style={{ objectPosition: "center 70%" }}
        />
        {/* Scrim plano para el contraste del texto */}
        <div className="absolute inset-0 bg-[rgba(10,30,20,0.34)]" />
      </div>

      {/* HERO — pantalla completa */}
      <div className="relative z-10 shrink-0 min-h-screen hero-fullscreen">
        <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20">
          <WeatherChip />
        </div>

        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 sm:px-8 text-center">
          <h1 className="text-2xl sm:text-4xl font-bold text-white drop-shadow">
            {saludo}, {nombre}
          </h1>
          <p className="text-white/80 text-sm sm:text-base mt-1">{fechaLabel}</p>
        </div>

        {/* Tarjetas de módulos — ancladas al pie del hero (tablet y desktop) */}
        <ModuleCards
          cards={kpis}
          className="hidden md:grid absolute bottom-8 left-6 right-6 z-10 grid-cols-2 lg:grid-cols-4 gap-3"
        />

        {/* Indicador de scroll */}
        <div className="absolute inset-x-0 bottom-2 z-10 flex justify-center">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-white/70">
            <ChevronDown size={13} />
            desliza
          </span>
        </div>
      </div>

      {/* CONTENIDO — velo algo más denso que el del hero: aquí el texto es
          pequeño y hay que compensar las zonas claras de la foto. Entra
          progresivamente en los primeros 120 px para que el borde del hero no
          se lea como una banda horizontal. */}
      <div
        className="relative z-10 flex-1 px-4 sm:px-6 py-5 sm:py-6 space-y-5 sm:space-y-6"
        style={{ backgroundImage: "linear-gradient(to bottom, rgba(10,30,20,0) 0px, rgba(10,30,20,0.30) 120px)" }}
      >

        {/* Tarjetas de módulos — en flujo bajo el hero (solo móvil), mismo
            vidrio pero apoyado en el fondo claro de la página */}
        <ModuleCards cards={kpis} className="md:hidden grid grid-cols-1 gap-3" />

        {/* AGENDA + PRÓXIMOS EVENTOS + RESUMEN DE ASISTENCIA */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* AGENDA (hoy / semana) */}
          <DashboardAgendaCard sesionesHoy={sesionesHoy} sesionesSemana={sesionesSemana} fechaLabel={fechaLabel} hoy={hoy} />

          {/* PRÓXIMOS EVENTOS */}
          <div className={`${GLASS_PANEL} border-t-[3px] p-4 sm:p-6`} style={{ borderTopColor: "#f59e0b" }}>
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-4" style={{ color: GLASS_TITLE }}>
              <Trophy size={15} style={{ color: "#b45309" }} />
              Próximos eventos
            </h2>

            {!eventosProximos || eventosProximos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center" style={{ color: GLASS_MUTED }}>
                <CalendarOff size={28} className="mb-2 opacity-40" />
                <p className="text-sm">No hay eventos próximos programados</p>
                <p className="text-xs mt-1 opacity-80">Los eventos que agregues en Programación aparecerán aquí</p>
              </div>
            ) : (
              <div className="space-y-3">
                {eventosProximos.map((e) => {
                  const { dia, mes } = formatFechaEventoCorta(e.fecha_inicio);
                  const esEspecial = e.tipo === "especial";
                  return (
                    <div key={e.id} className="flex gap-3">
                      <div className="w-12 shrink-0 text-center rounded-lg py-1.5 bg-white/50">
                        <p className="text-base font-bold leading-none" style={{ color: GLASS_TITLE }}>{dia}</p>
                        <p className="text-[10px] font-semibold mt-0.5" style={{ color: GLASS_MUTED }}>{mes}</p>
                      </div>
                      <div className="flex-1 min-w-0 pb-3 border-b last:border-0 last:pb-0" style={{ borderColor: GLASS_DIVIDER }}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-semibold" style={{ color: GLASS_TITLE }}>{e.nombre}</p>
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 shrink-0"
                            style={esEspecial ? { background: "#fef3c7", color: "#92400e" } : { background: "#dbeafe", color: "#1e40af" }}
                          >
                            {esEspecial ? <Star size={9} /> : <Pin size={9} />}
                            {esEspecial ? "Especial" : "Institucional"}
                          </span>
                        </div>
                        {e.descripcion && <p className="text-xs mt-1 line-clamp-2" style={{ color: GLASS_MUTED }}>{e.descripcion}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* RESUMEN DE ASISTENCIA */}
          <div className={`${GLASS_PANEL} border-t-[3px] p-4 sm:p-6`} style={{ borderTopColor: "#378ADD" }}>
            <div className="mb-4">
              <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: GLASS_TITLE }}>
                <ChartBar size={15} style={{ color: "#1d5c9e" }} />
                Resumen de asistencia
              </h2>
              <p className="text-xs mt-0.5" style={{ color: GLASS_MUTED }}>{rangoSemanaLabel}</p>
            </div>

            {!asistenciaError && totalReservasSemana === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center" style={{ color: GLASS_MUTED }}>
                <ChartBar size={28} className="mb-2 opacity-40" />
                <p className="text-sm">Aún no hay reservas esta semana</p>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <p className="text-3xl font-bold leading-none" style={{ color: GLASS_TITLE }}>
                    {pctAsistencia === null ? "—" : `${pctAsistencia}%`}
                  </p>
                  <p className="text-xs mt-1" style={{ color: GLASS_MUTED }}>Asistencia de la semana en curso</p>
                </div>

                <div className="flex h-2.5 rounded-full overflow-hidden mb-4 bg-white/50">
                  {ATTENDANCE_ORDER.map((key) => {
                    const count = attendanceCounts[key];
                    if (count === 0) return null;
                    return (
                      <div
                        key={key}
                        style={{ width: `${Math.round((count / totalReservasSemana) * 100)}%`, background: ATTENDANCE_COLOR[key] }}
                      />
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-1 lg:grid-cols-2 gap-x-3 gap-y-2">
                  {ATTENDANCE_ORDER.map((key) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ATTENDANCE_COLOR[key] }} />
                      <span className="text-xs" style={{ color: GLASS_SUBTITLE }}>{ATTENDANCE_LABEL[key]}</span>
                      <span className="text-xs ml-auto" style={{ color: GLASS_MUTED }}>{attendanceCounts[key]}</span>
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
