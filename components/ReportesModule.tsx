"use client";

import { useState, useEffect, useMemo, useRef, useCallback, type ReactNode, Fragment } from "react";
import {
  BarChart3, CalendarCheck, ClipboardCheck, TrendingUp, PieChart, CakeSlice, Radio,
  FileText, Table2, Send, type LucideIcon,
} from "lucide-react";
// El cliente compartido y no uno propio con createClient(): aquel guarda la
// sesión en localStorage, donde no está —vive en la cookie que lee
// createBrowserClient—, así que Reportes consultaba como anónimo. No se notó
// mientras `students` tuvo la lectura abierta; el día que RLS entró en esa
// tabla, la asistencia quedó con sus tarjetas y sus columnas pero sin una sola
// fila de alumnos.
import { supabase } from "@/lib/supabase";
import {
  acentoGrupo, acentoGrupoSuave, calcularGrupo, edadDe,
  tipoPlanDeAlumno, tipoPlanDeGrupo, TIPOS_PLAN, TIPO_PLAN_LABEL, type TipoPlan,
} from "@/lib/grupos";
import {
  lunesDe, META_SEMANAL_COMPETENCIA, metaDeAlumno, metaDeAlumnoEnSemana, metasPorSemana,
} from "@/lib/asistencia-competencia";
import {
  Badge, BarraPct, CAMPO, CampoLabel, ChipGrupo, EmptyState, Encabezado, ErrorState,
  fondoFila, GrupoBadge, Leyenda, Loading, MetricCard, Pagina, Panel, PctBadge,
  Segmented, TH, thStyle, TONO, tonoDePct, Toolbar, WeekNav, type Tono,
} from "@/components/ui/tema";

// ── Constants ────────────────────────────────────────────────────────────────

type Tab = "asistencia" | "tests" | "progreso" | "estadisticas" | "edades" | "live";

// Las seis pestañas responden a tres preguntas distintas y la barra plana las
// mostraba como si fueran seis variantes de lo mismo. Se agrupan por familia:
// el seguimiento del alumno, la foto del padrón y lo que está pasando ahora.
// El orden es el que ya tenían, así que agrupar no mueve nada de sitio.
type Familia = "seguimiento" | "padron" | "vivo";

const FAMILIA_LABEL: Record<Familia, string> = {
  seguimiento: "Seguimiento",
  padron: "Padrón",
  vivo: "Ahora",
};

const TABS: { id: Tab; label: string; icon: LucideIcon; familia: Familia; hint: string }[] = [
  { id: "asistencia",   label: "Asistencia",   icon: CalendarCheck,  familia: "seguimiento", hint: "Quién vino a cada sesión" },
  { id: "tests",        label: "Tests",        icon: ClipboardCheck, familia: "seguimiento", hint: "Cobertura de evaluaciones" },
  { id: "progreso",     label: "Progreso",     icon: TrendingUp,     familia: "seguimiento", hint: "Tendencia semana a semana" },
  { id: "estadisticas", label: "Estadísticas", icon: PieChart,       familia: "padron",      hint: "Resumen por grupo" },
  { id: "edades",       label: "Edades",       icon: CakeSlice,      familia: "padron",      hint: "Listado para armar grupos" },
  { id: "live",         label: "Reserva live", icon: Radio,          familia: "vivo",        hint: "Inscritos de la semana en curso" },
];

const MESES_ES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMondayOf(d: Date): Date {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// La fecha del calendario local, no la de UTC. Con toISOString() cualquier hora
// después de las 7:00 p. m. en Bogotá ya cae en el día siguiente, y `toISO(new
// Date())` devolvía mañana: la meta de Competencia empezaba a cobrar sesiones
// que aún no se dictan justo a la hora en que el profesor revisa después de
// clase.
function toISO(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, mo, d] = iso.split("-");
  return `${d} ${MESES_ES[parseInt(mo) - 1].slice(0,3)} ${y}`;
}

function fmtHora(h: string | null | undefined): string {
  if (!h) return "Sin hora";
  return h.slice(0, 5);
}

const grupoTipo = tipoPlanDeGrupo;

