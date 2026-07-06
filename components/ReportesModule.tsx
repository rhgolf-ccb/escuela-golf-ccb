"use client";

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Constants ────────────────────────────────────────────────────────────────

type Tab = "asistencia" | "cobros" | "tests" | "progreso" | "estadisticas" | "edades" | "live";

const TABS: { id: Tab; label: string }[] = [
  { id: "asistencia", label: "Asistencia" },
  { id: "cobros", label: "Cobros" },
  { id: "tests", label: "Tests" },
  { id: "progreso", label: "Progreso" },
  { id: "estadisticas", label: "Estadísticas" },
  { id: "edades", label: "Edades" },
  { id: "live", label: "Reserva live" },
];

const GROUP_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  juvenil:      { bg: "#1a3a2a18", text: "#1a3a2a", border: "#1a3a2a25" },
  competencia:  { bg: "#7d5a0018", text: "#7d5a00", border: "#7d5a0025" },
  damas:        { bg: "#4a107018", text: "#4a1070", border: "#4a107025" },
};

const DIAS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
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

function tipoLabel(tipo: string | null): string {
  if (tipo === "juvenil") return "Juvenil";
  if (tipo === "competencia") return "Competencia";
  if (tipo === "damas") return "Damas";
  return "—";
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
    { id: "juvenil", label: "Juvenil", color: "#1a3a2a" },
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

function TalegaCell({ value, studentId, onSaved }: { value: string | null; studentId: string; onSaved: (id: string, val: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  async function save(v: string) {
    setSaving(true);
    const val = v === "" ? null : v;
    await supabase.from("students").update({ tiene_talega: val }).eq("id", studentId);
    onSaved(studentId, val);
    setSaving(false);
    setOpen(false);
  }
  if (open) return (
    <select autoFocus value={value ?? ""} onChange={(e) => save(e.target.value)} onBlur={() => setOpen(false)} disabled={saving} className="text-xs border border-gray-300 rounded px-1 py-0.5 bg-white">
      <option value="">—</option>
      <option value="Sí">Sí</option>
      <option value="No">No</option>
    </select>
  );
  return (
    <button onClick={() => setOpen(true)} className="text-xs px-2 py-0.5 rounded hover:bg-gray-100 border border-transparent hover:border-gray-200 transition-colors">
      {value ?? "—"}
    </button>
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
    <button onClick={toggle} disabled={saving} title="Asistió — clic para cambiar" className="w-2 h-2 rounded-full mx-auto block transition-transform hover:scale-110" style={{ backgroundColor: "#1a3a2a" }} />
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

type Cobro = {
  id: string; estudiante_id: string; semana_inicio: string;
  sesiones_inscritas: number; sesiones_asistidas: number;
  estado: string; observacion: string | null;
};

// ── Export helpers ───────────────────────────────────────────────────────────

async function exportPDF(title: string, headers: string[], rows: string[][], subtitle?: string) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: rows.length > 0 && headers.length > 6 ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  let y = 18;
  doc.setFillColor(27, 77, 46);
  doc.rect(0, 0, W, 12, "F");
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(212, 175, 55);
  doc.text("CCB · Escuela de Golf", M, 8);
  doc.setTextColor(255, 255, 255);
  doc.text(`Generado ${new Date().toLocaleDateString("es-CO")}`, W - M, 8, { align: "right" });
  y = 22;
  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(27, 77, 46);
  doc.text(title, M, y); y += 6;
  if (subtitle) { doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(120,120,120); doc.text(subtitle, M, y); y += 6; }
  doc.setDrawColor(200,200,200); doc.setLineWidth(0.3); doc.line(M, y, W - M, y); y += 5;
  const colW = (W - M * 2) / headers.length;
  doc.setFillColor(245, 247, 245); doc.rect(M, y - 4, W - M * 2, 7, "F");
  doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(60,60,60);
  headers.forEach((h, i) => doc.text(h, M + i * colW + 1, y));
  y += 4;
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  rows.forEach((row, ri) => {
    if (y > doc.internal.pageSize.getHeight() - 15) { doc.addPage(); y = 15; }
    if (ri % 2 === 0) { doc.setFillColor(250,252,250); doc.rect(M, y - 3.5, W - M * 2, 6, "F"); }
    doc.setTextColor(40,40,40);
    row.forEach((cell, ci) => {
      const txt = doc.splitTextToSize(String(cell ?? ""), colW - 2);
      doc.text(txt[0] ?? "", M + ci * colW + 1, y);
    });
    y += 6;
  });
  doc.save(`${title.replace(/\s+/g, "_")}_${toISO(new Date())}.pdf`);
}

function exportExcel(title: string, headers: string[], rows: (string | number)[][], subtitle?: string) {
  const aoa: (string | number)[][] = subtitle ? [[title], [subtitle], [], headers, ...rows] : [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
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

// ── Tab 2: COBROS ────────────────────────────────────────────────────────────

function TabCobros() {
  const [monday, setMonday] = useState<Date>(() => getMondayOf(new Date()));
  const [periodMode, setPeriodMode] = useState<PeriodMode>("semana");
  const [rangeFrom, setRangeFrom] = useState<string>(() => toISO(getMondayOf(new Date())));
  const [rangeTo, setRangeTo] = useState<string>(() => toISO(addDays(getMondayOf(new Date()), 6)));
  const [grupo, setGrupo] = useState<GrupoFilter>("todos");
  const [cobros, setCobros] = useState<Cobro[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [reservas, setReservas] = useState<{ estudiante_id: string; sesion_id: string; asistio: boolean | null }[]>([]);
  const [sesiones, setSesiones] = useState<{ id: string; fecha: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingCobro, setEditingCobro] = useState<{ id: string; field: "estado" | "observacion" } | null>(null);

  const sunday = addDays(monday, 6);
  const effFrom = periodMode === "semana" ? monday : new Date(rangeFrom + "T12:00:00");
  const effTo = periodMode === "semana" ? sunday : new Date(rangeTo + "T12:00:00");
  const effFromISO = toISO(effFrom);
  const effToISO = toISO(effTo);
  const periodoLabel = periodoSubtitle(effFrom, effTo);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: sts }, { data: ses }] = await Promise.all([
        supabase.from("students").select("id,full_name,birth_date,grupo_activo,status,tiene_talega").eq("status", "activo").order("full_name"),
        supabase.from("sesiones_semana").select("id,fecha").gte("fecha", effFromISO).lte("fecha", effToISO),
      ]);
      setStudents((sts ?? []) as Student[]);
      setSesiones(ses ?? []);
      const sesIds = (ses ?? []).map((s: { id: string }) => s.id);
      const [{ data: rv }, { data: cb }] = await Promise.all([
        sesIds.length > 0 ? supabase.from("reservas").select("estudiante_id,sesion_id,asistio").in("sesion_id", sesIds) : Promise.resolve({ data: [] }),
        periodMode === "semana"
          ? supabase.from("cobros").select("*").eq("semana_inicio", effFromISO)
          : supabase.from("cobros").select("*").gte("semana_inicio", effFromISO).lte("semana_inicio", effToISO),
      ]);
      setReservas(rv ?? []);
      setCobros((cb ?? []) as Cobro[]);
      setLoading(false);
    }
    load();
  }, [periodMode, monday, rangeFrom, rangeTo]);

  async function updateCobro(estudianteId: string, patch: Partial<Cobro>) {
    const semanaInicio = toISO(monday);
    const existing = cobros.find((c) => c.estudiante_id === estudianteId);
    if (existing) {
      const { data } = await supabase.from("cobros").update(patch).eq("id", existing.id).select().single();
      if (data) setCobros((prev) => prev.map((c) => c.id === existing.id ? { ...c, ...data } : c));
    } else {
      const inscritas = reservas.filter((r) => r.estudiante_id === estudianteId).length;
      const asistidas = reservas.filter((r) => r.estudiante_id === estudianteId && r.asistio === true).length;
      const { data } = await supabase.from("cobros").insert({
        estudiante_id: estudianteId, semana_inicio: semanaInicio,
        sesiones_inscritas: inscritas, sesiones_asistidas: asistidas,
        ...patch,
      }).select().single();
      if (data) setCobros((prev) => [...prev, data as Cobro]);
    }
    setEditingCobro(null);
  }

  const studentsFiltrados = students.filter((s) => {
    const tieneReserva = reservas.some((r) => r.estudiante_id === s.id);
    if (!tieneReserva) return false;
    if (grupo === "todos") return true;
    return grupoTipo(s.grupo_activo) === grupo;
  });

  const pagados = cobros.filter((c) => c.estado === "pagado").length;
  const pendientes = cobros.filter((c) => c.estado === "pendiente" || !c.estado).length;
  const exonerados = cobros.filter((c) => c.estado === "exonerado").length;

  // Vista por semana: fila editable por alumno. Vista por periodo: solo lectura, una fila por (semana, alumno) — evita ambigüedad de a qué semana pertenece una edición.
  const filasPeriodo = periodMode === "periodo" ? weeksInRange(effFrom, effTo).flatMap((w) => {
    const wIni = toISO(w.inicio), wFin = toISO(w.fin);
    const sesIdsSemana = sesiones.filter((s) => s.fecha >= wIni && s.fecha <= wFin).map((s) => s.id);
    return studentsFiltrados
      .filter((st) => reservas.some((r) => r.estudiante_id === st.id && sesIdsSemana.includes(r.sesion_id)))
      .map((st) => {
        const rvSemana = reservas.filter((r) => r.estudiante_id === st.id && sesIdsSemana.includes(r.sesion_id));
        const cobro = cobros.find((c) => c.estudiante_id === st.id && c.semana_inicio === wIni);
        return {
          semanaInicio: wIni,
          semanaLabel: fmtRango(w.inicio, w.fin),
          student: st,
          inscritas: rvSemana.length,
          asistidas: rvSemana.filter((r) => r.asistio === true).length,
          estado: cobro?.estado ?? "pendiente",
          observacion: cobro?.observacion ?? null,
        };
      });
  }) : [];

  function doExportPDF() {
    if (periodMode === "periodo") {
      const rows = filasPeriodo.map((f) => [f.semanaLabel, f.student.full_name, f.student.grupo_activo ?? "—", String(f.inscritas), String(f.asistidas), f.estado, f.observacion ?? ""]);
      exportPDF("Cobros", ["Semana","Nombre","Grupo","Inscritas","Asistidas","Estado","Observación"], rows, periodoLabel);
      return;
    }
    const rows = studentsFiltrados.map((st) => {
      const inscritas = reservas.filter((r) => r.estudiante_id === st.id).length;
      const asistidas = reservas.filter((r) => r.estudiante_id === st.id && r.asistio === true).length;
      const cobro = cobros.find((c) => c.estudiante_id === st.id);
      return [st.full_name, st.grupo_activo ?? "—", String(inscritas), String(asistidas), cobro?.estado ?? "pendiente", cobro?.observacion ?? ""];
    });
    exportPDF("Cobros", ["Nombre","Grupo","Inscritas","Asistidas","Estado","Observación"], rows, periodoLabel);
  }

  function doExportExcel() {
    if (periodMode === "periodo") {
      const rows = filasPeriodo.map((f) => [f.semanaLabel, f.student.full_name, f.student.grupo_activo ?? "—", f.inscritas, f.asistidas, f.estado, f.observacion ?? ""]);
      exportExcel("Cobros", ["Semana","Nombre","Grupo","Inscritas","Asistidas","Estado","Observación"], rows, periodoLabel);
      return;
    }
    const rows = studentsFiltrados.map((st) => {
      const inscritas = reservas.filter((r) => r.estudiante_id === st.id).length;
      const asistidas = reservas.filter((r) => r.estudiante_id === st.id && r.asistio === true).length;
      const cobro = cobros.find((c) => c.estudiante_id === st.id);
      return [st.full_name, st.grupo_activo ?? "—", inscritas, asistidas, cobro?.estado ?? "pendiente", cobro?.observacion ?? ""];
    });
    exportExcel("Cobros", ["Nombre","Grupo","Inscritas","Asistidas","Estado","Observación"], rows, periodoLabel);
  }

  function doExportWhatsApp() {
    const lines = [periodoLabel, `Pagados: ${pagados} | Pendientes: ${pendientes} | Exonerados: ${exonerados}`, "",
      ...studentsFiltrados.slice(0, 30).map((st) => {
        const cobro = cobros.find((c) => c.estudiante_id === st.id);
        return `• ${st.full_name}: ${cobro?.estado ?? "pendiente"}`;
      })];
    exportWhatsApp(`Cobros – ${fmtRango(effFrom, effTo)}`, lines);
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
        <MetricCard label="Pagados" value={pagados} />
        <MetricCard label="Pendientes" value={pendientes} />
        <MetricCard label="Exonerados" value={exonerados} />
        <MetricCard label="Total alumnos" value={studentsFiltrados.length} />
      </div>
      {loading ? <Loading /> : periodMode === "periodo" ? (
        filasPeriodo.length === 0 ? <EmptyState msg="No hay alumnos inscritos en el periodo." /> : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Semana</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Nombre</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500">Grupo</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Inscritas</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Asistidas</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Estado pago</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500">Observación</th>
                </tr>
              </thead>
              <tbody>
                {filasPeriodo.map((f, i) => (
                  <tr key={`${f.semanaInicio}-${f.student.id}`} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                    <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{f.semanaLabel}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{f.student.full_name}</td>
                    <td className="px-3 py-2.5">
                      {f.student.grupo_activo && <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={(() => { const t = grupoTipo(f.student.grupo_activo); return t ? { backgroundColor: GROUP_COLOR[t].bg, color: GROUP_COLOR[t].text } : {}; })()}>{f.student.grupo_activo}</span>}
                    </td>
                    <td className="text-center px-3 py-2.5 text-gray-600">{f.inscritas}</td>
                    <td className="text-center px-3 py-2.5 text-gray-600">{f.asistidas}</td>
                    <td className="text-center px-3 py-2.5"><Badge label={f.estado} color={f.estado === "pagado" ? "green" : f.estado === "exonerado" ? "gray" : "yellow"} /></td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[200px] truncate">{f.observacion ?? <span className="text-gray-300 italic">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : studentsFiltrados.length === 0 ? (
        <EmptyState msg="No hay alumnos inscritos esta semana." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Nombre</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500">Grupo</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Inscritas</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Asistidas</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Estado pago</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500">Observación</th>
              </tr>
            </thead>
            <tbody>
              {studentsFiltrados.map((st, i) => {
                const inscritas = reservas.filter((r) => r.estudiante_id === st.id).length;
                const asistidas = reservas.filter((r) => r.estudiante_id === st.id && r.asistio === true).length;
                const cobro = cobros.find((c) => c.estudiante_id === st.id);
                const estado = cobro?.estado ?? "pendiente";
                return (
                  <tr key={st.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{st.full_name}</td>
                    <td className="px-3 py-2.5">
                      {st.grupo_activo && <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={(() => { const t = grupoTipo(st.grupo_activo); return t ? { backgroundColor: GROUP_COLOR[t].bg, color: GROUP_COLOR[t].text } : {}; })()}>{st.grupo_activo}</span>}
                    </td>
                    <td className="text-center px-3 py-2.5 text-gray-600">{inscritas}</td>
                    <td className="text-center px-3 py-2.5 text-gray-600">{asistidas}</td>
                    <td className="text-center px-3 py-2.5">
                      {editingCobro?.id === st.id && editingCobro.field === "estado" ? (
                        <select autoFocus defaultValue={estado} className="text-xs border border-gray-300 rounded px-1 py-0.5 bg-white"
                          onChange={(e) => updateCobro(st.id, { estado: e.target.value })} onBlur={() => setEditingCobro(null)}>
                          <option value="pendiente">pendiente</option>
                          <option value="pagado">pagado</option>
                          <option value="exonerado">exonerado</option>
                        </select>
                      ) : (
                        <button onClick={() => setEditingCobro({ id: st.id, field: "estado" })} className="inline-flex items-center">
                          <Badge label={estado} color={estado === "pagado" ? "green" : estado === "exonerado" ? "gray" : "yellow"} />
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[200px]">
                      {editingCobro?.id === st.id && editingCobro.field === "observacion" ? (
                        <input autoFocus defaultValue={cobro?.observacion ?? ""} className="w-full text-xs border border-gray-300 rounded px-1.5 py-0.5"
                          onBlur={(e) => updateCobro(st.id, { observacion: e.target.value || null })}
                          onKeyDown={(e) => { if (e.key === "Enter") { updateCobro(st.id, { observacion: (e.target as HTMLInputElement).value || null }); } if (e.key === "Escape") setEditingCobro(null); }} />
                      ) : (
                        <button onClick={() => setEditingCobro({ id: st.id, field: "observacion" })} className="text-left w-full hover:text-gray-700 truncate block">
                          {cobro?.observacion ?? <span className="text-gray-300 italic">Agregar nota...</span>}
                        </button>
                      )}
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

const RANGOS_GRUPO = [
  { label: "4–5 años (Birdies)", min: 4, max: 5 },
  { label: "6–8 años (Águilas)", min: 6, max: 8 },
  { label: "9–12 años (Albatros)", min: 9, max: 12 },
  { label: "13–17 años", min: 13, max: 17 },
];

function TabEdades() {
  const [edadSel, setEdadSel] = useState<number | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase.from("students").select("id,full_name,birth_date,grupo_activo,status,tiene_talega").eq("status", "activo").order("full_name");
      setStudents((data ?? []) as Student[]);
      setLoading(false);
    }
    load();
  }, []);

  function updateTalega(id: string, val: string | null) {
    setStudents((prev) => prev.map((s) => s.id === id ? { ...s, tiene_talega: val } : s));
  }

  const filtered = students.filter((s) => {
    const edad = calcEdad(s.birth_date);
    if (edadSel === null) return true;
    return edad === edadSel;
  });

  const conGrupo = filtered.filter((s) => s.grupo_activo).length;
  const sinGrupo = filtered.filter((s) => !s.grupo_activo).length;
  const conTalega = filtered.filter((s) => s.tiene_talega === "Sí").length;

  function setRango(min: number, max: number) {
    setEdadSel(edadSel !== null && edadSel >= min && edadSel <= max ? null : min);
  }

  function doExportPDF() {
    const rows = filtered.map((s) => [s.full_name, String(calcEdad(s.birth_date) ?? "—"), s.tiene_talega ?? "—"]);
    exportPDF("Talegas", ["Nombre","Edad","Talega"], rows, edadSel !== null ? `Edad: ${edadSel} años` : "Todos los alumnos");
  }
  function doExportExcel() {
    const rows = filtered.map((s) => [s.full_name, s.grupo_activo ?? "—", s.tiene_talega ?? "—", String(calcEdad(s.birth_date) ?? "—")]);
    exportExcel("Edades", ["Nombre","Grupo","Talega","Edad"], rows);
  }
  function doExportWhatsApp() {
    const lines = [edadSel !== null ? `Edad: ${edadSel} años` : "Todos", `Total: ${filtered.length} | Con talega: ${conTalega}`, "",
      ...filtered.slice(0, 40).map((s) => `• ${s.full_name} (${calcEdad(s.birth_date) ?? "?"}): ${s.tiene_talega ?? "—"}`)];
    exportWhatsApp("Talegas por edad", lines);
  }

  return (
    <div>
      <div className="space-y-2 mb-4">
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 14 }, (_, i) => i + 4).map((edad) => (
            <button key={edad} onClick={() => setEdadSel(edadSel === edad ? null : edad)}
              className={`w-9 h-9 rounded-full text-sm font-semibold border transition-colors ${edadSel === edad ? "bg-[#1B4D2E] text-white border-[#1B4D2E]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>
              {edad}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RANGOS_GRUPO.map((r) => {
            const active = edadSel !== null && edadSel >= r.min && edadSel <= r.max;
            return (
              <button key={r.label} onClick={() => setRango(r.min, r.max)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${active ? "bg-[#1B4D2E] text-white border-[#1B4D2E]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>
                {r.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="ml-auto flex gap-2">
          <ExportBtn label="PDF" onClick={doExportPDF} />
          <ExportBtn label="Excel" onClick={doExportExcel} />
          <ExportBtn label="WhatsApp" onClick={doExportWhatsApp} green />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3 mb-5">
        <MetricCard label={edadSel ? `Alumnos ${edadSel} años` : "Total alumnos"} value={filtered.length} />
        <MetricCard label="Con grupo asignado" value={conGrupo} />
        <MetricCard label="Sin grupo" value={sinGrupo} />
        <MetricCard label="Con talega" value={conTalega} />
      </div>
      {loading ? <Loading /> : filtered.length === 0 ? <EmptyState msg="No hay alumnos para este filtro." /> : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Nombre</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Edad</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500">Grupo</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Talega</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Estado</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500">Nacimiento</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((st, i) => (
                <tr key={st.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{st.full_name}</td>
                  <td className="text-center px-3 py-2.5 text-gray-700">{calcEdad(st.birth_date) ?? "—"}</td>
                  <td className="px-3 py-2.5">{st.grupo_activo ? <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={(() => { const t = grupoTipo(st.grupo_activo); return t ? { backgroundColor: GROUP_COLOR[t].bg, color: GROUP_COLOR[t].text } : {}; })()}>{st.grupo_activo}</span> : <span className="text-xs text-gray-300">—</span>}</td>
                  <td className="text-center px-3 py-2.5"><TalegaCell value={st.tiene_talega} studentId={st.id} onSaved={updateTalega} /></td>
                  <td className="text-center px-3 py-2.5"><Badge label={st.status} color={st.status === "activo" ? "green" : "gray"} /></td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{fmtFecha(st.birth_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab 7: RESERVA LIVE ──────────────────────────────────────────────────────

function TabReservaLive() {
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [sesionSel, setSesionSel] = useState<Sesion | null>(null);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const monday = getMondayOf(new Date());
  const sunday = addDays(monday, 6);

  useEffect(() => {
    async function loadSesiones() {
      const { data } = await supabase.from("sesiones_semana")
        .select("id,dia_semana,fecha,hora_inicio,hora_fin,tipo_sesion,lugar,objetivo,cupo_maximo,planes_semanales(tipo_plan)")
        .gte("fecha", toISO(monday)).lte("fecha", toISO(sunday)).order("fecha").order("hora_inicio");
      setSesiones((data ?? []) as unknown as Sesion[]);
      if (data && data.length > 0 && !sesionSel) setSesionSel(data[0] as unknown as Sesion);
    }
    loadSesiones();
  }, []);

  const fetchReservas = useCallback(async (id: string) => {
    setLoading(true);
    const { data } = await supabase.from("reservas")
      .select("id,sesion_id,estudiante_id,estado,posicion_espera,created_at,asistio,students!reservas_estudiante_id_fkey(id,full_name,grupo_activo,tiene_talega)")
      .eq("sesion_id", id).order("estado").order("posicion_espera", { ascending: true, nullsFirst: false }).order("created_at");
    setReservas(((data ?? []) as unknown as Reserva[]).map((r) => ({ ...r, students: Array.isArray(r.students) ? r.students[0] : r.students })));
    setLastUpdate(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!sesionSel) return;
    fetchReservas(sesionSel.id);
    timerRef.current = setInterval(() => fetchReservas(sesionSel.id), 30000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [sesionSel, fetchReservas]);

  function updateTalega(id: string, val: string | null) {
    setReservas((prev) => prev.map((r) => r.estudiante_id === id ? { ...r, students: r.students ? { ...r.students, tiene_talega: val } : r.students } : r));
  }

  const confirmados = reservas.filter((r) => r.estado === "confirmado");
  const conTalega = reservas.filter((r) => r.students?.tiene_talega === "Sí").length;
  const sinTalega = reservas.filter((r) => r.students?.tiene_talega === "No" || r.students?.tiene_talega === null).length;
  const cupo = sesionSel?.cupo_maximo ?? 15;
  const disponibles = Math.max(0, cupo - confirmados.length);

  const secsAgo = Math.floor((new Date().getTime() - lastUpdate.getTime()) / 1000);

  function doExportPDF() {
    if (!sesionSel) return;
    const tipo = (sesionSel.planes_semanales as { tipo_plan: string } | null)?.tipo_plan;
    const rows = reservas.map((r, i) => [String(i + 1), r.students?.full_name ?? "—", r.students?.tiene_talega ?? "—", r.estado === "confirmado" ? "Confirmado" : "En espera", new Date(r.created_at).toLocaleTimeString("es-CO")]);
    exportPDF("Reserva Live", ["#","Nombre","Talega","Estado","Inscrito"], rows, `${tipoLabel(tipo ?? null)} — ${DIAS_ES[new Date(sesionSel.fecha + "T12:00:00").getDay()]} ${fmtFecha(sesionSel.fecha)} ${fmtHora(sesionSel.hora_inicio)}`);
  }
  function doExportExcel() {
    const rows = reservas.map((r, i) => [i + 1, r.students?.full_name ?? "—", r.students?.tiene_talega ?? "—", r.estado, new Date(r.created_at).toLocaleTimeString("es-CO")]);
    exportExcel("Reserva Live", ["#","Nombre","Talega","Estado","Inscrito"], rows);
  }
  function doExportWhatsApp() {
    if (!sesionSel) return;
    const tipo = (sesionSel.planes_semanales as { tipo_plan: string } | null)?.tipo_plan;
    const lines = [`${tipoLabel(tipo ?? null)} — ${DIAS_ES[new Date(sesionSel.fecha + "T12:00:00").getDay()]} ${fmtFecha(sesionSel.fecha)} ${fmtHora(sesionSel.hora_inicio)}`,
      `Confirmados: ${confirmados.length}/${cupo} | Con talega: ${conTalega}`, "",
      "*Lista de talegas:*",
      ...reservas.filter((r) => r.estado === "confirmado").map((r) => `• ${r.students?.full_name ?? "—"}: ${r.students?.tiene_talega ?? "—"}`)];
    exportWhatsApp("Reserva Live — Talegas", lines);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {sesiones.map((s) => {
          const tipo = (s.planes_semanales as { tipo_plan: string } | null)?.tipo_plan;
          const t = tipo ? (tipo === "juvenil" ? "juvenil" : tipo === "competencia" ? "competencia" : "damas") : null;
          const sel = sesionSel?.id === s.id;
          return (
            <button key={s.id} onClick={() => setSesionSel(s)}
              className={`flex flex-col items-start px-4 py-3 rounded-xl border text-left transition-all ${sel ? "shadow-md border-transparent" : "bg-white border-gray-200 hover:border-gray-300"}`}
              style={sel && t ? { backgroundColor: GROUP_COLOR[t].bg, borderColor: GROUP_COLOR[t].border } : {}}>
              <span className="text-xs font-semibold" style={sel && t ? { color: GROUP_COLOR[t].text } : { color: "#374151" }}>{tipoLabel(tipo ?? null)}</span>
              <span className="text-[11px] text-gray-500 mt-0.5">{DIAS_ES[new Date(s.fecha + "T12:00:00").getDay()]} {s.fecha.slice(5)} · {fmtHora(s.hora_inicio)}</span>
            </button>
          );
        })}
      </div>

      {sesionSel && (
        <>
          <div className="flex items-center gap-4 mb-4 bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <div className="text-center">
              <p className="text-xs text-gray-400">Confirmados</p>
              <p className="text-lg font-bold text-gray-900">{confirmados.length}/{cupo}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400">Disponibles</p>
              <p className="text-lg font-bold" style={{ color: disponibles > 0 ? "#16a34a" : "#dc2626" }}>{disponibles}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400">Con talega</p>
              <p className="text-lg font-bold text-gray-900">{conTalega}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400">Sin talega / —</p>
              <p className="text-lg font-bold text-gray-900">{sinTalega}</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-400">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              En vivo · actualizado hace {secsAgo}s
            </div>
            <div className="flex gap-2">
              <ExportBtn label="PDF" onClick={doExportPDF} />
              <ExportBtn label="Excel" onClick={doExportExcel} />
              <ExportBtn label="WhatsApp" onClick={doExportWhatsApp} green />
            </div>
          </div>

          {loading ? <Loading /> : reservas.length === 0 ? <EmptyState msg="Sin inscritos en esta sesión." /> : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 w-10">#</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Nombre</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Talega</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Estado</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500">Hora inscripción</th>
                  </tr>
                </thead>
                <tbody>
                  {reservas.map((r, i) => (
                    <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                      <td className="text-center px-3 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-800">{r.students?.full_name ?? "—"}</td>
                      <td className="text-center px-3 py-2.5">
                        {r.students ? <TalegaCell value={r.students.tiene_talega} studentId={r.estudiante_id} onSaved={updateTalega} /> : "—"}
                      </td>
                      <td className="text-center px-3 py-2.5">
                        <Badge label={r.estado === "confirmado" ? "Confirmado" : "En espera"} color={r.estado === "confirmado" ? "green" : "yellow"} />
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{new Date(r.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
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
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Coordinador · Profesores</p>
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
          {activeTab === "cobros" && <TabCobros />}
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
