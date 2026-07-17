"use client";

import { useState, useEffect, useRef, useCallback, type ReactNode, Fragment } from "react";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { BarChart3 } from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Constants ────────────────────────────────────────────────────────────────

type Tab = "asistencia" | "tests" | "progreso" | "estadisticas" | "edades" | "live";

const TABS: { id: Tab; label: string }[] = [
  { id: "asistencia", label: "Asistencia" },
  { id: "tests", label: "Tests" },
  { id: "progreso", label: "Progreso" },
  { id: "estadisticas", label: "Estadísticas" },
  { id: "edades", label: "Edades" },
  { id: "live", label: "Reserva live" },
];

const GROUP_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  juvenil:      { bg: "#1B4D2E18", text: "#1B4D2E", border: "#1B4D2E25" },
  competencia:  { bg: "#7d5a0018", text: "#7d5a00", border: "#7d5a0025" },
  damas:        { bg: "#4a107018", text: "#4a1070", border: "#4a107025" },
};

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

function toISO(d: Date): string {
  return d.toISOString().split("T")[0];
}

function calcEdad(birth: string | null): number | null {
  if (!birth) return null;
  const hoy = new Date();
  const nac = new Date(birth);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
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

function grupoTipo(g: string | null): "juvenil" | "competencia" | "damas" | null {
  if (!g) return null;
  if (["Birdies","Águilas","Albatros","+14"].includes(g)) return "juvenil";
  if (g === "Competencia") return "competencia";
  if (g === "Damas") return "damas";
  return null;
}

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

// ── Shared UI components ─────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: "green" | "yellow" | "red" | "gray" | "blue" }) {
  const cls = {
    green:  "bg-green-50 text-green-700 border border-green-200",
    yellow: "bg-yellow-50 text-yellow-700 border border-yellow-200",
    red:    "bg-red-50 text-red-600 border border-red-200",
    gray:   "bg-gray-100 text-gray-500 border border-gray-200",
    blue:   "bg-blue-50 text-blue-700 border border-blue-200",
  }[color];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>{label}</span>;
}

function PctBadge({ value }: { value: number }) {
  const color = value >= 85 ? "green" : value >= 60 ? "yellow" : "red";
  return <Badge label={`${value}%`} color={color} />;
}

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function WeekNav({ monday, onChange }: { monday: Date; onChange: (d: Date) => void }) {
  const sunday = addDays(monday, 6);
  const label = monday.getMonth() === sunday.getMonth()
    ? `${monday.getDate()}–${sunday.getDate()} ${MESES_ES[monday.getMonth()]} ${monday.getFullYear()}`
    : `${monday.getDate()} ${MESES_ES[monday.getMonth()].slice(0,3)} – ${sunday.getDate()} ${MESES_ES[sunday.getMonth()].slice(0,3)} ${monday.getFullYear()}`;
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onChange(addDays(monday, -7))} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <span className="text-sm font-medium text-gray-700 min-w-[200px] text-center">{label}</span>
      <button onClick={() => onChange(addDays(monday, 7))} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>
  );
}

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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button onClick={() => onModeChange("semana")} className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${mode === "semana" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"}`}>Semana</button>
          <button onClick={() => onModeChange("periodo")} className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${mode === "periodo" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"}`}>Periodo</button>
        </div>
        {mode === "semana" ? weekSlot : (
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
            <span className="text-gray-400 text-sm">→</span>
            <input type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
            <button onClick={() => onApply(draftFrom, draftTo)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1B4D2E] text-white">Aplicar</button>
          </div>
        )}
      </div>
      {mode === "periodo" && (
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => shortcut("semana")} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50">Esta semana</button>
          <button onClick={() => shortcut("mes")} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50">Este mes</button>
          <button onClick={() => shortcut("mesAnterior")} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50">Último mes</button>
          <button onClick={() => shortcut("3meses")} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50">Últimos 3 meses</button>
        </div>
      )}
    </div>
  );
}

