"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase, type Student } from "@/lib/supabase";
import { isStaff, type Rol } from "@/lib/roles";
import { calcularGrupo, edadDe } from "@/lib/grupos";
import GroupAnalysisModal from "./GroupAnalysisModal";
import DropdownMenu from "./ui/DropdownMenu";
import { Search, X, Trophy, Users, UserPlus, Eye, MoreHorizontal, Pencil, ExternalLink } from "lucide-react";

// Grupos asignables a mano. Birdies/Águilas/Albatros/+14 se calculan por edad, pero
// se dejan elegibles para poder fijar el grupo de un alumno sin fecha de nacimiento.
const GRUPOS_ASIGNABLES = ["Birdies", "Águilas", "Albatros", "+14", "Damas", "Competencia"];

// El padrón no trae estas columnas (son 1.022 filas): la vista rápida las pide
// para un alumno cuando se abre el panel.
type DetalleAlumno = {
  enrollment_date: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  golf_profile: string | null;
  equipment: string | null;
  observations: string | null;
};

type AlumnoFila = Student & { foto_url: string | null };

// Una fila por alumno de la vista student_metrics. presentes/ausentes ya vienen
// sin las reservas que nadie marcó: ver la migración de la vista.
type Metrica = { presentes: number; ausentes: number; tests: number };
const SIN_METRICA: Metrica = { presentes: 0, ausentes: 0, tests: 0 };

const COLUMNAS_PADRON = "id, full_name, birth_date, status, grupo_activo, gender, tiene_talega, foto_url";

type NuevoAlumnoForm = {
  full_name: string;
  birth_date: string;
  gender: string;
  grupo_activo: string;
  status: "activo" | "inactivo";
  tiene_talega: string;
  enrollment_date: string;
  parent_name: string;
  parent_phone: string;
  parent_email: string;
  observations: string;
};

const NUEVO_ALUMNO_VACIO: NuevoAlumnoForm = {
  full_name: "", birth_date: "", gender: "", grupo_activo: "", status: "activo",
  tiene_talega: "", enrollment_date: "", parent_name: "", parent_phone: "",
  parent_email: "", observations: "",
};

type StatusFilter = "todos" | "activo" | "inactivo";
type GroupFilter = "todos" | "Birdies" | "Águilas" | "Albatros" | "+14" | "Damas" | "Competencia";

const GROUPS: { label: string; value: GroupFilter; isSpecial?: boolean }[] = [
  { label: "Todos",       value: "todos" },
  { label: "Birdies",     value: "Birdies" },
  { label: "Águilas",     value: "Águilas" },
  { label: "Albatros",    value: "Albatros" },
  { label: "+14",         value: "+14" },
  { label: "Damas",       value: "Damas" },
  { label: "Competencia", value: "Competencia", isSpecial: true },
];

// Sufijo de las variables CSS de cada grupo (ver .tema-oscuro-alumnos en
// globals.css). El nombre del grupo lleva tilde y símbolos, la variable no.
const GRUPO_VAR: Record<string, string> = {
  "Birdies": "birdies", "Águilas": "aguilas", "Albatros": "albatros",
  "+14": "mas14", "Damas": "damas", "Competencia": "competencia",
};

type Tono = { color: string; background: string };

const TONO_NEUTRO: Tono = { color: "var(--al-text-3)", background: "var(--al-border-soft)" };
const TONO_OK: Tono     = { color: "var(--al-ok)",     background: "var(--al-ok-bg)" };
const TONO_WARN: Tono   = { color: "var(--al-warn)",   background: "var(--al-warn-bg)" };
const TONO_BAD: Tono    = { color: "var(--al-bad)",    background: "var(--al-bad-bg)" };

function tonoGrupo(grupo: string | null): Tono {
  const sufijo = grupo ? GRUPO_VAR[grupo] : undefined;
  if (!sufijo) return TONO_NEUTRO;
  return { color: `var(--al-g-${sufijo}-fg)`, background: `var(--al-g-${sufijo}-bg)` };
}

// null = todavía nadie le marcó asistencia. No es 0 %, que se leería como que
// faltó a todas las clases — la escuela apenas arranca y casi nadie tiene datos.
function porcentajeAsistencia(m: Metrica): number | null {
  const total = m.presentes + m.ausentes;
  if (total === 0) return null;
  return Math.round((m.presentes / total) * 100);
}

function tonoAsistencia(pct: number | null): Tono {
  if (pct === null) return TONO_NEUTRO;
  if (pct >= 85) return TONO_OK;
  if (pct >= 70) return TONO_WARN;
  return TONO_BAD;
}

function tonoTests(n: number): Tono {
  if (n >= 3) return TONO_OK;
  if (n >= 1) return TONO_WARN;
  return TONO_BAD;
}

// Los CHECK de `students` sueltan mensajes como
// 'new row for relation "students" violates check constraint "students_gender_check"',
// que a quien está llenando el formulario no le dicen qué campo corregir.
const CHECK_CONSTRAINT_MSG: Record<string, string> = {
  students_gender_check: "Género: valor no válido. Elige Masculino, Femenino o déjalo sin especificar.",
  students_grupo_activo_check: "Grupo: valor no válido. Elige uno de la lista o déjalo sin grupo.",
  students_status_check: "Estado: valor no válido. Debe ser Activo o Inactivo.",
  students_tiene_talega_check: "Talega propia: valor no válido. Debe ser Sí o No.",
};

