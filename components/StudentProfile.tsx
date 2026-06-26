"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Tab = "datos" | "tecnicos" | "fisicos" | "hitos";

type Student = {
  id: string;
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

type EditForm = {
  full_name: string;
  birth_date: string;
  status: "activo" | "inactivo";
  grupo_activo: string;
  parent_name: string;
  parent_phone: string;
  parent_email: string;
  observations: string;
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

function studentToForm(s: Student): EditForm {
  return {
    full_name: s.full_name,
    birth_date: s.birth_date ?? "",
    status: s.status,
    grupo_activo: s.grupo_activo ?? "",
    parent_name: s.parent_name ?? "",
    parent_phone: s.parent_phone ?? "",
    parent_email: s.parent_email ?? "",
    observations: s.observations ?? "",
  };
}

export default function StudentProfile({ studentId }: { studentId: string }) {
  const router = useRouter();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("datos");
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  function openEdit() {
    if (!student) return;
    setForm(studentToForm(student));
    setSaveError(null);
    setIsEditing(true);
  }

  function closeEdit() {
    setIsEditing(false);
    setForm(null);
    setSaveError(null);
  }

  function setField<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  async function handleSave() {
    if (!form || !student) return;
    setSaving(true);
    setSaveError(null);

    const payload = {
      full_name: form.full_name.trim(),
      birth_date: form.birth_date || null,
      status: form.status,
      grupo_activo: form.grupo_activo || null,
      parent_name: form.parent_name.trim() || null,
      parent_phone: form.parent_phone.trim() || null,
      parent_email: form.parent_email.trim() || null,
      observations: form.observations.trim() || null,
    };

    const { error } = await supabase
      .from("students")
      .update(payload)
      .eq("id", student.id);

    if (error) {
      setSaveError(error.message);
      setSaving(false);
      return;
    }

    setStudent((prev) => prev ? { ...prev, ...payload } : prev);
    setSaving(false);
    closeEdit();
  }

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
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        Volver a alumnos
      </button>

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
          <button
            onClick={openEdit}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0"
            style={{ backgroundColor: "#1B4D2E", color: "white" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#163d24"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1B4D2E"; }}
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Editar
          </button>
        </div>
      </div>

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
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Contacto del acudiente</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Field label="Nombre del acudiente" value={student.parent_name} />
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

      {isEditing && form && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Editar perfil</h2>
              <button
                onClick={closeEdit}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                disabled={saving}
              >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <FormField label="Nombre completo" required>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => setField("full_name", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]"
                />
              </FormField>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Fecha de nacimiento">
                  <input
                    type="date"
                    value={form.birth_date}
                    onChange={(e) => setField("birth_date", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]"
                  />
                </FormField>

                <FormField label="Estado">
                  <select
                    value={form.status}
                    onChange={(e) => setField("status", e.target.value as "activo" | "inactivo")}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E] bg-white"
                  >
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </select>
                </FormField>
              </div>

              <FormField label="Grupo" hint="Selecciona solo para Damas o Competencia; los demás grupos se calculan por edad">
                <select
                  value={form.grupo_activo}
                  onChange={(e) => setField("grupo_activo", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E] bg-white"
                >
                  <option value="">Automático (según edad)</option>
                  <option value="Damas">Damas</option>
                  <option value="Competencia">Competencia</option>
                </select>
              </FormField>

              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Acudiente</p>
                <div className="space-y-4">
                  <FormField label="Nombre (padre, madre o cuidador)">
                    <input
                      type="text"
                      value={form.parent_name}
                      onChange={(e) => setField("parent_name", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]"
                    />
                  </FormField>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="Teléfono">
                      <input
                        type="tel"
                        value={form.parent_phone}
                        onChange={(e) => setField("parent_phone", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]"
                      />
                    </FormField>

                    <FormField label="Email">
                      <input
                        type="email"
                        value={form.parent_email}
                        onChange={(e) => setField("parent_email", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]"
                      />
                    </FormField>
                  </div>
                </div>
              </div>

              <FormField label="Observaciones">
                <textarea
                  value={form.observations}
                  onChange={(e) => setField("observations", e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E] resize-none"
                />
              </FormField>

              {saveError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  Error al guardar: {saveError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={closeEdit}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.full_name.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: "#1B4D2E" }}
                onMouseEnter={(e) => { if (!saving) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#163d24"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1B4D2E"; }}
              >
                {saving && (
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
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

function FormField({ label, children, required, hint }: { label: string; children: React.ReactNode; required?: boolean; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}
