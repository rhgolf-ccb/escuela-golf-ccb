"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Tab = "datos" | "tecnicos" | "fisicos" | "hitos";

// ─── Tipos ────────────────────────────────────────────────────────────────────

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

type SwingEvaluation = {
  id: string;
  student_id: string;
  student_name: string;
  grupo: string;
  evaluation_date: string;
  evaluation_type: string;
  p1_score: number | null;
  p2_score: number | null;
  p3_score: number | null;
  p4_score: number | null;
  p5_score: number | null;
  p6_score: number | null;
  p7_score: number | null;
  p8_score: number | null;
  p9_score: number | null;
  p10_score: number | null;
  juego_corto_putting: number | null;
  juego_corto_chipping: number | null;
  juego_corto_bunker: number | null;
  mental_rutina: number | null;
  mental_reglas: number | null;
  score_promedio: number | null;
  ai_analysis: string | null;
  ai_generated_at: string | null;
  professor_comment: string | null;
  created_at: string;
};

type SwingForm = {
  evaluation_type: "inicial" | "periódica" | "graduación";
  evaluation_date: string;
  p1_score: number;
  p2_score: number;
  p3_score: number;
  p4_score: number;
  p5_score: number;
  p6_score: number;
  p7_score: number;
  p8_score: number;
  p9_score: number;
  p10_score: number;
  juego_corto_putting: number;
  juego_corto_chipping: number;
  juego_corto_bunker: number;
  mental_rutina: number;
  mental_reglas: number;
  professor_comment: string;
};

type AiAnalysis = {
  resumen: string;
  prioridades: {
    orden: number;
    posicion: string;
    titulo: string;
    descripcion: string;
    instruccion_profesor: string;
    conexion_fisica: string | null;
    drills: string[];
  }[];
  fortalezas: string[];
  plan_clase: {
    minutos: string;
    actividad: string;
    tipo: string;
  }[];
  nota_edad: string;
};

// ─── Configuración de posiciones por grupo ────────────────────────────────────

const POSICIONES_GRUPO: Record<string, string[]> = {
  Birdies: ["P1", "P4", "P7"],
  "Águilas": ["P1", "P2", "P4", "P7", "P10"],
  Albatros: ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10"],
  "Grupo +14": ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10"],
  Competencia: ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10"],
  Damas: ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10"],
};

const POSICIONES_NOMBRES: Record<string, string> = {
  P1: "Posición inicial",
  P2: "Palo paralelo — backswing",
  P3: "Brazo izq. paralelo",
  P4: "Top backswing",
  P5: "Brazo der. paralelo — down",
  P6: "Palo paralelo — downswing",
  P7: "Impacto",
  P8: "Palo paralelo — follow",
  P9: "Brazo der. paralelo — follow",
  P10: "Finish completo",
};

const POSICIONES_FASES: { label: string; posiciones: string[] }[] = [
  { label: "Backswing", posiciones: ["P1", "P2", "P3", "P4"] },
  { label: "Downswing", posiciones: ["P5", "P6", "P7"] },
  { label: "Follow through", posiciones: ["P8", "P9", "P10"] },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number | null): { text: string; bg: string; bar: string } {
  if (score === null) return { text: "#9CA3AF", bg: "#F9FAFB", bar: "#E5E7EB" };
  if (score >= 8) return { text: "#1D4ED8", bg: "#EFF6FF", bar: "#3B82F6" };
  if (score >= 6) return { text: "#1B4D2E", bg: "#F0FDF4", bar: "#22C55E" };
  if (score >= 4) return { text: "#92400E", bg: "#FFFBEB", bar: "#F59E0B" };
  return { text: "#991B1B", bg: "#FEF2F2", bar: "#EF4444" };
}

function scoreLabel(score: number | null): string {
  if (score === null) return "—";
  if (score >= 8) return "Excelente";
  if (score >= 6) return "Cumple";
  if (score >= 4) return "En progreso";
  return "Bajo";
}