function mensajeErrorAlumno(e: { code?: string; message: string }): string {
  switch (e.code) {
    case "23514": {
      const constraint = e.message.match(/check constraint "([^"]+)"/)?.[1];
      return (constraint && CHECK_CONSTRAINT_MSG[constraint])
        ?? "Uno de los campos tiene un valor no válido. Revisa los datos e intenta de nuevo.";
    }
    case "23505":
      return "Ya existe un alumno registrado con esos datos.";
    case "23502":
      return "Falta un campo obligatorio.";
    case "42501":
      return "Tu usuario no tiene permiso para crear alumnos.";
    default:
      return e.message;
  }
}

function formatFecha(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

// 42 alumnos no tienen fecha de nacimiento: sin ella no hay edad que mostrar,
// y un 0 se leería como un bebé.
function textoEdad(birthDate: string | null): string {
  const edad = edadDe(birthDate);
  return edad === null ? "—" : String(edad);
}

function initiales(name: string): string {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

export default function StudentsModule({ currentRol }: { currentRol: Rol | null }) {
  const [students, setStudents] = useState<AlumnoFila[]>([]);
  const [metricas, setMetricas] = useState<Map<string, Metrica>>(new Map());
  const [metricasError, setMetricasError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("activo");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("todos");
  const [soloTalegaPropia, setSoloTalegaPropia] = useState(false);
  const [soloSinGrupo, setSoloSinGrupo] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [showGroupAnalysis, setShowGroupAnalysis] = useState(false);
  const [nuevoForm, setNuevoForm] = useState<NuevoAlumnoForm | null>(null);
  const [creando, setCreando] = useState(false);
  const [crearError, setCrearError] = useState<string | null>(null);
  const [vistaRapida, setVistaRapida] = useState<AlumnoFila | null>(null);
  const [detalle, setDetalle] = useState<DetalleAlumno | null>(null);
  const [detalleError, setDetalleError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      setError(null);

      // PostgREST corta en 1000 filas por defecto y no lo reporta como error:
      // el padrón ya pasa de esa cifra, así que hay que pedir página por página.
      // El desempate por id mantiene el orden estable entre páginas cuando dos
      // alumnos comparten nombre.
      const PAGE_SIZE = 1000;
      const acc: AlumnoFila[] = [];
      let failed = false;

      for (let desde = 0; ; desde += PAGE_SIZE) {
        const { data, error } = await supabase
          .from("students")
          .select(COLUMNAS_PADRON)
          .order("full_name", { ascending: true })
          .order("id", { ascending: true })
          .range(desde, desde + PAGE_SIZE - 1);

        if (error) {
          setError(error.message);
          failed = true;
          break;
        }
        const page = (data ?? []) as unknown as AlumnoFila[];
        acc.push(...page);
        if (page.length < PAGE_SIZE) break;
      }

      // Con una carga fallida se deja la lista vacía: media lista se ve igual
      // que la lista completa y aquí no habría forma de notarlo.
      setStudents(failed ? [] : acc);
      setLoading(false);
    }
    fetchAll();
  }, []);

  // Asistencia y tests salen agregados de la vista student_metrics — una fila
  // por alumno, no una consulta por alumno. Se piden solo las filas con algo
  // que mostrar: un alumno sin reservas ni tests equivale al valor por defecto,
  // y así el resultado no roza el tope de 1.000 filas mientras el padrón crece.
  useEffect(() => {
    async function fetchMetricas() {
      const PAGE_SIZE = 1000;
      const mapa = new Map<string, Metrica>();

      for (let desde = 0; ; desde += PAGE_SIZE) {
        const { data, error } = await supabase
          .from("student_metrics")
          .select("student_id, presentes, ausentes, tests")
          .or("presentes.gt.0,ausentes.gt.0,tests.gt.0")
          .order("student_id", { ascending: true })
          .range(desde, desde + PAGE_SIZE - 1);

        if (error) {
          // El padrón se queda: sin métricas la lista sirve igual, solo que
          // todo sale "sin datos". Perderla entera sería peor.
          setMetricasError(error.message);
          return;
        }
        const page = (data ?? []) as { student_id: string; presentes: number; ausentes: number; tests: number }[];
        for (const r of page) {
          mapa.set(String(r.student_id), { presentes: r.presentes, ausentes: r.ausentes, tests: r.tests });
        }
        if (page.length < PAGE_SIZE) break;
      }
      setMetricasError(null);
      setMetricas(mapa);
    }
    fetchMetricas();
  }, []);

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const matchSearch = s.full_name.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "todos" || s.status === statusFilter;
      const grupoCalculado = calcularGrupo(s.birth_date, s.gender, s.grupo_activo);
      const matchGroup =
        groupFilter === "todos"
          ? true
          : groupFilter === "Competencia"
          ? s.grupo_activo === "Competencia"
          : grupoCalculado === groupFilter;
      const matchTalega = !soloTalegaPropia || s.tiene_talega === "Sí";
      const matchSinGrupo = !soloSinGrupo || !s.grupo_activo;
      return matchSearch && matchStatus && matchGroup && matchTalega && matchSinGrupo;
    });
  }, [students, search, statusFilter, groupFilter, soloTalegaPropia, soloSinGrupo]);

  // Tarjetas destacadas: los mejores por asistencia de lo que se está viendo
  // (el chip de grupo manda; la búsqueda y el estado también aplican, para que
  // las tarjetas nunca muestren a alguien que no está en la lista de abajo).
  // Los que no tienen asistencia marcada van al final, ordenados por nombre.
  const destacados = useMemo(() => {
    const conPct = filtered.map((s) => ({
      alumno: s,
      pct: porcentajeAsistencia(metricas.get(String(s.id)) ?? SIN_METRICA),
    }));
    conPct.sort((a, b) => {
      if (a.pct === null && b.pct === null) return a.alumno.full_name.localeCompare(b.alumno.full_name);
      if (a.pct === null) return 1;
      if (b.pct === null) return -1;
      if (b.pct !== a.pct) return b.pct - a.pct;
      return a.alumno.full_name.localeCompare(b.alumno.full_name);
    });
    return conPct.slice(0, 6);
  }, [filtered, metricas]);

  const sinGrupoCount = useMemo(() => students.filter((s) => !s.grupo_activo).length, [students]);
  const allFilteredSelected = filtered.length > 0 && filtered.every((s) => selected.has(String(s.id)));

  function toggleSelect(id: string) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleSelectAll() {
    setSelected((prev) => {
      const n = new Set(prev);
      if (allFilteredSelected) filtered.forEach((s) => n.delete(String(s.id)));
      else filtered.forEach((s) => n.add(String(s.id)));
      return n;
    });
  }
  async function toggleStatus(student: AlumnoFila) {
    const nuevo = student.status === "activo" ? "inactivo" : "activo";
    setStudents((prev) => prev.map((s) => (s.id === student.id ? { ...s, status: nuevo } : s)));
    const { error: e } = await supabase.from("students").update({ status: nuevo }).eq("id", student.id);
    if (e) {
      setError(e.message);
      setStudents((prev) => prev.map((s) => (s.id === student.id ? { ...s, status: student.status } : s)));
    }
  }
  async function bulkUpdateStatus(nuevo: "activo" | "inactivo") {
    const ids = students.filter((s) => selected.has(String(s.id))).map((s) => s.id);
    if (!ids.length) return;
    setBulkSaving(true);
    const { error: e } = await supabase.from("students").update({ status: nuevo }).in("id", ids);
    setBulkSaving(false);
    if (e) { setError(e.message); return; }
    setStudents((prev) => prev.map((s) => (selected.has(String(s.id)) ? { ...s, status: nuevo } : s)));
    setSelected(new Set());
  }

  function setNuevoField<K extends keyof NuevoAlumnoForm>(key: K, value: NuevoAlumnoForm[K]) {
    setNuevoForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  const cerrarVistaRapida = useCallback(() => {
    setVistaRapida(null);
    setDetalle(null);
    setDetalleError(null);
  }, []);

  async function abrirVistaRapida(alumno: AlumnoFila) {
    setVistaRapida(alumno);
    setDetalle(null);
    setDetalleError(null);
    const { data, error: e } = await supabase
      .from("students")
      .select("enrollment_date, parent_name, parent_phone, parent_email, golf_profile, equipment, observations")
      .eq("id", alumno.id)
      .maybeSingle();
    if (e) { setDetalleError(e.message); return; }
    setDetalle(data as DetalleAlumno);
  }

  useEffect(() => {
    if (!vistaRapida) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") cerrarVistaRapida();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [vistaRapida, cerrarVistaRapida]);

  async function handleCrearAlumno() {
    if (!nuevoForm) return;
    const nombre = nuevoForm.full_name.trim();
    if (!nombre) { setCrearError("El nombre completo es obligatorio."); return; }

    setCreando(true); setCrearError(null);
    const payload = {
      full_name: nombre,
      birth_date: nuevoForm.birth_date || null,
      gender: nuevoForm.gender || null,
      grupo_activo: nuevoForm.grupo_activo || null,
      status: nuevoForm.status,
      tiene_talega: nuevoForm.tiene_talega || null,
      enrollment_date: nuevoForm.enrollment_date || null,
      parent_name: nuevoForm.parent_name.trim() || null,
      parent_phone: nuevoForm.parent_phone.trim() || null,
      parent_email: nuevoForm.parent_email.trim() || null,
      observations: nuevoForm.observations.trim() || null,
    };

    const { data, error: e } = await supabase
      .from("students")
      .insert(payload)
      .select(COLUMNAS_PADRON)
      .single();
    setCreando(false);
    if (e) { setCrearError(mensajeErrorAlumno(e)); return; }

    // Se inserta en la lista ya cargada para no repetir la paginación completa.
    const creado = data as unknown as AlumnoFila;
    setStudents((prev) => [...prev, creado].sort((a, b) => a.full_name.localeCompare(b.full_name)));
    setNuevoForm(null);
    router.push(`/alumnos/${creado.id}`);
  }

  const groupActiveStudents = useMemo(() => {
    if (groupFilter === "todos") return [];
    return students.filter((s) => {
      if (s.status !== "activo") return false;
      const grupoCalculado = calcularGrupo(s.birth_date, s.gender, s.grupo_activo);
      return groupFilter === "Competencia" ? s.grupo_activo === "Competencia" : grupoCalculado === groupFilter;
    });
  }, [students, groupFilter]);

  const groupCounts = useMemo(() => {
    const counts: Record<GroupFilter, number> = { todos: students.length, Birdies: 0, Águilas: 0, Albatros: 0, "+14": 0, Damas: 0, Competencia: 0 };
    for (const s of students) {
      const g = calcularGrupo(s.birth_date, s.gender, s.grupo_activo);
      if (g) counts[g]++;
      if (s.grupo_activo === "Competencia") {
        const gEdad = calcularGrupo(s.birth_date, s.gender, null);
        if (gEdad && gEdad !== "Competencia") counts[gEdad]++;
      }
    }
    return counts;
  }, [students]);

  const counts = useMemo(() => ({
    todos: students.length,
    activo: students.filter((s) => s.status === "activo").length,
    inactivo: students.filter((s) => s.status === "inactivo").length,
    talegaPropia: students.filter((s) => s.tiene_talega === "Sí").length,
  }), [students]);

  const inputClass = "w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2";
  // colorScheme: sin esto el calendario del input date, el caret y las opciones
  // del select salen en claro sobre el campo oscuro. Va en el campo y no en una
  // regla global porque dentro del módulo también vive GroupAnalysisModal, que
  // sigue siendo claro.
  const inputStyle = {
    background: "var(--al-card-alt)",
    border: "1px solid var(--al-border)",
    color: "var(--al-text)",
    colorScheme: "dark" as const,
  };

  return (
    <div className="tema-oscuro-alumnos min-h-screen">
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* HEADER */}
        <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "var(--al-g-aguilas-bg)", border: "1px solid var(--al-border)" }}>
              <Users size={22} style={{ color: "var(--al-gold)" }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: "var(--al-text)" }}>Alumnos</h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--al-text-3)" }}>Gestión de alumnos de la Escuela de Golf</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="hidden sm:flex items-center gap-3">
              <span className="flex items-center gap-1.5" style={{ color: "var(--al-text-2)" }}>
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: "var(--al-ok)" }} />
                {counts.activo} activos
              </span>
              <span style={{ color: "var(--al-border)" }}>·</span>
              <span className="flex items-center gap-1.5" style={{ color: "var(--al-text-3)" }}>
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: "var(--al-text-3)" }} />
                {counts.inactivo} inactivos
              </span>
            </div>
            {currentRol && isStaff(currentRol) && (
              <button
                onClick={() => { setNuevoForm({ ...NUEVO_ALUMNO_VACIO }); setCrearError(null); }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 shrink-0"
                style={{ background: "var(--al-gold)", color: "var(--al-bg)" }}
              >
                <UserPlus size={16} />
                Nuevo alumno
              </button>
            )}
          </div>
        </div>

        {/* BARRA BÚSQUEDA + FILTROS */}
        <div className="rounded-xl p-4 mb-3 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center"
          style={{ background: "var(--al-card)", border: "1px solid var(--al-border)" }}>
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--al-text-3)" }} />
            <input
              type="text"
              placeholder="Buscar por nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2"
              style={inputStyle}
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--al-text-3)" }}>
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex gap-1 rounded-lg p-1 self-start sm:self-auto shrink-0" style={{ background: "var(--al-card-alt)" }}>
            {(["todos", "activo", "inactivo"] as StatusFilter[]).map((s) => {
              const active = statusFilter === s;
              return (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors"
                  style={active
                    ? { background: "var(--al-g-aguilas-bg)", color: "var(--al-g-aguilas-fg)" }
                    : { color: "var(--al-text-3)" }}>
                  {s === "todos" ? `Todos (${counts.todos})` : s === "activo" ? `Activos (${counts.activo})` : `Inactivos (${counts.inactivo})`}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setSoloTalegaPropia((v) => !v)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors self-start sm:self-auto shrink-0"
            style={soloTalegaPropia
              ? { background: "var(--al-gold)", color: "var(--al-bg)", border: "1px solid var(--al-gold)" }
              : { color: "var(--al-text-2)", border: "1px solid var(--al-border)" }}
          >
            Talega propia ({counts.talegaPropia})
          </button>
          <button
            onClick={() => setSoloSinGrupo((v) => !v)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors self-start sm:self-auto shrink-0"
            style={soloSinGrupo
              ? { background: "var(--al-gold)", color: "var(--al-bg)", border: "1px solid var(--al-gold)" }
              : { color: "var(--al-text-2)", border: "1px solid var(--al-border)" }}
          >
            Sin grupo ({sinGrupoCount})
          </button>
        </div>

        {/* CHIPS DE GRUPO */}
        <div className="rounded-xl px-4 py-3 mb-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between"
          style={{ background: "var(--al-card)", border: "1px solid var(--al-border)" }}>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {GROUPS.map(({ label, value, isSpecial }) => {
              const active = groupFilter === value;
              const count = groupCounts[value];
              const tono = value === "todos" ? TONO_NEUTRO : tonoGrupo(value);
              return (
                <button key={value} onClick={() => setGroupFilter(value)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all shrink-0"
                  style={active
                    ? { background: tono.background, color: tono.color, border: `1px solid ${tono.color}` }
                    : { background: "transparent", color: "var(--al-text-2)", border: "1px solid var(--al-border)" }}>
                  {isSpecial && <Trophy size={13} />}
                  {label}
                  {value !== "todos" && (
                    <span className="text-xs rounded-full px-1.5 py-0.5 font-semibold"
                      style={{ background: "var(--al-bg)", color: active ? tono.color : "var(--al-text-3)" }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {currentRol && isStaff(currentRol) && (
            <button
              onClick={() => groupFilter !== "todos" && setShowGroupAnalysis(true)}
              disabled={groupFilter === "todos"}
              title={groupFilter === "todos" ? "Selecciona un grupo primero" : undefined}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium shrink-0 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-90"
              style={{ background: "var(--al-g-aguilas-bg)", color: "var(--al-g-aguilas-fg)", border: "1px solid var(--al-border)" }}
            >
              Análisis grupal con Paco 🦅
            </button>
          )}
        </div>

        {/* PERFILES DESTACADOS */}
        {!loading && !error && destacados.length > 0 && (
          <div className="mb-4">
            <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: "var(--al-text-3)" }}>
              {groupFilter === "todos" ? "Perfiles destacados" : `Destacados de ${groupFilter}`}
              <span className="font-medium normal-case tracking-normal ml-1.5">— por asistencia</span>
            </p>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6">
              {destacados.map(({ alumno, pct }, i) => (
                <TarjetaPerfil
                  key={String(alumno.id)}
                  alumno={alumno}
                  pct={pct}
                  metrica={metricas.get(String(alumno.id)) ?? SIN_METRICA}
                  // Con 4 columnas las dos últimas romperían la fila: solo
                  // aparecen cuando la rejilla tiene las 6.
                  oculta={i >= 4}
                  onVer={() => abrirVistaRapida(alumno)}
                  onAbrir={() => router.push(`/alumnos/${alumno.id}`)}
                />
              ))}
            </div>
          </div>
        )}

        {/* BARRA DE ACCIÓN EN BLOQUE */}
        {selected.size > 0 && (
          <div className="rounded-xl px-4 py-2.5 mb-3 flex items-center justify-between gap-3 flex-wrap"
            style={{ background: "var(--al-g-aguilas-bg)", border: "1px solid var(--al-border)" }}>
            <span className="text-sm font-medium" style={{ color: "var(--al-text)" }}>
              {selected.size} seleccionado{selected.size > 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => bulkUpdateStatus("inactivo")} disabled={bulkSaving}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                style={{ background: "var(--al-card)", color: "var(--al-text)" }}>
                {bulkSaving ? "Guardando…" : "Marcar inactivos"}
              </button>
              <button onClick={() => bulkUpdateStatus("activo")} disabled={bulkSaving}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                style={{ background: "var(--al-card)", color: "var(--al-text)" }}>
                Marcar activos
              </button>
              <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ color: "var(--al-text-2)" }}>Limpiar</button>
            </div>
          </div>
        )}

        {metricasError && (
          <div className="rounded-lg px-4 py-2.5 mb-3 text-xs"
            style={{ background: "var(--al-warn-bg)", color: "var(--al-warn)", border: "1px solid var(--al-border)" }}>
            No se pudieron cargar asistencia y tests ({metricasError}). El padrón se muestra completo, pero esas dos columnas quedan sin datos.
          </div>
        )}

        {/* TABLA */}
        <div className="rounded-xl overflow-hidden" style={{ background: "var(--al-card)", border: "1px solid var(--al-border)" }}>
          {loading ? (
            <div className="flex items-center justify-center py-20" style={{ color: "var(--al-text-3)" }}>
              <svg className="animate-spin mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Cargando alumnos...
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2" style={{ color: "var(--al-bad)" }}>
              <p className="text-sm">Error al cargar los datos: {error}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "var(--al-card-alt)", borderBottom: "1px solid var(--al-border)" }}>
                      <th className="px-4 py-3 w-10">
                        <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} title="Seleccionar todos los filtrados" className="w-4 h-4 cursor-pointer" style={{ accentColor: "var(--al-gold)", colorScheme: "dark" }} />
                      </th>
                      {["Alumno", "Edad", "Asistencia", "Tests", "Estado"].map((h) => (
                        <th key={h} className="text-left px-5 py-3 font-semibold tracking-wide text-xs uppercase" style={{ color: "var(--al-text-3)" }}>{h}</th>
                      ))}
                      <th className="text-right px-5 py-3 font-semibold tracking-wide text-xs uppercase" style={{ color: "var(--al-text-3)" }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-16" style={{ color: "var(--al-text-3)" }}>
                          {search ? `No se encontraron alumnos con "${search}"` : "No hay alumnos en esta categoría"}
                        </td>
                      </tr>
                    ) : (
                      filtered.map((student, idx) => {
                        const grupoMostrar = calcularGrupo(student.birth_date, student.gender, student.grupo_activo);
                        const metrica = metricas.get(String(student.id)) ?? SIN_METRICA;
                        const pct = porcentajeAsistencia(metrica);
                        return (
                          <tr
                            key={String(student.id)}
                            className="cursor-pointer transition-colors"
                            style={{
                              background: idx % 2 === 1 ? "var(--al-card-alt)" : "transparent",
                              borderTop: "1px solid var(--al-border-soft)",
                            }}
                            onClick={() => router.push(`/alumnos/${student.id}`)}
                          >
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" checked={selected.has(String(student.id))} onChange={() => toggleSelect(String(student.id))} className="w-4 h-4 cursor-pointer" style={{ accentColor: "var(--al-gold)", colorScheme: "dark" }} />
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Avatar alumno={student} grupo={grupoMostrar} size={34} />
                                <div className="min-w-0">
                                  <p className="font-medium truncate" style={{ color: "var(--al-text)" }}>{student.full_name}</p>
                                  {grupoMostrar && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold mt-0.5" style={tonoGrupo(grupoMostrar)}>
                                      {grupoMostrar}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3 tabular-nums" style={{ color: "var(--al-text-2)" }}>{textoEdad(student.birth_date)}</td>
                            <td className="px-5 py-3">
                              <Indicador texto={pct === null ? "sin datos" : `${pct}%`} tono={tonoAsistencia(pct)} />
                            </td>
                            <td className="px-5 py-3">
                              <Indicador texto={`${metrica.tests}/3`} tono={tonoTests(metrica.tests)} />
                            </td>
                            <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => toggleStatus(student)} title="Cambiar activo / inactivo" className="cursor-pointer focus:outline-none">
                                <StatusBadge status={student.status} />
                              </button>
                            </td>
                            <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => abrirVistaRapida(student)}
                                  title="Vista rápida"
                                  aria-label={`Vista rápida de ${student.full_name}`}
                                  className="p-1.5 rounded-lg transition-colors hover:opacity-80"
                                  style={{ color: "var(--al-text-2)" }}
                                >
                                  <Eye size={16} />
                                </button>
                                <DropdownMenu
                                  ariaLabel={`Acciones de ${student.full_name}`}
                                  align="right"
                                  minWidth={190}
                                  buttonClassName="p-1.5 rounded-lg transition-colors hover:opacity-80"
                                  buttonStyle={{ color: "var(--al-text-2)" }}
                                  trigger={<MoreHorizontal size={16} />}
                                  items={[
                                    { label: "Vista rápida", icon: <Eye size={14} />, onSelect: () => abrirVistaRapida(student) },
                                    { label: "Abrir perfil completo", icon: <ExternalLink size={14} />, onSelect: () => router.push(`/alumnos/${student.id}`) },
                                    { label: "Editar datos", icon: <Pencil size={14} />, onSelect: () => router.push(`/alumnos/${student.id}?editar=1`) },
                                    {
                                      label: student.status === "activo" ? "Marcar inactivo" : "Marcar activo",
                                      separatorBefore: true,
                                      onSelect: () => toggleStatus(student),
                                    },
                                  ]}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {filtered.length > 0 && (
                <div className="px-5 py-3 text-xs" style={{ borderTop: "1px solid var(--al-border-soft)", color: "var(--al-text-3)" }}>
                  Mostrando {filtered.length} de {students.length} alumnos
                  {groupFilter !== "todos" && (
                    <span className="ml-1">· filtro: <span className="font-medium" style={{ color: "var(--al-gold)" }}>{groupFilter}</span></span>
                  )}
                  {soloTalegaPropia && (
                    <span className="ml-1">· <span className="font-medium" style={{ color: "var(--al-gold)" }}>talega propia</span></span>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* VISTA RÁPIDA */}
        {vistaRapida && (
          <VistaRapida
            alumno={vistaRapida}
            detalle={detalle}
            detalleError={detalleError}
            metrica={metricas.get(String(vistaRapida.id)) ?? SIN_METRICA}
            onClose={cerrarVistaRapida}
            onEditar={() => router.push(`/alumnos/${vistaRapida.id}?editar=1`)}
            onAbrirPerfil={() => router.push(`/alumnos/${vistaRapida.id}`)}
          />
        )}

        {/* MODAL NUEVO ALUMNO */}
        {nuevoForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8" onClick={() => !creando && setNuevoForm(null)}>
            <div className="tema-oscuro-alumnos rounded-2xl shadow-xl w-full max-w-lg max-h-full overflow-y-auto"
              style={{ background: "var(--al-card)", border: "1px solid var(--al-border)" }}
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 sticky top-0 rounded-t-2xl"
                style={{ background: "var(--al-card)", borderBottom: "1px solid var(--al-border)" }}>
                <h2 className="text-base font-bold" style={{ color: "var(--al-text)" }}>Nuevo alumno</h2>
                <button onClick={() => setNuevoForm(null)} disabled={creando} className="disabled:opacity-40" style={{ color: "var(--al-text-3)" }}>
                  <X size={18} />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                <Campo label="Nombre completo *">
                  <input type="text" autoFocus value={nuevoForm.full_name}
                    onChange={(e) => setNuevoField("full_name", e.target.value)}
                    className={inputClass} style={inputStyle} />
                </Campo>

                <div className="grid grid-cols-2 gap-3">
                  <Campo label="Fecha de nacimiento">
                    <input type="date" value={nuevoForm.birth_date} onChange={(e) => setNuevoField("birth_date", e.target.value)}
                      className={inputClass} style={inputStyle} />
                  </Campo>
                  <Campo label="Género">
                    <select value={nuevoForm.gender} onChange={(e) => setNuevoField("gender", e.target.value)}
                      className={inputClass} style={inputStyle}>
                      <option value="">Sin especificar</option>
                      <option value="masculino">Masculino</option>
                      <option value="femenino">Femenino</option>
                    </select>
                  </Campo>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Campo label="Grupo">
                    <select value={nuevoForm.grupo_activo} onChange={(e) => setNuevoField("grupo_activo", e.target.value)}
                      className={inputClass} style={inputStyle}>
                      <option value="">Sin grupo (se calcula por edad)</option>
                      {GRUPOS_ASIGNABLES.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Estado">
                    <select value={nuevoForm.status} onChange={(e) => setNuevoField("status", e.target.value as "activo" | "inactivo")}
                      className={inputClass} style={inputStyle}>
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                    </select>
                  </Campo>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Campo label="Talega propia">
                    <select value={nuevoForm.tiene_talega} onChange={(e) => setNuevoField("tiene_talega", e.target.value)}
                      className={inputClass} style={inputStyle}>
                      <option value="">Sin especificar</option>
                      <option value="Sí">Sí</option>
                      <option value="No">No</option>
                    </select>
                  </Campo>
                  <Campo label="Fecha de ingreso">
                    <input type="date" value={nuevoForm.enrollment_date} onChange={(e) => setNuevoField("enrollment_date", e.target.value)}
                      className={inputClass} style={inputStyle} />
                  </Campo>
                </div>

                <div className="pt-2" style={{ borderTop: "1px solid var(--al-border-soft)" }}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--al-text-3)" }}>Acudiente</p>
                  <div className="space-y-3">
                    <Campo label="Nombre del acudiente">
                      <input type="text" value={nuevoForm.parent_name} onChange={(e) => setNuevoField("parent_name", e.target.value)}
                        className={inputClass} style={inputStyle} />
                    </Campo>
                    <div className="grid grid-cols-2 gap-3">
                      <Campo label="Teléfono">
                        <input type="tel" value={nuevoForm.parent_phone} onChange={(e) => setNuevoField("parent_phone", e.target.value)}
                          className={inputClass} style={inputStyle} />
                      </Campo>
                      <Campo label="Correo">
                        <input type="email" value={nuevoForm.parent_email} onChange={(e) => setNuevoField("parent_email", e.target.value)}
                          className={inputClass} style={inputStyle} />
                      </Campo>
                    </div>
                  </div>
                </div>

                <Campo label="Observaciones">
                  <textarea rows={2} value={nuevoForm.observations} onChange={(e) => setNuevoField("observations", e.target.value)}
                    className={`${inputClass} resize-none`} style={inputStyle} />
                </Campo>

                {crearError && (
                  <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "var(--al-bad-bg)", color: "var(--al-bad)" }}>{crearError}</p>
                )}
              </div>

              <div className="flex gap-2 px-6 py-4 sticky bottom-0 rounded-b-2xl"
                style={{ background: "var(--al-card)", borderTop: "1px solid var(--al-border)" }}>
                <button onClick={() => setNuevoForm(null)} disabled={creando}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
                  style={{ border: "1px solid var(--al-border)", color: "var(--al-text-2)" }}>
                  Cancelar
                </button>
                <button onClick={handleCrearAlumno} disabled={creando || !nuevoForm.full_name.trim()}
                  className="flex-1 py-2.5 rounded-lg text-sm font-bold disabled:opacity-40"
                  style={{ background: "var(--al-gold)", color: "var(--al-bg)" }}>
                  {creando ? "Creando…" : "Crear alumno"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showGroupAnalysis && groupFilter !== "todos" && (
          <GroupAnalysisModal
            grupo={groupFilter}
            students={groupActiveStudents.map((s) => ({ id: String(s.id), full_name: s.full_name }))}
            onClose={() => setShowGroupAnalysis(false)}
          />
        )}
      </div>
    </div>
  );
}

// Manda la foto. Las iniciales sobre el color del grupo son el respaldo cuando
// no hay foto_url — o cuando el archivo ya no está y la imagen falla, que si no
// dejaría un cuadro vacío.
function Avatar({ alumno, grupo, size }: { alumno: AlumnoFila; grupo: string | null; size: number }) {
  // Se guarda la URL que falló, no un booleano: así una foto nueva vuelve a
  // intentarse sola sin tener que reiniciar el estado desde un efecto.
  const [urlFallida, setUrlFallida] = useState<string | null>(null);

  if (alumno.foto_url && urlFallida !== alumno.foto_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={alumno.foto_url}
        alt={alumno.full_name}
        onError={() => setUrlFallida(alumno.foto_url)}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size, border: "1px solid var(--al-border)" }}
      />
    );
  }
  return (
    <span
      className="rounded-full inline-flex items-center justify-center font-bold shrink-0"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), ...tonoGrupo(grupo) }}
    >
      {initiales(alumno.full_name)}
    </span>
  );
}

function Indicador({ texto, tono }: { texto: string; tono: Tono }) {
  return (
    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold tabular-nums" style={tono}>
      {texto}
    </span>
  );
}

function TarjetaPerfil({ alumno, pct, metrica, oculta, onVer, onAbrir }: {
  alumno: AlumnoFila;
  pct: number | null;
  metrica: Metrica;
  oculta: boolean;
  onVer: () => void;
  onAbrir: () => void;
}) {
  const grupo = calcularGrupo(alumno.birth_date, alumno.gender, alumno.grupo_activo);
  const edad = edadDe(alumno.birth_date);
  const tonoP = tonoAsistencia(pct);

  return (
    <div
      className={`${oculta ? "hidden 2xl:flex" : "flex"} flex-col items-center text-center rounded-xl p-4 relative cursor-pointer transition-transform hover:-translate-y-0.5`}
      style={{ background: "var(--al-card)", border: "1px solid var(--al-border)" }}
      onClick={onAbrir}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onVer(); }}
        title="Vista rápida"
        aria-label={`Vista rápida de ${alumno.full_name}`}
        className="absolute top-2 right-2 p-1.5 rounded-lg hover:opacity-80"
        style={{ color: "var(--al-text-3)" }}
      >
        <Eye size={15} />
      </button>

      <Avatar alumno={alumno} grupo={grupo} size={78} />

      <p className="mt-2.5 text-sm font-semibold leading-tight line-clamp-2 flex items-center justify-center"
        // Dos líneas fijas: sin esto un nombre largo empuja hacia abajo el
        // bloque de asistencia y las tarjetas de la fila dejan de alinear.
        style={{ color: "var(--al-text)", minHeight: "2.5rem" }}>
        {alumno.full_name}
      </p>
      <span className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold" style={tonoGrupo(grupo)}>
        {grupo ?? "Sin grupo"} · {edad === null ? "—" : `${edad} años`}
      </span>

      <div className="mt-3 w-full rounded-lg py-2.5" style={{ background: tonoP.background }}>
        <p className="text-2xl font-bold leading-none tabular-nums" style={{ color: tonoP.color }}>
          {pct === null ? "—" : `${pct}%`}
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-wide mt-1" style={{ color: tonoP.color }}>
          {pct === null ? "sin datos" : "asistencia"}
        </p>
      </div>

      <div className="mt-2 w-full flex gap-2 text-[11px]">
        <div className="flex-1 rounded-lg py-1.5" style={{ background: "var(--al-card-alt)" }}>
          <p className="font-semibold" style={{ color: alumno.tiene_talega === "Sí" ? "var(--al-ok)" : "var(--al-text-3)" }}>
            {alumno.tiene_talega === "Sí" ? "Sí" : alumno.tiene_talega === "No" ? "No" : "—"}
          </p>
          <p style={{ color: "var(--al-text-3)" }}>Talega</p>
        </div>
        <div className="flex-1 rounded-lg py-1.5" style={{ background: "var(--al-card-alt)" }}>
          <p className="font-semibold tabular-nums" style={{ color: tonoTests(metrica.tests).color }}>{metrica.tests}/3</p>
          <p style={{ color: "var(--al-text-3)" }}>Tests</p>
        </div>
      </div>
    </div>
  );
}

// Panel de solo lectura: la idea es no tener que entrar al perfil completo
// salvo para editar. Los campos vacíos se muestran como "Sin registrar" en vez
// de esconderse — hoy casi ningún alumno tiene acudiente cargado y eso es
// justamente lo que hay que ver.
function VistaRapida({ alumno, detalle, detalleError, metrica, onClose, onEditar, onAbrirPerfil }: {
  alumno: AlumnoFila;
  detalle: DetalleAlumno | null;
  detalleError: string | null;
  metrica: Metrica;
  onClose: () => void;
  onEditar: () => void;
  onAbrirPerfil: () => void;
}) {
  const grupo = calcularGrupo(alumno.birth_date, alumno.gender, alumno.grupo_activo);
  const edad = edadDe(alumno.birth_date);
  const pct = porcentajeAsistencia(metrica);
  const cargando = !detalle && !detalleError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8" onClick={onClose}>
      <div
        className="tema-oscuro-alumnos rounded-2xl shadow-xl w-full max-w-xl max-h-full overflow-y-auto"
        style={{ background: "var(--al-card)", border: "1px solid var(--al-border)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Vista rápida de ${alumno.full_name}`}
      >
        <div className="flex items-start gap-4 px-6 py-5" style={{ borderBottom: "1px solid var(--al-border)" }}>
          <Avatar alumno={alumno} grupo={grupo} size={72} />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold leading-tight" style={{ color: "var(--al-text)" }}>{alumno.full_name}</h2>
            <p className="text-xs mt-1" style={{ color: "var(--al-text-3)" }}>
              {grupo ?? "Sin grupo"} · {edad === null ? "edad —" : `${edad} años`} · nac. {formatFecha(alumno.birth_date)} · ingreso {detalle ? formatFecha(detalle.enrollment_date) : "…"}
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ color: "var(--al-text-3)" }}>
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 grid grid-cols-3 gap-2">
          <IndicadorPanel etiqueta="Asistencia" valor={pct === null ? "sin datos" : `${pct}%`} tono={tonoAsistencia(pct)} />
          <IndicadorPanel etiqueta="Tests" valor={`${metrica.tests}/3`} tono={tonoTests(metrica.tests)} />
          <IndicadorPanel
            etiqueta="Talega"
            valor={alumno.tiene_talega ?? "Sin registrar"}
            tono={alumno.tiene_talega === "Sí" ? TONO_OK : TONO_NEUTRO}
          />
        </div>

        <div className="px-6 pb-5 space-y-3">
          {detalleError && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "var(--al-bad-bg)", color: "var(--al-bad)" }}>
              No se pudieron cargar los datos del alumno: {detalleError}
            </p>
          )}

          <BloqueDato titulo="Acudiente" cargando={cargando}>
            <Dato etiqueta="Nombre" valor={detalle?.parent_name} />
            <Dato etiqueta="Teléfono" valor={detalle?.parent_phone} />
            <Dato etiqueta="Correo" valor={detalle?.parent_email} />
          </BloqueDato>

          <BloqueDato titulo="Equipo" cargando={cargando}>
            <Dato valor={detalle?.equipment} />
          </BloqueDato>

          <BloqueDato titulo="Perfil de golf" cargando={cargando}>
            <Dato valor={detalle?.golf_profile} />
          </BloqueDato>

          <BloqueDato titulo="Observaciones" cargando={cargando}>
            <Dato valor={detalle?.observations} />
          </BloqueDato>
        </div>

        <div className="flex gap-2 px-6 py-4 sticky bottom-0 rounded-b-2xl"
          style={{ background: "var(--al-card)", borderTop: "1px solid var(--al-border)" }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-medium"
            style={{ border: "1px solid var(--al-border)", color: "var(--al-text-2)" }}>
            Cerrar
          </button>
          <button onClick={onEditar} className="flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5"
            style={{ border: "1px solid var(--al-border)", color: "var(--al-text)", background: "var(--al-card-alt)" }}>
            <Pencil size={14} /> Editar
          </button>
          <button onClick={onAbrirPerfil} className="flex-1 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5"
            style={{ background: "var(--al-gold)", color: "var(--al-bg)" }}>
            <ExternalLink size={14} /> Perfil completo
          </button>
        </div>
      </div>
    </div>
  );
}