function pct(n: number, d: number): number {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

function fmtRango(from: Date, to: Date): string {
  const mf = MESES_ES[from.getMonth()].slice(0, 3);
  const mt = MESES_ES[to.getMonth()].slice(0, 3);
  if (from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()) {
    return `${from.getDate()}–${to.getDate()} ${mt} ${to.getFullYear()}`;
  }
  if (from.getFullYear() === to.getFullYear()) {
    return `${from.getDate()} ${mf} – ${to.getDate()} ${mt} ${to.getFullYear()}`;
  }
  return `${from.getDate()} ${mf} ${from.getFullYear()} – ${to.getDate()} ${mt} ${to.getFullYear()}`;
}

function periodoSubtitle(from: Date, to: Date): string {
  return `Periodo: ${fmtRango(from, to)}`;
}

function weeksInRange(from: Date, to: Date): { inicio: Date; fin: Date }[] {
  const weeks: { inicio: Date; fin: Date }[] = [];
  let cur = getMondayOf(from);
  while (cur <= to) {
    weeks.push({ inicio: new Date(cur), fin: addDays(cur, 6) });
    cur = addDays(cur, 7);
  }
  return weeks;
}

// ── Paginación ───────────────────────────────────────────────────────────────

// PostgREST corta cualquier select en 1000 filas por defecto y no avisa: la
// respuesta llega con `error: null` y la lista simplemente incompleta. El
// padrón ya pasa de 1000 alumnos, así que toda consulta que traiga el listado
// completo tiene que paginarse con .range().
const PAGE_SIZE = 1000;

type PagedResponse<T> = { data: T[] | null; error: { message: string } | null; count?: number | null };

/**
 * Trae todas las páginas de una consulta con .range().
 *
 * La primera página viaja con `count: "exact"`, así que la respuesta ya dice
 * cuántas filas hay en total y el resto de páginas salen a la vez en vez de una
 * detrás de otra. Con la base en São Paulo cada viaje cuesta ~300 ms, y el
 * padrón —1019 alumnos, dos páginas— los pagaba dos veces seguidas.
 *
 * `buildQuery` recibe el rango porque los query builders de PostgREST son de un
 * solo uso: hay que construir uno nuevo en cada llamada.
 *
 * Si una página falla se devuelve el error junto con lo acumulado hasta ahí;
 * quien llama debe mostrarlo en vez de pintar la lista parcial como si
 * estuviera completa.
 */
async function fetchAllPages<T>(
  buildQuery: (desde: number, hasta: number, conCuenta: boolean) => PromiseLike<PagedResponse<T>>
): Promise<{ rows: T[]; error: string | null }> {
  const { data, error, count } = await buildQuery(0, PAGE_SIZE - 1, true);
  if (error) return { rows: [], error: error.message };
  const primera = data ?? [];
  if (primera.length < PAGE_SIZE) return { rows: primera, error: null };

  // Sin cuenta exacta —la consulta no la pidió— no se sabe cuántas páginas
  // faltan, así que se siguen pidiendo una a una como antes.
  if (count == null) {
    const rows = [...primera];
    for (let desde = PAGE_SIZE; ; desde += PAGE_SIZE) {
      const { data: d, error: e } = await buildQuery(desde, desde + PAGE_SIZE - 1, false);
      if (e) return { rows, error: e.message };
      const page = d ?? [];
      rows.push(...page);
      if (page.length < PAGE_SIZE) return { rows, error: null };
    }
  }
  if (count <= PAGE_SIZE) return { rows: primera, error: null };

  const total = count;
  const restantes = await Promise.all(
    Array.from({ length: Math.ceil(total / PAGE_SIZE) - 1 }, (_, i) => {
      const desde = (i + 1) * PAGE_SIZE;
      return buildQuery(desde, desde + PAGE_SIZE - 1, false);
    })
  );
  const fallo = restantes.find((p) => p.error);
  if (fallo) return { rows: primera, error: fallo.error!.message };
  return { rows: [...primera, ...restantes.flatMap((p) => p.data ?? [])], error: null };
}

/**
 * Padrón de alumnos paginado. `soloActivos` replica el .eq("status","activo")
 * que usaban las pestañas que sólo miran el padrón activo.
 *
 * El orden secundario por id no es cosmético: sin un criterio de desempate
 * estable, dos alumnos con el mismo nombre pueden caer en distinta página entre
 * una petición y otra, y la paginación duplicaría una fila y se saltaría otra.
 */
// Cada pestaña monta su propio componente y pedía el padrón otra vez al
// entrar: ~190 KB y casi un segundo por cambio de pestaña, para una lista que
// no cambia mientras se mira un reporte. Se guarda en memoria un rato corto y
// se comparte entre pestañas. Reportes no escribe en `students` —lo único que
// graba es `reservas.asistio`—, así que no hay nada que invalidar; al recargar
// la pantalla el padrón vuelve a pedirse.
const PADRON_TTL_MS = 120_000;
const padronCache = new Map<string, { en: number; promesa: Promise<{ rows: unknown[]; error: string | null }> }>();

function fetchStudents<T = Student>(columnas: string, soloActivos: boolean) {
  const clave = `${columnas}|${soloActivos}`;
  const guardado = padronCache.get(clave);
  if (guardado && Date.now() - guardado.en < PADRON_TTL_MS) {
    return guardado.promesa as Promise<{ rows: T[]; error: string | null }>;
  }

  const promesa = fetchAllPages<T>((desde, hasta, conCuenta) => {
    const q = supabase.from("students").select(columnas, conCuenta ? { count: "exact" } : undefined);
    return (soloActivos ? q.eq("status", "activo") : q)
      .order("full_name").order("id").range(desde, hasta) as unknown as PromiseLike<PagedResponse<T>>;
  }).then((res) => {
    // Un fallo no se cachea: la siguiente pestaña debe poder reintentar.
    if (res.error) padronCache.delete(clave);
    return res;
  });

  padronCache.set(clave, { en: Date.now(), promesa: promesa as Promise<{ rows: unknown[]; error: string | null }> });
  return promesa;
}

// enrollment_date entra porque la meta de Competencia no cobra las semanas
// anteriores a la matrícula del alumno.
const STUDENT_COLS = "id,full_name,birth_date,gender,grupo_activo,status,tiene_talega,enrollment_date";

// ── Selector de periodo ──────────────────────────────────────────────────────

type PeriodMode = "semana" | "periodo";

function PeriodSelector({
  mode, onModeChange, from, to, onApply, weekSlot,
}: {
  mode: PeriodMode;
  onModeChange: (m: PeriodMode) => void;
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
  weekSlot: ReactNode;
}) {
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  function shortcut(kind: "semana" | "mes" | "mesAnterior" | "3meses") {
    const hoy = new Date();
    let f: Date, t: Date;
    if (kind === "semana") { f = getMondayOf(hoy); t = addDays(f, 6); }
    else if (kind === "mes") { f = new Date(hoy.getFullYear(), hoy.getMonth(), 1); t = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0); }
    else if (kind === "mesAnterior") { f = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1); t = new Date(hoy.getFullYear(), hoy.getMonth(), 0); }
    else { f = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1); t = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0); }
    const fi = toISO(f), ti = toISO(t);
    setDraftFrom(fi); setDraftTo(ti);
    onApply(fi, ti);
  }

  const ATAJOS = [
    { id: "semana", label: "Esta semana" },
    { id: "mes", label: "Este mes" },
    { id: "mesAnterior", label: "Último mes" },
    { id: "3meses", label: "Últimos 3 meses" },
  ] as const;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <CampoLabel>Periodo</CampoLabel>
        <Segmented
          value={mode}
          onChange={onModeChange}
          options={[{ id: "semana" as const, label: "Semana" }, { id: "periodo" as const, label: "Rango" }]}
        />
        {mode === "semana" ? weekSlot : (
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)}
              className="text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2" style={CAMPO} />
            <span className="text-sm" style={{ color: "var(--ui-text-3)" }}>→</span>
            <input type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)}
              className="text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2" style={CAMPO} />
            <button onClick={() => onApply(draftFrom, draftTo)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-opacity hover:opacity-90"
              style={{ background: "var(--ui-gold)", color: "var(--ui-bg)" }}>
              Aplicar
            </button>
          </div>
        )}
      </div>
      {mode === "periodo" && (
        <div className="flex gap-1.5 flex-wrap">
          {ATAJOS.map((a) => (
            <button key={a.id} onClick={() => shortcut(a.id)}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors hover:bg-(--ui-card-alt)"
              style={{ color: "var(--ui-text-2)", border: "1px solid var(--ui-border)" }}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type GrupoFilter = "todos" | TipoPlan;

function GrupoTabs({ value, onChange }: { value: GrupoFilter; onChange: (v: GrupoFilter) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <CampoLabel>Grupo</CampoLabel>
      <div className="flex gap-1.5 flex-wrap">
        <ChipGrupo label="Todos" grupo={null} active={value === "todos"} onClick={() => onChange("todos")} />
        {TIPOS_PLAN.map((t) => (
          <ChipGrupo key={t} label={TIPO_PLAN_LABEL[t]} grupo={t} active={value === t} onClick={() => onChange(t)} />
        ))}
      </div>
    </div>
  );
}

function AsistioCell({ value, reservaId, onSaved }: { value: boolean | null; reservaId: string; onSaved: (id: string, v: boolean | null) => void }) {
  const [saving, setSaving] = useState(false);
  async function toggle() {
    if (saving) return;
    setSaving(true);
    const next = value === true ? false : value === false ? null : true;
    await supabase.from("reservas").update({ asistio: next }).eq("id", reservaId);
    onSaved(reservaId, next);
    setSaving(false);
  }
  // El punto era de 8px y había que apuntarle: el área clicable sube a 20px sin
  // que el punto crezca, porque la densidad de la rejilla es lo que la hace útil.
  const comun = "w-5 h-5 flex items-center justify-center mx-auto rounded transition-colors hover:bg-(--ui-card-alt)";
  if (value === true) return (
    <button onClick={toggle} disabled={saving} title="Asistió — clic para cambiar" className={comun}>
      <span className="w-2 h-2 rounded-full" style={{ background: "var(--ui-ok)" }} />
    </button>
  );
  if (value === false) return (
    <button onClick={toggle} disabled={saving} title="Ausente — clic para cambiar" className={comun}>
      <span className="w-2 h-2 rounded-full" style={{ background: "var(--ui-bad)" }} />
    </button>
  );
  return (
    <button onClick={toggle} disabled={saving} title="Sin marcar — clic para marcar asistencia" className={comun}>
      <span className="w-2 h-2 rounded-full" style={{ border: "1px solid var(--ui-text-3)" }} />
    </button>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

type Sesion = {
  id: string; dia_semana: string; fecha: string; hora_inicio: string | null;
  hora_fin: string | null; tipo_sesion: string | null; lugar: string | null;
  objetivo: string | null; cupo_maximo: number | null;
  // semana_inicio es el lunes del plan y es opcional porque no todas las
  // pestañas lo piden: la meta de Competencia reparte por él, "Reserva live" no.
  planes_semanales: { tipo_plan: string; semana_inicio?: string | null } | null;
};

type Reserva = {
  id: string; sesion_id: string; estudiante_id: string; estado: string;
  posicion_espera: number | null; created_at: string; asistio: boolean | null;
  // Opcional: solo "Reserva live" necesita el nombre incrustado en la reserva.
  // La pestaña de Asistencia saca los suyos del padrón y no lo pide, que es la
  // mitad del peso de esa respuesta.
  students?: { id: string; full_name: string; grupo_activo: string | null; tiene_talega: string | null } | null;
};

type Student = {
  id: string; full_name: string; birth_date: string | null; gender: string | null;
  grupo_activo: string | null; status: string; tiene_talega: string | null;
  enrollment_date: string | null;
};

// ── Export helpers ───────────────────────────────────────────────────────────

async function exportPDF(title: string, headers: string[], rows: string[][], subtitle?: string) {
  const { generateCCBPdf } = await import("@/lib/pdf-generator");
  const esc = (v: unknown) => String(v ?? "—").replace(/\|/g, "/").replace(/\n/g, " ");
  const headerRow = `| ${headers.map(esc).join(" | ")} |`;
  const sepRow = `| ${headers.map(() => "---").join(" | ")} |`;
  const dataRows = rows.map((r) => `| ${r.map(esc).join(" | ")} |`);
  const markdown = [headerRow, sepRow, ...dataRows].join("\n");
  generateCCBPdf(markdown, {
    documentName: subtitle ? `${title} — ${subtitle}` : title,
    filenamePrefix: title,
    dense: true,
  });
}

// Excel compacto: fila mínima (14px) y anchos de columna ajustados al contenido,
// para maximizar registros visibles por hoja (estándar de descargables de Reportes).
//
// La librería se carga al pulsar el botón y no con el módulo: son 137 KB
// comprimidos —una cuarta parte de todo el JavaScript de la pantalla— que la
// inmensa mayoría de las visitas nunca usa. El PDF ya se cargaba así.
async function exportExcel(title: string, headers: string[], rows: (string | number)[][], subtitle?: string) {
  const XLSX = await import("xlsx");
  const aoa: (string | number)[][] = subtitle ? [[title], [subtitle], [], headers, ...rows] : [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!rows"] = aoa.map(() => ({ hpx: 14 }));
  ws["!cols"] = headers.map((h, i) => {
    const maxLen = Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length));
    return { wch: Math.min(Math.max(maxLen + 2, 8), 40) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));
  XLSX.writeFile(wb, `${title.replace(/\s+/g, "_")}_${toISO(new Date())}.xlsx`);
}

function exportWhatsApp(title: string, lines: string[]) {
  const text = `*${title}*\n${lines.join("\n")}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
}

// ── Tab 1: ASISTENCIA ────────────────────────────────────────────────────────

function TabAsistencia() {
  const [monday, setMonday] = useState<Date>(() => getMondayOf(new Date()));
  const [periodMode, setPeriodMode] = useState<PeriodMode>("semana");
  const [rangeFrom, setRangeFrom] = useState<string>(() => toISO(getMondayOf(new Date())));
  const [rangeTo, setRangeTo] = useState<string>(() => toISO(addDays(getMondayOf(new Date()), 6)));
  const [grupo, setGrupo] = useState<GrupoFilter>("todos");
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // effFrom/effTo se memorizan porque son objetos Date: sin esto cambian de
  // identidad en cada render y arrastrarían a todos los useMemo que dependen
  // de ellos.
  const effFrom = useMemo(
    () => (periodMode === "semana" ? monday : new Date(rangeFrom + "T12:00:00")),
    [periodMode, monday, rangeFrom]
  );
  const effTo = useMemo(
    () => (periodMode === "semana" ? addDays(monday, 6) : new Date(rangeTo + "T12:00:00")),
    [periodMode, monday, rangeTo]
  );
  const effFromISO = toISO(effFrom);
  const effToISO = toISO(effTo);
  const rangeDays = Math.round((effTo.getTime() - effFrom.getTime()) / 86400000) + 1;
  const groupByWeek = periodMode === "periodo" && rangeDays > 14;
  const periodoLabel = periodoSubtitle(effFrom, effTo);

  // Las cuatro consultas salen a la vez. Antes las reservas esperaban a que
  // llegaran las sesiones para armar el .in(sesion_id, …), y el padrón entero
  // —956 fichas, 190 KB— viajaba para pintar las ocho filas de una semana. Las
  // reservas se filtran por la fecha de su sesión con un join, así que ya no
  // dependen del primer viaje, y del padrón solo se piden los alumnos que la
  // tabla puede llegar a mostrar:
  //   · los que tienen reserva en el periodo (cualquier grupo), y
  //   · el grupo de Competencia completo, que aparece aunque no haya reservado
  //     nada porque se mide contra la meta del club.
  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError(null);
      const [
        { data: ses, error: sesErr },
        { rows: rv, error: rvErr },
        { data: stsRv, error: stsRvErr },
        { data: stsComp, error: stsCompErr },
      ] = await Promise.all([
        supabase.from("sesiones_semana")
          .select("id,dia_semana,fecha,hora_inicio,hora_fin,tipo_sesion,lugar,objetivo,cupo_maximo,planes_semanales(tipo_plan,semana_inicio)")
          .gte("fecha", effFromISO).lte("fecha", effToISO).order("fecha").order("hora_inicio"),
        fetchAllPages<Reserva>((desde, hasta) =>
          supabase.from("reservas")
            .select("id,sesion_id,estudiante_id,estado,posicion_espera,created_at,asistio,sesiones_semana!inner(fecha)")
            .gte("sesiones_semana.fecha", effFromISO)
            .lte("sesiones_semana.fecha", effToISO)
            .eq("estado", "confirmado")
            .order("id")
            .range(desde, hasta) as unknown as PromiseLike<PagedResponse<Reserva>>
        ),
        supabase.from("students")
          .select(`${STUDENT_COLS},reservas!inner(sesiones_semana!inner(fecha))`)
          .eq("status", "activo")
          .eq("reservas.estado", "confirmado")
          .gte("reservas.sesiones_semana.fecha", effFromISO)
          .lte("reservas.sesiones_semana.fecha", effToISO)
          .order("full_name"),
        supabase.from("students")
          .select(STUDENT_COLS)
          .eq("status", "activo")
          .eq("grupo_activo", "Competencia")
          .order("full_name"),
      ]);
      const err = sesErr?.message ?? rvErr ?? stsRvErr?.message ?? stsCompErr?.message;
      if (err) {
        setLoadError(err);
        setSesiones([]); setStudents([]); setReservas([]);
        setLoading(false);
        return;
      }
      // Un alumno de Competencia con reserva llega por las dos consultas.
      const porId = new Map<string, Student>();
      for (const st of [...((stsRv ?? []) as unknown as Student[]), ...((stsComp ?? []) as unknown as Student[])]) {
        porId.set(st.id, st);
      }
      setSesiones((ses ?? []) as unknown as Sesion[]);
      setStudents([...porId.values()].sort((a, b) => a.full_name.localeCompare(b.full_name)));
      setReservas(rv);
      setLoading(false);
    }
    load();
  }, [periodMode, monday, rangeFrom, rangeTo, effFromISO, effToISO]);

  function handleAsistioSaved(reservaId: string, val: boolean | null) {
    setReservas((prev) => prev.map((r) => r.id === reservaId ? { ...r, asistio: val } : r));
  }

  const sesionesFiltradas = useMemo(() => sesiones.filter((s) => {
    if (grupo === "todos") return true;
    const t = (s.planes_semanales as { tipo_plan: string } | null)?.tipo_plan;
    return t === grupo;
  }), [sesiones, grupo]);

  // Un Set en vez del sesionesFiltradas.some(...) que se repetía en cada
  // filtro: era O(reservas × sesiones) y se recalculaba en cada render, incluido
  // cada toggle de asistencia.
  const sesionIdsFiltradas = useMemo(
    () => new Set(sesionesFiltradas.map((s) => s.id)),
    [sesionesFiltradas]
  );
  const reservasEnRango = useMemo(
    () => reservas.filter((r) => sesionIdsFiltradas.has(r.sesion_id)),
    [reservas, sesionIdsFiltradas]
  );

  // Índices por alumno y por sesión: la tabla los consulta una vez por fila y
  // por celda, y sin ellos cada consulta recorría el arreglo entero.
  const reservasPorAlumno = useMemo(() => {
    const m = new Map<string, Reserva[]>();
    for (const r of reservasEnRango) {
      const arr = m.get(r.estudiante_id);
      if (arr) arr.push(r); else m.set(r.estudiante_id, [r]);
    }
    return m;
  }, [reservasEnRango]);

  const reservasPorSesion = useMemo(() => {
    const m = new Map<string, Reserva[]>();
    for (const r of reservas) {
      const arr = m.get(r.sesion_id);
      if (arr) arr.push(r); else m.set(r.sesion_id, [r]);
    }
    return m;
  }, [reservas]);

  // Competencia no se mide contra lo que el alumno reservó sino contra la meta
  // del club — la regla completa está en lib/asistencia-competencia.ts. Con el
  // denominador viejo el mes entero salía en 100 % porque nadie había marcado
  // una sola ausencia, y los que no reservaron nada ni siquiera aparecían.
  const esCompetencia = grupo === "competencia";

  const metasSemana = useMemo(
    () => esCompetencia
      ? metasPorSemana(
          sesionesFiltradas.map((s) => ({
            fecha: s.fecha,
            semanaInicio: s.planes_semanales?.semana_inicio ?? "",
          })),
          toISO(new Date()),
        )
      : new Map<string, number>(),
    [esCompetencia, sesionesFiltradas]
  );

  const metaDe = useCallback(
    (st: Student) => esCompetencia ? metaDeAlumno(metasSemana, st.enrollment_date) : 0,
    [esCompetencia, metasSemana]
  );

  const semanaPorSesion = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sesionesFiltradas) m.set(s.id, s.planes_semanales?.semana_inicio || lunesDe(s.fecha));
    return m;
  }, [sesionesFiltradas]);

  // Asistencias que cuentan para el alumno. En Competencia son solo las de las
  // semanas que también le suman meta: una clase anterior a su matrícula no
  // entra ni arriba ni abajo, igual que en la vista student_metrics.
  const presentesDe = useCallback((st: Student) => {
    const asistio = (reservasPorAlumno.get(st.id) ?? []).filter((r) => r.asistio === true);
    const desde = st.enrollment_date;
    if (!esCompetencia || !desde) return asistio.length;
    return asistio.filter((r) => (semanaPorSesion.get(r.sesion_id) ?? "") >= desde).length;
  }, [reservasPorAlumno, esCompetencia, semanaPorSesion]);

  // En Competencia el que no reservó nada es justo el que hay que ver, así que
  // la fila existe si tiene meta aunque no tenga ni una reserva. En el resto de
  // grupos la tabla sigue siendo la de siempre: solo quien se inscribió.
  const filasAlumnos = useMemo(() => {
    const conReserva = new Set(reservas.map((r) => r.estudiante_id));
    return students.filter((s) => {
      if (grupo === "todos") return conReserva.has(s.id);
      if (tipoPlanDeAlumno(s) !== grupo) return false;
      if (conReserva.has(s.id)) return true;
      return esCompetencia && metaDe(s) > 0;
    });
  }, [students, reservas, grupo, esCompetencia, metaDe]);

  const { totalInscritos, totalAsistieron, totalAusentes, totalMarcadas } = useMemo(() => ({
    totalInscritos: new Set(reservasEnRango.map((r) => r.estudiante_id)).size,
    totalAsistieron: reservasEnRango.filter((r) => r.asistio === true).length,
    totalAusentes: reservasEnRango.filter((r) => r.asistio === false).length,
    totalMarcadas: reservasEnRango.filter((r) => r.asistio !== null).length,
  }), [reservasEnRango]);

  // Con meta, las asistencias del grupo se suman por alumno de la tabla y no
  // sobre reservasEnRango: esta última incluye a quien vino a una sesión de
  // Competencia sin pertenecer al grupo, que suma al numerador sin sumar meta.
  const { presentesFilas, metaTotal } = useMemo(() => {
    let presentes = 0, meta = 0;
    for (const st of filasAlumnos) {
      presentes += presentesDe(st);
      meta += metaDe(st);
    }
    return { presentesFilas: presentes, metaTotal: meta };
  }, [filasAlumnos, presentesDe, metaDe]);

  // Rango corto: una columna por sesión (editable). Rango largo en modo periodo: una columna por semana (% agregado).
  //
  // `label` es lo que cabe en una columna de la rejilla y `labelLargo` lo que
  // se entiende fuera de ella. Con catorce semanas en pantalla el rango
  // completo ("22/6–28/6") se solapaba con el de la columna vecina, así que la
  // cabecera muestra solo el lunes; el rango entero queda en el title y es el
  // que viaja al PDF y al Excel, donde sí hay sitio y no hay a qué apuntar.
  const columnas: { key: string; label: string; labelLargo: string; sesionIds: string[] }[] = useMemo(() => groupByWeek
    ? weeksInRange(effFrom, effTo).map((w) => {
        const wIni = toISO(w.inicio), wFin = toISO(w.fin);
        return {
          key: wIni,
          label: `${w.inicio.getDate()}/${w.inicio.getMonth() + 1}`,
          labelLargo: `${w.inicio.getDate()}/${w.inicio.getMonth() + 1}–${w.fin.getDate()}/${w.fin.getMonth() + 1}`,
          sesionIds: sesionesFiltradas.filter((s) => s.fecha >= wIni && s.fecha <= wFin).map((s) => s.id),
        };
      })
    : sesionesFiltradas.map((s) => {
        const d = new Date(s.fecha + "T12:00:00");
        const etiqueta = `${d.getDate()}/${d.getMonth() + 1}`;
        return { key: s.id, label: etiqueta, labelLargo: `${etiqueta} ${fmtHora(s.hora_inicio)}`, sesionIds: [s.id] };
      }), [groupByWeek, effFrom, effTo, sesionesFiltradas]);

  // Cada sesión cae en exactamente una columna (la suya, o la semana que la
  // contiene), así que las celdas se llenan con una sola pasada por reservas.
  const colKeyPorSesion = useMemo(() => {
    const m = new Map<string, string>();
    for (const col of columnas) for (const id of col.sesionIds) m.set(id, col.key);
    return m;
  }, [columnas]);

  // Reservas de cada celda (alumno × columna), precalculadas una vez.
  const reservasPorCelda = useMemo(() => {
    const m = new Map<string, Reserva[]>();
    for (const r of reservasEnRango) {
      const colKey = colKeyPorSesion.get(r.sesion_id);
      if (!colKey) continue;
      const k = `${r.estudiante_id}|${colKey}`;
      const arr = m.get(k);
      if (arr) arr.push(r); else m.set(k, [r]);
    }
    return m;
  }, [reservasEnRango, colKeyPorSesion]);

  const celda = (alumnoId: string, colKey: string) => reservasPorCelda.get(`${alumnoId}|${colKey}`) ?? [];
  const reservasDe = (alumnoId: string) => reservasPorAlumno.get(alumnoId) ?? [];

  const headers = ["Nombre", "Grupo", ...columnas.map((c) => c.labelLargo), esCompetencia ? "Asist./Meta" : "Total", "% Asist."];

  // Lo que va en la penúltima columna y en el %: en Competencia, asistencias
  // sobre la meta del periodo; en el resto, asistencias sobre lo reservado.
  function totalYPct(st: Student, asistio: number, reservadas: number): { total: string; p: number; base: number } {
    const base = esCompetencia ? metaDe(st) : reservadas;
    return { total: esCompetencia ? `${asistio}/${base}` : String(reservadas), p: pct(asistio, base), base };
  }

  function doExportPDF() {
    const rows = filasAlumnos.map((st) => {
      const reservasAlumno = reservasDe(st.id);
      const asistio = presentesDe(st);
      const cells = columnas.map((col) => {
        const rCol = celda(st.id, col.key);
        if (groupByWeek) {
          const marcado = rCol.filter((r) => r.asistio !== null).length;
          const asis = rCol.filter((r) => r.asistio === true).length;
          return marcado > 0 ? `${pct(asis, marcado)}%` : "—";
        }
        const r = rCol[0];
        if (!r) return "·";
        if (r.asistio === true) return "✓";
        if (r.asistio === false) return "✗";
        return "—";
      });
      const { total, p } = totalYPct(st, asistio, reservasAlumno.length);
      return [st.full_name, st.grupo_activo ?? "—", ...cells, total, `${p}%`];
    });
    exportPDF("Asistencia", headers, rows, periodoLabel);
  }

  function doExportExcel() {
    const rows = filasAlumnos.map((st) => {
      const reservasAlumno = reservasDe(st.id);
      const asistio = presentesDe(st);
      const cells = columnas.map((col) => {
        const rCol = celda(st.id, col.key);
        if (groupByWeek) {
          const marcado = rCol.filter((r) => r.asistio !== null).length;
          const asis = rCol.filter((r) => r.asistio === true).length;
          return marcado > 0 ? `${pct(asis, marcado)}%` : "—";
        }
        const r = rCol[0];
        if (!r) return "·";
        if (r.asistio === true) return "Asistió";
        if (r.asistio === false) return "Ausente";
        return "Sin marcar";
      });
      const { total, p } = totalYPct(st, asistio, reservasAlumno.length);
      return [st.full_name, st.grupo_activo ?? "—", ...cells, total, p];
    });
    exportExcel("Asistencia", headers, rows, periodoLabel);
  }

  function doExportWhatsApp() {
    const resumen = esCompetencia
      ? `Asistencias: ${presentesFilas} de una meta de ${metaTotal} (${META_SEMANAL_COMPETENCIA} por semana) — ${pctGlobal}%`
      : `Inscritos: ${totalInscritos} | Asistieron: ${totalAsistieron} | Ausentes: ${totalAusentes}`;
    const lines = [periodoLabel, resumen,
      "", ...filasAlumnos.slice(0, 30).map((st) => {
        const rv = reservasDe(st.id);
        const a = presentesDe(st);
        const { base } = totalYPct(st, a, rv.length);
        return `• ${st.full_name}: ${a}/${base} (${pct(a, base)}%)`;
      })];
    exportWhatsApp(`Asistencia – ${fmtRango(effFrom, effTo)}`, lines);
  }

  const pctGlobal = esCompetencia ? pct(presentesFilas, metaTotal) : pct(totalAsistieron, totalMarcadas);
  // Con el periodo largo la rejilla se va a la derecha y el nombre se pierde:
  // la primera columna se queda pegada al borde izquierdo.
  const nombrePegado: React.CSSProperties = { position: "sticky", left: 0, zIndex: 1 };

  return (
    <div>
      <Toolbar right={<ExportBar pdf={doExportPDF} excel={doExportExcel} whatsapp={doExportWhatsApp} />}>
        <PeriodSelector
          mode={periodMode}
          onModeChange={setPeriodMode}
          from={rangeFrom}
          to={rangeTo}
          onApply={(f, t) => { setRangeFrom(f); setRangeTo(t); }}
          weekSlot={<WeekNav monday={monday} onChange={setMonday} />}
        />
        <GrupoTabs value={grupo} onChange={setGrupo} />
      </Toolbar>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <MetricCard
          label={esCompetencia ? "Alumnos" : "Inscritos"}
          value={esCompetencia ? filasAlumnos.length : totalInscritos}
          sub={fmtRango(effFrom, effTo)} />
        <MetricCard label="Asistieron" value={esCompetencia ? presentesFilas : totalAsistieron} tono="ok"
          sub={esCompetencia
            ? (metaTotal > 0 ? `${pctGlobal}% de una meta de ${metaTotal}` : "sin sesiones dictadas aún")
            : (totalMarcadas > 0 ? `${pctGlobal}% de lo marcado` : "sin marcar aún")} />
        <MetricCard
          label={esCompetencia ? "Bajo la meta" : "Ausencias"}
          value={esCompetencia ? Math.max(0, metaTotal - presentesFilas) : totalAusentes}
          tono={(esCompetencia ? metaTotal - presentesFilas : totalAusentes) > 0 ? "bad" : "neutro"} />
        <MetricCard
          label={groupByWeek ? "Semanas" : "Sesiones"}
          value={groupByWeek ? columnas.length : sesionesFiltradas.length}
          sub={groupByWeek ? "% agregado por semana" : undefined}
        />
      </div>

      {esCompetencia && (
        <p className="text-[11px] mb-4 leading-relaxed" style={{ color: "var(--ui-text-3)" }}>
          En Competencia el % va contra la meta del club — {META_SEMANAL_COMPETENCIA} sesiones por semana — y no contra lo que
          el alumno reservó. Una semana con menos programación baja su meta a las sesiones que se dictaron,
          las que todavía no han pasado no cuentan, y el alumno aparece aunque no haya reservado nada.
        </p>
      )}

      {loading ? <Loading /> : loadError ? (
        <ErrorState msg={loadError} />
      ) : sesionesFiltradas.length === 0 ? (
        <Panel><EmptyState msg="No hay sesiones en el periodo para el grupo seleccionado." /></Panel>
      ) : (
        <Panel>
          <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th className={`${TH} text-left px-2 py-2 w-[170px]`} style={{ ...thStyle, ...nombrePegado, zIndex: 2 }}>Nombre</th>
                <th className={`${TH} text-left px-1.5 py-2 w-24`} style={thStyle}>Grupo</th>
                {columnas.map((c) => {
                  const ses = !groupByWeek ? sesionesFiltradas.find((s) => s.id === c.key) : undefined;
                  return (
                    <th key={c.key} className={`${TH} text-center px-1 py-2 w-9 overflow-hidden`} style={thStyle} title={c.labelLargo}>
                      {c.label}
                      {ses && <><br /><span className="font-medium text-[9px] normal-case tracking-normal opacity-70">{fmtHora(ses.hora_inicio)}</span></>}
                    </th>
                  );
                })}
                <th className={`${TH} text-center px-1.5 py-2 w-12`} style={thStyle}
                  title={esCompetencia ? `Asistencias sobre la meta del periodo (${META_SEMANAL_COMPETENCIA} por semana)` : "Sesiones reservadas"}>
                  {esCompetencia ? "Meta" : "Total"}
                </th>
                <th className={`${TH} text-center px-1.5 py-2 w-14`} style={thStyle}>%</th>
              </tr>
            </thead>
            <tbody>
              {filasAlumnos.length === 0 ? (
                <tr><td colSpan={columnas.length + 4}><EmptyState msg={esCompetencia ? "Sin alumnos de Competencia en el periodo" : "Sin inscritos en el periodo"} /></td></tr>
              ) : filasAlumnos.map((st, i) => {
                const reservasAlumno = reservasDe(st.id);
                const asistio = presentesDe(st);
                const { total: totalCelda, p, base } = totalYPct(st, asistio, reservasAlumno.length);
                const fondo = fondoFila(i);
                return (
                  <tr key={st.id} className="h-8" style={{ background: fondo }}>
                    <td className="px-2 py-1 text-[11px] font-semibold w-[170px] truncate"
                      style={{ ...nombrePegado, background: fondo, color: "var(--ui-text)" }} title={st.full_name}>
                      {st.full_name}
                    </td>
                    <td className="px-1.5 py-1 w-24 truncate"><GrupoBadge grupo={st.grupo_activo} /></td>
                    {columnas.map((col) => {
                      const rCol = celda(st.id, col.key);
                      if (groupByWeek) {
                        const marcado = rCol.filter((r) => r.asistio !== null).length;
                        const asis = rCol.filter((r) => r.asistio === true).length;
                        return (
                          <td key={col.key} className="text-center px-1 py-1 w-9">
                            {marcado > 0 ? <PctBadge value={pct(asis, marcado)} /> : <span className="text-[10px]" style={{ color: "var(--ui-text-3)" }}>—</span>}
                          </td>
                        );
                      }
                      const r = rCol[0];
                      if (!r) return (
                        <td key={col.key} className="text-center px-1 py-1 w-9" title="No estaba inscrito en esta sesión">
                          <span className="w-2 h-2 rounded-full block mx-auto" style={{ background: "var(--ui-border)" }} />
                        </td>
                      );
                      return <td key={col.key} className="text-center px-1 py-1 w-9"><AsistioCell value={r.asistio} reservaId={r.id} onSaved={handleAsistioSaved} /></td>;
                    })}
                    <td className="text-center px-1.5 py-1 text-[11px] tabular-nums w-12" style={{ color: "var(--ui-text-2)" }}>{totalCelda}</td>
                    <td className="text-center px-1.5 py-1 w-14">
                      {/* Meta 0 (semana sin programación, o alumno matriculado después) no es
                          0 % de asistencia: es que no hay nada contra qué medirlo todavía. */}
                      {base > 0
                        ? <PctBadge value={p} />
                        : <span className="text-[10px]" style={{ color: "var(--ui-text-3)" }} title="Sin meta en el periodo">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filasAlumnos.length > 0 && (
              <tfoot>
                <tr className="font-bold" style={{ background: "var(--ui-card-alt)", borderTop: "2px solid var(--ui-border)" }}>
                  <td className={`${TH} px-2 py-2`} style={{ ...nombrePegado, background: "var(--ui-card-alt)", color: "var(--ui-text-2)" }}>Totales</td>
                  <td style={{ background: "var(--ui-card-alt)" }} />
                  {columnas.map((col) => {
                    const rCol = col.sesionIds.flatMap((id) => reservasPorSesion.get(id) ?? []);
                    const total = rCol.length;
                    const asist = rCol.filter((r) => r.asistio === true).length;
                    return (
                      <td key={col.key} className="text-center px-1 py-2 w-9">
                        <span className="text-[10px] tabular-nums" style={{ color: "var(--ui-text-2)" }}>{asist}/{total}</span>
                      </td>
                    );
                  })}
                  <td className="text-center px-1.5 py-2 w-12">
                    {esCompetencia && (
                      <span className="text-[10px] tabular-nums" style={{ color: "var(--ui-text-2)" }}>{presentesFilas}/{metaTotal}</span>
                    )}
                  </td>
                  <td className="text-center px-1.5 py-2 w-14"><PctBadge value={pctGlobal} /></td>
                </tr>
              </tfoot>
            )}
          </table>
          </div>
          <Leyenda items={[
            { color: "var(--ui-ok)", label: "Asistió" },
            { color: "var(--ui-bad)", label: "Ausente" },
            { color: "transparent", borde: "var(--ui-text-3)", label: "Sin marcar — clic para cambiar" },
            { color: "var(--ui-border)", label: esCompetencia ? "No reservó esta sesión" : "No inscrito" },
          ]} />
        </Panel>
      )}
    </div>
  );
}

// ── Tab 3: TESTS ─────────────────────────────────────────────────────────────

type TestStatus = "completo" | "parcial" | "sin" | "na";

const TONO_TEST: Record<Exclude<TestStatus, "na">, { tono: Tono; title: string }> = {
  completo: { tono: "ok",   title: "Completo" },
  parcial:  { tono: "warn", title: "Parcial" },
  sin:      { tono: "bad",  title: "Sin test" },
};

function TestDot({ status }: { status: TestStatus }) {
  if (status === "na") return <span className="text-sm" style={{ color: "var(--ui-text-3)" }} title="No aplica">—</span>;
  const cfg = TONO_TEST[status];
  return (
    <span className="w-4 h-4 rounded-full block mx-auto" title={cfg.title}
      style={{ background: TONO[cfg.tono].fg }} />
  );
}

function TabTests() {
  const [grupo, setGrupo] = useState<GrupoFilter>("todos");
  const [students, setStudents] = useState<Student[]>([]);
  const [swingMap, setSwingMap] = useState<Record<string, { score_promedio: number | null; p1_score: number | null }>>({});
  const [physMap, setPhysMap] = useState<Record<string, boolean>>({});
  const [trackMap, setTrackMap] = useState<Record<string, boolean>>({});
  const [notasMap, setNotasMap] = useState<Record<string, { contenido: string; fecha: string }>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError(null);
      const [{ rows: sts, error: stsErr }, { data: sw }, { data: ph }, { data: tr }, { data: nt }] = await Promise.all([
        fetchStudents(STUDENT_COLS, true),
        supabase.from("swing_evaluations").select("student_id,score_promedio,p1_score,created_at").order("created_at", { ascending: false }),
        supabase.from("physical_tests").select("student_id,tpi_summary,created_at").order("created_at", { ascending: false }),
        supabase.from("trackman_sessions").select("alumno_id,created_at").order("created_at", { ascending: false }),
        supabase.from("notas_profesor").select("alumno_id,contenido,fecha,created_at").order("created_at", { ascending: false }),
      ]);
      if (stsErr) {
        setLoadError(stsErr);
        setStudents([]);
        setLoading(false);
        return;
      }
      setStudents(sts);
      const swMap: Record<string, { score_promedio: number | null; p1_score: number | null }> = {};
      (sw ?? []).forEach((s: { student_id: string; score_promedio: number | null; p1_score: number | null }) => { if (!swMap[s.student_id]) swMap[s.student_id] = s; });
      setSwingMap(swMap);
      const phMap: Record<string, boolean> = {};
      (ph ?? []).forEach((p: { student_id: string; tpi_summary: unknown }) => { if (!phMap[p.student_id]) phMap[p.student_id] = !!p.tpi_summary; });
      setPhysMap(phMap);
      const tkMap: Record<string, boolean> = {};
      (tr ?? []).forEach((t: { alumno_id: string }) => { tkMap[t.alumno_id] = true; });
      setTrackMap(tkMap);
      const ntMap: Record<string, { contenido: string; fecha: string }> = {};
      (nt ?? []).forEach((n: { alumno_id: string; contenido: string; fecha: string }) => { if (!ntMap[n.alumno_id]) ntMap[n.alumno_id] = { contenido: n.contenido, fecha: n.fecha }; });
      setNotasMap(ntMap);
      setLoading(false);
    }
    load();
  }, []);

  const studentsFiltrados = useMemo(() => students.filter((s) => {
    if (grupo === "todos") return true;
    return tipoPlanDeAlumno(s) === grupo;
  }), [students, grupo]);

  function getSwingStatus(id: string): TestStatus {
    const sw = swingMap[id];
    if (!sw) return "sin";
    if (sw.score_promedio !== null) return "completo";
    return "parcial";
  }
  function getPhysStatus(id: string): TestStatus {
    if (physMap[id] === undefined) return "sin";
    return physMap[id] ? "completo" : "parcial";
  }
  function getTrackStatus(id: string, grp: string | null): TestStatus {
    const t = grupoTipo(grp);
    if (t !== "competencia" && t !== "damas") return "na";
    return trackMap[id] ? "completo" : "sin";
  }
  function getNotaStatus(id: string): TestStatus {
    return notasMap[id] ? "completo" : "sin";
  }
  function getGeneral(sw: TestStatus, ph: TestStatus, tr: TestStatus, nt: TestStatus): Exclude<TestStatus, "na"> {
    const relevant = [sw, ph, tr !== "na" ? tr : null, nt].filter(Boolean) as TestStatus[];
    if (relevant.every((s) => s === "completo")) return "completo";
    if (relevant.some((s) => s === "completo" || s === "parcial")) return "parcial";
    return "sin";
  }

  function doExportPDF() {
    const rows = studentsFiltrados.map((st) => {
      const sw = getSwingStatus(st.id); const ph = getPhysStatus(st.id); const tr = getTrackStatus(st.id, st.grupo_activo);
      const gen = getGeneral(sw, ph, tr, getNotaStatus(st.id));
      return [st.full_name, st.grupo_activo ?? "—", sw, ph, tr, notasMap[st.id] ? "✓" : "✗", gen];
    });
    exportPDF("Tests", ["Nombre","Grupo","Técnico","Físico TPI","Trackman","Notas","Estado"], rows);
  }
  function doExportExcel() {
    const rows = studentsFiltrados.map((st) => {
      const sw = getSwingStatus(st.id); const ph = getPhysStatus(st.id); const tr = getTrackStatus(st.id, st.grupo_activo);
      const gen = getGeneral(sw, ph, tr, getNotaStatus(st.id));
      return [st.full_name, st.grupo_activo ?? "—", sw, ph, tr, notasMap[st.id] ? "Sí" : "No", gen];
    });
    exportExcel("Tests", ["Nombre","Grupo","Técnico","Físico TPI","Trackman","Notas","Estado"], rows);
  }
  function doExportWhatsApp() {
    const completos = studentsFiltrados.filter((s) => getGeneral(getSwingStatus(s.id), getPhysStatus(s.id), getTrackStatus(s.id, s.grupo_activo), getNotaStatus(s.id)) === "completo").length;
    const lines = [`Alumnos: ${studentsFiltrados.length} | Tests completos: ${completos}`, "",
      ...studentsFiltrados.slice(0, 30).map((st) => {
        const gen = getGeneral(getSwingStatus(st.id), getPhysStatus(st.id), getTrackStatus(st.id, st.grupo_activo), getNotaStatus(st.id));
        return `• ${st.full_name}: ${gen}`;
      })];
    exportWhatsApp("Tests", lines);
  }

  // La tabla contesta "quién tiene qué", pero la pregunta que se hace primero
  // es "cuánto falta". Las cifras van arriba y la tabla queda como detalle.
  const resumen = useMemo(() => {
    let completos = 0, parciales = 0, sinNada = 0;
    for (const st of studentsFiltrados) {
      const gen = getGeneral(getSwingStatus(st.id), getPhysStatus(st.id), getTrackStatus(st.id, st.grupo_activo), getNotaStatus(st.id));
      if (gen === "completo") completos++;
      else if (gen === "parcial") parciales++;
      else sinNada++;
    }
    return { completos, parciales, sinNada };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- los get* leen los mapas de estado, que ya están en las dependencias
  }, [studentsFiltrados, swingMap, physMap, trackMap, notasMap]);

  const columnasTest: { key: string; label: string; sub?: string }[] = [
    { key: "sw", label: "Técnico", sub: "P1–P10" },
    { key: "ph", label: "Físico", sub: "TPI" },
    { key: "tr", label: "Trackman" },
    { key: "nt", label: "Nota", sub: "profesor" },
  ];

  return (
    <div>
      <Toolbar right={<ExportBar pdf={doExportPDF} excel={doExportExcel} whatsapp={doExportWhatsApp} />}>
        <GrupoTabs value={grupo} onChange={setGrupo} />
      </Toolbar>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <MetricCard label="Alumnos activos" value={studentsFiltrados.length} />
        <MetricCard label="Con todo al día" value={resumen.completos} tono="ok"
          sub={studentsFiltrados.length > 0 ? `${pct(resumen.completos, studentsFiltrados.length)}% del grupo` : undefined} />
        <MetricCard label="Pendientes" value={resumen.parciales} tono={resumen.parciales > 0 ? "warn" : "neutro"} sub="les falta algún test" />
        <MetricCard label="Sin ningún test" value={resumen.sinNada} tono={resumen.sinNada > 0 ? "bad" : "neutro"} />
      </div>

      {loading ? <Loading /> : loadError ? <ErrorState msg={loadError} /> : studentsFiltrados.length === 0 ? <Panel><EmptyState msg="No hay alumnos activos." /></Panel> : (
        <Panel>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={`${TH} text-left px-4 py-2.5`} style={thStyle}>Nombre</th>
                <th className={`${TH} text-left px-3 py-2.5`} style={thStyle}>Grupo</th>
                {columnasTest.map((c) => (
                  <th key={c.key} className={`${TH} text-center px-3 py-2.5 w-24`} style={thStyle}>
                    {c.label}
                    {c.sub && <><br /><span className="font-medium text-[9px] normal-case tracking-normal opacity-70">{c.sub}</span></>}
                  </th>
                ))}
                <th className={`${TH} text-center px-3 py-2.5 w-28`} style={thStyle}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {studentsFiltrados.map((st, i) => {
                const sw = getSwingStatus(st.id); const ph = getPhysStatus(st.id);
                const tr = getTrackStatus(st.id, st.grupo_activo); const nt = getNotaStatus(st.id);
                const gen = getGeneral(sw, ph, tr, nt);
                const nota = notasMap[st.id];
                return (
                  <tr key={st.id} style={{ background: fondoFila(i) }}>
                    <td className="px-4 py-2 text-[13px] font-semibold" style={{ color: "var(--ui-text)" }}>{st.full_name}</td>
                    <td className="px-3 py-2"><GrupoBadge grupo={st.grupo_activo} /></td>
                    <td className="text-center px-3 py-2"><TestDot status={sw} /></td>
                    <td className="text-center px-3 py-2"><TestDot status={ph} /></td>
                    <td className="text-center px-3 py-2"><TestDot status={tr} /></td>
                    <td className="text-center px-3 py-2" title={nota ? `${nota.contenido.slice(0,80)} (${nota.fecha})` : ""}><TestDot status={nt} /></td>
                    <td className="text-center px-3 py-2">
                      <Badge
                        label={gen === "completo" ? "Completo" : gen === "parcial" ? "Pendiente" : "Sin tests"}
                        tono={TONO_TEST[gen].tono}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <Leyenda items={[
            { color: TONO.ok.fg, label: "Completo" },
            { color: TONO.warn.fg, label: "Parcial" },
            { color: TONO.bad.fg, label: "Sin test" },
            { color: "transparent", borde: "var(--ui-border)", label: "No aplica — Trackman solo en Competencia y Damas" },
          ]} />
        </Panel>
      )}
    </div>
  );
}

// ── Tab 4: PROGRESO ──────────────────────────────────────────────────────────

// Cada barra se pinta contra la semana anterior: subió, bajó o se mantuvo. La
// primera no tiene con qué compararse, así que va neutra.
function MiniBar({ values, labels }: { values: number[]; labels?: string[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-0.5 h-6">
      {values.map((v, i) => {
        const color = i === 0 ? "var(--ui-text-3)"
          : v > values[i - 1] ? TONO.ok.fg
          : v < values[i - 1] ? TONO.bad.fg
          : TONO.warn.fg;
        return (
          <div key={i} className="w-3 rounded-sm shrink-0"
            style={{ height: `${Math.max(3, (v / max) * 24)}px`, background: color }}
            title={labels?.[i] ? `${labels[i]}: ${v}%` : `${v}%`} />
        );
      })}
    </div>
  );
}

type SemanaProgreso = {
  inicio: string;
  pct: Record<string, number>;
  /** Asistencias del alumno esa semana. */
  presentes: Record<string, number>;
  /** Contra qué se mide: la meta en Competencia, lo reservado en el resto. */
  base: Record<string, number>;
};

function TabProgreso() {
  const [grupo, setGrupo] = useState<GrupoFilter>("todos");
  const [rango, setRango] = useState<4 | 8 | 12>(4);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("semana");
  const [rangeFrom, setRangeFrom] = useState<string>(() => toISO(addDays(getMondayOf(new Date()), -21)));
  const [rangeTo, setRangeTo] = useState<string>(() => toISO(addDays(getMondayOf(new Date()), 6)));
  const [students, setStudents] = useState<Student[]>([]);
  // Además del %, cada semana guarda los números crudos: en Competencia la
  // acumulada es la suma de asistencias sobre la suma de metas, no el promedio
  // de porcentajes semanales — que daría el mismo peso a una semana de una sola
  // sesión que a una completa.
  const [semanas, setSemanas] = useState<SemanaProgreso[]>([]);
  const [swingMap, setSwingMap] = useState<Record<string, number>>({});
  const [physTotal, setPhysTotal] = useState<Record<string, boolean>>({});
  const [notasMap, setNotasMap] = useState<Record<string, { contenido: string; fecha: string }>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError(null);
      const lunesHoy = getMondayOf(new Date());
      const semanasList: string[] = periodMode === "periodo"
        ? weeksInRange(new Date(rangeFrom + "T12:00:00"), new Date(rangeTo + "T12:00:00")).map((w) => toISO(w.inicio)).slice(-12)
        : (() => { const arr: string[] = []; for (let i = rango - 1; i >= 0; i--) arr.push(toISO(addDays(lunesHoy, -i * 7))); return arr; })();
      const primeraSemana = new Date(semanasList[0] + "T12:00:00");
      const ultimaSemanaFin = addDays(new Date(semanasList[semanasList.length - 1] + "T12:00:00"), 6);

      const [{ rows: sts, error: stsErr }, { data: sw }, { data: ph }, { data: nt }, { data: ses }] = await Promise.all([
        fetchStudents(STUDENT_COLS, true),
        supabase.from("swing_evaluations").select("student_id,score_promedio").order("created_at", { ascending: false }),
        supabase.from("physical_tests").select("student_id,tpi_summary").order("created_at", { ascending: false }),
        supabase.from("notas_profesor").select("alumno_id,contenido,fecha,created_at").order("created_at", { ascending: false }),
        supabase.from("sesiones_semana").select("id,fecha,planes_semanales(tipo_plan,semana_inicio)")
          .gte("fecha", toISO(primeraSemana)).lte("fecha", toISO(ultimaSemanaFin)),
      ]);

      if (stsErr) {
        setLoadError(stsErr);
        setStudents([]); setSemanas([]);
        setLoading(false);
        return;
      }

      setStudents(sts);
      const swMap: Record<string, number> = {};
      (sw ?? []).forEach((s: { student_id: string; score_promedio: number | null }) => { if (!swMap[s.student_id] && s.score_promedio !== null) swMap[s.student_id] = 1; });
      (ph ?? []).forEach((p: { student_id: string; tpi_summary: unknown }) => { if (p.tpi_summary) swMap[p.student_id] = (swMap[p.student_id] ?? 0) + 1; });
      setSwingMap(swMap);
      const phMap: Record<string, boolean> = {};
      (ph ?? []).forEach((p: { student_id: string }) => { phMap[p.student_id] = true; });
      setPhysTotal(phMap);
      const ntMap: Record<string, { contenido: string; fecha: string }> = {};
      (nt ?? []).forEach((n: { alumno_id: string; contenido: string; fecha: string }) => { if (!ntMap[n.alumno_id]) ntMap[n.alumno_id] = { contenido: n.contenido, fecha: n.fecha }; });
      setNotasMap(ntMap);

      const sesArr = (ses ?? []) as unknown as { id: string; fecha: string; planes_semanales: { tipo_plan: string; semana_inicio?: string | null } | null }[];
      const sesIds = sesArr.map((s) => s.id);
      if (sesIds.length > 0) {
        // Hasta 12 semanas de reservas de todo el padrón: pasa de 1000 filas sin
        // problema, así que también va paginado.
        type RvProgreso = { estudiante_id: string; sesion_id: string; asistio: boolean | null };
        const { rows: rv, error: rvErr } = await fetchAllPages<RvProgreso>((desde, hasta) =>
          supabase.from("reservas").select("estudiante_id,sesion_id,asistio")
            .in("sesion_id", sesIds).order("sesion_id").order("estudiante_id")
            .range(desde, hasta) as unknown as PromiseLike<PagedResponse<RvProgreso>>
        );
        if (rvErr) {
          setLoadError(rvErr);
          setStudents([]); setSemanas([]);
          setLoading(false);
          return;
        }
        // La meta solo mira las sesiones de Competencia; los demás grupos se
        // siguen midiendo contra lo que cada alumno reservó esa semana.
        const metasComp = metasPorSemana(
          sesArr
            .filter((s) => s.planes_semanales?.tipo_plan === "competencia")
            .map((s) => ({ fecha: s.fecha, semanaInicio: s.planes_semanales?.semana_inicio ?? "" })),
          toISO(new Date()),
        );
        const semanasData = semanasList.map((inicio) => {
          const fin = toISO(addDays(new Date(inicio + "T12:00:00"), 6));
          const sesEnSemana = new Set(sesArr.filter((s) => s.fecha >= inicio && s.fecha <= fin).map((s) => s.id));
          // Índice por alumno: sin él cada semana recorría el arreglo completo
          // de reservas una vez por alumno del padrón.
          const rvPorAlumno = new Map<string, RvProgreso[]>();
          for (const r of rv) {
            if (!sesEnSemana.has(r.sesion_id)) continue;
            const arr = rvPorAlumno.get(r.estudiante_id);
            if (arr) arr.push(r); else rvPorAlumno.set(r.estudiante_id, [r]);
          }
          const pctMap: Record<string, number> = {};
          const presentesMap: Record<string, number> = {};
          const baseMap: Record<string, number> = {};
          for (const st of sts) {
            const rvAlumno = rvPorAlumno.get(st.id) ?? [];
            const asist = rvAlumno.filter((r) => r.asistio === true).length;
            const esComp = tipoPlanDeAlumno(st) === "competencia";
            const base = esComp
              ? metaDeAlumnoEnSemana(metasComp, inicio, st.enrollment_date)
              : rvAlumno.length;
            // Semana anterior a la matrícula: no cuenta ni meta ni asistencias,
            // o la acumulada sumaría arriba sin sumar abajo.
            presentesMap[st.id] = esComp && base === 0 ? 0 : asist;
            baseMap[st.id] = base;
            pctMap[st.id] = base > 0 ? pct(asist, base) : 0;
          }
          return { inicio, pct: pctMap, presentes: presentesMap, base: baseMap };
        });
        setSemanas(semanasData);
      } else {
        setSemanas(semanasList.map((inicio) => ({ inicio, pct: {}, presentes: {}, base: {} })));
      }
      setLoading(false);
    }
    load();
  }, [rango, periodMode, rangeFrom, rangeTo]);

  const studentsFiltrados = useMemo(() => students.filter((s) => {
    if (grupo === "todos") return true;
    return tipoPlanDeAlumno(s) === grupo;
  }), [students, grupo]);

  const periodoLabel = semanas.length > 0
    ? periodoSubtitle(new Date(semanas[0].inicio + "T12:00:00"), addDays(new Date(semanas[semanas.length - 1].inicio + "T12:00:00"), 6))
    : "";

  function getTestFraction(id: string, grp: string | null): string {
    let total = 2; let done = 0;
    if (swingMap[id]) done++;
    if (physTotal[id]) done++;
    const t = grupoTipo(grp);
    if (t === "competencia" || t === "damas") { total++; }
    return `${done}/${total}`;
  }

  // Acumulada: en Competencia son las asistencias sobre las metas sumadas, así
  // una semana sin programación no entra como un 0 que arrastra el promedio. En
  // el resto sigue siendo el promedio de los porcentajes semanales.
  function acumDe(st: Student): number {
    if (tipoPlanDeAlumno(st) === "competencia") {
      let presentes = 0, base = 0;
      for (const s of semanas) { presentes += s.presentes[st.id] ?? 0; base += s.base[st.id] ?? 0; }
      return base > 0 ? pct(presentes, base) : 0;
    }
    const vals = semanas.map((s) => s.pct[st.id] ?? 0);
    return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  }

  function doExportExcel() {
    const rows = studentsFiltrados.map((st) => {
      const vals = semanas.map((s) => s.pct[st.id] ?? 0);
      const acum = acumDe(st);
      const nota = notasMap[st.id];
      return [st.full_name, st.grupo_activo ?? "—", ...vals.map((v) => `${v}%`), `${acum}%`, getTestFraction(st.id, st.grupo_activo), nota ? nota.contenido.slice(0, 60) : "—"];
    });
    const headers = ["Nombre","Grupo",...semanas.map((s) => s.inicio),"Asist. acum.","Tests","Última nota"];
    exportExcel("Progreso", headers, rows, periodoLabel);
  }

  const etiquetasSemana = semanas.map((s) => {
    const d = new Date(s.inicio + "T12:00:00");
    return `${d.getDate()}/${d.getMonth() + 1}`;
  });

  return (
    <div>
      <Toolbar right={<ExportBar excel={doExportExcel} />}>
        <PeriodSelector
          mode={periodMode}
          onModeChange={setPeriodMode}
          from={rangeFrom}
          to={rangeTo}
          onApply={(f, t) => { setRangeFrom(f); setRangeTo(t); }}
          weekSlot={
            <Segmented
              value={rango}
              onChange={setRango}
              options={[
                { id: 4 as const, label: "4 semanas" },
                { id: 8 as const, label: "8 semanas" },
                { id: 12 as const, label: "3 meses" },
              ]}
            />
          }
        />
        <GrupoTabs value={grupo} onChange={setGrupo} />
      </Toolbar>

      {loading ? <Loading /> : loadError ? <ErrorState msg={loadError} /> : studentsFiltrados.length === 0 ? <Panel><EmptyState msg="No hay alumnos activos." /></Panel> : (
        <Panel title="Progreso por alumno"
          sub={grupo === "competencia"
            ? `${periodoLabel} · % contra la meta de ${META_SEMANAL_COMPETENCIA} sesiones por semana`
            : periodoLabel}>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={`${TH} text-left px-4 py-2.5`} style={thStyle}>Nombre</th>
                <th className={`${TH} text-left px-3 py-2.5`} style={thStyle}>Grupo</th>
                <th className={`${TH} text-center px-3 py-2.5 w-32`} style={thStyle}>
                  Tendencia
                  {etiquetasSemana.length > 0 && (
                    <><br /><span className="font-medium text-[9px] normal-case tracking-normal opacity-70">
                      {etiquetasSemana[0]} → {etiquetasSemana[etiquetasSemana.length - 1]}
                    </span></>
                  )}
                </th>
                <th className={`${TH} text-center px-3 py-2.5 w-40`} style={thStyle}>Asist. acumulada</th>
                <th className={`${TH} text-center px-3 py-2.5 w-16`} style={thStyle}>Tests</th>
                <th className={`${TH} text-left px-3 py-2.5`} style={thStyle}>Última nota</th>
              </tr>
            </thead>
            <tbody>
              {studentsFiltrados.map((st, i) => {
                const vals = semanas.map((s) => s.pct[st.id] ?? 0);
                const acum = acumDe(st);
                const nota = notasMap[st.id];
                return (
                  <tr key={st.id} style={{ background: fondoFila(i) }}>
                    <td className="px-4 py-2 text-[13px] font-semibold" style={{ color: "var(--ui-text)" }}>{st.full_name}</td>
                    <td className="px-3 py-2"><GrupoBadge grupo={st.grupo_activo} /></td>
                    <td className="px-3 py-2"><div className="flex justify-center"><MiniBar values={vals} labels={etiquetasSemana} /></div></td>
                    <td className="px-3 py-2"><BarraPct value={acum} /></td>
                    <td className="text-center px-3 py-2 text-xs tabular-nums" style={{ color: "var(--ui-text-2)" }}>{getTestFraction(st.id, st.grupo_activo)}</td>
                    <td className="px-3 py-2 text-xs max-w-[220px]" style={{ color: "var(--ui-text-2)" }}>
                      {nota ? (
                        <div>
                          <p className="truncate">{nota.contenido.slice(0, 50)}{nota.contenido.length > 50 ? "…" : ""}</p>
                          <p className="text-[10px]" style={{ color: "var(--ui-text-3)" }}>{fmtFecha(nota.fecha)}</p>
                        </div>
                      ) : <span style={{ color: "var(--ui-text-3)" }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <Leyenda items={[
            { color: TONO.ok.fg, label: "Subió respecto a la semana previa" },
            { color: TONO.bad.fg, label: "Bajó" },
            { color: TONO.warn.fg, label: "Se mantuvo" },
            { color: "var(--ui-text-3)", label: "Primera semana del periodo" },
          ]} />
        </Panel>
      )}
    </div>
  );
}

// ── Tab 5: ESTADÍSTICAS ──────────────────────────────────────────────────────

function TabEstadisticas() {
  const [stats, setStats] = useState<{
    totalActivos: number; pctAsistencia: number;
    competencia: number; damas: number;
    porGrupo: { grupo: string; alumnos: number; sesiones: number; asistProm: number; testsCompletos: number }[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError(null);
      const hoy = new Date();
      const lunes4 = toISO(addDays(getMondayOf(hoy), -3 * 7));
      const domingo = toISO(addDays(getMondayOf(hoy), 6));
      type ActivoRow = { id: string; grupo_activo: string | null; birth_date: string | null; gender: string | null; enrollment_date: string | null };
      type RvStats = { sesion_id: string; estudiante_id: string; asistio: boolean | null };
      const [{ rows: activos, error: stsErr }, { data: ses }, { data: sw }] = await Promise.all([
        fetchStudents<ActivoRow>("id,grupo_activo,birth_date,gender,status,tiene_talega,enrollment_date", true),
        supabase.from("sesiones_semana").select("id,fecha,planes_semanales(tipo_plan,semana_inicio)").gte("fecha", lunes4).lte("fecha", domingo),
        supabase.from("swing_evaluations").select("student_id,score_promedio"),
      ]);
      if (stsErr) {
        setLoadError(stsErr);
        setStats(null);
        setLoading(false);
        return;
      }
      const sesArr = (ses ?? []) as unknown as { id: string; fecha: string; planes_semanales: { tipo_plan: string; semana_inicio?: string | null } | null }[];
      const sesIds = sesArr.map((s) => s.id);
      let rv: RvStats[] = [];
      if (sesIds.length > 0) {
        const { rows, error: rvErr } = await fetchAllPages<RvStats>((desde, hasta) =>
          supabase.from("reservas").select("sesion_id,estudiante_id,asistio")
            .in("sesion_id", sesIds).order("sesion_id").order("estudiante_id")
            .range(desde, hasta) as unknown as PromiseLike<PagedResponse<RvStats>>
        );
        if (rvErr) {
          setLoadError(rvErr);
          setStats(null);
          setLoading(false);
          return;
        }
        rv = rows;
      }
      const swArr = (sw ?? []) as { student_id: string; score_promedio: number | null }[];
      const swSet = new Set(swArr.filter((s) => s.score_promedio !== null).map((s) => s.student_id));
      const totalActivos = activos.length;
      const competencia = activos.filter((s) => s.grupo_activo === "Competencia").length;
      const damas = activos.filter((s) => s.grupo_activo === "Damas").length;
      // Competencia se mide contra la meta del club en las mismas 4 semanas de
      // la ventana; el resto de grupos, contra lo que marcó el profesor.
      const sesionesComp = sesArr.filter((s) => s.planes_semanales?.tipo_plan === "competencia");
      const sesionesCompIds = new Set(sesionesComp.map((s) => s.id));
      const metasComp = metasPorSemana(
        sesionesComp.map((s) => ({ fecha: s.fecha, semanaInicio: s.planes_semanales?.semana_inicio ?? "" })),
        toISO(hoy),
      );
      const idsComp = new Set(activos.filter((s) => s.grupo_activo === "Competencia").map((s) => s.id));
      const metaComp = activos
        .filter((s) => idsComp.has(s.id))
        .reduce((suma, s) => suma + metaDeAlumno(metasComp, s.enrollment_date), 0);
      // Solo sesiones de Competencia — una clase suelta de otro plan no cuenta
      // contra una meta que tampoco la incluyó — y solo de semanas que ya le
      // suman meta al alumno: si no, el numerador crece sin que crezca el
      // denominador.
      const semanaDeSesionComp = new Map(sesionesComp.map((s) => [s.id, s.planes_semanales?.semana_inicio || lunesDe(s.fecha)] as const));
      const matriculaComp = new Map(activos.filter((s) => idsComp.has(s.id)).map((s) => [s.id, s.enrollment_date] as const));
      const presentesComp = rv.filter((r) => {
        if (r.asistio !== true || !sesionesCompIds.has(r.sesion_id) || !idsComp.has(r.estudiante_id)) return false;
        const desde = matriculaComp.get(r.estudiante_id);
        return !desde || (semanaDeSesionComp.get(r.sesion_id) ?? "") >= desde;
      }).length;

      // El global mezcla las dos bases a propósito: el denominador es "cuántas
      // asistencias se esperaban", que en Competencia es la meta y en el resto
      // es lo que se marcó.
      const rvOtros = rv.filter((r) => !idsComp.has(r.estudiante_id));
      const marcadasOtros = rvOtros.filter((r) => r.asistio !== null).length;
      const asistidasOtros = rvOtros.filter((r) => r.asistio === true).length;
      const baseGlobal = marcadasOtros + metaComp;
      const pctAsistencia = baseGlobal > 0 ? pct(asistidasOtros + presentesComp, baseGlobal) : 0;

      const grupos = ["Birdies","Águilas","Albatros","+14","Competencia","Damas"];
      const porGrupo = grupos.map((g) => {
        const alumnos = activos.filter((s) => calcularGrupo(s.birth_date, s.gender, s.grupo_activo) === g);
        const ids = new Set(alumnos.map((a) => a.id));
        const rvG = rv.filter((r) => ids.has(r.estudiante_id));
        const asistG = rvG.filter((r) => r.asistio === true).length;
        const marcG = rvG.filter((r) => r.asistio !== null).length;
        const tipo = grupoTipo(g);
        const sesG = sesArr.filter((s) => s.planes_semanales?.tipo_plan === tipo).length;
        const testsG = [...ids].filter((id) => swSet.has(id)).length;
        const asistProm = g === "Competencia" ? pct(presentesComp, metaComp) : pct(asistG, marcG);
        return { grupo: g, alumnos: alumnos.length, sesiones: sesG, asistProm, testsCompletos: testsG };
      }).filter((g) => g.alumnos > 0);
      setStats({ totalActivos, pctAsistencia, competencia, damas, porGrupo });
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <Loading />;
  if (loadError) return <ErrorState msg={loadError} />;
  if (!stats) return <EmptyState msg="No hay datos." />;

  // El padrón repartido por grupo, como una sola barra apilada: es la forma más
  // rápida de ver si un grupo se está comiendo la escuela.
  const totalEnGrupos = stats.porGrupo.reduce((a, g) => a + g.alumnos, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Alumnos activos" value={stats.totalActivos} />
        <MetricCard label="Asistencia prom. 4 sem." value={`${stats.pctAsistencia}%`} tono={tonoDePct(stats.pctAsistencia)}
          sub={`Competencia va contra su meta de ${META_SEMANAL_COMPETENCIA}/semana`} />
        <MetricCard label="Alumnos Competencia" value={stats.competencia} />
        <MetricCard label="Alumnos Damas" value={stats.damas} />
      </div>

      {totalEnGrupos > 0 && (
        <Panel title="Reparto del padrón" sub={`${totalEnGrupos} alumnos activos con grupo`}>
          <div className="px-4 py-4">
            <div className="flex h-3 rounded-full overflow-hidden" style={{ background: "var(--ui-card-alt)" }}>
              {stats.porGrupo.map((g) => (
                <div key={g.grupo}
                  style={{ width: `${(g.alumnos / totalEnGrupos) * 100}%`, background: acentoGrupo(g.grupo) }}
                  title={`${g.grupo}: ${g.alumnos} (${pct(g.alumnos, totalEnGrupos)}%)`} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
              {stats.porGrupo.map((g) => (
                <span key={g.grupo} className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--ui-text-2)" }}>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: acentoGrupo(g.grupo) }} />
                  {g.grupo}
                  <span className="tabular-nums" style={{ color: "var(--ui-text-3)" }}>{g.alumnos}</span>
                </span>
              ))}
            </div>
          </div>
        </Panel>
      )}

      <Panel title="Resumen por grupo" sub="últimas 4 semanas">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={`${TH} text-left px-4 py-2.5`} style={thStyle}>Grupo</th>
              <th className={`${TH} text-center px-3 py-2.5`} style={thStyle}>Alumnos</th>
              <th className={`${TH} text-center px-3 py-2.5`} style={thStyle}>Sesiones</th>
              <th className={`${TH} text-center px-3 py-2.5 w-40`} style={thStyle}>Asist. promedio</th>
              <th className={`${TH} text-center px-3 py-2.5`} style={thStyle}>Tests técnicos</th>
            </tr>
          </thead>
          <tbody>
            {stats.porGrupo.map((g, i) => (
              <tr key={g.grupo} style={{ background: fondoFila(i) }}>
                <td className="px-4 py-2.5"><GrupoBadge grupo={g.grupo} /></td>
                <td className="text-center px-3 py-2.5 tabular-nums" style={{ color: "var(--ui-text)" }}>{g.alumnos}</td>
                <td className="text-center px-3 py-2.5 tabular-nums" style={{ color: "var(--ui-text-2)" }}>{g.sesiones}</td>
                <td className="px-3 py-2.5"><BarraPct value={g.asistProm} /></td>
                <td className="text-center px-3 py-2.5 tabular-nums" style={{ color: "var(--ui-text-2)" }}>{g.testsCompletos}/{g.alumnos}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Panel>
    </div>
  );
}

// ── Tab 6: EDADES ────────────────────────────────────────────────────────────

const GRUPOS_EDADES = ["Birdies", "Águilas", "Albatros", "+14", "Competencia", "Damas"] as const;
type GrupoEdad = typeof GRUPOS_EDADES[number];
type EstadoFilter = "todos" | "activos" | "inactivos";

function TabEdades() {
  const [grupoSel, setGrupoSel] = useState<GrupoEdad>("Birdies");
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>("todos");
  const [edadFilter, setEdadFilter] = useState<number | "todas">("todas");
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError(null);
      // Este listado es el que se usa para armar los grupos, así que trae el
      // padrón entero (activos e inactivos) y tiene que venir completo.
      const { rows, error } = await fetchStudents(STUDENT_COLS, false);
      if (error) {
        setLoadError(error);
        setStudents([]);
      } else {
        setStudents(rows);
      }
      setLoading(false);
    }
    load();
  }, []);

  function selectGrupo(g: GrupoEdad) {
    setGrupoSel(g);
    setEdadFilter("todas");
  }

  const showEdadDropdown = grupoSel === "Birdies" || grupoSel === "Águilas" || grupoSel === "Albatros";
  const acento = acentoGrupo(grupoSel);

  // La edad se recalcula muchas veces por alumno (filtro, orden, agrupación,
  // métricas y render), así que se cachea una sola vez por lista.
  const conEdad = useMemo(
    () => students.map((s) => ({ student: s, edad: edadDe(s.birth_date) })),
    [students]
  );

  const porGrupoYEstado = useMemo(() => conEdad.filter(({ student: s }) => {
    if (s.grupo_activo !== grupoSel) return false;
    if (estadoFilter === "activos") return s.status === "activo";
    if (estadoFilter === "inactivos") return s.status === "inactivo";
    return true;
  }), [conEdad, grupoSel, estadoFilter]);

  const edadesDisponibles = useMemo(() => Array.from(
    new Set(porGrupoYEstado.map((e) => e.edad).filter((e): e is number => e !== null))
  ).sort((a, b) => a - b), [porGrupoYEstado]);

  const filteredConEdad = useMemo(() => porGrupoYEstado
    .filter(({ edad }) => {
      if (!showEdadDropdown || edadFilter === "todas") return true;
      return edad === edadFilter;
    })
    .sort((a, b) => {
      const ea = a.edad ?? 999, eb = b.edad ?? 999;
      if (ea !== eb) return ea - eb;
      return a.student.full_name.localeCompare(b.student.full_name);
    }), [porGrupoYEstado, showEdadDropdown, edadFilter]);

  const filtered = useMemo(() => filteredConEdad.map((e) => e.student), [filteredConEdad]);

  const { promedioEdad, menorEdad, mayorEdad } = useMemo(() => {
    const edades = filteredConEdad.map((e) => e.edad).filter((e): e is number => e !== null);
    if (edades.length === 0) return { promedioEdad: null, menorEdad: null, mayorEdad: null };
    return {
      promedioEdad: Math.round((edades.reduce((a, b) => a + b, 0) / edades.length) * 10) / 10,
      menorEdad: Math.min(...edades),
      mayorEdad: Math.max(...edades),
    };
  }, [filteredConEdad]);

  const agrupadoPorEdad = showEdadDropdown && edadFilter === "todas";

  type GrupoEdadRow = { edad: number | null; items: Student[] };
  const grupos: GrupoEdadRow[] = useMemo(() => agrupadoPorEdad
    ? Array.from(
        filteredConEdad.reduce((acc, { student, edad }) => {
          const key = edad === null ? "sinfecha" : String(edad);
          if (!acc.has(key)) acc.set(key, { edad, items: [] });
          acc.get(key)!.items.push(student);
          return acc;
        }, new Map<string, GrupoEdadRow>()).values()
      ).sort((a, b) => (a.edad ?? 999) - (b.edad ?? 999))
    : [{ edad: null, items: filtered }], [agrupadoPorEdad, filteredConEdad, filtered]);

  function doExportPDF() {
    const parts: string[] = [];
    let n = 0;
    grupos.forEach((g) => {
      if (agrupadoPorEdad) parts.push(`### ${g.edad !== null ? `${g.edad} años` : "Sin fecha de nacimiento"} — ${g.items.length} alumno${g.items.length === 1 ? "" : "s"}`);
      parts.push(`| # | Nombre | Fecha de nacimiento | Edad | Estado |`);
      parts.push(`| --- | --- | --- | --- | --- |`);
      g.items.forEach((s) => {
        n++;
        parts.push(`| ${n} | ${s.full_name} | ${fmtFecha(s.birth_date)} | ${edadDe(s.birth_date) ?? "—"} | ${s.status === "activo" ? "Activo" : "Inactivo"} |`);
      });
    });
    import("@/lib/pdf-generator").then(({ generateCCBPdf }) => {
      generateCCBPdf(parts.join("\n"), { documentName: `Listado de edades — ${grupoSel}`, filenamePrefix: `Edades-${grupoSel}`, dense: true });
    });
  }

  function doExportExcel() {
    const rows: (string | number)[][] = [];
    let n = 0;
    grupos.forEach((g) => {
      if (agrupadoPorEdad) rows.push([`${g.edad !== null ? `${g.edad} años` : "Sin fecha"} — ${g.items.length} alumnos`, "", "", "", ""]);
      g.items.forEach((s) => {
        n++;
        rows.push([n, s.full_name, fmtFecha(s.birth_date), edadDe(s.birth_date) ?? "—", s.status === "activo" ? "Activo" : "Inactivo"]);
      });
    });
    exportExcel(`Edades — ${grupoSel}`, ["#", "Nombre", "Fecha de nacimiento", "Edad", "Estado"], rows);
  }

  // Cuántos hay en cada grupo con el filtro de estado puesto, para que el chip
  // diga a dónde vale la pena entrar antes de entrar.
  const conteoPorGrupo = useMemo(() => {
    const m = new Map<string, number>();
    for (const { student: s } of conEdad) {
      if (estadoFilter === "activos" && s.status !== "activo") continue;
      if (estadoFilter === "inactivos" && s.status !== "inactivo") continue;
      if (!s.grupo_activo) continue;
      m.set(s.grupo_activo, (m.get(s.grupo_activo) ?? 0) + 1);
    }
    return m;
  }, [conEdad, estadoFilter]);

  return (
    <div>
      <Toolbar right={
        /* Sin exportar mientras la carga esté fallida: el PDF y el Excel de
           esta pestaña son los que se usan para armar los grupos. */
        loadError ? undefined : <ExportBar pdf={doExportPDF} excel={doExportExcel} />
      }>
        <div className="flex items-center gap-2 flex-wrap">
          <CampoLabel>Grupo</CampoLabel>
          <div className="flex gap-1.5 flex-wrap">
            {GRUPOS_EDADES.map((g) => (
              <ChipGrupo key={g} label={g} grupo={g} active={grupoSel === g}
                count={loadError ? undefined : (conteoPorGrupo.get(g) ?? 0)}
                onClick={() => selectGrupo(g)} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CampoLabel>Estado</CampoLabel>
          <Segmented
            value={estadoFilter}
            onChange={setEstadoFilter}
            options={[
              { id: "todos" as EstadoFilter, label: "Todos" },
              { id: "activos" as EstadoFilter, label: "Activos" },
              { id: "inactivos" as EstadoFilter, label: "Inactivos" },
            ]}
          />
        </div>
        {showEdadDropdown && (
          <select
            value={edadFilter === "todas" ? "todas" : String(edadFilter)}
            onChange={(e) => setEdadFilter(e.target.value === "todas" ? "todas" : Number(e.target.value))}
            className="text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2"
            style={CAMPO}
          >
            <option value="todas">Todas las edades</option>
            {edadesDisponibles.map((e) => <option key={e} value={e}>{e} años</option>)}
          </select>
        )}
      </Toolbar>

      {/* Conteos y promedios se ocultan si la carga falló: sobre un listado que
          no llegó completo serían cifras falsas. */}
      {!loadError && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <MetricCard label={`Alumnos en ${grupoSel}`} value={filtered.length} />
          <MetricCard label="Edad promedio" value={promedioEdad ?? "—"} sub="años" />
          <MetricCard label="Menor edad" value={menorEdad ?? "—"} sub="años" />
          <MetricCard label="Mayor edad" value={mayorEdad ?? "—"} sub="años" />
        </div>
      )}

      {loading ? <Loading /> : loadError ? <ErrorState msg={loadError} /> : filtered.length === 0 ? <Panel><EmptyState msg="No hay alumnos para este filtro." /></Panel> : (
        <Panel
          title={grupoSel}
          sub={`${filtered.length} alumno${filtered.length === 1 ? "" : "s"}${agrupadoPorEdad ? " · agrupados por edad" : ""}`}
        >
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={`${TH} text-center px-2 py-2 w-10`} style={thStyle}>#</th>
                <th className={`${TH} text-left px-2 py-2`} style={thStyle}>Nombre</th>
                <th className={`${TH} text-left px-2 py-2`} style={thStyle}>Fecha de nacimiento</th>
                <th className={`${TH} text-center px-2 py-2 w-16`} style={thStyle}>Edad</th>
                <th className={`${TH} text-center px-2 py-2 w-24`} style={thStyle}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let n = 0;
                return grupos.map((g) => (
                  <Fragment key={g.edad ?? "sinfecha"}>
                    {agrupadoPorEdad && (
                      <tr>
                        <td colSpan={5} className="px-2 py-1.5 text-[11px] font-bold"
                          style={{ background: "var(--ui-card-alt)", color: "var(--ui-text-2)", borderTop: "1px solid var(--ui-border-soft)", borderBottom: "1px solid var(--ui-border-soft)" }}>
                          <span className="inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle" style={{ background: acento }} />
                          {g.edad !== null ? `${g.edad} años` : "Sin fecha"} — {g.items.length} alumno{g.items.length === 1 ? "" : "s"}
                        </td>
                      </tr>
                    )}
                    {g.items.map((s, i) => {
                      n++;
                      return (
                        <tr key={s.id} style={{ background: fondoFila(i) }}>
                          <td className="text-center px-2 py-[3px] text-[11px] tabular-nums" style={{ color: "var(--ui-text-3)" }}>{n}</td>
                          <td className="px-2 py-[3px] text-[11px] font-semibold" style={{ color: "var(--ui-text)" }}>{s.full_name}</td>
                          <td className="px-2 py-[3px] text-[11px]" style={{ color: "var(--ui-text-2)" }}>{fmtFecha(s.birth_date)}</td>
                          <td className="text-center px-2 py-[3px]">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold tabular-nums"
                              style={{ background: acentoGrupoSuave(grupoSel, 18), color: acento }}>
                              {edadDe(s.birth_date) ?? "—"}
                            </span>
                          </td>
                          <td className="text-center px-2 py-[3px]">
                            <Badge label={s.status} tono={s.status === "activo" ? "ok" : "neutro"} />
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ));
              })()}
            </tbody>
          </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

// ── Tab 7: RESERVAS LIVE ─────────────────────────────────────────────────────

// El color de cada plan sale de lib/grupos; aquí solo viven los días en que
// entrena cada uno.
const GRUPOS_LIVE: { id: TipoPlan; dias: string[] }[] = [
  { id: "birdies",     dias: ["martes", "miercoles", "jueves", "sabado", "domingo"] },
  { id: "juvenil",     dias: ["martes", "miercoles", "jueves", "sabado", "domingo"] },
  { id: "competencia", dias: ["martes", "miercoles", "jueves", "sabado"] },
  { id: "damas",       dias: ["viernes"] },
];

const DIA_LABEL: Record<string, string> = { martes: "Martes", miercoles: "Miércoles", jueves: "Jueves", viernes: "Viernes", sabado: "Sábado", domingo: "Domingo" };
const DIA_OFFSET: Record<string, number> = { lunes: 0, martes: 1, miercoles: 2, jueves: 3, viernes: 4, sabado: 5, domingo: 6 };

function TalegaChip({ propia }: { propia: boolean }) {
  const t = propia ? TONO.ok : TONO.neutro;
  return (
    <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
      style={{ background: t.bg, color: t.fg }}>
      {propia ? "Propia" : "Escuela"}
    </span>
  );
}

function DayColumn({
  diaLabel, fecha, sesionesDia, reservasBySesion, acento, esHoy,
}: {
  diaLabel: string; fecha: string; sesionesDia: Sesion[];
  reservasBySesion: Record<string, Reserva[]>; acento: string; esHoy: boolean;
}) {
  const totalReservas = sesionesDia.reduce((sum, s) => sum + (reservasBySesion[s.id]?.length ?? 0), 0);
  return (
    <div className="rounded-xl overflow-hidden flex flex-col min-w-0"
      style={{
        background: "var(--ui-card)",
        // El día de hoy es el que se mira: se marca con el acento del grupo en
        // vez de dejarlo idéntico a los otros seis.
        border: esHoy ? `1px solid ${acento}` : "1px solid var(--ui-border-soft)",
      }}>
      <div className="px-3 py-2" style={{
        background: `color-mix(in srgb, ${acento} ${esHoy ? 16 : 8}%, transparent)`,
        borderBottom: "1px solid var(--ui-border-soft)",
      }}>
        <div className="flex items-baseline justify-between gap-1">
          <span className="text-xs font-bold truncate" style={{ color: acento }}>{diaLabel}</span>
          <span className="text-[10px] shrink-0" style={{ color: "var(--ui-text-3)" }}>{fecha}</span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          {sesionesDia.length === 1 ? (
            <span className="text-[10px]" style={{ color: "var(--ui-text-2)" }}>{fmtHora(sesionesDia[0].hora_inicio)} – {fmtHora(sesionesDia[0].hora_fin)}</span>
          ) : sesionesDia.length > 1 ? (
            <span className="text-[10px]" style={{ color: "var(--ui-text-3)" }}>{sesionesDia.length} horarios</span>
          ) : <span className="text-[10px]" style={{ color: "var(--ui-text-3)" }}>Sin sesión</span>}
          <span className="text-[11px] font-bold tabular-nums" style={{ color: "var(--ui-text)" }}>{totalReservas}</span>
        </div>
      </div>
      <div className="p-2 space-y-2 flex-1">
        {sesionesDia.length === 0 ? (
          <p className="text-[11px] text-center py-4" style={{ color: "var(--ui-text-3)" }}>Sin sesión</p>
        ) : sesionesDia.map((s) => {
          const rv = reservasBySesion[s.id] ?? [];
          return (
            <div key={s.id}>
              {sesionesDia.length > 1 && (
                <p className="text-[10px] font-bold mb-1" style={{ color: "var(--ui-text-3)" }}>{fmtHora(s.hora_inicio)} – {fmtHora(s.hora_fin)}</p>
              )}
              {rv.length === 0 ? (
                <p className="text-[10px] italic mb-1" style={{ color: "var(--ui-text-3)" }}>Sin inscritos</p>
              ) : (
                <div className="space-y-1">
                  {rv.map((r, i) => (
                    <div key={r.id}
                      className="flex items-center justify-between gap-1.5"
                      style={{ padding: "5px", borderRadius: "6px", fontSize: "11px", background: "var(--ui-card-alt)" }}>
                      <span className="truncate flex items-center gap-1 min-w-0" style={{ color: "var(--ui-text)" }}>
                        <span className="shrink-0 tabular-nums" style={{ color: "var(--ui-text-3)" }}>{i + 1}.</span>
                        <span className="truncate">{r.students?.full_name ?? "—"}</span>
                      </span>
                      <TalegaChip propia={r.students?.tiene_talega === "Sí"} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TabReservaLive() {
  const [grupoSel, setGrupoSel] = useState<TipoPlan>("birdies");
  const [monday, setMonday] = useState<Date>(() => getMondayOf(new Date()));
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const grupoCfg = GRUPOS_LIVE.find((g) => g.id === grupoSel)!;
  const sunday = addDays(monday, 6);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data: ses } = await supabase.from("sesiones_semana")
      .select("id,dia_semana,fecha,hora_inicio,hora_fin,tipo_sesion,lugar,objetivo,cupo_maximo,planes_semanales(tipo_plan)")
      .gte("fecha", toISO(monday)).lte("fecha", toISO(addDays(monday, 6))).order("fecha").order("hora_inicio");
    const sesArr = ((ses ?? []) as unknown as Sesion[]).filter((s) => (s.planes_semanales as { tipo_plan: string } | null)?.tipo_plan === grupoSel);
    setSesiones(sesArr);
    const ids = sesArr.map((s) => s.id);
    if (ids.length === 0) { setReservas([]); setLastUpdate(new Date()); setLoading(false); return; }
    const { data: rv } = await supabase.from("reservas")
      .select("id,sesion_id,estudiante_id,estado,posicion_espera,created_at,asistio,students!reservas_estudiante_id_fkey(id,full_name,grupo_activo,tiene_talega)")
      .in("sesion_id", ids).eq("estado", "confirmado").order("created_at");
    setReservas(((rv ?? []) as unknown as Reserva[]).map((r) => ({ ...r, students: Array.isArray(r.students) ? r.students[0] : r.students })));
    setLastUpdate(new Date());
    setLoading(false);
  }, [grupoSel, monday]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount + poll pattern
    fetchAll();
    timerRef.current = setInterval(fetchAll, 30000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchAll]);

  const totalReservas = reservas.length;
  const conTalegaPropia = reservas.filter((r) => r.students?.tiene_talega === "Sí").length;
  const talegaEscuela = totalReservas - conTalegaPropia;
  const secsAgo = Math.floor((new Date().getTime() - lastUpdate.getTime()) / 1000);

  const reservasBySesion: Record<string, Reserva[]> = {};
  reservas.forEach((r) => { (reservasBySesion[r.sesion_id] ??= []).push(r); });

  const columnas = grupoCfg.dias.map((dia) => {
    const fechaDia = addDays(monday, DIA_OFFSET[dia]);
    const sesionesDia = sesiones.filter((s) => s.dia_semana === dia).sort((a, b) => (a.hora_inicio ?? "").localeCompare(b.hora_inicio ?? ""));
    return { dia, label: DIA_LABEL[dia], fecha: fechaDia, sesionesDia };
  });

  function doExportPDF() {
    const rows: string[][] = [];
    columnas.forEach((col) => {
      col.sesionesDia.forEach((s) => {
        (reservasBySesion[s.id] ?? []).forEach((r, i) => {
          rows.push([col.label, `${fmtHora(s.hora_inicio)}–${fmtHora(s.hora_fin)}`, String(i + 1), r.students?.full_name ?? "—", r.students?.tiene_talega === "Sí" ? "Propia" : "Escuela"]);
        });
      });
    });
    exportPDF("Reservas Live", ["Día", "Horario", "#", "Nombre", "Talega"], rows, `${TIPO_PLAN_LABEL[grupoSel]} — ${fmtRango(monday, sunday)}`);
  }
  function doExportExcel() {
    const rows: (string | number)[][] = [];
    columnas.forEach((col) => {
      col.sesionesDia.forEach((s) => {
        (reservasBySesion[s.id] ?? []).forEach((r, i) => {
          rows.push([col.label, `${fmtHora(s.hora_inicio)}–${fmtHora(s.hora_fin)}`, i + 1, r.students?.full_name ?? "—", r.students?.tiene_talega === "Sí" ? "Propia" : "Escuela"]);
        });
      });
    });
    exportExcel("Reservas Live", ["Día", "Horario", "#", "Nombre", "Talega"], rows, `${TIPO_PLAN_LABEL[grupoSel]} — ${fmtRango(monday, sunday)}`);
  }
  function doExportWhatsApp() {
    const lines = [`${TIPO_PLAN_LABEL[grupoSel]} — ${fmtRango(monday, sunday)}`, `Total: ${totalReservas} | Talega propia: ${conTalegaPropia} | Talega escuela: ${talegaEscuela}`, ""];
    columnas.forEach((col) => {
      const total = col.sesionesDia.reduce((sum, s) => sum + (reservasBySesion[s.id]?.length ?? 0), 0);
      if (total === 0) return;
      lines.push(`*${col.label}* (${total})`);
      col.sesionesDia.forEach((s) => {
        (reservasBySesion[s.id] ?? []).forEach((r) => lines.push(`• ${r.students?.full_name ?? "—"} — ${r.students?.tiene_talega === "Sí" ? "Propia" : "Escuela"}`));
      });
    });
    exportWhatsApp("Reservas Live", lines);
  }

  const acento = acentoGrupo(grupoSel);
  const hoyISO = toISO(new Date());

  return (
    <div>
      <Toolbar right={
        <>
          <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--ui-text-3)" }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--ui-bad)" }} />
            En vivo · hace {secsAgo}s
          </span>
          <ExportBar pdf={doExportPDF} excel={doExportExcel} whatsapp={doExportWhatsApp} />
        </>
      }>
        <div className="flex items-center gap-2 flex-wrap">
          <CampoLabel>Grupo</CampoLabel>
          <div className="flex gap-1.5 flex-wrap">
            {GRUPOS_LIVE.map((g) => (
              <ChipGrupo key={g.id} label={TIPO_PLAN_LABEL[g.id]} grupo={g.id}
                active={grupoSel === g.id} onClick={() => setGrupoSel(g.id)} />
            ))}
          </div>
        </div>
        <WeekNav monday={monday} onChange={setMonday} />
      </Toolbar>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <MetricCard label="Total reservas" value={totalReservas} sub={fmtRango(monday, sunday)} />
        <MetricCard label="Con talega propia" value={conTalegaPropia} tono="ok"
          sub={totalReservas > 0 ? `${pct(conTalegaPropia, totalReservas)}% de los inscritos` : undefined} />
        <MetricCard label="Con talega escuela" value={talegaEscuela} tono="neutro"
          sub={talegaEscuela > 0 ? "talegas a preparar" : undefined} />
      </div>

      {loading && sesiones.length === 0 ? <Loading /> : (
        // Las columnas se estrechaban hasta 60px en móvil, donde el nombre de un
        // alumno no cabe. Ahora tienen un mínimo y la semana se desplaza en
        // horizontal; el tope de ancho es para que Damas —un solo día— no se
        // estire a lo ancho de la pantalla.
        <div className="overflow-x-auto pb-1">
          <div className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${columnas.length}, minmax(150px, 1fr))`,
              maxWidth: columnas.length <= 2 ? columnas.length * 300 : undefined,
            }}>
          {columnas.map((col) => {
            const fechaISO = toISO(col.fecha);
            return (
              <DayColumn
                key={col.dia}
                diaLabel={col.label}
                fecha={`${col.fecha.getDate()} ${MESES_ES[col.fecha.getMonth()].slice(0, 3)}`}
                sesionesDia={col.sesionesDia}
                reservasBySesion={reservasBySesion}
                acento={acento}
                esHoy={fechaISO === hoyISO}
              />
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared helpers ───────────────────────────────────────────────────────────

// Los tres formatos salen siempre juntos y competían visualmente con los
// filtros. Agrupados en una sola pieza con icono se leen como una acción, y el
// verde de WhatsApp deja de ser el elemento más llamativo de la pantalla.
function ExportBar({ pdf, excel, whatsapp }: { pdf?: () => void; excel?: () => void; whatsapp?: () => void }) {
  const btn = "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-(--ui-card-alt)";
  return (
    <div className="flex items-stretch rounded-lg overflow-hidden divide-x shrink-0"
      style={{ border: "1px solid var(--ui-border)", borderColor: "var(--ui-border)", color: "var(--ui-text-2)" }}>
      {pdf && <button onClick={pdf} className={btn} style={{ borderColor: "var(--ui-border)" }}><FileText size={13} />PDF</button>}
      {excel && <button onClick={excel} className={btn} style={{ borderColor: "var(--ui-border)" }}><Table2 size={13} />Excel</button>}
      {whatsapp && (
        <button onClick={whatsapp} className={btn} style={{ borderColor: "var(--ui-border)", color: "var(--ui-ok)" }}>
          <Send size={13} />WhatsApp
        </button>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ReportesModule() {
  const [activeTab, setActiveTab] = useState<Tab>("asistencia");
  const tabActual = TABS.find((t) => t.id === activeTab)!;

  // Las familias en el orden en que aparecen en TABS, sin repetirlas.
  const familias = useMemo(() => {
    const vistas: Familia[] = [];
    for (const t of TABS) if (!vistas.includes(t.familia)) vistas.push(t.familia);
    return vistas.map((f) => ({ familia: f, tabs: TABS.filter((t) => t.familia === f) }));
  }, []);

  return (
    <Pagina>
        <Encabezado icono={BarChart3} titulo="Reportes" bajada="Coordinador · Profesores" />

        {/* NAVEGACIÓN POR FAMILIA */}
        <nav className="rounded-xl p-1.5 mb-2 flex items-center gap-1.5 overflow-x-auto"
          style={{ background: "var(--ui-card)", border: "1px solid var(--ui-border)" }}>
          {familias.map(({ familia, tabs }, iFam) => (
            <Fragment key={familia}>
              {iFam > 0 && <span className="w-px self-stretch my-1 shrink-0" style={{ background: "var(--ui-border)" }} />}
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 hidden lg:block"
                  style={{ color: "var(--ui-text-3)" }}>
                  {FAMILIA_LABEL[familia]}
                </span>
                {tabs.map((t) => {
                  const activo = activeTab === t.id;
                  const Icono = t.icon;
                  return (
                    <button key={t.id} onClick={() => setActiveTab(t.id)} title={t.hint}
                      className="px-3 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap flex items-center gap-1.5"
                      style={activo
                        ? { background: "var(--g-juvenil-bg)", color: "var(--g-juvenil-fg)" }
                        : { color: "var(--ui-text-2)" }}>
                      {t.id === "live"
                        ? <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--ui-bad)" }} />
                        : <Icono size={15} />}
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </Fragment>
          ))}
        </nav>

        {/* Qué contesta la pestaña abierta. Con seis pestañas el nombre solo no
            alcanza: "Tests" y "Progreso" suenan intercambiables hasta que se
            entran. */}
        <p className="text-xs mb-5 px-1" style={{ color: "var(--ui-text-3)" }}>{tabActual.hint}</p>

        <div>
          {activeTab === "asistencia" && <TabAsistencia />}
          {activeTab === "tests" && <TabTests />}
          {activeTab === "progreso" && <TabProgreso />}
          {activeTab === "estadisticas" && <TabEstadisticas />}
          {activeTab === "edades" && <TabEdades />}
          {activeTab === "live" && <TabReservaLive />}
        </div>
    </Pagina>
  );
}
