"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Tab = "datos" | "tecnicos" | "fisicos" | "hitos";
type SkillLevel = "bajo" | "en_progreso" | "cumple";

const SKILL_KEYS = [
  "putt_linea", "putt_distancia", "chipping", "pitching", "postura_grip",
  "swing_hierros", "maderas_driver", "reglas_basicas", "etiqueta_campo",
  "conteo_scoring", "concentracion", "manejo_frustracion", "trabajo_equipo",
] as const;
type SkillKey = typeof SKILL_KEYS[number];

const SKILL_LABELS: Record<SkillKey, string> = {
  putt_linea: "Putt línea",
  putt_distancia: "Putt distancia",
  chipping: "Chipping",
  pitching: "Pitching",
  postura_grip: "Postura y grip",
  swing_hierros: "Swing hierros",
  maderas_driver: "Maderas y driver",
  reglas_basicas: "Reglas básicas",
  etiqueta_campo: "Etiqueta en campo",
  conteo_scoring: "Conteo y scoring",
  concentracion: "Concentración",
  manejo_frustracion: "Manejo de frustración",
  trabajo_equipo: "Trabajo en equipo",
};

const GOLF_SKILLS: SkillKey[] = [
  "putt_linea", "putt_distancia", "chipping", "pitching",
  "postura_grip", "swing_hierros", "maderas_driver",
];
const CONDUCT_SKILLS: SkillKey[] = [
  "reglas_basicas", "etiqueta_campo", "conteo_scoring",
  "concentracion", "manejo_frustracion", "trabajo_equipo",
];

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

type SkillEvaluation = {
  id: string;
  student_id: string;
  evaluation_date: string;
  evaluation_type: string;
  skills: Record<string, SkillLevel> | null;
  general_comment: string | null;
  overall_level: string | null;
  created_at: string;
};

type EvalForm = {
  evaluation_type: "inicial" | "periódica" | "graduación";
  evaluation_date: string;
  skills: Record<SkillKey, SkillLevel>;
  general_comment: string;
};

// ── Physical tests ────────────────────────────────────────────────────────────

const TPI_SCREEN_KEYS = [
  "inclinacion_pelvica", "rotacion_pelvica", "rotacion_torso",
  "sentadilla_profunda", "toe_touch", "equilibrio_una_pierna",
  "estocada_linea", "puente_extension_pierna", "longitud_dorsal",
  "rotacion_interna_cadera", "rotacion_externa_cadera",
  "rotacion_cuadrante_inferior", "rotacion_cervical",
  "movilidad_hombro", "bisagra_muneca", "rotacion_antebrazo",
] as const;
type TpiScreenKey = typeof TPI_SCREEN_KEYS[number];

const TPI_SCREEN_LABELS: Record<TpiScreenKey, string> = {
  inclinacion_pelvica: "Inclinación pélvica",
  rotacion_pelvica: "Rotación pélvica",
  rotacion_torso: "Rotación de torso",
  sentadilla_profunda: "Sentadilla profunda",
  toe_touch: "Toe touch",
  equilibrio_una_pierna: "Equilibrio una pierna",
  estocada_linea: "Estocada en línea",
  puente_extension_pierna: "Puente con extensión de pierna",
  longitud_dorsal: "Longitud dorsal",
  rotacion_interna_cadera: "Rotación interna de cadera",
  rotacion_externa_cadera: "Rotación externa de cadera",
  rotacion_cuadrante_inferior: "Rotación cuadrante inferior",
  rotacion_cervical: "Rotación cervical",
  movilidad_hombro: "Movilidad hombro",
  bisagra_muneca: "Bisagra de muñeca",
  rotacion_antebrazo: "Rotación de antebrazo",
};

type TpiScreen = { pass: boolean; notes: string };

type PhysicalTest = {
  id: string;
  student_id: string;
  student_name: string | null;
  analysis_date: string;
  evaluator_name: string | null;
  player_profile: string | null;
  anthropometry: { height_cm: number | null; weight_kg: number | null; wingspan_cm: number | null } | null;
  performance_tests: { swing_speed_mph: number | null; vertical_jump_cm: number | null; med_ball_throw_m: number | null } | null;
  strength_power: { plank_seconds: number | null; grip_right_kg: number | null; grip_left_kg: number | null } | null;
  tpi_screens: Record<string, TpiScreen> | null;
  tpi_summary: { passes: number; fails: number } | null;
  created_at: string;
};

type PhysicalTestForm = {
  test_date: string;
  evaluator: string;
  player_profile: "junior_alto_rendimiento" | "dama_casual" | "hombre_casual";
  height_cm: string;
  weight_kg: string;
  wingspan_cm: string;
  swing_speed_mph: string;
  vertical_jump_cm: string;
  med_ball_throw_m: string;
  plank_seconds: string;
  grip_right_kg: string;
  grip_left_kg: string;
  tpi_screens: Record<TpiScreenKey, TpiScreen>;
};

