"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface SesionInfo {
  id: string;
  dia_semana: string;
  fecha: string;
  tipo_sesion: string;
  lugar: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  objetivo: string;
  asistencia_registrada: boolean;
  plan_id: string;
}

interface PlanInfo {
  tipo_plan: "juvenil" | "competencia" | "damas";
  tema_semanal: string;
}

interface StudentRow {
  id: string;
  full_name: string;
  grupo_activo: string | null;
  // null = alumno del grupo que todavía no tiene reserva para esta sesión.
  // Se le crea una confirmada al guardar la asistencia.
  reserva_id: string | null;
}

type Asistencia = boolean | null; // true=presente, false=ausente, null=sin marcar
type CheckResult = "cumple" | "progreso" | "bajo" | null; // check rápido sobre el foco del día

function prettifyFoco(f: string): string {
  const s = f.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const TIPO_SESION_LABEL: Record<string, string> = {
  tiro_largo: "Tiro Largo", juego_corto: "Juego Corto", putt: "Putt",
  campo: "Campo", test_tecnico: "Test Técnico", test_fisico: "Test Físico",
  competencia: "Competencia", damas_estaciones: "Estaciones",
};

const LUGAR_LABEL: Record<string, string> = {
  campo_practica: "Campo de práctica", putting_green: "Putting Green",
  campo_infantil: "Campo Infantil", campo_pacos_fabios: "Pacos/Fabios",
  campo_completo: "Campo Completo",
};

const SUBGRUPOS_JUVENIL = ["Birdies", "Águilas", "Albatros", "+14"];

// Grupos de `students.grupo_activo` que corresponden a cada tipo de plan. Sirve
// para poder pasar asistencia sin haber inscrito antes a nadie en Reservas.
const GRUPOS_POR_PLAN: Record<PlanInfo["tipo_plan"], string[]> = {
  competencia: ["Competencia"],
  juvenil: SUBGRUPOS_JUVENIL,
  damas: ["Damas"],
};

const GRUPO_COLOR: Record<string, { bg: string; text: string }> = {
  Birdies: { bg: "#dbeafe", text: "#1e40af" },
  "Águilas": { bg: "#dcfce7", text: "#166534" },
  Albatros: { bg: "#fef9c3", text: "#854d0e" },
  "+14": { bg: "#ede9fe", text: "#6d28d9" },
  Competencia: { bg: "#fff7ed", text: "#9a3412" },
  Damas: { bg: "#fdf2f8", text: "#86198f" },
};

function formatFecha(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatHora(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

function initiales(name: string): string {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

export default function AsistenciaView({ sesionId }: { sesionId: string }) {
  const router = useRouter();
  const listRef = useRef<HTMLDivElement>(null);

  const [sesion, setSesion] = useState<SesionInfo | null>(null);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [grupoRoster, setGrupoRoster] = useState<StudentRow[]>([]);
  const [autoCargadoDelGrupo, setAutoCargadoDelGrupo] = useState(false);
  const [showAgregar, setShowAgregar] = useState(false);
  const [buscarAlumno, setBuscarAlumno] = useState("");
  const [asistencias, setAsistencias] = useState<Record<string, Asistencia>>({});
  const [checks, setChecks] = useState<Record<string, CheckResult>>({});
  const [focosDia, setFocosDia] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtroGrupo, setFiltroGrupo] = useState<string>("todos");
  // Guardar sin ninguna marca borra la asistencia que hubiera: se pide confirmar.
  const [confirmarVacio, setConfirmarVacio] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    // 1. Load session
    const { data: sesData } = await supabase
      .from("sesiones_semana")
      .select("*")
      .eq("id", sesionId)
      .single();

    if (!sesData) { setLoading(false); return; }
    const s = sesData as SesionInfo;
    setSesion(s);

    // Focos del día — desde las estaciones (Competencia/Juvenil) para saber
    // sobre qué se hace el check rápido.
    const raw = sesData as unknown as {
      estaciones_competencia?: { foco?: string | null }[] | null;
      sesion_juvenil?: { estaciones?: { foco?: string | null }[] } | null;
    };
    const fset = new Set<string>();
    (raw.estaciones_competencia ?? []).forEach((e) => { if (e?.foco) fset.add(e.foco); });
    (raw.sesion_juvenil?.estaciones ?? []).forEach((e) => { if (e?.foco) fset.add(e.foco); });
    setFocosDia([...fset]);

    // 2. Load plan
    const { data: planData } = await supabase
      .from("planes_semanales")
      .select("tipo_plan, tema_semanal")
      .eq("id", s.plan_id)
      .single();

    if (!planData) { setLoading(false); return; }
    const p = planData as PlanInfo;
    setPlan(p);

    // 3. Load students with a confirmed reservation for this session (+ their asistio)
    type ReservaRow = {
      id: string;
      asistio: boolean | null;
      students: { id: string; full_name: string; grupo_activo: string | null } | { id: string; full_name: string; grupo_activo: string | null }[] | null;
    };
    const { data: rvData } = await supabase
      .from("reservas")
      .select("id, asistio, students!reservas_estudiante_id_fkey(id, full_name, grupo_activo)")
      .eq("sesion_id", sesionId)
      .eq("estado", "confirmado");

    const rows = ((rvData as unknown as ReservaRow[]) ?? [])
      .map((r) => {
        const st = Array.isArray(r.students) ? r.students[0] : r.students;
        if (!st) return null;
        return { id: st.id, full_name: st.full_name, grupo_activo: st.grupo_activo, reserva_id: r.id, asistio: r.asistio };
      })
      .filter((r): r is { id: string; full_name: string; grupo_activo: string | null; reserva_id: string; asistio: boolean | null } => r !== null)
      .sort((a, b) => a.full_name.localeCompare(b.full_name));

    const alumnos: StudentRow[] = rows.map(({ id, full_name, grupo_activo, reserva_id }) => ({ id, full_name, grupo_activo, reserva_id }));

    // 3b. Padrón activo del grupo que corresponde al plan. La asistencia no debe
    // depender de que alguien haya inscrito antes a cada alumno en Reservas: si la
    // sesión no tiene ninguna reserva se arranca con el grupo completo, y si tiene
    // algunas queda disponible el botón "Agregar alumnos del grupo".
    const { data: rosterData } = await supabase
      .from("students")
      .select("id, full_name, grupo_activo")
      .eq("status", "activo")
      .in("grupo_activo", GRUPOS_POR_PLAN[p.tipo_plan])
      .order("full_name", { ascending: true });

    const roster: StudentRow[] = ((rosterData as { id: string; full_name: string; grupo_activo: string | null }[]) ?? [])
      .map((st) => ({ id: st.id, full_name: st.full_name, grupo_activo: st.grupo_activo, reserva_id: null }));
    setGrupoRoster(roster);

    const autoCarga = alumnos.length === 0 && roster.length > 0;
    setAutoCargadoDelGrupo(autoCarga);
    setStudents(autoCarga ? roster : alumnos);

    // 4. Seed local attendance state from reservas.asistio
    const map: Record<string, Asistencia> = {};
    rows.forEach((r) => { map[r.id] = r.asistio; });
    if (autoCarga) roster.forEach((r) => { map[r.id] = null; });
    setAsistencias(map);

    // 5. Cargar checks rápidos ya guardados para esta sesión (si la tabla existe)
    const { data: checkData } = await supabase
      .from("progreso_checks")
      .select("student_id, resultado")
      .eq("sesion_id", sesionId);
    const cmap: Record<string, CheckResult> = {};
    (checkData ?? []).forEach((c) => {
      const row = c as { student_id: string; resultado: CheckResult };
      cmap[row.student_id] = row.resultado;
    });
    setChecks(cmap);

    setLoading(false);
  }, [sesionId]);

  useEffect(() => { load(); }, [load]);

  // ── Counters ─────────────────────────────────────────────────────────────
  const total = students.length;
  const presentes = students.filter((s) => asistencias[s.id] === true).length;
  const ausentes = students.filter((s) => asistencias[s.id] === false).length;
  const sinMarcar = students.filter((s) => asistencias[s.id] !== true && asistencias[s.id] !== false).length;

  // Alumnos activos del grupo que todavía no están en la lista de asistencia.
  const faltantes = grupoRoster.filter((r) => !students.some((s) => s.id === r.id));
  const faltantesFiltrados = buscarAlumno.trim()
    ? faltantes.filter((r) => r.full_name.toLowerCase().includes(buscarAlumno.trim().toLowerCase()))
    : faltantes;

  // ── Filter ────────────────────────────────────────────────────────────────
  const studentsFiltered = filtroGrupo === "todos"
    ? students
    : students.filter((s) => s.grupo_activo === filtroGrupo);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function marcar(studentId: string, value: Asistencia) {
    setAsistencias((prev) => (prev[studentId] === value ? prev : { ...prev, [studentId]: value }));
    setSaved(false);
    setConfirmarVacio(false);
  }

  function setCheckFor(studentId: string, value: CheckResult) {
    setChecks((prev) => ({ ...prev, [studentId]: prev[studentId] === value ? null : value }));
    setSaved(false);
  }

  function agregarAlumnos(nuevos: StudentRow[]) {
    if (!nuevos.length) return;
    setStudents((prev) => [...prev, ...nuevos].sort((a, b) => a.full_name.localeCompare(b.full_name)));
    setAsistencias((prev) => {
      const n = { ...prev };
      nuevos.forEach((s) => { if (n[s.id] === undefined) n[s.id] = null; });
      return n;
    });
    setSaved(false);
  }

  function todosPresentes() {
    const map: Record<string, Asistencia> = {};
    students.forEach((s) => { map[s.id] = true; });
    setAsistencias(map);
    setSaved(false);
    setConfirmarVacio(false);
  }

  async function handleGuardar() {
    if (!sesion) return;
    const marcados = students.filter((s) => asistencias[s.id] === true || asistencias[s.id] === false).length;
    if (students.length > 0 && marcados === 0 && !confirmarVacio) {
      setConfirmarVacio(true);
      setError("No hay ningún alumno marcado como presente o ausente. Si guardas así, la sesión queda registrada sin asistencia. Vuelve a pulsar Guardar para confirmar.");
      return;
    }
    setConfirmarVacio(false);
    setSaving(true);
    setError(null);
    try {
      // Los alumnos que llegaron desde el padrón del grupo (sin reserva previa)
      // quedan inscritos como confirmados al guardar, para que la sesión conserve
      // su lista y Reservas muestre lo mismo que se pasó en clase.
      const nuevos = students.filter((s) => !s.reserva_id);
      if (nuevos.length) {
        // Upsert y no insert: reservas tiene UNIQUE (sesion_id, estudiante_id), y un
        // alumno del grupo puede venir con una reserva en_espera (que la lista de
        // asistencia no carga). En ese caso se promueve a confirmado.
        const { data: creadas, error: insErr } = await supabase
          .from("reservas")
          .upsert(nuevos.map((s) => ({
            sesion_id: sesionId,
            estudiante_id: s.id,
            estado: "confirmado",
            posicion_espera: null,
            asistio: asistencias[s.id] ?? null,
          })), { onConflict: "sesion_id,estudiante_id" })
          .select("id, estudiante_id");
        if (insErr) throw new Error(insErr.message);

        const porAlumno = new Map(((creadas as { id: string; estudiante_id: string }[]) ?? []).map((r) => [r.estudiante_id, r.id]));
        setStudents((prev) => prev.map((s) => (s.reserva_id ? s : { ...s, reserva_id: porAlumno.get(s.id) ?? null })));
        setAutoCargadoDelGrupo(false);
      }

      // El upsert va con la fila completa a propósito: PostgREST lo traduce a
      // INSERT ... ON CONFLICT, y Postgres valida los NOT NULL de la fila
      // propuesta ANTES de resolver el conflicto. Mandando solo {id, asistio}
      // reventaba siempre con 'null value in column "sesion_id"'.
      const updates = students
        .filter((s) => s.reserva_id)
        .map((s) => ({
          id: s.reserva_id as string,
          sesion_id: sesionId,
          estudiante_id: s.id,
          estado: "confirmado",
          asistio: asistencias[s.id] ?? null,
        }));

      for (let i = 0; i < updates.length; i += 50) {
        const { error: upsertErr } = await supabase
          .from("reservas")
          .upsert(updates.slice(i, i + 50), { onConflict: "id" });
        if (upsertErr) throw new Error(upsertErr.message);
      }

      // Mark session as attended
      await supabase
        .from("sesiones_semana")
        .update({ asistencia_registrada: true })
        .eq("id", sesionId);

      // Guardar checks rápidos (no bloquea la asistencia si la tabla no existe aún)
      const checkRows = students
        .filter((s) => checks[s.id])
        .map((s) => ({
          student_id: s.id,
          sesion_id: sesionId,
          fecha: sesion.fecha,
          categoria: sesion.tipo_sesion,
          foco: focosDia.join(", ") || null,
          resultado: checks[s.id],
        }));
      if (checkRows.length) {
        const { error: chkErr } = await supabase
          .from("progreso_checks")
          .upsert(checkRows, { onConflict: "student_id,sesion_id" });
        if (chkErr) console.warn("check rápido no guardado:", chkErr.message);
      }

      setSaved(true);
      setSesion((prev) => prev ? { ...prev, asistencia_registrada: true } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  function handleExportCSV() {
    const rows = students.map((s) => {
      const a = asistencias[s.id];
      return [s.full_name, s.grupo_activo ?? "", a === true ? "Presente" : a === false ? "Ausente" : "Sin marcar"];
    });
    const header = ["Nombre", "Grupo", "Asistencia"];
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `asistencia_${sesion?.fecha ?? sesionId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExportPDF() {
    if (!listRef.current) return;
    const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
      import("jspdf"), import("html2canvas"),
    ]);
    const canvas = await html2canvas(listRef.current, { scale: 2, backgroundColor: "#fff", useCORS: true });
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = (canvas.height * pdfW) / canvas.width;
    const pageH = pdf.internal.pageSize.getHeight();
    let y = 0;
    while (y < pdfH) {
      if (y > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", 0, -y, pdfW, pdfH);
      y += pageH;
    }
    pdf.save(`Asistencia_${sesion?.fecha ?? sesionId}.pdf`);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 flex items-center justify-center text-gray-400">
        <svg className="animate-spin mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
        Cargando asistencia...
      </div>
    );
  }

  if (!sesion || !plan) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-gray-500">Sesión no encontrada.</p>
        <button onClick={() => router.push("/programacion")} className="mt-4 text-sm text-blue-600 hover:underline">Volver a Programación</button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* Back */}
      <button onClick={() => router.push("/programacion")} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        Volver a Programación
      </button>

      {/* Session info card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">{plan.tema_semanal}</p>
            <h1 className="text-lg font-bold text-gray-900 capitalize mb-1">{formatFecha(sesion.fecha)}</h1>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                {TIPO_SESION_LABEL[sesion.tipo_sesion] ?? sesion.tipo_sesion}
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                {LUGAR_LABEL[sesion.lugar] ?? sesion.lugar}
              </span>
              {sesion.hora_inicio && (
                <span className="text-xs text-gray-400">{formatHora(sesion.hora_inicio)} – {formatHora(sesion.hora_fin)}</span>
              )}
            </div>
            {sesion.objetivo && <p className="text-xs text-gray-500 mt-2">{sesion.objetivo}</p>}
          </div>
          {sesion.asistencia_registrada && (
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 shrink-0">
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="#059669" strokeWidth={2.5}><path d="M3 10l4 4 9-9"/></svg>
              <span className="text-xs font-semibold text-emerald-700">Asistencia guardada</span>
            </div>
          )}
        </div>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: "Total", value: total, color: "#6b7280" },
          { label: "Presentes", value: presentes, color: "#059669" },
          { label: "Ausentes", value: ausentes, color: "#dc2626" },
          { label: "Sin marcar", value: sinMarcar, color: "#d97706" },
        ].map((item) => (
          <div key={item.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 text-center">
            <p className="text-2xl font-bold" style={{ color: item.color }}>{item.value}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          {plan.tipo_plan === "juvenil" && (
            <select
              value={filtroGrupo}
              onChange={(e) => setFiltroGrupo(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
            >
              <option value="todos">Todos los subgrupos</option>
              {SUBGRUPOS_JUVENIL.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          {faltantes.length > 0 && (
            <button
              onClick={() => setShowAgregar((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 transition-colors"
            >
              + Agregar alumnos del grupo ({faltantes.length})
            </button>
          )}
          <button
            onClick={todosPresentes}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="#059669" strokeWidth={2.5}><path d="M3 10l4 4 9-9"/></svg>
            Todos presentes
          </button>
        </div>
      </div>

      {/* Aviso: la lista se armó con el padrón del grupo, no con reservas previas */}
      {autoCargadoDelGrupo && students.some((s) => !s.reserva_id) && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs text-amber-800">
            Esta sesión no tenía inscritos en Reservas, así que se cargó el grupo completo
            ({students.length} alumnos activos). Al guardar quedan inscritos automáticamente.
          </p>
        </div>
      )}

      {/* Selector para sumar alumnos del grupo que no están en la lista */}
      {showAgregar && (
        <div className="mb-4 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50">
            <input
              type="text"
              value={buscarAlumno}
              onChange={(e) => setBuscarAlumno(e.target.value)}
              placeholder="Buscar alumno del grupo..."
              className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
            />
            <button
              onClick={() => { agregarAlumnos(faltantesFiltrados); setShowAgregar(false); setBuscarAlumno(""); }}
              disabled={faltantesFiltrados.length === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40 shrink-0"
              style={{ background: "#1B4D2E" }}
            >
              Agregar {faltantesFiltrados.length}
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
            {faltantesFiltrados.length === 0 ? (
              <p className="py-6 text-center text-xs text-gray-400">Sin alumnos por agregar.</p>
            ) : faltantesFiltrados.map((r) => (
              <button
                key={r.id}
                onClick={() => agregarAlumnos([r])}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
              >
                <span className="text-sm text-gray-800">{r.full_name}</span>
                <span className="text-[11px] text-gray-400">{r.grupo_activo} · agregar +</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Student list */}
      <div ref={listRef} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-5">
        <div className="px-4 py-3 border-b border-gray-50 bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {studentsFiltered.length} alumnos{filtroGrupo !== "todos" ? ` · ${filtroGrupo}` : ""}
          </p>
          {focosDia.length > 0 && (
            <p className="text-[11px] text-gray-500 mt-1">
              Check del día sobre <span className="font-semibold" style={{ color: "#7d5a00" }}>{focosDia.map(prettifyFoco).join(", ")}</span>
              <span className="text-gray-400"> · ↑ bien · → regular · ↓ bajo</span>
            </p>
          )}
        </div>
        {studentsFiltered.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            {students.length === 0
              ? grupoRoster.length === 0
                ? "No hay alumnos activos en este grupo — revisa el padrón en Alumnos."
                : "Sin alumnos en la lista — usa \"Agregar alumnos del grupo\"."
              : "No hay alumnos en este grupo."}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {studentsFiltered.map((student) => {
              const estado = asistencias[student.id];
              const gc = GRUPO_COLOR[student.grupo_activo ?? ""] ?? { bg: "#f3f4f6", text: "#6b7280" };

              return (
                <div key={student.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={
                        estado === true ? { background: "#dcfce7", color: "#166534" }
                        : estado === false ? { background: "#fee2e2", color: "#991b1b" }
                        : { background: "#f3f4f6", color: "#6b7280" }
                      }
                    >
                      {initiales(student.full_name)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{student.full_name}</p>
                      {student.grupo_activo && (
                        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded" style={{ background: gc.bg, color: gc.text }}>
                          {student.grupo_activo}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Check rápido (si presente) + P / A */}
                  <div className="flex items-center gap-2">
                    {estado === true && (
                      <div className="flex gap-1" title="Check rápido sobre el foco del día">
                        {([
                          ["cumple", "#16a34a", "↑", "Bien"],
                          ["progreso", "#d97706", "→", "Regular"],
                          ["bajo", "#dc2626", "↓", "Bajo"],
                        ] as const).map(([val, color, sym, tit]) => {
                          const on = checks[student.id] === val;
                          return (
                            <button
                              key={val}
                              onClick={() => setCheckFor(student.id, val)}
                              className="w-7 h-7 rounded-md text-sm font-bold transition-all"
                              style={on ? { background: color, color: "#fff" } : { background: "#f3f4f6", color }}
                              title={tit}
                            >
                              {sym}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex gap-1.5 border-l border-gray-100 pl-2">
                      <button
                        onClick={() => marcar(student.id, true)}
                        className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${estado === true ? "bg-emerald-500 text-white shadow-sm" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}
                        title="Presente"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => marcar(student.id, false)}
                        className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${estado === false ? "bg-red-500 text-white shadow-sm" : "bg-red-50 text-red-600 hover:bg-red-100"}`}
                        title="Ausente"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Error */}
      {error && <p className="mb-4 text-xs text-red-500 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}

      {/* Save + Export */}
      <div className="flex flex-col gap-3">
        <button
          onClick={handleGuardar}
          disabled={saving || saved}
          className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-60 transition-all"
          style={{ background: confirmarVacio ? "#b91c1c" : "#1B4D2E" }}
        >
          {saving ? "Guardando..." : saved ? "✓ Asistencia guardada" : confirmarVacio ? "Guardar sin asistencia" : "Guardar asistencia"}
        </button>

        <div className="flex gap-2">
          <button
            onClick={handleExportCSV}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Excel cobros (CSV)
          </button>
          <button
            onClick={handleExportPDF}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            PDF coordinador
          </button>
        </div>
      </div>
    </div>
  );
}
