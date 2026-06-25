"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Tab = "datos" | "tecnicos" | "fisicos" | "hitos";

type Student = {
  id: number;
  full_name: string;
  birth_date: string | null;
  status: "activo" | "inactivo";
  grupo_activo: string | null;
  gender: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  observations: string | null;
  enrollment_date: string | null;
};

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
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
}

function initiales(name: string): string {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

export default function StudentProfile({ studentId }: { studentId: number }) {
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("datos");

  useEffect(() => {
    async function fetchStudent() {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, birth_date, status, grupo_activo, gender, parent_name, parent_phone, parent_email, observations, enrollment_date")
        .eq("id", studentId)
        .single();
      if (!error) setStudent(data);
      setLoading(false);
    }
    fetchStudent();
  }, [studentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-gray-400">
        <svg className="animate-spin mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Cargando perfil...
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-gray-400">
        <p>Alumno no encontrado.</p>
      </div>
    );
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "datos", label: "Datos personales" },
    { key: "tecnicos", label: "Tests técnicos" },
    { key: "fisicos", label: "Tests físicos" },
    { key: "hitos", label: "Hitos" },
  ];

  return (
    <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
      {/* Botón volver */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        Volver a alumnos
      </button>

      {/* Header del perfil */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-4">
        <div className="flex items-center gap-4">
          <span
            className="inline-flex items-center justify-center w-16 h-16 rounded-full text-xl font-bold shrink-0"
            style={{ backgroundColor: "#1B4D2E1A", color: "#1B4D2E" }}
          >
            {initiales(student.full_name)}
          </span>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{student.full_name}</h1>
              {student.grupo_activo && (
                <span
                  className="px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: "#1B4D2E15", color: "#1B4D2E", border: "1px solid #1B4D2E25" }}
                >
                  {student.grupo_activo}
                </span>
              )}
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  student.status === "activo"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-gray-100 text-gray-500 border border-gray-200"
                }`}
              >
                {student.status}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {calcularEdad(student.birth_date)}
              {student.enrollment_date && (
                <span className="ml-3 text-gray-400">· Ingresó {formatFecha(student.enrollment_date)}</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 mb-4">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all"
              style={
                activeTab === key
                  ? { backgroundColor: "#1B4D2E", color: "white" }
                  : { color: "#374151" }
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido de cada tab */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        {activeTab === "datos" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Field label="Nombre completo" value={student.full_name} />
            <Field label="Fecha de nacimiento" value={formatFecha(student.birth_date)} />
            <Field label="Edad" value={calcularEdad(student.birth_date)} />
            <Field label="Grupo" value={student.grupo_activo} />
            <Field label="Estado" value={student.status} />
            <Field label="Fecha de ingreso" value={formatFecha(student.enrollment_date)} />
            <div className="sm:col-span-2 border-t border-gray-100 pt-4 mt-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Contacto de padres</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Field label="Nombre del padre/madre" value={student.parent_name} />
                <Field label="Teléfono" value={student.parent_phone} />
                <Field label="Email" value={student.parent_email} />
              </div>
            </div>
            {student.observations && (
              <div className="sm:col-span-2 border-t border-gray-100 pt-4 mt-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Observaciones</p>
                <p className="text-sm text-gray-700">{student.observations}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "tecnicos" && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="mb-3">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
            </svg>
            <p className="text-sm">Tests técnicos — próximamente</p>
          </div>
        )}

        {activeTab === "fisicos" && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="mb-3">
              <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
              <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
              <line x1="6" y1="1" x2="6" y2="4" />
              <line x1="10" y1="1" x2="10" y2="4" />
              <line x1="14" y1="1" x2="14" y2="4" />
            </svg>
            <p className="text-sm">Tests físicos — próximamente</p>
          </div>
        )}

        {activeTab === "hitos" && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="mb-3">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
            <p className="text-sm">Hitos personales — próximamente</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm text-gray-800">{value || "—"}</p>
    </div>
  );
}