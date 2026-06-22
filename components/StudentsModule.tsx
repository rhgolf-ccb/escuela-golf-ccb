"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase, type Student } from "@/lib/supabase";

type StatusFilter = "todos" | "activo" | "inactivo";

function calcularEdad(birthDate: string | null): string {
  if (!birthDate) return "—";
  const hoy = new Date();
  const nac = new Date(birthDate);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return `${edad} años`;
}

function formatFecha(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

export default function StudentsModule() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");

  useEffect(() => {
    async function fetchStudents() {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, birth_date, status, grupo_activo")
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
      return matchSearch && matchStatus;
    });
  }, [students, search, statusFilter]);

  const counts = useMemo(() => ({
    todos: students.length,
    activo: students.filter((s) => s.status === "activo").length,
    inactivo: students.filter((s) => s.status === "inactivo").length,
  }), [students]);

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ccb-green">Alumnos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Gestión de alumnos de la Escuela de Golf
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-sm text-gray-500">
          <span className="inline-block w-2 h-2 rounded-full bg-ccb-gold" />
          {counts.activo} activos &nbsp;·&nbsp;
          <span className="inline-block w-2 h-2 rounded-full bg-gray-300" />
          {counts.inactivo} inactivos
        </div>
      </div>

      {/* Filters bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Buscar por nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ccb-gold focus:border-transparent transition"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Limpiar búsqueda"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 self-start sm:self-auto">
          {(["todos", "activo", "inactivo"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                statusFilter === s
                  ? "bg-ccb-green text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              {s === "todos" ? `Todos (${counts.todos})` : s === "activo" ? `Activos (${counts.activo})` : `Inactivos (${counts.inactivo})`}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
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
          <div className="flex flex-col items-center justify-center py-20 text-red-500 gap-2">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
            </svg>
            <p className="text-sm">Error al cargar los datos: {error}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-ccb-green text-white">
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
                        {search
                          ? `No se encontraron alumnos con "${search}"`
                          : "No hay alumnos en esta categoría"}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((student, idx) => (
                      <tr
                        key={student.id}
                        className={`border-t border-gray-50 transition-colors hover:bg-amber-50/40 ${
                          idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                        }`}
                      >
                        <td className="px-5 py-3.5 font-medium text-gray-800">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shrink-0"
                              style={{ backgroundColor: "#1B4D2E1A", color: "#1B4D2E" }}
                            >
                              {student.full_name
                                .split(" ")
                                .slice(0, 2)
                                .map((n) => n[0])
                                .join("")
                                .toUpperCase()}
                            </span>
                            {student.full_name}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-gray-600">
                          {formatFecha(student.birth_date)}
                        </td>
                        <td className="px-5 py-3.5 text-gray-600">
                          {calcularEdad(student.birth_date)}
                        </td>
                        <td className="px-5 py-3.5 text-gray-600">
                          {student.grupo_activo ?? (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge status={student.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {filtered.length > 0 && (
              <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400">
                Mostrando {filtered.length} de {students.length} alumnos
              </div>
            )}
          </>
        )}
      </div>
    </div>
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
