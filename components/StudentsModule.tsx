"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase, type Student } from "@/lib/supabase";
import { isStaff, type Rol } from "@/lib/roles";
import { calcularGrupo } from "@/lib/grupos";
import GroupAnalysisModal from "./GroupAnalysisModal";
import { Search, X, Trophy, Users, UserPlus } from "lucide-react";

// Grupos asignables a mano. Birdies/Águilas/Albatros/+14 se calculan por edad, pero
// se dejan elegibles para poder fijar el grupo de un alumno sin fecha de nacimiento.
const GRUPOS_ASIGNABLES = ["Birdies", "Águilas", "Albatros", "+14", "Damas", "Competencia"];

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

function initiales(name: string): string {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

export default function StudentsModule({ currentRol }: { currentRol: Rol | null }) {
  const [students, setStudents] = useState<Student[]>([]);
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
      const acc: Student[] = [];
      let failed = false;

      for (let desde = 0; ; desde += PAGE_SIZE) {
        const { data, error } = await supabase
          .from("students")
          .select("id, full_name, birth_date, status, grupo_activo, gender, tiene_talega")
          .order("full_name", { ascending: true })
          .order("id", { ascending: true })
          .range(desde, desde + PAGE_SIZE - 1);

        if (error) {
          setError(error.message);
          failed = true;
          break;
        }
        const page = data ?? [];
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
  async function toggleStatus(student: Student) {
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
      .select("id, full_name, birth_date, status, grupo_activo, gender, tiene_talega")
      .single();
    setCreando(false);
    if (e) { setCrearError(mensajeErrorAlumno(e)); return; }

    // Se inserta en la lista ya cargada para no repetir la paginación completa.
    setStudents((prev) => [...prev, data as Student].sort((a, b) => a.full_name.localeCompare(b.full_name)));
    setNuevoForm(null);
    router.push(`/alumnos/${(data as Student).id}`);
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

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
      {/* HEADER */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-ccb-green flex items-center justify-center shrink-0">
            <Users size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ccb-green">Alumnos</h1>
            <p className="text-sm text-(--text-muted) mt-0.5">Gestión de alumnos de la Escuela de Golf</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="hidden sm:flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-gray-600">
              <span className="inline-block w-2 h-2 rounded-full bg-ccb-green" />
              {counts.activo} activos
            </span>
            <span className="text-gray-300">·</span>
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="inline-block w-2 h-2 rounded-full bg-gray-300" />
              {counts.inactivo} inactivos
            </span>
          </div>
          {currentRol && isStaff(currentRol) && (
            <button
              onClick={() => { setNuevoForm({ ...NUEVO_ALUMNO_VACIO }); setCrearError(null); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-ccb-green text-white hover:bg-[#245038] transition-colors shrink-0"
            >
              <UserPlus size={16} />
              Nuevo alumno
            </button>
          )}
        </div>
      </div>

      {/* BARRA BÚSQUEDA + FILTROS */}
      <div className="bg-white rounded-xl shadow-sm border border-(--border) p-4 mb-3 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-ccb-gold focus:ring-2 focus:ring-ccb-gold/20 transition"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 self-start sm:self-auto shrink-0">
          {(["todos", "activo", "inactivo"] as StatusFilter[]).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                statusFilter === s ? "bg-ccb-green text-white" : "text-gray-600 hover:text-gray-900"
              }`}>
              {s === "todos" ? `Todos (${counts.todos})` : s === "activo" ? `Activos (${counts.activo})` : `Inactivos (${counts.inactivo})`}
            </button>
          ))}
        </div>

        <button
          onClick={() => setSoloTalegaPropia((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors self-start sm:self-auto shrink-0 border ${
            soloTalegaPropia
              ? "bg-ccb-green text-white border-ccb-green"
              : "text-gray-600 border-gray-200 bg-white hover:border-gray-300"
          }`}
        >
          Talega propia ({counts.talegaPropia})
        </button>
        <button
          onClick={() => setSoloSinGrupo((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors self-start sm:self-auto shrink-0 border ${
            soloSinGrupo
              ? "bg-ccb-green text-white border-ccb-green"
              : "text-gray-600 border-gray-200 bg-white hover:border-gray-300"
          }`}
        >
          Sin grupo ({sinGrupoCount})
        </button>
      </div>

      {/* CHIPS DE GRUPO */}
      <div className="bg-white rounded-xl shadow-sm border border-(--border) px-4 py-3 mb-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {GROUPS.map(({ label, value, isSpecial }) => {
            const active = groupFilter === value;
            const count = groupCounts[value];
            return (
              <button key={value} onClick={() => setGroupFilter(value)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all shrink-0 border ${
                  active && isSpecial
                    ? "bg-ccb-gold text-ccb-green border-transparent shadow"
                    : active
                    ? "bg-ccb-green text-white border-transparent shadow"
                    : isSpecial
                    ? "text-amber-800 bg-amber-50/50 border-ccb-gold/40"
                    : "text-gray-700 bg-transparent border-gray-200 hover:border-gray-300"
                }`}>
                {isSpecial && <Trophy size={13} />}
                {label}
                {value !== "todos" && (
                  <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${
                    active
                      ? isSpecial ? "bg-ccb-green/15 text-ccb-green" : "bg-white/20 text-white"
                      : "bg-gray-100 text-gray-500"
                  }`}>
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
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium shrink-0 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity bg-[#1a3a2a] text-white hover:bg-[#245038]"
          >
            Análisis grupal con Paco 🦅
          </button>
        )}
      </div>

      {/* BARRA DE ACCIÓN EN BLOQUE */}
      {selected.size > 0 && (
        <div className="bg-ccb-green text-white rounded-xl px-4 py-2.5 mb-3 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm font-medium">{selected.size} seleccionado{selected.size > 1 ? "s" : ""}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => bulkUpdateStatus("inactivo")} disabled={bulkSaving} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/15 hover:bg-white/25 disabled:opacity-50">
              {bulkSaving ? "Guardando…" : "Marcar inactivos"}
            </button>
            <button onClick={() => bulkUpdateStatus("activo")} disabled={bulkSaving} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/15 hover:bg-white/25 disabled:opacity-50">
              Marcar activos
            </button>
            <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/80 hover:text-white">Limpiar</button>
          </div>
        </div>
      )}

      {/* TABLA */}
      <div className="bg-white rounded-xl shadow-sm border border-(--border) overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <svg className="animate-spin mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Cargando alumnos...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-red-600">
            <p className="text-sm">Error al cargar los datos: {error}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 w-10">
                      <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} title="Seleccionar todos los filtrados" className="w-4 h-4 accent-[#1B4D2E] cursor-pointer" />
                    </th>
                    <th className="text-left px-5 py-3 font-semibold tracking-wide text-xs uppercase text-gray-500">Nombre</th>
                    <th className="text-left px-5 py-3 font-semibold tracking-wide text-xs uppercase text-gray-500">Fecha de nacimiento</th>
                    <th className="text-left px-5 py-3 font-semibold tracking-wide text-xs uppercase text-gray-500">Grupo</th>
                    <th className="text-left px-5 py-3 font-semibold tracking-wide text-xs uppercase text-gray-500">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-16 text-gray-400">
                        {search ? `No se encontraron alumnos con "${search}"` : "No hay alumnos en esta categoría"}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((student) => {
                      const grupoMostrar = calcularGrupo(student.birth_date, student.gender, student.grupo_activo);
                      const isCompetencia = student.grupo_activo === "Competencia";
                      return (
                        <tr
                          key={student.id}
                          className="border-t border-gray-50 cursor-pointer transition-colors hover:bg-ccb-gold/[0.06]"
                          onClick={() => router.push(`/alumnos/${student.id}`)}
                        >
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={selected.has(String(student.id))} onChange={() => toggleSelect(String(student.id))} className="w-4 h-4 accent-[#1B4D2E] cursor-pointer" />
                          </td>
                          <td className="px-5 py-3 font-medium text-gray-800">
                            <div className="flex items-center gap-2.5">
                              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shrink-0 bg-ccb-green/10 text-ccb-green">
                                {initiales(student.full_name)}
                              </span>
                              <span>{student.full_name}</span>
                              {isCompetencia && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-ccb-gold/15 text-amber-800 border border-ccb-gold/40">
                                  <Trophy size={10} />
                                  Competencia
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-gray-600">{formatFecha(student.birth_date)}</td>
                          <td className="px-5 py-3">
                            {grupoMostrar ? <GroupBadge grupo={grupoMostrar} /> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => toggleStatus(student)} title="Cambiar activo / inactivo" className="cursor-pointer focus:outline-none">
                              <StatusBadge status={student.status} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {filtered.length > 0 && (
              <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400">
                Mostrando {filtered.length} de {students.length} alumnos
                {groupFilter !== "todos" && (
                  <span className="ml-1">· filtro: <span className="text-ccb-green font-medium">{groupFilter}</span></span>
                )}
                {soloTalegaPropia && (
                  <span className="ml-1">· <span className="text-ccb-green font-medium">talega propia</span></span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* MODAL NUEVO ALUMNO */}
      {nuevoForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8" onClick={() => !creando && setNuevoForm(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="text-base font-bold text-ccb-green">Nuevo alumno</h2>
              <button onClick={() => setNuevoForm(null)} disabled={creando} className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <Campo label="Nombre completo *">
                <input
                  type="text" autoFocus value={nuevoForm.full_name}
                  onChange={(e) => setNuevoField("full_name", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-ccb-gold focus:ring-2 focus:ring-ccb-gold/20"
                />
              </Campo>

              <div className="grid grid-cols-2 gap-3">
                <Campo label="Fecha de nacimiento">
                  <input type="date" value={nuevoForm.birth_date} onChange={(e) => setNuevoField("birth_date", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-ccb-gold focus:ring-2 focus:ring-ccb-gold/20" />
                </Campo>
                <Campo label="Género">
                  <select value={nuevoForm.gender} onChange={(e) => setNuevoField("gender", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-ccb-gold focus:ring-2 focus:ring-ccb-gold/20">
                    <option value="">Sin especificar</option>
                    <option value="masculino">Masculino</option>
                    <option value="femenino">Femenino</option>
                  </select>
                </Campo>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Campo label="Grupo">
                  <select value={nuevoForm.grupo_activo} onChange={(e) => setNuevoField("grupo_activo", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-ccb-gold focus:ring-2 focus:ring-ccb-gold/20">
                    <option value="">Sin grupo (se calcula por edad)</option>
                    {GRUPOS_ASIGNABLES.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </Campo>
                <Campo label="Estado">
                  <select value={nuevoForm.status} onChange={(e) => setNuevoField("status", e.target.value as "activo" | "inactivo")}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-ccb-gold focus:ring-2 focus:ring-ccb-gold/20">
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </select>
                </Campo>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Campo label="Talega propia">
                  <select value={nuevoForm.tiene_talega} onChange={(e) => setNuevoField("tiene_talega", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-ccb-gold focus:ring-2 focus:ring-ccb-gold/20">
                    <option value="">Sin especificar</option>
                    <option value="Sí">Sí</option>
                    <option value="No">No</option>
                  </select>
                </Campo>
                <Campo label="Fecha de ingreso">
                  <input type="date" value={nuevoForm.enrollment_date} onChange={(e) => setNuevoField("enrollment_date", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-ccb-gold focus:ring-2 focus:ring-ccb-gold/20" />
                </Campo>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Acudiente</p>
                <div className="space-y-3">
                  <Campo label="Nombre del acudiente">
                    <input type="text" value={nuevoForm.parent_name} onChange={(e) => setNuevoField("parent_name", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-ccb-gold focus:ring-2 focus:ring-ccb-gold/20" />
                  </Campo>
                  <div className="grid grid-cols-2 gap-3">
                    <Campo label="Teléfono">
                      <input type="tel" value={nuevoForm.parent_phone} onChange={(e) => setNuevoField("parent_phone", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-ccb-gold focus:ring-2 focus:ring-ccb-gold/20" />
                    </Campo>
                    <Campo label="Correo">
                      <input type="email" value={nuevoForm.parent_email} onChange={(e) => setNuevoField("parent_email", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-ccb-gold focus:ring-2 focus:ring-ccb-gold/20" />
                    </Campo>
                  </div>
                </div>
              </div>

              <Campo label="Observaciones">
                <textarea rows={2} value={nuevoForm.observations} onChange={(e) => setNuevoField("observations", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none focus:outline-none focus:border-ccb-gold focus:ring-2 focus:ring-ccb-gold/20" />
              </Campo>

              {crearError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{crearError}</p>}
            </div>

            <div className="flex gap-2 px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-2xl">
              <button onClick={() => setNuevoForm(null)} disabled={creando}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                Cancelar
              </button>
              <button onClick={handleCrearAlumno} disabled={creando || !nuevoForm.full_name.trim()}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold bg-ccb-green text-white hover:bg-[#245038] disabled:opacity-40">
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
  );
}


function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function GroupBadge({ grupo }: { grupo: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-ccb-green/[0.08] text-ccb-green border border-ccb-green/20">
      {grupo}
    </span>
  );
}

function StatusBadge({ status }: { status: Student["status"] }) {
  if (status === "activo") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
        Activo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
      Inactivo
    </span>
  );
}