function defaultTpiScreens(): Record<TpiScreenKey, TpiScreen> {
  return Object.fromEntries(
    TPI_SCREEN_KEYS.map((k) => [k, { pass: false, notes: "" }])
  ) as Record<TpiScreenKey, TpiScreen>;
}

function tpiSummary(screens: Record<string, TpiScreen> | null) {
  if (!screens) return { passes: 0, fails: 0 };
  const vals = Object.values(screens);
  const passes = vals.filter((v) => v.pass).length;
  return { passes, fails: vals.length - passes };
}

const PLAYER_PROFILE_LABELS: Record<string, string> = {
  junior_alto_rendimiento: "Junior alto rendimiento",
  dama_casual: "Dama casual",
  hombre_casual: "Hombre casual",
};

// ─────────────────────────────────────────────────────────────────────────────

function defaultSkills(): Record<SkillKey, SkillLevel> {
  return Object.fromEntries(SKILL_KEYS.map((k) => [k, "bajo"])) as Record<SkillKey, SkillLevel>;
}

function calcularNivelGeneral(skills: Record<string, SkillLevel> | null): string {
  if (!skills) return "bajo";
  const valores = Object.values(skills) as SkillLevel[];
  if (!valores.length) return "bajo";
  const scores: number[] = valores.map((v) => (v === "cumple" ? 2 : v === "en_progreso" ? 1 : 0));
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg >= 1.5) return "cumple";
  if (avg >= 0.7) return "en_progreso";
  return "bajo";
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

function formatFecha(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
}