function IndicadorPanel({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono: Tono }) {
  return (
    <div className="rounded-lg py-2.5 text-center" style={{ background: tono.background }}>
      <p className="text-lg font-bold leading-none tabular-nums" style={{ color: tono.color }}>{valor}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide mt-1" style={{ color: tono.color }}>{etiqueta}</p>
    </div>
  );
}

function BloqueDato({ titulo, cargando, children }: { titulo: string; cargando: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-lg px-3.5 py-3" style={{ background: "var(--al-card-alt)", border: "1px solid var(--al-border-soft)" }}>
      <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--al-text-3)" }}>{titulo}</p>
      {cargando ? <p className="text-sm" style={{ color: "var(--al-text-3)" }}>Cargando…</p> : <div className="space-y-1">{children}</div>}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta?: string; valor?: string | null }) {
  const vacio = !valor || !valor.trim();
  return (
    <p className="text-sm leading-snug">
      {etiqueta && <span style={{ color: "var(--al-text-3)" }}>{etiqueta}: </span>}
      <span style={{ color: vacio ? "var(--al-text-3)" : "var(--al-text)", fontStyle: vacio ? "italic" : "normal" }}>
        {vacio ? "Sin registrar" : valor}
      </span>
    </p>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium mb-1" style={{ color: "var(--al-text-3)" }}>{label}</span>
      {children}
    </label>
  );
}

function StatusBadge({ status }: { status: Student["status"] }) {
  const tono = status === "activo" ? TONO_OK : TONO_NEUTRO;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold" style={tono}>
      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: tono.color }} />
      {status === "activo" ? "Activo" : "Inactivo"}
    </span>
  );
}