function calcularPromedio(form: SwingForm, grupo: string): number {
  const posiciones = POSICIONES_GRUPO[grupo] || POSICIONES_GRUPO["Albatros"];
  const scoreMap: Record<string, number> = {
    P1: form.p1_score, P2: form.p2_score, P3: form.p3_score,
    P4: form.p4_score, P5: form.p5_score, P6: form.p6_score,
    P7: form.p7_score, P8: form.p8_score, P9: form.p9_score, P10: form.p10_score,
  };
  const vals = posiciones.map((p) => scoreMap[p]).filter((v) => v > 0);
  const extras = [
    form.juego_corto_putting, form.juego_corto_chipping,
    form.juego_corto_bunker, form.mental_rutina, form.mental_reglas,
  ].filter((v) => v > 0);
  const all = [...vals, ...extras];
  if (!all.length) return 0;
  return Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 100) / 100;
}

function calcularEdad(birthDate: string | null): string {
  if (!birthDate) return "—";
  const hoy = new Date();
  const nac = new Date(birthDate);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return `${edad} años`;
}

function calcularEdadNum(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const hoy = new Date();
  const nac = new Date(birthDate);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
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

function defaultSwingForm(): SwingForm {
  return {
    evaluation_type: "inicial",
    evaluation_date: new Date().toISOString().split("T")[0],
    p1_score: 5, p2_score: 5, p3_score: 5, p4_score: 5, p5_score: 5,
    p6_score: 5, p7_score: 5, p8_score: 5, p9_score: 5, p10_score: 5,
    juego_corto_putting: 5, juego_corto_chipping: 5, juego_corto_bunker: 5,
    mental_rutina: 5, mental_reglas: 5,
    professor_comment: "",
  };
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function StudentProfile({ studentId }: { studentId: string }) {
  const router = useRouter();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("datos");

  // Edit student
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Swing evaluations
  const [swingEvals, setSwingEvals] = useState<SwingEvaluation[]>([]);
  const [swingLoading, setSwingLoading] = useState(false);
  const [showSwingForm, setShowSwingForm] = useState(false);
  const [swingForm, setSwingForm] = useState<SwingForm | null>(null);
  const [swingSaving, setSwingSaving] = useState(false);
  const [swingSaveError, setSwingSaveError] = useState<string | null>(null);
  const [expandedEval, setExpandedEval] = useState<string | null>(null);

  // AI analysis
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<Record<string, AiAnalysis>>({});

  // ── Fetch student ──
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

  // ── Fetch swing evaluations ──
  useEffect(() => {
    if (activeTab !== "tecnicos") return;
    async function fetchSwing() {
      setSwingLoading(true);
      const { data, error } = await supabase
        .from("swing_evaluations")
        .select("*")
        .eq("student_id", studentId)
        .order("evaluation_date", { ascending: false });
      if (!error && data) {
        setSwingEvals(data);
        // Cargar análisis IA guardados
        const aiMap: Record<string, AiAnalysis> = {};
        data.forEach((ev) => {
          if (ev.ai_analysis) {
            try { aiMap[ev.id] = JSON.parse(ev.ai_analysis); } catch {}
          }
        });
        setAiResults(aiMap);
      }
      setSwingLoading(false);
    }
    fetchSwing();
  }, [activeTab, studentId]);

  // ── Edit student ──
  function openEdit() {
    if (!student) return;
    setForm(studentToForm(student));
    setSaveError(null);
    setIsEditing(true);
  }
  function closeEdit() { setIsEditing(false); setForm(null); setSaveError(null); }
  function setField<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }
  async function handleSave() {
    if (!form || !student) return;
    setSaving(true); setSaveError(null);
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
    const { error } = await supabase.from("students").update(payload).eq("id", student.id);
    if (error) { setSaveError(error.message); setSaving(false); return; }
    setStudent((prev) => (prev ? { ...prev, ...payload } : prev));
    setSaving(false); closeEdit();
  }

  // ── Swing evaluation ──
  function openSwingForm() {
    setSwingForm(defaultSwingForm());
    setSwingSaveError(null);
    setShowSwingForm(true);
  }
  function closeSwingForm() { setShowSwingForm(false); setSwingForm(null); setSwingSaveError(null); }
  function setSwingField<K extends keyof SwingForm>(key: K, value: SwingForm[K]) {
    setSwingForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSaveSwing() {
    if (!swingForm || !student) return;
    setSwingSaving(true); setSwingSaveError(null);
    const grupo = student.grupo_activo || "Albatros";
    const promedio = calcularPromedio(swingForm, grupo);
    const id = `swing_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const posiciones = POSICIONES_GRUPO[grupo] || POSICIONES_GRUPO["Albatros"];

    // Solo guardar scores de posiciones que aplican al grupo
    const scoreFields: Record<string, number | null> = {
      p1_score: null, p2_score: null, p3_score: null, p4_score: null, p5_score: null,
      p6_score: null, p7_score: null, p8_score: null, p9_score: null, p10_score: null,
    };
    posiciones.forEach((p) => {
      const key = `${p.toLowerCase()}_score` as keyof typeof scoreFields;
      const formKey = `${p.toLowerCase()}_score` as keyof SwingForm;
      scoreFields[key] = swingForm[formKey] as number;
    });

    const payload = {
      id,
      student_id: student.id,
      student_name: student.full_name,
      grupo,
      evaluation_date: swingForm.evaluation_date,
      evaluation_type: swingForm.evaluation_type,
      ...scoreFields,
      juego_corto_putting: swingForm.juego_corto_putting || null,
      juego_corto_chipping: swingForm.juego_corto_chipping || null,
      juego_corto_bunker: swingForm.juego_corto_bunker || null,
      mental_rutina: swingForm.mental_rutina || null,
      mental_reglas: swingForm.mental_reglas || null,
      score_promedio: promedio,
      professor_comment: swingForm.professor_comment.trim() || null,
    };

    const { error } = await supabase.from("swing_evaluations").insert(payload);
    if (error) { setSwingSaveError(error.message); setSwingSaving(false); return; }
   const newEval = { ...payload, ai_analysis: null, ai_generated_at: null, created_at: new Date().toISOString() } as SwingEvaluation;
    setSwingEvals((prev) => [newEval, ...prev]);
    setSwingSaving(false);
    closeSwingForm();
    setExpandedEval(id);
  }

  // ── AI Analysis ──
  async function handleAnalyzeAI(ev: SwingEvaluation) {
    if (!student) return;
    setAnalyzingId(ev.id);
    try {
      const res = await fetch("/api/swing-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student: {
            ...student,
            edad: calcularEdadNum(student.birth_date),
          },
          evaluation: ev,
          physicalTest: null, // TODO: conectar test físico TPI cuando esté disponible
        }),
      });
      const data = await res.json();
      if (data.analysis) {
        setAiResults((prev) => ({ ...prev, [ev.id]: data.analysis }));
        // Guardar en Supabase
        await supabase.from("swing_evaluations").update({
          ai_analysis: JSON.stringify(data.analysis),
          ai_generated_at: new Date().toISOString(),
        }).eq("id", ev.id);
      }
    } catch (err) {
      console.error("Error al analizar con IA:", err);
    }
    setAnalyzingId(null);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

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

  const grupo = student.grupo_activo || "Albatros";
  const posicionesActivas = POSICIONES_GRUPO[grupo] || POSICIONES_GRUPO["Albatros"];

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

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-4">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center justify-center w-16 h-16 rounded-full text-xl font-bold shrink-0"
            style={{ backgroundColor: "#1B4D2E1A", color: "#1B4D2E" }}>
            {initiales(student.full_name)}
          </span>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{student.full_name}</h1>
              {student.grupo_activo && (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: "#1B4D2E15", color: "#1B4D2E", border: "1px solid #1B4D2E25" }}>
                  {student.grupo_activo}
                </span>
              )}
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${student.status === "activo"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-gray-100 text-gray-500 border border-gray-200"}`}>
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
          <button onClick={openEdit}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0"
            style={{ backgroundColor: "#1B4D2E", color: "white" }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Editar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 mb-4">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className="px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all"
              style={activeTab === key ? { backgroundColor: "#1B4D2E", color: "white" } : { color: "#374151" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">

        {/* ── DATOS ── */}
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

        {/* ── TÉCNICOS ── */}
        {activeTab === "tecnicos" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Evaluación técnica de swing</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {grupo} · {posicionesActivas.length} posiciones evaluadas
                </p>
              </div>
              <button onClick={openSwingForm}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: "#1B4D2E" }}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Nueva evaluación
              </button>
            </div>

            {swingLoading ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <svg className="animate-spin mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Cargando evaluaciones...
              </div>
            ) : swingEvals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="mb-3">
                  <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                  <rect x="9" y="3" width="6" height="4" rx="1" />
                </svg>
                <p className="text-sm font-medium">Sin evaluaciones aún</p>
                <p className="text-xs mt-1">Registra la primera evaluación técnica de swing</p>
              </div>
            ) : (
              <div className="space-y-3">
                {swingEvals.map((ev) => {
                  const isOpen = expandedEval === ev.id;
                  const ai = aiResults[ev.id];
                  const isAnalyzing = analyzingId === ev.id;
                  const posActivas = POSICIONES_GRUPO[ev.grupo] || POSICIONES_GRUPO["Albatros"];

                  return (
                    <div key={ev.id} className="border border-gray-100 rounded-xl overflow-hidden">
                      {/* Header de la evaluación */}
                      <button onClick={() => setExpandedEval(isOpen ? null : ev.id)}
                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{formatFecha(ev.evaluation_date)}</p>
                          <p className="text-xs text-gray-500 mt-0.5 capitalize">{ev.evaluation_type} · {ev.grupo}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <EvalTypeBadge type={ev.evaluation_type} />
                          {ev.score_promedio !== null && (
                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold"
                              style={{
                                backgroundColor: scoreColor(ev.score_promedio).bg,
                                color: scoreColor(ev.score_promedio).text,
                              }}>
                              {ev.score_promedio.toFixed(1)}/10
                            </span>
                          )}
                          {ai && (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
                              IA ✓
                            </span>
                          )}
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                            className={`text-gray-400 transition-transform ml-1 ${isOpen ? "rotate-180" : ""}`}>
                            <path d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="border-t border-gray-50">
                          {/* Scores P1-P10 */}
                          <div className="px-5 pt-5 pb-3">
                            {POSICIONES_FASES.map((fase) => {
                              const fasePosiciones = fase.posiciones.filter((p) => posActivas.includes(p));
                              if (!fasePosiciones.length) return null;
                              return (
                                <div key={fase.label} className="mb-4">
                                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                                    {fase.label}
                                  </p>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {fasePosiciones.map((p) => {
                                      const scoreKey = `${p.toLowerCase()}_score` as keyof SwingEvaluation;
                                      const score = ev[scoreKey] as number | null;
                                      const c = scoreColor(score);
                                      return (
                                        <div key={p} className="rounded-lg p-3 text-center"
                                          style={{ backgroundColor: c.bg }}>
                                          <p className="text-xs font-semibold mb-0.5" style={{ color: c.text }}>{p}</p>
                                          <p className="text-xs text-gray-500 mb-1.5 leading-tight" style={{ fontSize: "10px" }}>
                                            {POSICIONES_NOMBRES[p]}
                                          </p>
                                          <p className="text-xl font-bold" style={{ color: c.text }}>
                                            {score ?? "—"}
                                          </p>
                                          <div className="h-1 rounded-full mt-1.5" style={{ backgroundColor: "#E5E7EB" }}>
                                            <div className="h-1 rounded-full transition-all"
                                              style={{ width: score ? `${score * 10}%` : "0%", backgroundColor: c.bar }} />
                                          </div>
                                          <p className="text-xs mt-1" style={{ color: c.text, fontSize: "10px" }}>
                                            {scoreLabel(score)}
                                          </p>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}

                            {/* Juego corto y mental */}
                            {(ev.juego_corto_putting !== null || ev.juego_corto_chipping !== null ||
                              ev.juego_corto_bunker !== null || ev.mental_rutina !== null || ev.mental_reglas !== null) && (
                              <div className="mb-4">
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                                  Juego corto y mental
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                  {[
                                    { key: "juego_corto_putting", label: "Putting" },
                                    { key: "juego_corto_chipping", label: "Chipping" },
                                    { key: "juego_corto_bunker", label: "Bunker" },
                                    { key: "mental_rutina", label: "Rutina" },
                                    { key: "mental_reglas", label: "Reglas" },
                                  ].map(({ key, label }) => {
                                    const score = ev[key as keyof SwingEvaluation] as number | null;
                                    if (score === null) return null;
                                    const c = scoreColor(score);
                                    return (
                                      <div key={key} className="rounded-lg p-3 text-center" style={{ backgroundColor: c.bg }}>
                                        <p className="text-xs text-gray-500 mb-1" style={{ fontSize: "10px" }}>{label}</p>
                                        <p className="text-xl font-bold" style={{ color: c.text }}>{score}</p>
                                        <div className="h-1 rounded-full mt-1" style={{ backgroundColor: "#E5E7EB" }}>
                                          <div className="h-1 rounded-full" style={{ width: `${score * 10}%`, backgroundColor: c.bar }} />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {ev.professor_comment && (
                              <div className="bg-gray-50 rounded-lg p-3 mb-4">
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                                  Observaciones del profesor
                                </p>
                                <p className="text-sm text-gray-700">{ev.professor_comment}</p>
                              </div>
                            )}

                            {/* Botón analizar IA */}
                            {!ai && (
                              <button onClick={() => handleAnalyzeAI(ev)} disabled={isAnalyzing}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border-2 border-dashed transition-all"
                                style={{
                                  borderColor: isAnalyzing ? "#C4B5FD" : "#7C3AED",
                                  color: isAnalyzing ? "#7C3AED" : "#5B21B6",
                                  backgroundColor: isAnalyzing ? "#F5F3FF" : "transparent",
                                }}>
                                {isAnalyzing ? (
                                  <>
                                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                    </svg>
                                    Analizando con IA...
                                  </>
                                ) : (
                                  <>
                                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                    </svg>
                                    Analizar con IA — guía para el profesor
                                  </>
                                )}
                              </button>
                            )}
                          </div>

                          {/* Panel análisis IA */}
                          {ai && (
                            <div className="border-t border-gray-100 bg-gradient-to-b from-purple-50 to-white px-5 py-5">
                              <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-purple-700">✦ Análisis IA</span>
                                  <span className="text-xs text-gray-400">Guía de instrucción para el profesor</span>
                                </div>
                                <button onClick={() => handleAnalyzeAI(ev)} disabled={isAnalyzing}
                                  className="text-xs text-purple-600 hover:text-purple-800 underline">
                                  Regenerar
                                </button>
                              </div>

                              {/* Resumen */}
                              <div className="bg-white rounded-xl border border-purple-100 p-4 mb-4">
                                <p className="text-sm text-gray-700 leading-relaxed">{ai.resumen}</p>
                              </div>

                              {/* Prioridades */}
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                                Lo que el profesor debe trabajar — en orden
                              </p>
                              <div className="space-y-3 mb-4">
                                {ai.prioridades?.map((p) => {
                                  const borderColors = ["#EF4444", "#F59E0B", "#22C55E"];
                                  const bgColors = ["#FEF2F2", "#FFFBEB", "#F0FDF4"];
                                  const numColors = ["#991B1B", "#92400E", "#1B4D2E"];
                                  const idx = Math.min(p.orden - 1, 2);
                                  return (
                                    <div key={p.orden} className="bg-white rounded-xl border p-4"
                                      style={{ borderColor: borderColors[idx] + "40" }}>
                                      <div className="flex items-start gap-3 mb-2">
                                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                                          style={{ backgroundColor: bgColors[idx], color: numColors[idx] }}>
                                          {p.orden}
                                        </span>
                                        <div className="flex-1">
                                          <p className="text-sm font-semibold text-gray-900">{p.titulo}</p>
                                          <p className="text-xs text-gray-500">{p.posicion}</p>
                                        </div>
                                      </div>
                                      <p className="text-sm text-gray-700 leading-relaxed mb-2 ml-9">{p.descripcion}</p>
                                      <div className="ml-9 bg-blue-50 rounded-lg p-3 mb-2">
                                        <p className="text-xs font-semibold text-blue-700 mb-1">Instrucción para el profesor</p>
                                        <p className="text-xs text-blue-800 leading-relaxed">{p.instruccion_profesor}</p>
                                      </div>
                                      {p.conexion_fisica && (
                                        <div className="ml-9 bg-green-50 rounded-lg p-2.5 mb-2">
                                          <p className="text-xs text-green-800">
                                            <span className="font-semibold">Conexión física TPI:</span> {p.conexion_fisica}
                                          </p>
                                        </div>
                                      )}
                                      {p.drills && p.drills.length > 0 && (
                                        <div className="ml-9 flex flex-wrap gap-1.5">
                                          {p.drills.map((d, i) => (
                                            <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-100">
                                              {d}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Fortalezas */}
                              {ai.fortalezas && ai.fortalezas.length > 0 && (
                                <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4 mb-4">
                                  <p className="text-xs font-semibold text-emerald-700 mb-2">⭐ Fortalezas — mantener y reforzar</p>
                                  <ul className="space-y-1">
                                    {ai.fortalezas.map((f, i) => (
                                      <li key={i} className="text-sm text-emerald-800">· {f}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Plan de clase */}
                              {ai.plan_clase && ai.plan_clase.length > 0 && (
                                <div className="bg-white rounded-xl border border-gray-100 p-4 mb-3">
                                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                                    Plan sugerido para próxima clase
                                  </p>
                                  <div className="space-y-2">
                                    {ai.plan_clase.map((step, i) => {
                                      const tipoColors: Record<string, string> = {
                                        fisico: "bg-green-50 text-green-700",
                                        tecnico: "bg-blue-50 text-blue-700",
                                        juego_corto: "bg-purple-50 text-purple-700",
                                        mental: "bg-amber-50 text-amber-700",
                                      };
                                      return (
                                        <div key={i} className="flex items-start gap-3">
                                          <span className="text-xs text-gray-400 min-w-[48px] mt-0.5">{step.minutos}'</span>
                                          <p className="text-sm text-gray-700 flex-1">{step.actividad}</p>
                                          <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${tipoColors[step.tipo] || "bg-gray-50 text-gray-600"}`}>
                                            {step.tipo}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Nota de edad */}
                              {ai.nota_edad && (
                                <div className="bg-amber-50 rounded-xl border border-amber-100 p-3">
                                  <p className="text-xs text-amber-800">
                                    <span className="font-semibold">Nota pedagógica:</span> {ai.nota_edad}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── FÍSICOS ── */}
        {activeTab === "fisicos" && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="mb-3">
              <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
              <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
              <line x1="6" y1="1" x2="6" y2="4" />
              <line x1="10" y1="1" x2="10" y2="4" />
              <line x1="14" y1="1" x2="14" y2="4" />
            </svg>
            <p className="text-sm">Tests físicos TPI — próximamente</p>
          </div>
        )}

        {/* ── HITOS ── */}
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

      {/* ── MODAL EDITAR ALUMNO ── */}
      {isEditing && form && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Editar perfil</h2>
              <button onClick={closeEdit} className="text-gray-400 hover:text-gray-600" disabled={saving}>
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <FormField label="Nombre completo" required>
                <input type="text" value={form.full_name} onChange={(e) => setField("full_name", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]" />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Fecha de nacimiento">
                  <input type="date" value={form.birth_date} onChange={(e) => setField("birth_date", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]" />
                </FormField>
                <FormField label="Estado">
                  <select value={form.status} onChange={(e) => setField("status", e.target.value as "activo" | "inactivo")}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E] bg-white">
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </select>
                </FormField>
              </div>
              <FormField label="Grupo" hint="Selecciona solo para Damas o Competencia">
                <select value={form.grupo_activo} onChange={(e) => setField("grupo_activo", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E] bg-white">
                  <option value="">Automático (según edad)</option>
                  <option value="Damas">Damas</option>
                  <option value="Competencia">Competencia</option>
                </select>
              </FormField>
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Acudiente</p>
                <div className="space-y-4">
                  <FormField label="Nombre">
                    <input type="text" value={form.parent_name} onChange={(e) => setField("parent_name", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]" />
                  </FormField>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="Teléfono">
                      <input type="tel" value={form.parent_phone} onChange={(e) => setField("parent_phone", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]" />
                    </FormField>
                    <FormField label="Email">
                      <input type="email" value={form.parent_email} onChange={(e) => setField("parent_email", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]" />
                    </FormField>
                  </div>
                </div>
              </div>
              <FormField label="Observaciones">
                <textarea value={form.observations} onChange={(e) => setField("observations", e.target.value)}
                  rows={3} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E] resize-none" />
              </FormField>
              {saveError && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">Error: {saveError}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={closeEdit} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">Cancelar</button>
              <button onClick={handleSave} disabled={saving || !form.full_name.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: "#1B4D2E" }}>
                {saving && <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>}
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL NUEVA EVALUACIÓN SWING ── */}
      {showSwingForm && swingForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={(e) => { if (e.target === e.currentTarget) closeSwingForm(); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Nueva evaluación técnica de swing</h2>
                <p className="text-xs text-gray-400 mt-0.5">{student.full_name} · {grupo}</p>
              </div>
              <button onClick={closeSwingForm} className="text-gray-400 hover:text-gray-600" disabled={swingSaving}>
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-6 overflow-y-auto max-h-[72vh]">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Tipo" required>
                  <select value={swingForm.evaluation_type}
                    onChange={(e) => setSwingField("evaluation_type", e.target.value as SwingForm["evaluation_type"])}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] bg-white">
                    <option value="inicial">Inicial</option>
                    <option value="periódica">Periódica</option>
                    <option value="graduación">Graduación</option>
                  </select>
                </FormField>
                <FormField label="Fecha" required>
                  <input type="date" value={swingForm.evaluation_date}
                    onChange={(e) => setSwingField("evaluation_date", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E]" />
                </FormField>
              </div>

              {/* Scores por fase */}
              {POSICIONES_FASES.map((fase) => {
                const fasePosiciones = fase.posiciones.filter((p) => posicionesActivas.includes(p));
                if (!fasePosiciones.length) return null;
                return (
                  <div key={fase.label}>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{fase.label}</p>
                    <div className="space-y-3">
                      {fasePosiciones.map((p) => {
                        const formKey = `${p.toLowerCase()}_score` as keyof SwingForm;
                        const val = swingForm[formKey] as number;
                        const c = scoreColor(val);
                        return (
                          <div key={p} className="flex items-center gap-3">
                            <span className="text-xs font-bold w-6 text-gray-500">{p}</span>
                            <span className="text-sm text-gray-700 flex-1">{POSICIONES_NOMBRES[p]}</span>
                            <div className="flex items-center gap-2">
                              <input type="range" min="1" max="10" step="1" value={val}
                                onChange={(e) => setSwingField(formKey, parseInt(e.target.value))}
                                className="w-24" />
                              <span className="text-sm font-bold w-5 text-center" style={{ color: c.text }}>{val}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Juego corto */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Juego corto</p>
                <div className="space-y-3">
                  {[
                    { key: "juego_corto_putting" as keyof SwingForm, label: "Putting" },
                    { key: "juego_corto_chipping" as keyof SwingForm, label: "Chipping" },
                    { key: "juego_corto_bunker" as keyof SwingForm, label: "Bunker" },
                  ].map(({ key, label }) => {
                    const val = swingForm[key] as number;
                    const c = scoreColor(val);
                    return (
                      <div key={key as string} className="flex items-center gap-3">
                        <span className="text-sm text-gray-700 flex-1">{label}</span>
                        <div className="flex items-center gap-2">
                          <input type="range" min="1" max="10" step="1" value={val}
                            onChange={(e) => setSwingField(key, parseInt(e.target.value))}
                            className="w-24" />
                          <span className="text-sm font-bold w-5 text-center" style={{ color: c.text }}>{val}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Mental */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Mental y reglas</p>
                <div className="space-y-3">
                  {[
                    { key: "mental_rutina" as keyof SwingForm, label: "Rutina previa al golpe" },
                    { key: "mental_reglas" as keyof SwingForm, label: "Reglas y etiqueta" },
                  ].map(({ key, label }) => {
                    const val = swingForm[key] as number;
                    const c = scoreColor(val);
                    return (
                      <div key={key as string} className="flex items-center gap-3">
                        <span className="text-sm text-gray-700 flex-1">{label}</span>
                        <div className="flex items-center gap-2">
                          <input type="range" min="1" max="10" step="1" value={val}
                            onChange={(e) => setSwingField(key, parseInt(e.target.value))}
                            className="w-24" />
                          <span className="text-sm font-bold w-5 text-center" style={{ color: c.text }}>{val}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <FormField label="Observaciones del profesor">
                <textarea value={swingForm.professor_comment}
                  onChange={(e) => setSwingField("professor_comment", e.target.value)}
                  rows={3} placeholder="Observaciones sobre el alumno, contexto de la clase..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] resize-none" />
              </FormField>

              {/* Preview promedio */}
              <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
                <span className="text-sm text-gray-600">Promedio de esta evaluación</span>
                <span className="text-xl font-bold" style={{ color: scoreColor(calcularPromedio(swingForm, grupo)).text }}>
                  {calcularPromedio(swingForm, grupo).toFixed(1)}/10
                </span>
              </div>

              {swingSaveError && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">Error: {swingSaveError}</p>}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={closeSwingForm} disabled={swingSaving}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">
                Cancelar
              </button>
              <button onClick={handleSaveSwing} disabled={swingSaving || !swingForm.evaluation_date}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: "#1B4D2E" }}>
                {swingSaving && <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>}
                {swingSaving ? "Guardando..." : "Guardar evaluación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function EvalTypeBadge({ type }: { type: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    inicial: { bg: "#C9A84C20", color: "#8B6914" },
    "periódica": { bg: "#EFF6FF", color: "#1D4ED8" },
    "graduación": { bg: "#F5F3FF", color: "#6D28D9" },
  };
  const s = map[type] ?? { bg: "#F3F4F6", color: "#6B7280" };
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-medium capitalize"
      style={{ backgroundColor: s.bg, color: s.color }}>
      {type.charAt(0).toUpperCase() + type.slice(1)}
    </span>
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

function FormField({ label, children, required, hint }: {
  label: string; children: React.ReactNode; required?: boolean; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}