function initiales(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
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

  const [evaluations, setEvaluations] = useState<SkillEvaluation[]>([]);
  const [evalsLoading, setEvalsLoading] = useState(false);
  const [showEvalForm, setShowEvalForm] = useState(false);
  const [evalForm, setEvalForm] = useState<EvalForm | null>(null);
  const [evalSaving, setEvalSaving] = useState(false);
  const [evalSaveError, setEvalSaveError] = useState<string | null>(null);
  const [expandedEval, setExpandedEval] = useState<string | null>(null);
  const [editingEval, setEditingEval] = useState<SkillEvaluation | null>(null);

  const [physicalTests, setPhysicalTests] = useState<PhysicalTest[]>([]);
  const [physTestsLoading, setPhysTestsLoading] = useState(false);
  const [showPhysForm, setShowPhysForm] = useState(false);
  const [physForm, setPhysForm] = useState<PhysicalTestForm | null>(null);
  const [physFormSaving, setPhysFormSaving] = useState(false);
  const [physFormError, setPhysFormError] = useState<string | null>(null);
  const [editingPhysTest, setEditingPhysTest] = useState<PhysicalTest | null>(null);
  const [expandedPhysTest, setExpandedPhysTest] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStudent() {
      const { data, error } = await supabase
        .from("students")
        .select(
          "id, full_name, birth_date, status, grupo_activo, gender, parent_name, parent_phone, parent_email, observations, enrollment_date"
        )
        .eq("id", studentId)
        .single();
      if (!error) setStudent(data);
      setLoading(false);
    }
    fetchStudent();
  }, [studentId]);

  useEffect(() => {
    if (activeTab !== "tecnicos") return;
    async function fetchEvaluations() {
      setEvalsLoading(true);
      const { data, error } = await supabase
        .from("skill_evaluations")
        .select(
          "id, student_id, evaluation_date, evaluation_type, skills, general_comment, overall_level, created_at"
        )
        .eq("student_id", studentId)
        .order("evaluation_date", { ascending: false });
      if (!error && data) setEvaluations(data);
      setEvalsLoading(false);
    }
    fetchEvaluations();
  }, [activeTab, studentId]);

  useEffect(() => {
    if (activeTab !== "fisicos") return;
    async function fetchPhysicalTests() {
      setPhysTestsLoading(true);
      const { data, error } = await supabase
        .from("physical_tests")
        .select("*")
        .eq("student_id", studentId)
        .order("test_date", { ascending: false });
      if (!error && data) setPhysicalTests(data);
      setPhysTestsLoading(false);
    }
    fetchPhysicalTests();
  }, [activeTab, studentId]);

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
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
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

    setStudent((prev) => (prev ? { ...prev, ...payload } : prev));
    setSaving(false);
    closeEdit();
  }

  function openEvalForm() {
    setEvalForm({
      evaluation_type: "inicial",
      evaluation_date: new Date().toISOString().split("T")[0],
      skills: defaultSkills(),
      general_comment: "",
    });
    setEvalSaveError(null);
    setShowEvalForm(true);
  }

  function closeEvalForm() {
    setShowEvalForm(false);
    setEvalForm(null);
    setEvalSaveError(null);
    setEditingEval(null);
  }

  function openEditEvalForm(ev: SkillEvaluation) {
    setEditingEval(ev);
    setEvalForm({
      evaluation_type: ev.evaluation_type as EvalForm["evaluation_type"],
      evaluation_date: ev.evaluation_date,
      skills: { ...defaultSkills(), ...(ev.skills as Record<SkillKey, SkillLevel>) },
      general_comment: ev.general_comment ?? "",
    });
    setEvalSaveError(null);
    setShowEvalForm(true);
  }

  function setEvalField<K extends keyof EvalForm>(key: K, value: EvalForm[K]) {
    setEvalForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function setSkillLevel(skill: SkillKey, level: SkillLevel) {
    setEvalForm((prev) =>
      prev ? { ...prev, skills: { ...prev.skills, [skill]: level } } : prev
    );
  }

  async function handleDeleteEvalFromForm() {
    if (!editingEval) return;
    if (!window.confirm(`¿Eliminar la evaluación del ${formatFecha(editingEval.evaluation_date)}? Esta acción no se puede deshacer.`)) return;
    setEvalSaving(true);
    const { error } = await supabase.from("skill_evaluations").delete().eq("id", editingEval.id);
    if (!error) {
      setEvaluations((prev) => prev.filter((e) => e.id !== editingEval.id));
      if (expandedEval === editingEval.id) setExpandedEval(null);
      closeEvalForm();
    } else {
      setEvalSaveError(error.message);
      setEvalSaving(false);
    }
  }

  async function handleSaveEval() {
    if (!evalForm || !student) return;
    setEvalSaving(true);
    setEvalSaveError(null);

    const overall = calcularNivelGeneral(evalForm.skills);

    if (editingEval) {
      const patch = {
        evaluation_date: evalForm.evaluation_date,
        evaluation_type: evalForm.evaluation_type,
        skills: evalForm.skills,
        general_comment: evalForm.general_comment.trim() || null,
        overall_level: overall,
      };
      const { error } = await supabase.from("skill_evaluations").update(patch).eq("id", editingEval.id);
      if (error) {
        setEvalSaveError(error.message);
        setEvalSaving(false);
        return;
      }
      setEvaluations((prev) =>
        prev.map((e) => (e.id === editingEval.id ? { ...e, ...patch } : e))
      );
      setEvalSaving(false);
      closeEvalForm();
      return;
    }

    const id = `eval_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const payload = {
      id,
      student_id: student.id,
      student_name: student.full_name,
      evaluation_date: evalForm.evaluation_date,
      evaluation_type: evalForm.evaluation_type,
      skills: evalForm.skills,
      general_comment: evalForm.general_comment.trim() || null,
      overall_level: overall,
    };

    const { error } = await supabase.from("skill_evaluations").insert(payload);

    if (error) {
      setEvalSaveError(error.message);
      setEvalSaving(false);
      return;
    }

    const newEval: SkillEvaluation = { ...payload, created_at: new Date().toISOString() };
    setEvaluations((prev) => [newEval, ...prev]);
    setEvalSaving(false);
    closeEvalForm();
  }

  function openPhysForm() {
    setEditingPhysTest(null);
    setPhysForm({
      test_date: new Date().toISOString().split("T")[0],
      evaluator: "",
      player_profile: "junior_alto_rendimiento",
      height_cm: "", weight_kg: "", wingspan_cm: "",
      swing_speed_mph: "", vertical_jump_cm: "", med_ball_throw_m: "",
      plank_seconds: "", grip_right_kg: "", grip_left_kg: "",
      tpi_screens: defaultTpiScreens(),
    });
    setPhysFormError(null);
    setShowPhysForm(true);
  }

  function openEditPhysForm(t: PhysicalTest) {
    setEditingPhysTest(t);
    setPhysForm({
      test_date: t.analysis_date,
      evaluator: t.evaluator_name ?? "",
      player_profile: (t.player_profile as PhysicalTestForm["player_profile"]) ?? "junior_alto_rendimiento",
      height_cm: t.anthropometry?.height_cm?.toString() ?? "",
      weight_kg: t.anthropometry?.weight_kg?.toString() ?? "",
      wingspan_cm: t.anthropometry?.wingspan_cm?.toString() ?? "",
      swing_speed_mph: t.performance_tests?.swing_speed_mph?.toString() ?? "",
      vertical_jump_cm: t.performance_tests?.vertical_jump_cm?.toString() ?? "",
      med_ball_throw_m: t.performance_tests?.med_ball_throw_m?.toString() ?? "",
      plank_seconds: t.strength_power?.plank_seconds?.toString() ?? "",
      grip_right_kg: t.strength_power?.grip_right_kg?.toString() ?? "",
      grip_left_kg: t.strength_power?.grip_left_kg?.toString() ?? "",
      tpi_screens: { ...defaultTpiScreens(), ...(t.tpi_screens as Record<TpiScreenKey, TpiScreen>) },
    });
    setPhysFormError(null);
    setShowPhysForm(true);
  }

  function closePhysForm() {
    setShowPhysForm(false);
    setPhysForm(null);
    setPhysFormError(null);
    setEditingPhysTest(null);
  }

  function setPhysField<K extends keyof PhysicalTestForm>(key: K, value: PhysicalTestForm[K]) {
    setPhysForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function setTpiScreen(key: TpiScreenKey, patch: Partial<TpiScreen>) {
    setPhysForm((prev) =>
      prev
        ? { ...prev, tpi_screens: { ...prev.tpi_screens, [key]: { ...prev.tpi_screens[key], ...patch } } }
        : prev
    );
  }

  function parseNum(s: string): number | null {
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  async function handleSavePhysTest() {
    if (!physForm || !student) return;
    setPhysFormSaving(true);
    setPhysFormError(null);

    const { passes, fails } = tpiSummary(physForm.tpi_screens);

    const payload = {
      student_id: student.id,
      student_name: student.full_name,
      analysis_date: physForm.test_date,
      evaluator_name: physForm.evaluator.trim() || null,
      player_profile: physForm.player_profile,
      anthropometry: {
        height_cm: parseNum(physForm.height_cm),
        weight_kg: parseNum(physForm.weight_kg),
        wingspan_cm: parseNum(physForm.wingspan_cm),
      },
      performance_tests: {
        swing_speed_mph: parseNum(physForm.swing_speed_mph),
        vertical_jump_cm: parseNum(physForm.vertical_jump_cm),
        med_ball_throw_m: parseNum(physForm.med_ball_throw_m),
      },
      strength_power: {
        plank_seconds: parseNum(physForm.plank_seconds),
        grip_right_kg: parseNum(physForm.grip_right_kg),
        grip_left_kg: parseNum(physForm.grip_left_kg),
      },
      tpi_screens: physForm.tpi_screens,
      tpi_summary: { passes, fails },
    };

    if (editingPhysTest) {
      const { error } = await supabase.from("physical_tests").update(payload).eq("id", editingPhysTest.id);
      if (error) { setPhysFormError(error.message); setPhysFormSaving(false); return; }
      setPhysicalTests((prev) => prev.map((t) => t.id === editingPhysTest.id ? { ...t, ...payload } : t));
    } else {
      const { data, error } = await supabase.from("physical_tests").insert(payload).select().single();
      if (error) { setPhysFormError(error.message); setPhysFormSaving(false); return; }
      setPhysicalTests((prev) => [data as PhysicalTest, ...prev]);
    }

    setPhysFormSaving(false);
    closePhysForm();
  }

  async function handleDeletePhysTestFromForm() {
    if (!editingPhysTest) return;
    if (!window.confirm(`¿Eliminar el test del ${formatFecha(editingPhysTest.analysis_date)}? Esta acción no se puede deshacer.`)) return;
    setPhysFormSaving(true);
    const { error } = await supabase.from("physical_tests").delete().eq("id", editingPhysTest.id);
    if (!error) {
      setPhysicalTests((prev) => prev.filter((t) => t.id !== editingPhysTest.id));
      if (expandedPhysTest === editingPhysTest.id) setExpandedPhysTest(null);
      closePhysForm();
    } else {
      setPhysFormError(error.message);
      setPhysFormSaving(false);
    }
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
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#163d24";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1B4D2E";
            }}
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
              style={activeTab === key ? { backgroundColor: "#1B4D2E", color: "white" } : { color: "#374151" }}
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
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
                Contacto del acudiente
              </p>
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
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">Evaluaciones técnicas</h2>
              <button
                onClick={openEvalForm}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: "#1B4D2E" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#163d24";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1B4D2E";
                }}
              >
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Nueva evaluación
              </button>
            </div>

            {evalsLoading ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <svg className="animate-spin mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Cargando evaluaciones...
              </div>
            ) : evaluations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <svg
                  width="40"
                  height="40"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="mb-3"
                >
                  <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                  <rect x="9" y="3" width="6" height="4" rx="1" />
                  <path d="M9 12h6M9 16h4" />
                </svg>
                <p className="text-sm font-medium">Sin evaluaciones aún</p>
                <p className="text-xs mt-1">Crea la primera evaluación técnica de este alumno</p>
              </div>
            ) : (
              <div className="space-y-3">
                {evaluations.map((ev) => {
                  const isOpen = expandedEval === ev.id;
                  const nivel = ev.overall_level ?? calcularNivelGeneral(ev.skills);
                  return (
                    <div key={ev.id} className="border border-gray-100 rounded-xl overflow-hidden">
                      <div className="flex items-center hover:bg-gray-50 transition-colors">
                        <button
                          onClick={() => setExpandedEval(isOpen ? null : ev.id)}
                          className="flex-1 flex items-center justify-between px-5 py-4 text-left"
                        >
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              {formatFecha(ev.evaluation_date)}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5 capitalize">{ev.evaluation_type}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <EvalTypeBadge type={ev.evaluation_type} />
                            <NivelBadge nivel={nivel} />
                            <svg
                              width="16"
                              height="16"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                              className={`text-gray-400 transition-transform ml-1 ${isOpen ? "rotate-180" : ""}`}
                            >
                              <path d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>
                        <button
                          onClick={() => openEditEvalForm(ev)}
                          title="Editar evaluación"
                          className="mr-3 p-2 rounded-lg text-gray-400 hover:text-[#1B4D2E] hover:bg-[#1B4D2E10] transition-colors"
                        >
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                      </div>

                      {isOpen && (
                        <div className="px-5 pb-5 border-t border-gray-50">
                          <div className="pt-4 space-y-5">
                            <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                                Habilidades técnicas de golf
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                {GOLF_SKILLS.map((skill) => (
                                  <SkillRow
                                    key={skill}
                                    label={SKILL_LABELS[skill]}
                                    level={(ev.skills?.[skill] as SkillLevel) ?? null}
                                  />
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                                Actitud y conocimiento
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                {CONDUCT_SKILLS.map((skill) => (
                                  <SkillRow
                                    key={skill}
                                    label={SKILL_LABELS[skill]}
                                    level={(ev.skills?.[skill] as SkillLevel) ?? null}
                                  />
                                ))}
                              </div>
                            </div>
                            {ev.general_comment && (
                              <div className="border-t border-gray-50 pt-4">
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                                  Comentario del evaluador
                                </p>
                                <p className="text-sm text-gray-700 leading-relaxed">{ev.general_comment}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "fisicos" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">Tests físicos</h2>
              <button
                onClick={openPhysForm}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: "#1B4D2E" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#163d24"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1B4D2E"; }}
              >
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Nuevo test
              </button>
            </div>

            {physTestsLoading ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <svg className="animate-spin mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Cargando tests...
              </div>
            ) : physicalTests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="mb-3">
                  <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                  <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                  <line x1="6" y1="1" x2="6" y2="4" />
                  <line x1="10" y1="1" x2="10" y2="4" />
                  <line x1="14" y1="1" x2="14" y2="4" />
                </svg>
                <p className="text-sm font-medium">Sin tests físicos aún</p>
                <p className="text-xs mt-1">Crea el primer test físico de este alumno</p>
              </div>
            ) : (
              <div className="space-y-3">
                {physicalTests.map((t) => {
                  const isOpen = expandedPhysTest === t.id;
                  const { passes, fails } = tpiSummary(t.tpi_screens);
                  return (
                    <div key={t.id} className="border border-gray-100 rounded-xl overflow-hidden">
                      <div className="flex items-center hover:bg-gray-50 transition-colors">
                        <button
                          onClick={() => setExpandedPhysTest(isOpen ? null : t.id)}
                          className="flex-1 flex items-center justify-between px-5 py-4 text-left"
                        >
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{formatFecha(t.analysis_date)}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{t.evaluator_name || "Sin evaluador"}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {t.player_profile && (
                              <span
                                className="px-2.5 py-1 rounded-full text-xs font-medium"
                                style={{ backgroundColor: "#C9A84C20", color: "#8B6914" }}
                              >
                                {PLAYER_PROFILE_LABELS[t.player_profile] ?? t.player_profile}
                              </span>
                            )}
                            {t.tpi_screens && (
                              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                                style={{ backgroundColor: "#1B4D2E15", color: "#1B4D2E" }}>
                                <span style={{ color: "#1B4D2E" }}>{passes}P</span>
                                <span className="text-gray-400 mx-0.5">/</span>
                                <span style={{ color: "#DC2626" }}>{fails}F</span>
                              </span>
                            )}
                            <svg
                              width="16" height="16" fill="none" viewBox="0 0 24 24"
                              stroke="currentColor" strokeWidth={2}
                              className={`text-gray-400 transition-transform ml-1 ${isOpen ? "rotate-180" : ""}`}
                            >
                              <path d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>
                        <button
                          onClick={() => openEditPhysForm(t)}
                          title="Editar test"
                          className="mr-3 p-2 rounded-lg text-gray-400 hover:text-[#1B4D2E] hover:bg-[#1B4D2E10] transition-colors"
                        >
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                      </div>

                      {isOpen && (
                        <div className="px-5 pb-5 border-t border-gray-50">
                          <div className="pt-4 space-y-5">
                            <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Antropometría</p>
                              <div className="grid grid-cols-3 gap-2">
                                <PhysMetric label="Altura" value={t.anthropometry?.height_cm ?? null} unit="cm" />
                                <PhysMetric label="Peso" value={t.anthropometry?.weight_kg ?? null} unit="kg" />
                                <PhysMetric label="Envergadura" value={t.anthropometry?.wingspan_cm ?? null} unit="cm" />
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Rendimiento</p>
                              <div className="grid grid-cols-3 gap-2">
                                <PhysMetric label="Vel. swing" value={t.performance_tests?.swing_speed_mph ?? null} unit="mph" />
                                <PhysMetric label="Salto vertical" value={t.performance_tests?.vertical_jump_cm ?? null} unit="cm" />
                                <PhysMetric label="Med ball" value={t.performance_tests?.med_ball_throw_m ?? null} unit="m" />
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Fuerza</p>
                              <div className="grid grid-cols-3 gap-2">
                                <PhysMetric label="Plancha" value={t.strength_power?.plank_seconds ?? null} unit="seg" />
                                <PhysMetric label="Agarre derecha" value={t.strength_power?.grip_right_kg ?? null} unit="kg" />
                                <PhysMetric label="Agarre izquierda" value={t.strength_power?.grip_left_kg ?? null} unit="kg" />
                              </div>
                            </div>
                            {t.tpi_screens && (
                              <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">TPI Screens</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                  {TPI_SCREEN_KEYS.map((key) => {
                                    const sc = t.tpi_screens![key];
                                    return (
                                      <div key={key} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-gray-50">
                                        <span className="text-sm text-gray-700">{TPI_SCREEN_LABELS[key]}</span>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <span
                                            className="px-2 py-0.5 rounded-full text-xs font-semibold"
                                            style={sc?.pass
                                              ? { backgroundColor: "#1B4D2E15", color: "#1B4D2E" }
                                              : { backgroundColor: "#FEE2E2", color: "#991B1B" }}
                                          >
                                            {sc?.pass ? "Pass" : "Fail"}
                                          </span>
                                          {sc?.notes && <span className="text-xs text-gray-400 max-w-[80px] truncate" title={sc.notes}>{sc.notes}</span>}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "hitos" && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg
              width="40"
              height="40"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              className="mb-3"
            >
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
            <p className="text-sm">Hitos personales — próximamente</p>
          </div>
        )}
      </div>

      {/* Edit student modal */}
      {isEditing && form && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEdit();
          }}
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

              <FormField label="Grupo">
                <select
                  value={form.grupo_activo}
                  onChange={(e) => setField("grupo_activo", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E] bg-white"
                >
                  <option value="">Sin grupo asignado</option>
                  <option value="Birdies">Birdies</option>
                  <option value="Águilas">Águilas</option>
                  <option value="Albatros">Albatros</option>
                  <option value="+14">+14</option>
                  <option value="Competencia">Competencia</option>
                  <option value="Damas">Damas</option>
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
                onMouseEnter={(e) => {
                  if (!saving) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#163d24";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1B4D2E";
                }}
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

      {/* Physical test modal */}
      {showPhysForm && physForm && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={(e) => { if (e.target === e.currentTarget) closePhysForm(); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {editingPhysTest ? "Editar test físico" : "Nuevo test físico"}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">{student.full_name}</p>
              </div>
              <button onClick={closePhysForm} className="text-gray-400 hover:text-gray-600 transition-colors" disabled={physFormSaving}>
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-6 overflow-y-auto max-h-[72vh]">
              {/* Básicos */}
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Fecha" required>
                  <input type="date" value={physForm.test_date}
                    onChange={(e) => setPhysField("test_date", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]" />
                </FormField>
                <FormField label="Evaluador">
                  <input type="text" value={physForm.evaluator} placeholder="Nombre del evaluador"
                    onChange={(e) => setPhysField("evaluator", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]" />
                </FormField>
              </div>
              <FormField label="Perfil del jugador">
                <select value={physForm.player_profile}
                  onChange={(e) => setPhysField("player_profile", e.target.value as PhysicalTestForm["player_profile"])}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E] bg-white">
                  <option value="junior_alto_rendimiento">Junior alto rendimiento</option>
                  <option value="dama_casual">Dama casual</option>
                  <option value="hombre_casual">Hombre casual</option>
                </select>
              </FormField>

              {/* Antropometría */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Antropometría</p>
                <div className="grid grid-cols-3 gap-4">
                  <FormField label="Altura (cm)">
                    <input type="number" value={physForm.height_cm} placeholder="—"
                      onChange={(e) => setPhysField("height_cm", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]" />
                  </FormField>
                  <FormField label="Peso (kg)">
                    <input type="number" value={physForm.weight_kg} placeholder="—"
                      onChange={(e) => setPhysField("weight_kg", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]" />
                  </FormField>
                  <FormField label="Envergadura (cm)">
                    <input type="number" value={physForm.wingspan_cm} placeholder="—"
                      onChange={(e) => setPhysField("wingspan_cm", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]" />
                  </FormField>
                </div>
              </div>

              {/* Rendimiento */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Tests de rendimiento</p>
                <div className="grid grid-cols-3 gap-4">
                  <FormField label="Vel. swing (mph)">
                    <input type="number" value={physForm.swing_speed_mph} placeholder="—"
                      onChange={(e) => setPhysField("swing_speed_mph", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]" />
                  </FormField>
                  <FormField label="Salto vertical (cm)">
                    <input type="number" value={physForm.vertical_jump_cm} placeholder="—"
                      onChange={(e) => setPhysField("vertical_jump_cm", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]" />
                  </FormField>
                  <FormField label="Med ball (m)">
                    <input type="number" value={physForm.med_ball_throw_m} placeholder="—"
                      onChange={(e) => setPhysField("med_ball_throw_m", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]" />
                  </FormField>
                </div>
              </div>

              {/* Fuerza */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Fuerza</p>
                <div className="grid grid-cols-3 gap-4">
                  <FormField label="Plancha (seg)">
                    <input type="number" value={physForm.plank_seconds} placeholder="—"
                      onChange={(e) => setPhysField("plank_seconds", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]" />
                  </FormField>
                  <FormField label="Agarre der. (kg)">
                    <input type="number" value={physForm.grip_right_kg} placeholder="—"
                      onChange={(e) => setPhysField("grip_right_kg", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]" />
                  </FormField>
                  <FormField label="Agarre izq. (kg)">
                    <input type="number" value={physForm.grip_left_kg} placeholder="—"
                      onChange={(e) => setPhysField("grip_left_kg", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]" />
                  </FormField>
                </div>
              </div>

              {/* TPI Screens */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">TPI Screens</p>
                <div className="space-y-2">
                  {TPI_SCREEN_KEYS.map((key) => {
                    const sc = physForm.tpi_screens[key];
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <span className="text-sm text-gray-700 w-52 shrink-0 leading-tight">{TPI_SCREEN_LABELS[key]}</span>
                        <div className="flex gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setTpiScreen(key, { pass: true })}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
                            style={sc.pass
                              ? { backgroundColor: "#1B4D2E15", color: "#1B4D2E", borderColor: "#1B4D2E50" }
                              : { backgroundColor: "white", color: "#9CA3AF", borderColor: "#E5E7EB" }}
                          >Pass</button>
                          <button
                            type="button"
                            onClick={() => setTpiScreen(key, { pass: false })}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
                            style={!sc.pass
                              ? { backgroundColor: "#FEE2E2", color: "#991B1B", borderColor: "#FCA5A5" }
                              : { backgroundColor: "white", color: "#9CA3AF", borderColor: "#E5E7EB" }}
                          >Fail</button>
                        </div>
                        <input
                          type="text"
                          value={sc.notes}
                          onChange={(e) => setTpiScreen(key, { notes: e.target.value })}
                          placeholder="Notas..."
                          className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {physFormError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  Error al guardar: {physFormError}
                </p>
              )}
            </div>

            <div className="flex items-center px-6 py-4 border-t border-gray-100 gap-3">
              {editingPhysTest && (
                <button
                  onClick={handleDeletePhysTestFromForm}
                  disabled={physFormSaving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                  Eliminar
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={closePhysForm}
                disabled={physFormSaving}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-colors"
              >Cancelar</button>
              <button
                onClick={handleSavePhysTest}
                disabled={physFormSaving || !physForm.test_date}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: "#1B4D2E" }}
                onMouseEnter={(e) => { if (!physFormSaving) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#163d24"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1B4D2E"; }}
              >
                {physFormSaving && (
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
                {physFormSaving ? "Guardando..." : editingPhysTest ? "Guardar cambios" : "Guardar test"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New evaluation modal */}
      {showEvalForm && evalForm && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEvalForm();
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {editingEval ? "Editar evaluación técnica" : "Nueva evaluación técnica"}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">{student.full_name}</p>
              </div>
              <button
                onClick={closeEvalForm}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                disabled={evalSaving}
              >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-6 overflow-y-auto max-h-[72vh]">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Tipo de evaluación" required>
                  <select
                    value={evalForm.evaluation_type}
                    onChange={(e) =>
                      setEvalField("evaluation_type", e.target.value as EvalForm["evaluation_type"])
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E] bg-white"
                  >
                    <option value="inicial">Inicial</option>
                    <option value="periódica">Periódica</option>
                    <option value="graduación">Graduación</option>
                  </select>
                </FormField>
                <FormField label="Fecha" required>
                  <input
                    type="date"
                    value={evalForm.evaluation_date}
                    onChange={(e) => setEvalField("evaluation_date", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]"
                  />
                </FormField>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Habilidades técnicas de golf
                </p>
                <div className="space-y-2">
                  {GOLF_SKILLS.map((skill) => (
                    <SkillLevelInput
                      key={skill}
                      label={SKILL_LABELS[skill]}
                      value={evalForm.skills[skill]}
                      onChange={(level) => setSkillLevel(skill, level)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Actitud y conocimiento
                </p>
                <div className="space-y-2">
                  {CONDUCT_SKILLS.map((skill) => (
                    <SkillLevelInput
                      key={skill}
                      label={SKILL_LABELS[skill]}
                      value={evalForm.skills[skill]}
                      onChange={(level) => setSkillLevel(skill, level)}
                    />
                  ))}
                </div>
              </div>

              <FormField label="Comentario general del evaluador">
                <textarea
                  value={evalForm.general_comment}
                  onChange={(e) => setEvalField("general_comment", e.target.value)}
                  rows={3}
                  placeholder="Observaciones sobre el alumno, avances, áreas de mejora..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E] resize-none"
                />
              </FormField>

              {evalSaveError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  Error al guardar: {evalSaveError}
                </p>
              )}
            </div>

            <div className="flex items-center px-6 py-4 border-t border-gray-100 gap-3">
              {editingEval && (
                <button
                  onClick={handleDeleteEvalFromForm}
                  disabled={evalSaving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                  Eliminar
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={closeEvalForm}
                disabled={evalSaving}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEval}
                disabled={evalSaving || !evalForm.evaluation_date}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: "#1B4D2E" }}
                onMouseEnter={(e) => {
                  if (!evalSaving) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#163d24";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1B4D2E";
                }}
              >
                {evalSaving && (
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
                {evalSaving ? "Guardando..." : editingEval ? "Guardar cambios" : "Guardar evaluación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NivelBadge({ nivel }: { nivel: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    cumple: { bg: "#1B4D2E15", color: "#1B4D2E", label: "Cumple" },
    en_progreso: { bg: "#FEF3C7", color: "#92400E", label: "En progreso" },
    bajo: { bg: "#FEE2E2", color: "#991B1B", label: "Bajo" },
  };
  const s = map[nivel] ?? { bg: "#F3F4F6", color: "#6B7280", label: nivel };
  return (
    <span
      className="px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ backgroundColor: s.bg, color: s.color, border: `1px solid ${s.color}30` }}
    >
      {s.label}
    </span>
  );
}

function EvalTypeBadge({ type }: { type: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    inicial: { bg: "#C9A84C20", color: "#8B6914" },
    periódica: { bg: "#EFF6FF", color: "#1D4ED8" },
    graduación: { bg: "#F5F3FF", color: "#6D28D9" },
  };
  const s = map[type] ?? { bg: "#F3F4F6", color: "#6B7280" };
  return (
    <span
      className="px-2.5 py-1 rounded-full text-xs font-medium capitalize"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {type.charAt(0).toUpperCase() + type.slice(1)}
    </span>
  );
}

function SkillRow({ label, level }: { label: string; level: SkillLevel | null }) {
  const cfg: Record<SkillLevel, { dot: string; text: string; label: string }> = {
    cumple: { dot: "#1B4D2E", text: "#1B4D2E", label: "Cumple" },
    en_progreso: { dot: "#D97706", text: "#D97706", label: "En progreso" },
    bajo: { dot: "#DC2626", text: "#DC2626", label: "Bajo" },
  };
  const c = level ? cfg[level] : null;
  return (
    <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-gray-50">
      <span className="text-sm text-gray-700">{label}</span>
      {c ? (
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.dot }} />
          <span className="text-xs font-medium" style={{ color: c.text }}>
            {c.label}
          </span>
        </div>
      ) : (
        <span className="text-xs text-gray-400">—</span>
      )}
    </div>
  );
}

function SkillLevelInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: SkillLevel;
  onChange: (level: SkillLevel) => void;
}) {
  const levels: {
    key: SkillLevel;
    label: string;
    active: { bg: string; color: string; border: string };
  }[] = [
    {
      key: "bajo",
      label: "Bajo",
      active: { bg: "#FEE2E2", color: "#991B1B", border: "#FCA5A5" },
    },
    {
      key: "en_progreso",
      label: "En progreso",
      active: { bg: "#FEF3C7", color: "#92400E", border: "#FCD34D" },
    },
    {
      key: "cumple",
      label: "Cumple",
      active: { bg: "#1B4D2E15", color: "#1B4D2E", border: "#1B4D2E50" },
    },
  ];

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-700 w-40 shrink-0 leading-tight">{label}</span>
      <div className="flex gap-1 flex-1">
        {levels.map(({ key, label: lbl, active }) => {
          const isActive = value === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-all"
              style={
                isActive
                  ? { backgroundColor: active.bg, color: active.color, borderColor: active.border }
                  : { backgroundColor: "white", color: "#9CA3AF", borderColor: "#E5E7EB" }
              }
            >
              {lbl}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PhysMetric({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-3 px-2 rounded-lg bg-gray-50 text-center">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      {value != null ? (
        <p className="text-sm font-semibold text-gray-900">{value} <span className="text-xs font-normal text-gray-500">{unit}</span></p>
      ) : (
        <p className="text-sm text-gray-400">—</p>
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

function FormField({
  label,
  children,
  required,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
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