type GrupoFilter = "todos" | "juvenil" | "competencia" | "damas";
function GrupoTabs({ value, onChange }: { value: GrupoFilter; onChange: (v: GrupoFilter) => void }) {
  const opts: { id: GrupoFilter; label: string; color?: string }[] = [
    { id: "todos", label: "Todos" },
    { id: "juvenil", label: "Juvenil", color: "#1B4D2E" },
    { id: "competencia", label: "Competencia", color: "#7d5a00" },
    { id: "damas", label: "Damas", color: "#4a1070" },
  ];
  return (
    <div className="flex gap-1.5">
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border"
          style={value === o.id && o.color
            ? { backgroundColor: o.color, color: "#fff", borderColor: o.color }
            : value === o.id && !o.color
            ? { backgroundColor: "#1B4D2E", color: "#fff", borderColor: "#1B4D2E" }
            : { backgroundColor: "#fff", color: "#6b7280", borderColor: "#e5e7eb" }
          }
        >{o.label}</button>
      ))}
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
  if (value === true) return (
    <button onClick={toggle} disabled={saving} title="Asistió — clic para cambiar" className="w-2 h-2 rounded-full mx-auto block transition-transform hover:scale-110" style={{ backgroundColor: "#1B4D2E" }} />
  );
  if (value === false) return (
    <button onClick={toggle} disabled={saving} title="Ausente — clic para cambiar" className="w-2 h-2 rounded-full mx-auto block transition-transform hover:scale-110" style={{ backgroundColor: "#e24b4a" }} />
  );
  return (
    <button onClick={toggle} disabled={saving} title="Sin marcar — clic para marcar asistencia" className="w-2 h-2 rounded-full mx-auto block border border-gray-300 hover:border-gray-500 transition-colors" />
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

type Sesion = {
  id: string; dia_semana: string; fecha: string; hora_inicio: string | null;
  hora_fin: string | null; tipo_sesion: string | null; lugar: string | null;
  objetivo: string | null; cupo_maximo: number | null;
  planes_semanales: { tipo_plan: string } | null;
};

type Reserva = {
  id: string; sesion_id: string; estudiante_id: string; estado: string;
  posicion_espera: number | null; created_at: string; asistio: boolean | null;
  students: { id: string; full_name: string; grupo_activo: string | null; tiene_talega: string | null } | null;
};

type Student = {
  id: string; full_name: string; birth_date: string | null;
  grupo_activo: string | null; status: string; tiene_talega: string | null;
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
function exportExcel(title: string, headers: string[], rows: (string | number)[][], subtitle?: string) {
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

  const sunday = addDays(monday, 6);
  const effFrom = periodMode === "semana" ? monday : new Date(rangeFrom + "T12:00:00");
  const effTo = periodMode === "semana" ? sunday : new Date(rangeTo + "T12:00:00");
  const effFromISO = toISO(effFrom);
  const effToISO = toISO(effTo);
  const rangeDays = Math.round((effTo.getTime() - effFrom.getTime()) / 86400000) + 1;
  const groupByWeek = periodMode === "periodo" && rangeDays > 14;
  const periodoLabel = periodoSubtitle(effFrom, effTo);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: ses }, { data: sts }] = await Promise.all([
        supabase.from("sesiones_semana")
          .select("id,dia_semana,fecha,hora_inicio,hora_fin,tipo_sesion,lugar,objetivo,cupo_maximo,planes_semanales(tipo_plan)")
          .gte("fecha", effFromISO).lte("fecha", effToISO).order("fecha").order("hora_inicio"),
        supabase.from("students").select("id,full_name,birth_date,grupo_activo,status,tiene_talega").eq("status", "activo").order("full_name"),
      ]);
      setSesiones((ses ?? []) as unknown as Sesion[]);
      setStudents((sts ?? []) as Student[]);
      if (ses && ses.length > 0) {
        const ids = (ses as unknown as Sesion[]).map((s) => s.id);
        const { data: rv } = await supabase.from("reservas")
          .select("id,sesion_id,estudiante_id,estado,posicion_espera,created_at,asistio,students!reservas_estudiante_id_fkey(id,full_name,grupo_activo,tiene_talega)")
          .in("sesion_id", ids)
          .eq("estado", "confirmado");
        setReservas(((rv ?? []) as unknown as Reserva[]).map((r) => ({ ...r, students: Array.isArray(r.students) ? r.students[0] : r.students })));
      } else {
        setReservas([]);
      }
      setLoading(false);
    }
    load();
  }, [periodMode, monday, rangeFrom, rangeTo]);

  function handleAsistioSaved(reservaId: string, val: boolean | null) {
    setReservas((prev) => prev.map((r) => r.id === reservaId ? { ...r, asistio: val } : r));
  }

  const sesionesFiltradas = sesiones.filter((s) => {
    if (grupo === "todos") return true;
    const t = (s.planes_semanales as { tipo_plan: string } | null)?.tipo_plan;
    if (grupo === "juvenil") return t === "juvenil";
    if (grupo === "competencia") return t === "competencia";
    if (grupo === "damas") return t === "damas";
    return true;
  });

  const studentIds = new Set(reservas.map((r) => r.estudiante_id));
  const studentsConReserva = students.filter((s) => {
    if (!studentIds.has(s.id)) return false;
    if (grupo === "todos") return true;
    const t = grupoTipo(s.grupo_activo);
    return t === grupo;
  });

  const totalInscritos = new Set(reservas.filter((r) => sesionesFiltradas.some((s) => s.id === r.sesion_id)).map((r) => r.estudiante_id)).size;
  const totalAsistieron = reservas.filter((r) => r.asistio === true && sesionesFiltradas.some((s) => s.id === r.sesion_id)).length;
  const totalAusentes = reservas.filter((r) => r.asistio === false && sesionesFiltradas.some((s) => s.id === r.sesion_id)).length;

  // Rango corto: una columna por sesión (editable). Rango largo en modo periodo: una columna por semana (% agregado).
  const columnas: { key: string; label: string; sesionIds: string[] }[] = groupByWeek
    ? weeksInRange(effFrom, effTo).map((w) => {
        const wIni = toISO(w.inicio), wFin = toISO(w.fin);
        return {
          key: wIni,
          label: `${w.inicio.getDate()}/${w.inicio.getMonth() + 1}–${w.fin.getDate()}/${w.fin.getMonth() + 1}`,
          sesionIds: sesionesFiltradas.filter((s) => s.fecha >= wIni && s.fecha <= wFin).map((s) => s.id),
        };
      })
    : sesionesFiltradas.map((s) => {
        const d = new Date(s.fecha + "T12:00:00");
        return { key: s.id, label: `${d.getDate()}/${d.getMonth() + 1}`, sesionIds: [s.id] };
      });

  const headers = ["Nombre", "Grupo", ...columnas.map((c) => c.label), "Total", "% Asist."];

  function doExportPDF() {
    const rows = studentsConReserva.map((st) => {
      const reservasAlumno = reservas.filter((r) => r.estudiante_id === st.id && sesionesFiltradas.some((s) => s.id === r.sesion_id));
      const asistio = reservasAlumno.filter((r) => r.asistio === true).length;
      const cells = columnas.map((col) => {
        const rCol = reservas.filter((rv) => rv.estudiante_id === st.id && col.sesionIds.includes(rv.sesion_id));
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
      return [st.full_name, st.grupo_activo ?? "—", ...cells, String(reservasAlumno.length), `${pct(asistio, reservasAlumno.length)}%`];
    });
    exportPDF("Asistencia", headers, rows, periodoLabel);
  }

  function doExportExcel() {
    const rows = studentsConReserva.map((st) => {
      const reservasAlumno = reservas.filter((r) => r.estudiante_id === st.id && sesionesFiltradas.some((s) => s.id === r.sesion_id));
      const asistio = reservasAlumno.filter((r) => r.asistio === true).length;
      const cells = columnas.map((col) => {
        const rCol = reservas.filter((rv) => rv.estudiante_id === st.id && col.sesionIds.includes(rv.sesion_id));
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
      return [st.full_name, st.grupo_activo ?? "—", ...cells, reservasAlumno.length, pct(asistio, reservasAlumno.length)];
    });
    exportExcel("Asistencia", headers, rows, periodoLabel);
  }

  function doExportWhatsApp() {
    const lines = [periodoLabel, `Inscritos: ${totalInscritos} | Asistieron: ${totalAsistieron} | Ausentes: ${totalAusentes}`,
      "", ...studentsConReserva.slice(0, 30).map((st) => {
        const rv = reservas.filter((r) => r.estudiante_id === st.id && sesionesFiltradas.some((s) => s.id === r.sesion_id));
        const a = rv.filter((r) => r.asistio === true).length;
        return `• ${st.full_name}: ${a}/${rv.length} (${pct(a, rv.length)}%)`;
      })];
    exportWhatsApp(`Asistencia – ${fmtRango(effFrom, effTo)}`, lines);
  }

  return (
    <div>
      <div className="flex flex-wrap items-start gap-3 mb-5">
        <PeriodSelector
          mode={periodMode}
          onModeChange={setPeriodMode}
          from={rangeFrom}
          to={rangeTo}
          onApply={(f, t) => { setRangeFrom(f); setRangeTo(t); }}
          weekSlot={<WeekNav monday={monday} onChange={setMonday} />}
        />
        <GrupoTabs value={grupo} onChange={setGrupo} />
        <div className="ml-auto flex gap-2">
          <ExportBtn label="PDF" onClick={doExportPDF} />
          <ExportBtn label="Excel" onClick={doExportExcel} />
          <ExportBtn label="WhatsApp" onClick={doExportWhatsApp} green />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-5">
        <MetricCard label="Inscritos" value={totalInscritos} />
        <MetricCard label="Asistieron" value={totalAsistieron} />
        <MetricCard label="Ausencias" value={totalAusentes} />
        <MetricCard label={groupByWeek ? "Semanas" : "Sesiones"} value={groupByWeek ? columnas.length : sesionesFiltradas.length} />
      </div>

      {loading ? <Loading /> : sesionesFiltradas.length === 0 ? (
        <EmptyState msg="No hay sesiones en el periodo para el grupo seleccionado." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-1.5 py-1.5 text-[11px] font-semibold text-gray-500 bg-gray-50 w-[160px]">Nombre</th>
                <th className="text-left px-1.5 py-1.5 text-[11px] font-semibold text-gray-500 bg-gray-50 w-20">Grupo</th>
                {columnas.map((c) => {
                  const ses = !groupByWeek ? sesionesFiltradas.find((s) => s.id === c.key) : undefined;
                  return (
                    <th key={c.key} className="text-center px-1 py-1.5 text-[11px] font-semibold text-gray-500 bg-gray-50 w-8">
                      {c.label}
                      {ses && <><br /><span className="font-normal text-gray-400 text-[9px]">{fmtHora(ses.hora_inicio)}</span></>}
                    </th>
                  );
                })}
                <th className="text-center px-1.5 py-1.5 text-[11px] font-semibold text-gray-500 bg-gray-50 w-12">Total</th>
                <th className="text-center px-1.5 py-1.5 text-[11px] font-semibold text-gray-500 bg-gray-50 w-12">%</th>
              </tr>
            </thead>
            <tbody>
              {studentsConReserva.length === 0 ? (
                <tr><td colSpan={columnas.length + 4} className="text-center py-8 text-sm text-gray-400">Sin inscritos en el periodo</td></tr>
              ) : studentsConReserva.map((st, i) => {
                const reservasAlumno = reservas.filter((r) => r.estudiante_id === st.id && sesionesFiltradas.some((s) => s.id === r.sesion_id));
                const asistio = reservasAlumno.filter((r) => r.asistio === true).length;
                const p = pct(asistio, reservasAlumno.length);
                return (
                  <tr key={st.id} className={`h-8 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                    <td className="px-1.5 py-1 text-[11px] font-medium text-gray-800 w-[160px] truncate" title={st.full_name}>{st.full_name}</td>
                    <td className="px-1.5 py-1 w-20 truncate">
                      {st.grupo_activo && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={(() => { const t = grupoTipo(st.grupo_activo); return t ? { backgroundColor: GROUP_COLOR[t].bg, color: GROUP_COLOR[t].text } : {}; })()}>{st.grupo_activo}</span>
                      )}
                    </td>
                    {columnas.map((col) => {
                      const rCol = reservas.filter((rv) => rv.estudiante_id === st.id && col.sesionIds.includes(rv.sesion_id));
                      if (groupByWeek) {
                        const marcado = rCol.filter((r) => r.asistio !== null).length;
                        const asis = rCol.filter((r) => r.asistio === true).length;
                        return (
                          <td key={col.key} className="text-center px-1 py-1 w-8">
                            {marcado > 0 ? <PctBadge value={pct(asis, marcado)} /> : <span className="text-[10px] text-gray-300">—</span>}
                          </td>
                        );
                      }
                      const r = rCol[0];
                      if (!r) return <td key={col.key} className="text-center px-1 py-1 w-8"><span className="w-2 h-2 rounded-full bg-gray-200 block mx-auto" /></td>;
                      return <td key={col.key} className="text-center px-1 py-1 w-8"><AsistioCell value={r.asistio} reservaId={r.id} onSaved={handleAsistioSaved} /></td>;
                    })}
                    <td className="text-center px-1.5 py-1 text-[11px] text-gray-600 w-12">{reservasAlumno.length}</td>
                    <td className="text-center px-1.5 py-1 w-12"><PctBadge value={p} /></td>
                  </tr>
                );
              })}
            </tbody>
            {studentsConReserva.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                  <td className="px-1.5 py-1.5 text-[11px] text-gray-600">Totales</td>
                  <td />
                  {columnas.map((col) => {
                    const rCol = reservas.filter((r) => col.sesionIds.includes(r.sesion_id));
                    const total = rCol.length;
                    const asist = rCol.filter((r) => r.asistio === true).length;
                    return (
                      <td key={col.key} className="text-center px-1 py-1.5 w-8">
                        <span className="text-[10px] text-gray-600">{asist}/{total}</span>
                      </td>
                    );
                  })}
                  <td />
                  <td className="text-center px-1.5 py-1.5 w-12"><PctBadge value={pct(totalAsistieron, reservas.filter((r) => sesionesFiltradas.some((s) => s.id === r.sesion_id) && (r.asistio === true || r.asistio === false)).length)} /></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab 3: TESTS ─────────────────────────────────────────────────────────────

type TestStatus = "completo" | "parcial" | "sin" | "na";

function TestDot({ status }: { status: TestStatus }) {
  if (status === "na") return <span className="text-gray-300 text-sm">—</span>;
  const cfg = {
    completo: { bg: "#16a34a", title: "Completo" },
    parcial:  { bg: "#ca8a04", title: "Parcial" },
    sin:      { bg: "#dc2626", title: "Sin test" },
  }[status];
  return <span className="w-4 h-4 rounded-full block mx-auto" style={{ backgroundColor: cfg.bg }} title={cfg.title} />;
}

function TabTests() {
  const [grupo, setGrupo] = useState<GrupoFilter>("todos");
  const [students, setStudents] = useState<Student[]>([]);
  const [swingMap, setSwingMap] = useState<Record<string, { score_promedio: number | null; p1_score: number | null }>>({});
  const [physMap, setPhysMap] = useState<Record<string, boolean>>({});
  const [trackMap, setTrackMap] = useState<Record<string, boolean>>({});
  const [notasMap, setNotasMap] = useState<Record<string, { contenido: string; fecha: string }>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: sts }, { data: sw }, { data: ph }, { data: tr }, { data: nt }] = await Promise.all([
        supabase.from("students").select("id,full_name,birth_date,grupo_activo,status,tiene_talega").eq("status", "activo").order("full_name"),
        supabase.from("swing_evaluations").select("student_id,score_promedio,p1_score,created_at").order("created_at", { ascending: false }),
        supabase.from("physical_tests").select("student_id,tpi_summary,created_at").order("created_at", { ascending: false }),
        supabase.from("trackman_sessions").select("alumno_id,created_at").order("created_at", { ascending: false }),
        supabase.from("notas_profesor").select("alumno_id,contenido,fecha,created_at").order("created_at", { ascending: false }),
      ]);
      setStudents((sts ?? []) as Student[]);
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

  const studentsFiltrados = students.filter((s) => {
    if (grupo === "todos") return true;
    return grupoTipo(s.grupo_activo) === grupo;
  });

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
  function getGeneral(sw: TestStatus, ph: TestStatus, tr: TestStatus, nt: TestStatus): TestStatus {
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

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <GrupoTabs value={grupo} onChange={setGrupo} />
        <div className="ml-auto flex gap-2">
          <ExportBtn label="PDF" onClick={doExportPDF} />
          <ExportBtn label="Excel" onClick={doExportExcel} />
          <ExportBtn label="WhatsApp" onClick={doExportWhatsApp} green />
        </div>
      </div>
      {loading ? <Loading /> : studentsFiltrados.length === 0 ? <EmptyState msg="No hay alumnos activos." /> : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Nombre</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500">Grupo</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Técnico<br/><span className="font-normal text-gray-400">P1–P10</span></th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Físico<br/><span className="font-normal text-gray-400">TPI</span></th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Trackman</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Nota<br/><span className="font-normal text-gray-400">profesor</span></th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Estado</th>
              </tr>
            </thead>
            <tbody>
              {studentsFiltrados.map((st, i) => {
                const sw = getSwingStatus(st.id); const ph = getPhysStatus(st.id);
                const tr = getTrackStatus(st.id, st.grupo_activo); const nt = getNotaStatus(st.id);
                const gen = getGeneral(sw, ph, tr, nt);
                const nota = notasMap[st.id];
                return (
                  <tr key={st.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{st.full_name}</td>
                    <td className="px-3 py-2.5">{st.grupo_activo && <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={(() => { const t = grupoTipo(st.grupo_activo); return t ? { backgroundColor: GROUP_COLOR[t].bg, color: GROUP_COLOR[t].text } : {}; })()}>{st.grupo_activo}</span>}</td>
                    <td className="text-center px-3 py-2.5"><TestDot status={sw} /></td>
                    <td className="text-center px-3 py-2.5"><TestDot status={ph} /></td>
                    <td className="text-center px-3 py-2.5"><TestDot status={tr} /></td>
                    <td className="text-center px-3 py-2.5" title={nota ? `${nota.contenido.slice(0,80)} (${nota.fecha})` : ""}><TestDot status={nt} /></td>
                    <td className="text-center px-3 py-2.5">
                      <Badge label={gen === "completo" ? "Completo" : gen === "parcial" ? "Pendiente" : "Sin tests"} color={gen === "completo" ? "green" : gen === "parcial" ? "yellow" : "red"} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-600 inline-block" /> Completo</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" /> Parcial</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-600 inline-block" /> Sin test</span>
        <span className="flex items-center gap-1.5"><span className="text-gray-300">—</span> No aplica</span>
      </div>
    </div>
  );
}

// ── Tab 4: PROGRESO ──────────────────────────────────────────────────────────

function MiniBar({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const colors = values.map((v, i) => {
    if (i === 0) return "#9ca3af";
    return v > values[i - 1] ? "#16a34a" : v < values[i - 1] ? "#dc2626" : "#ca8a04";
  });
  return (
    <div className="flex items-end gap-0.5 h-6">
      {values.map((v, i) => (
        <div key={i} className="w-3 rounded-sm" style={{ height: `${Math.max(3, (v / max) * 24)}px`, backgroundColor: colors[i] }} title={`${v}%`} />
      ))}
    </div>
  );
}

function TabProgreso() {
  const [grupo, setGrupo] = useState<GrupoFilter>("todos");
  const [rango, setRango] = useState<4 | 8 | 12>(4);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("semana");
  const [rangeFrom, setRangeFrom] = useState<string>(() => toISO(addDays(getMondayOf(new Date()), -21)));
  const [rangeTo, setRangeTo] = useState<string>(() => toISO(addDays(getMondayOf(new Date()), 6)));
  const [students, setStudents] = useState<Student[]>([]);
  const [semanas, setSemanas] = useState<{ inicio: string; pct: Record<string, number> }[]>([]);
  const [swingMap, setSwingMap] = useState<Record<string, number>>({});
  const [physTotal, setPhysTotal] = useState<Record<string, boolean>>({});
  const [notasMap, setNotasMap] = useState<Record<string, { contenido: string; fecha: string }>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const lunesHoy = getMondayOf(new Date());
      const semanasList: string[] = periodMode === "periodo"
        ? weeksInRange(new Date(rangeFrom + "T12:00:00"), new Date(rangeTo + "T12:00:00")).map((w) => toISO(w.inicio)).slice(-12)
        : (() => { const arr: string[] = []; for (let i = rango - 1; i >= 0; i--) arr.push(toISO(addDays(lunesHoy, -i * 7))); return arr; })();
      const primeraSemana = new Date(semanasList[0] + "T12:00:00");
      const ultimaSemanaFin = addDays(new Date(semanasList[semanasList.length - 1] + "T12:00:00"), 6);

      const [{ data: sts }, { data: sw }, { data: ph }, { data: nt }, { data: ses }] = await Promise.all([
        supabase.from("students").select("id,full_name,birth_date,grupo_activo,status,tiene_talega").eq("status", "activo").order("full_name"),
        supabase.from("swing_evaluations").select("student_id,score_promedio").order("created_at", { ascending: false }),
        supabase.from("physical_tests").select("student_id,tpi_summary").order("created_at", { ascending: false }),
        supabase.from("notas_profesor").select("alumno_id,contenido,fecha,created_at").order("created_at", { ascending: false }),
        supabase.from("sesiones_semana").select("id,fecha").gte("fecha", toISO(primeraSemana)).lte("fecha", toISO(ultimaSemanaFin)),
      ]);

      setStudents((sts ?? []) as Student[]);
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

      const sesIds = (ses ?? []).map((s: { id: string }) => s.id);
      if (sesIds.length > 0) {
        const { data: rv } = await supabase.from("reservas").select("estudiante_id,sesion_id,asistio").in("sesion_id", sesIds);
        const sesFechaMap: Record<string, string> = {};
        (ses ?? []).forEach((s: { id: string; fecha: string }) => { sesFechaMap[s.id] = s.fecha; });
        const semanasData = semanasList.map((inicio) => {
          const fin = toISO(addDays(new Date(inicio + "T12:00:00"), 6));
          const sesEnSemana = (ses ?? []).filter((s: { id: string; fecha: string }) => s.fecha >= inicio && s.fecha <= fin).map((s: { id: string }) => s.id);
          const pctMap: Record<string, number> = {};
          (sts ?? []).forEach((st: Student) => {
            const rvAlumno = (rv ?? []).filter((r: { estudiante_id: string; sesion_id: string }) => r.estudiante_id === st.id && sesEnSemana.includes(r.sesion_id));
            const asist = (rv ?? []).filter((r: { estudiante_id: string; sesion_id: string; asistio: boolean | null }) => r.estudiante_id === st.id && sesEnSemana.includes(r.sesion_id) && r.asistio === true).length;
            pctMap[st.id] = rvAlumno.length > 0 ? pct(asist, rvAlumno.length) : 0;
          });
          return { inicio, pct: pctMap };
        });
        setSemanas(semanasData);
      } else {
        setSemanas(semanasList.map((inicio) => ({ inicio, pct: {} })));
      }
      setLoading(false);
    }
    load();
  }, [rango, periodMode, rangeFrom, rangeTo]);

  const studentsFiltrados = students.filter((s) => {
    if (grupo === "todos") return true;
    return grupoTipo(s.grupo_activo) === grupo;
  });

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

  function doExportExcel() {
    const rows = studentsFiltrados.map((st) => {
      const vals = semanas.map((s) => s.pct[st.id] ?? 0);
      const acum = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
      const nota = notasMap[st.id];
      return [st.full_name, st.grupo_activo ?? "—", ...vals.map((v) => `${v}%`), `${acum}%`, getTestFraction(st.id, st.grupo_activo), nota ? nota.contenido.slice(0, 60) : "—"];
    });
    const headers = ["Nombre","Grupo",...semanas.map((s) => s.inicio),"Asist. acum.","Tests","Última nota"];
    exportExcel("Progreso", headers, rows, periodoLabel);
  }

  return (
    <div>
      <div className="flex flex-wrap items-start gap-3 mb-5">
        <PeriodSelector
          mode={periodMode}
          onModeChange={setPeriodMode}
          from={rangeFrom}
          to={rangeTo}
          onApply={(f, t) => { setRangeFrom(f); setRangeTo(t); }}
          weekSlot={
            <div className="flex gap-1.5">
              {([4,8,12] as const).map((r) => (
                <button key={r} onClick={() => setRango(r)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${rango===r ? "bg-[#1B4D2E] text-white border-[#1B4D2E]" : "bg-white text-gray-600 border-gray-200"}`}>
                  {r === 4 ? "4 semanas" : r === 8 ? "8 semanas" : "3 meses"}
                </button>
              ))}
            </div>
          }
        />
        <GrupoTabs value={grupo} onChange={setGrupo} />
        <div className="ml-auto flex gap-2">
          <ExportBtn label="Excel" onClick={doExportExcel} />
        </div>
      </div>
      {loading ? <Loading /> : studentsFiltrados.length === 0 ? <EmptyState msg="No hay alumnos activos." /> : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Nombre</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500">Grupo</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Tendencia</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Asist. acumulada</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Tests</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500">Última nota</th>
              </tr>
            </thead>
            <tbody>
              {studentsFiltrados.map((st, i) => {
                const vals = semanas.map((s) => s.pct[st.id] ?? 0);
                const acum = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
                const nota = notasMap[st.id];
                return (
                  <tr key={st.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{st.full_name}</td>
                    <td className="px-3 py-2.5">{st.grupo_activo && <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={(() => { const t = grupoTipo(st.grupo_activo); return t ? { backgroundColor: GROUP_COLOR[t].bg, color: GROUP_COLOR[t].text } : {}; })()}>{st.grupo_activo}</span>}</td>
                    <td className="px-3 py-2.5 flex justify-center"><MiniBar values={vals} /></td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-[60px]">
                          <div className="h-1.5 rounded-full" style={{ width: `${acum}%`, backgroundColor: acum >= 85 ? "#16a34a" : acum >= 60 ? "#ca8a04" : "#dc2626" }} />
                        </div>
                        <span className="text-xs text-gray-600 w-8">{acum}%</span>
                      </div>
                    </td>
                    <td className="text-center px-3 py-2.5 text-xs text-gray-600">{getTestFraction(st.id, st.grupo_activo)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[200px]">
                      {nota ? (
                        <div><p className="truncate">{nota.contenido.slice(0, 50)}{nota.contenido.length > 50 ? "…" : ""}</p><p className="text-gray-300 text-[10px]">{fmtFecha(nota.fecha)}</p></div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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

  useEffect(() => {
    async function load() {
      setLoading(true);
      const hoy = new Date();
      const lunes4 = toISO(addDays(getMondayOf(hoy), -3 * 7));
      const domingo = toISO(addDays(getMondayOf(hoy), 6));
      const [{ data: sts }, { data: ses }, { data: sw }] = await Promise.all([
        supabase.from("students").select("id,grupo_activo,status,tiene_talega").eq("status", "activo"),
        supabase.from("sesiones_semana").select("id,fecha,planes_semanales(tipo_plan)").gte("fecha", lunes4).lte("fecha", domingo),
        supabase.from("swing_evaluations").select("student_id,score_promedio"),
      ]);
      const activos = (sts ?? []) as { id: string; grupo_activo: string | null }[];
      const sesArr = (ses ?? []) as unknown as { id: string; fecha: string; planes_semanales: { tipo_plan: string } | null }[];
      const sesIds = sesArr.map((s) => s.id);
      let rv: { sesion_id: string; estudiante_id: string; asistio: boolean | null }[] = [];
      if (sesIds.length > 0) {
        const { data } = await supabase.from("reservas").select("sesion_id,estudiante_id,asistio").in("sesion_id", sesIds);
        rv = data ?? [];
      }
      const swArr = (sw ?? []) as { student_id: string; score_promedio: number | null }[];
      const swSet = new Set(swArr.filter((s) => s.score_promedio !== null).map((s) => s.student_id));
      const totalActivos = activos.length;
      const competencia = activos.filter((s) => s.grupo_activo === "Competencia").length;
      const damas = activos.filter((s) => s.grupo_activo === "Damas").length;
      const marcadas = rv.filter((r) => r.asistio !== null);
      const asistidas = rv.filter((r) => r.asistio === true).length;
      const pctAsistencia = marcadas.length > 0 ? pct(asistidas, marcadas.length) : 0;
      const grupos = ["Birdies","Águilas","Albatros","+14","Competencia","Damas"];
      const porGrupo = grupos.map((g) => {
        const alumnos = activos.filter((s) => s.grupo_activo === g);
        const ids = alumnos.map((a) => a.id);
        const rvG = rv.filter((r) => ids.includes(r.estudiante_id));
        const asistG = rvG.filter((r) => r.asistio === true).length;
        const marcG = rvG.filter((r) => r.asistio !== null).length;
        const tipo = g === "Competencia" ? "competencia" : g === "Damas" ? "damas" : "juvenil";
        const sesG = sesArr.filter((s) => s.planes_semanales?.tipo_plan === tipo).length;
        const testsG = ids.filter((id) => swSet.has(id)).length;
        return { grupo: g, alumnos: alumnos.length, sesiones: sesG, asistProm: pct(asistG, marcG), testsCompletos: testsG };
      }).filter((g) => g.alumnos > 0);
      setStats({ totalActivos, pctAsistencia, competencia, damas, porGrupo });
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <Loading />;
  if (!stats) return <EmptyState msg="No hay datos." />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Alumnos activos" value={stats.totalActivos} />
        <MetricCard label="% Asistencia prom. 4 sem." value={`${stats.pctAsistencia}%`} />
        <MetricCard label="Alumnos Competencia" value={stats.competencia} />
        <MetricCard label="Alumnos Damas" value={stats.damas} />
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Resumen por grupo</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Grupo</th>
              <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Alumnos</th>
              <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Sesiones (4 sem.)</th>
              <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Asist. promedio</th>
              <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Tests técnicos</th>
            </tr>
          </thead>
          <tbody>
            {stats.porGrupo.map((g, i) => {
              const tipo = grupoTipo(g.grupo);
              return (
                <tr key={g.grupo} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                  <td className="px-4 py-2.5">
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={tipo ? { backgroundColor: GROUP_COLOR[tipo].bg, color: GROUP_COLOR[tipo].text } : {}}>{g.grupo}</span>
                  </td>
                  <td className="text-center px-3 py-2.5 text-gray-700">{g.alumnos}</td>
                  <td className="text-center px-3 py-2.5 text-gray-700">{g.sesiones}</td>
                  <td className="text-center px-3 py-2.5"><PctBadge value={g.asistProm} /></td>
                  <td className="text-center px-3 py-2.5 text-gray-700">{g.testsCompletos}/{g.alumnos}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab 6: EDADES ────────────────────────────────────────────────────────────

const GRUPOS_EDADES = ["Birdies", "Águilas", "Albatros", "+14", "Competencia", "Damas"] as const;
type GrupoEdad = typeof GRUPOS_EDADES[number];
type EstadoFilter = "todos" | "activos" | "inactivos";

function colorHexForGrupo(g: string): string {
  const t = grupoTipo(g);
  if (t === "competencia") return "#7d5a00";
  if (t === "damas") return "#4a1070";
  return "#1B4D2E";
}

function GrupoChip({ label, active, colorHex, onClick }: { label: string; active: boolean; colorHex: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border"
      style={active ? { backgroundColor: colorHex, color: "#fff", borderColor: colorHex } : { backgroundColor: "#fff", color: "#6b7280", borderColor: "#e5e7eb" }}
    >{label}</button>
  );
}

function TabEdades() {
  const [grupoSel, setGrupoSel] = useState<GrupoEdad>("Birdies");
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>("todos");
  const [edadFilter, setEdadFilter] = useState<number | "todas">("todas");
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase.from("students").select("id,full_name,birth_date,grupo_activo,status,tiene_talega").order("full_name");
      setStudents((data ?? []) as Student[]);
      setLoading(false);
    }
    load();
  }, []);

  function selectGrupo(g: GrupoEdad) {
    setGrupoSel(g);
    setEdadFilter("todas");
  }

  const showEdadDropdown = grupoSel === "Birdies" || grupoSel === "Águilas" || grupoSel === "Albatros";
  const colorHex = colorHexForGrupo(grupoSel);

  const porGrupoYEstado = students.filter((s) => {
    if (s.grupo_activo !== grupoSel) return false;
    if (estadoFilter === "activos") return s.status === "activo";
    if (estadoFilter === "inactivos") return s.status === "inactivo";
    return true;
  });

  const edadesDisponibles = Array.from(
    new Set(porGrupoYEstado.map((s) => calcEdad(s.birth_date)).filter((e): e is number => e !== null))
  ).sort((a, b) => a - b);

  const filtered = porGrupoYEstado
    .filter((s) => {
      if (!showEdadDropdown || edadFilter === "todas") return true;
      return calcEdad(s.birth_date) === edadFilter;
    })
    .sort((a, b) => {
      const ea = calcEdad(a.birth_date) ?? 999, eb = calcEdad(b.birth_date) ?? 999;
      if (ea !== eb) return ea - eb;
      return a.full_name.localeCompare(b.full_name);
    });

  const edadesFiltradas = filtered.map((s) => calcEdad(s.birth_date)).filter((e): e is number => e !== null);
  const promedioEdad = edadesFiltradas.length > 0 ? Math.round((edadesFiltradas.reduce((a, b) => a + b, 0) / edadesFiltradas.length) * 10) / 10 : null;
  const menorEdad = edadesFiltradas.length > 0 ? Math.min(...edadesFiltradas) : null;
  const mayorEdad = edadesFiltradas.length > 0 ? Math.max(...edadesFiltradas) : null;

  const agrupadoPorEdad = showEdadDropdown && edadFilter === "todas";

  type GrupoEdadRow = { edad: number | null; items: Student[] };
  const grupos: GrupoEdadRow[] = agrupadoPorEdad
    ? Array.from(
        filtered.reduce((acc, s) => {
          const e = calcEdad(s.birth_date);
          const key = e === null ? "sinfecha" : String(e);
          if (!acc.has(key)) acc.set(key, { edad: e, items: [] });
          acc.get(key)!.items.push(s);
          return acc;
        }, new Map<string, GrupoEdadRow>()).values()
      ).sort((a, b) => (a.edad ?? 999) - (b.edad ?? 999))
    : [{ edad: null, items: filtered }];

  function doExportPDF() {
    const parts: string[] = [];
    let n = 0;
    grupos.forEach((g) => {
      if (agrupadoPorEdad) parts.push(`### ${g.edad !== null ? `${g.edad} años` : "Sin fecha de nacimiento"} — ${g.items.length} alumno${g.items.length === 1 ? "" : "s"}`);
      parts.push(`| # | Nombre | Fecha de nacimiento | Edad | Estado |`);
      parts.push(`| --- | --- | --- | --- | --- |`);
      g.items.forEach((s) => {
        n++;
        parts.push(`| ${n} | ${s.full_name} | ${fmtFecha(s.birth_date)} | ${calcEdad(s.birth_date) ?? "—"} | ${s.status === "activo" ? "Activo" : "Inactivo"} |`);
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
        rows.push([n, s.full_name, fmtFecha(s.birth_date), calcEdad(s.birth_date) ?? "—", s.status === "activo" ? "Activo" : "Inactivo"]);
      });
    });
    exportExcel(`Edades — ${grupoSel}`, ["#", "Nombre", "Fecha de nacimiento", "Edad", "Estado"], rows);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {GRUPOS_EDADES.map((g) => (
          <GrupoChip key={g} label={g} active={grupoSel === g} colorHex={colorHexForGrupo(g)} onClick={() => selectGrupo(g)} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(["todos", "activos", "inactivos"] as EstadoFilter[]).map((e) => (
            <button key={e} onClick={() => setEstadoFilter(e)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${estadoFilter === e ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"}`}>
              {e === "todos" ? "Todos" : e === "activos" ? "Solo activos" : "Inactivos"}
            </button>
          ))}
        </div>
        {showEdadDropdown && (
          <select
            value={edadFilter === "todas" ? "todas" : String(edadFilter)}
            onChange={(e) => setEdadFilter(e.target.value === "todas" ? "todas" : Number(e.target.value))}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700"
          >
            <option value="todas">Todas las edades</option>
            {edadesDisponibles.map((e) => <option key={e} value={e}>{e} años</option>)}
          </select>
        )}
        <div className="ml-auto flex gap-2">
          <ExportBtn label="PDF" onClick={doExportPDF} />
          <ExportBtn label="Excel" onClick={doExportExcel} />
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorHex }} />
        <h3 className="text-sm font-bold text-gray-800">{grupoSel}</h3>
        <span className="text-xs text-gray-400">({filtered.length} alumno{filtered.length === 1 ? "" : "s"})</span>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <MetricCard label="Total alumnos" value={filtered.length} />
        <MetricCard label="Edad promedio" value={promedioEdad ?? "—"} />
        <MetricCard label="Menor edad" value={menorEdad ?? "—"} />
        <MetricCard label="Mayor edad" value={mayorEdad ?? "—"} />
      </div>

      {loading ? <Loading /> : filtered.length === 0 ? <EmptyState msg="No hay alumnos para este filtro." /> : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-center px-2 py-1.5 text-[11px] font-semibold text-gray-500 w-10">#</th>
                <th className="text-left px-2 py-1.5 text-[11px] font-semibold text-gray-500">Nombre</th>
                <th className="text-left px-2 py-1.5 text-[11px] font-semibold text-gray-500">Fecha de nacimiento</th>
                <th className="text-center px-2 py-1.5 text-[11px] font-semibold text-gray-500 w-16">Edad</th>
                <th className="text-center px-2 py-1.5 text-[11px] font-semibold text-gray-500 w-20">Estado</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let n = 0;
                return grupos.map((g) => (
                  <Fragment key={g.edad ?? "sinfecha"}>
                    {agrupadoPorEdad && (
                      <tr>
                        <td colSpan={5} className="px-2 py-1 bg-gray-50 text-[11px] font-semibold text-gray-600 border-t border-b border-gray-100">
                          {g.edad !== null ? `${g.edad} años` : "Sin fecha"} — {g.items.length} alumno{g.items.length === 1 ? "" : "s"}
                        </td>
                      </tr>
                    )}
                    {g.items.map((s, i) => {
                      n++;
                      return (
                        <tr key={s.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                          <td className="text-center px-2 py-[3px] text-[11px] text-gray-400">{n}</td>
                          <td className="px-2 py-[3px] text-[11px] font-medium text-gray-800">{s.full_name}</td>
                          <td className="px-2 py-[3px] text-[11px] text-gray-500">{fmtFecha(s.birth_date)}</td>
                          <td className="text-center px-2 py-[3px]">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: `${colorHex}18`, color: colorHex }}>
                              {calcEdad(s.birth_date) ?? "—"}
                            </span>
                          </td>
                          <td className="text-center px-2 py-[3px]"><Badge label={s.status} color={s.status === "activo" ? "green" : "gray"} /></td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ));
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab 7: RESERVAS LIVE ─────────────────────────────────────────────────────

const GRUPOS_LIVE = [
  { id: "juvenil" as const, label: "Juvenil", color: "#1B4D2E", dias: ["martes", "miercoles", "jueves", "sabado", "domingo"] },
  { id: "competencia" as const, label: "Competencia", color: "#7d5a00", dias: ["martes", "miercoles", "jueves", "sabado"] },
  { id: "damas" as const, label: "Damas", color: "#4a1070", dias: ["viernes"] },
];

const DIA_LABEL: Record<string, string> = { martes: "Martes", miercoles: "Miércoles", jueves: "Jueves", viernes: "Viernes", sabado: "Sábado", domingo: "Domingo" };
const DIA_OFFSET: Record<string, number> = { lunes: 0, martes: 1, miercoles: 2, jueves: 3, viernes: 4, sabado: 5, domingo: 6 };

function TalegaChip({ propia }: { propia: boolean }) {
  return (
    <span
      className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
      style={propia ? { backgroundColor: "#16a34a18", color: "#16a34a" } : { backgroundColor: "#9ca3af20", color: "#6b7280" }}
    >{propia ? "Propia" : "Escuela"}</span>
  );
}

function DayColumn({
  diaLabel, fecha, sesionesDia, reservasBySesion, colorHex,
}: {
  diaLabel: string; fecha: string; sesionesDia: Sesion[];
  reservasBySesion: Record<string, Reserva[]>; colorHex: string;
}) {
  const totalReservas = sesionesDia.reduce((sum, s) => sum + (reservasBySesion[s.id]?.length ?? 0), 0);
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-w-0">
      <div className="px-3 py-2 border-b border-gray-100" style={{ backgroundColor: `${colorHex}10` }}>
        <div className="flex items-baseline justify-between gap-1">
          <span className="text-xs font-bold truncate" style={{ color: colorHex }}>{diaLabel}</span>
          <span className="text-[10px] text-gray-400 shrink-0">{fecha}</span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          {sesionesDia.length === 1 ? (
            <span className="text-[10px] text-gray-500">{fmtHora(sesionesDia[0].hora_inicio)} – {fmtHora(sesionesDia[0].hora_fin)}</span>
          ) : sesionesDia.length > 1 ? (
            <span className="text-[10px] text-gray-400">{sesionesDia.length} horarios</span>
          ) : <span className="text-[10px] text-gray-300">Sin sesión</span>}
          <span className="text-[10px] font-semibold text-gray-600">{totalReservas}</span>
        </div>
      </div>
      <div className="p-2 space-y-2 flex-1">
        {sesionesDia.length === 0 ? (
          <p className="text-[11px] text-gray-300 text-center py-4">Sin sesión</p>
        ) : sesionesDia.map((s) => {
          const rv = reservasBySesion[s.id] ?? [];
          return (
            <div key={s.id}>
              {sesionesDia.length > 1 && (
                <p className="text-[10px] font-semibold text-gray-500 mb-1">{fmtHora(s.hora_inicio)} – {fmtHora(s.hora_fin)}</p>
              )}
              {rv.length === 0 ? (
                <p className="text-[10px] text-gray-300 italic mb-1">Sin inscritos</p>
              ) : (
                <div className="space-y-1">
                  {rv.map((r, i) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-1.5 border border-gray-100"
                      style={{ padding: "5px", borderRadius: "6px", fontSize: "11px" }}
                    >
                      <span className="text-gray-700 truncate flex items-center gap-1 min-w-0">
                        <span className="text-gray-400 shrink-0">{i + 1}.</span>
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
  const [grupoSel, setGrupoSel] = useState<"juvenil" | "competencia" | "damas">("juvenil");
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
    exportPDF("Reservas Live", ["Día", "Horario", "#", "Nombre", "Talega"], rows, `${grupoCfg.label} — ${fmtRango(monday, sunday)}`);
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
    exportExcel("Reservas Live", ["Día", "Horario", "#", "Nombre", "Talega"], rows, `${grupoCfg.label} — ${fmtRango(monday, sunday)}`);
  }
  function doExportWhatsApp() {
    const lines = [`${grupoCfg.label} — ${fmtRango(monday, sunday)}`, `Total: ${totalReservas} | Talega propia: ${conTalegaPropia} | Talega escuela: ${talegaEscuela}`, ""];
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

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1.5">
          {GRUPOS_LIVE.map((g) => (
            <GrupoChip key={g.id} label={g.label} active={grupoSel === g.id} colorHex={g.color} onClick={() => setGrupoSel(g.id)} />
          ))}
        </div>
        <WeekNav monday={monday} onChange={setMonday} />
        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            En vivo · hace {secsAgo}s
          </span>
          <div className="flex gap-2">
            <ExportBtn label="PDF" onClick={doExportPDF} />
            <ExportBtn label="Excel" onClick={doExportExcel} />
            <ExportBtn label="WhatsApp" onClick={doExportWhatsApp} green />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <MetricCard label="Total reservas" value={totalReservas} />
        <MetricCard label="Con talega propia" value={conTalegaPropia} />
        <MetricCard label="Con talega escuela" value={talegaEscuela} />
      </div>

      {loading && sesiones.length === 0 ? <Loading /> : (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columnas.length}, minmax(0, 1fr))` }}>
          {columnas.map((col) => (
            <DayColumn
              key={col.dia}
              diaLabel={col.label}
              fecha={`${col.fecha.getDate()} ${MESES_ES[col.fecha.getMonth()].slice(0, 3)}`}
              sesionesDia={col.sesionesDia}
              reservasBySesion={reservasBySesion}
              colorHex={grupoCfg.color}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Shared helpers ───────────────────────────────────────────────────────────

function Loading() {
  return <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-7 w-7 border-2 border-[#1B4D2E] border-t-transparent" /></div>;
}

function EmptyState({ msg }: { msg: string }) {
  return <div className="py-16 text-center text-sm text-gray-400">{msg}</div>;
}

function ExportBtn({ label, onClick, green }: { label: string; onClick: () => void; green?: boolean }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${green ? "bg-[#25d366] text-white border-[#25d366] hover:bg-[#1ebe5d]" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
      {label}
    </button>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ReportesModule() {
  const [activeTab, setActiveTab] = useState<Tab>("asistencia");

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-ccb-green flex items-center justify-center shrink-0">
            <BarChart3 size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ccb-green">Reportes</h1>
            <p className="text-sm text-(--text-muted) mt-0.5">Coordinador · Profesores</p>
          </div>
        </div>

        <div className="flex gap-1 bg-white rounded-xl border border-gray-100 shadow-sm p-1 mb-6 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${activeTab === t.id ? "bg-[#1B4D2E] text-white shadow-sm" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"}`}>
              {t.id === "live" && activeTab === t.id && <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />}
              {t.label}
            </button>
          ))}
        </div>

        <div>
          {activeTab === "asistencia" && <TabAsistencia />}
          {activeTab === "tests" && <TabTests />}
          {activeTab === "progreso" && <TabProgreso />}
          {activeTab === "estadisticas" && <TabEstadisticas />}
          {activeTab === "edades" && <TabEdades />}
          {activeTab === "live" && <TabReservaLive />}
        </div>
      </div>
    </div>
  );
}
