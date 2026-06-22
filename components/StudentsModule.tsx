"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase, type Student } from "@/lib/supabase";

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

function calcularEdad(birthDate: string | null): string {
  if (!birthDate) return "—";
  const hoy = new Date();
  const nac = new Date(birthDate);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return `${edad} años`;
}

function calcularGrupo(birthDate: string | null, gender: string | null, grupoActivo: string | null): GroupFilter | null {
  if (grupoActivo === "Competencia") return "Competencia";
  if (!birthDate) {
   if (gender === "F" || gender === "f" || gender?.toLowerCase() === "damas" || gender?.toLowerCase() === "femenino") return "Damas"; 
    return null;
  }
  const hoy = new Date();
  const nac = new Date(birthDate);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  if (edad <= 5) return "Birdies";
  if (edad <= 8) return "Águilas";
  if (edad <= 12) return "Albatros";
  return "+14";
}

function formatFecha(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

function initiales(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

export default function StudentsModule() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("todos");

  useEffect(() => {
    async function fetchStudents() {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, birth_date, status, grupo_activo, gender")
        .order("full_name", { ascending: true });

      if (error) {
        setError(error.message);
      } else {
        setStudents(data ?? []);
      }
      setLoading(false);
    }
    fetchStudents();
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
      return matchSearch && matchStatus && matchGroup;
    });
  }, [students, search, statusFilter, groupFilter]);

  const groupCounts = useMemo(() => {
    const counts: Record<GroupFilter, number> = {
      todos: students.length,
      Birdies: 0,
      Águilas: 0,
      Albatros: 0,
      "+14": 0,
      Damas: 0,
      Competencia: 0,
    };
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

  const counts = useMemo(
    () => ({
      todos: students.length,
      activo: students.filter((s) => s.status === "activo").length,
      inactivo: students.filter((s) => s.status === "inactivo").length,
    }),
    [students]
  );

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1B4D2E" }}>
            Alumnos
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Gestión de alumnos de la Escuela de Golf
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1.5 text-gray-600">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: "#1B4D2E" }} />
            {counts.activo} activos
          </span>
          <span className="text-gray-300">·</span>
          <span className="flex items-center gap-1.5 text-gray-500">
            <span className="inline-block w-2 h-2 rounded-full bg-gray-300" />
            {counts.inactivo} inactivos
          </span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-3 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Buscar por nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none transition"
            onFocus={(e) => {
              e.target.style.borderColor = "#C9A84C";
              e.target.style.boxShadow = "0 0 0 2px #C9A84C33";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "";
              e.target.style.boxShadow = "";
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 self-start sm:self-auto shrink-0">
          {(["todos", "activo", "inactivo"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors"
              style={
                statusFilter === s
                  ? { backgroundColor: "#1B4D2E", color: "white" }
                  : { color: "#4b5563" }
              }
            >
              {s === "todos" ? `Todos (${counts.todos})` : s === "activo" ? `Activos (${counts.activo})` : `Inactivos (${counts.inactivo})`}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 mb-4">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {GROUPS.map(({ label, value, isSpecial }) => {
            const active = groupFilter === value;
            const count = groupCounts[value];
            return (
              <button
                key={value}
                onClick={() => setGroupFilter(value)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all shrink-0"
                style={
                  active
                    ? { backgroundColor: isSpecial ? "#C9A84C" : "#1B4D2E", color: isSpecial ? "#1B4D2E" : "white", boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }
                    : isSpecial
                    ? { color: "#92400e", backgroundColor: "#fef3c720", border: "1px solid #C9A84C55" }
                    : { color: "#374151", backgroundColor: "transparent", border: "1px solid #e5e7eb" }
                }
              >
                {isSpecial && (
                  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                    <path d="M4 22h16" />
                    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                  </svg>
                )}
                {label}
                {value !== "todos" && (
                  <span
                    className="text-xs rounded-full px-1.5 py-0.5 font-semibold"
                    style={
                      active
                        ? { backgroundColor: isSpecial ? "#1B4D2E22" : "#ffffff33", color: isSpecial ? "#1B4D2E" : "white" }
                        : { backgroundColor: "#f3f4f6", color: "#6b7280" }
                    }
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <svg className="animate-spin mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Cargando alumnos...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2" style={{ color: "#dc2626" }}>
            <p className="text-sm">Error al cargar los datos: {error}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: "#1B4D2E", color: "white" }}>
                    <th className="text-left px-5 py-3.5 font-semibold tracking-wide text-xs uppercase opacity-90">Nombre</th>
                    <th className="text-left px-5 py-3.5 font-semibold tracking-wide text-xs uppercase opacity-90">Fecha de nacimiento</th>
                    <th className="text-left px-5 py-3.5 font-semibold tracking-wide text-xs uppercase opacity-90">Edad</th>
                    <th className="text-left px-5 py-3.5 font-semibold tracking-wide text-xs uppercase opacity-90">Grupo</th>
                    <th className="text-left px-5 py-3.5 font-semibold tracking-wide text-xs uppercase opacity-90">Estado</th>
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
                    filtered.map((student, idx) => {
                      const grupoMostrar = calcularGrupo(student.birth_date, student.gender, student.grupo_activo);
                      return (
                        <tr
                          key={student.id}
                          className="border-t border-gray-50 transition-colors"
                          style={{ backgroundColor: idx % 2 === 0 ? "white" : "#f9fafb80" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "#C9A84C0A"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = idx % 2 === 0 ? "white" : "#f9fafb80"; }}
                        >
                          <td className="px-5 py-3.5 font-medium text-gray-800">
                            <div className="flex items-center gap-2.5">
                              <span
                                className="inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shrink-0"
                                style={{ backgroundColor: "#1B4D2E1A", color: "#1B4D2E" }}
                              >
                                {initiales(student.full_name)}
                              </span>
                              <span>{student.full_name}</span>
                              {student.grupo_activo === "Competencia" && (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                                  style={{ backgroundColor: "#C9A84C22", color: "#92400e", border: "1px solid #C9A84C55" }}
                                >
                                  <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                                    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                                    <path d="M4 22h16" />
                                    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                                  </svg>
                                  Competencia
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-gray-600">{formatFecha(student.birth_date)}</td>
                          <td className="px-5 py-3.5 text-gray-600">{calcularEdad(student.birth_date)}</td>
                          <td className="px-5 py-3.5">
                            {grupoMostrar ? <GroupBadge grupo={grupoMostrar} /> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-5 py-3.5">
                            <StatusBadge status={student.status} />
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
                  <span className="ml-1">· filtro: <span style={{ color: "#1B4D2E" }} className="font-medium">{groupFilter}</span></span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function GroupBadge({ grupo }: { grupo: string }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ backgroundColor: "#1B4D2E15", color: "#1B4D2E", border: "1px solid #1B4D2E25" }}
    >
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