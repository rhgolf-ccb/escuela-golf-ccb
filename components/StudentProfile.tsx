"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Tab = "datos" | "tecnicos" | "fisicos" | "hitos";
type CritValue = "cumple" | "progreso" | "no" | null;

const CRITERIOS_POR_POSICION: Record<string, string[]> = {
  P1: ["Grip — posición documentada (neutro/fuerte/débil)", "Postura — rodillas, inclinación, columna", "Posición de la bola — específica por palo", "Alineación — cara al objetivo, cuerpo paralelo", "Distancia al palo — correcta por longitud"],
  P2: ["Posición de la vara — sobre la línea de juego", "Cara del palo — paralela a la columna", "Triángulo — brazos y hombros unidos", "Carga de muñecas — iniciando sin quiebre", "Peso — transferencia al pie derecho"],
  P3: ["Brazo izquierdo — paralelo al piso y línea de juego", "Plano del palo — apuntando a la línea de juego", "Carga de muñecas — completada al 90%", "Rotación de hombros — iniciando, hombro derecho atrás", "Peso — cargando al pie derecho"],
  P4: ["Rotación de hombros — 90°, se ve profundidad", "Rotación de caderas — 45°, full carga", "Posición del palo — paralelo al piso y línea de juego", "Cara del palo — perpendicular a la columna", "Peso — 80% pie derecho"],
  P5: ["Secuencia — caderas lideran antes que hombros", "Codo derecho — baja pegado al costado", "Plano del palo — ligeramente más interno", "Lag — ángulo de muñecas mantenido", "Peso — transferencia al pie izquierdo"],
  P6: ["Plano del palo — apuntando a la línea de juego", "Cara del palo — perpendicular al piso (toe up)", "Lag — ángulo de muñecas al máximo", "Caderas — 20-25° apertura al objetivo", "Peso — mayoría al pie izquierdo"],
  P7: ["Manos — adelante de la cabeza del palo (shaft lean)", "Cara del palo — perpendicular a la línea de juego", "Caderas — 30-45° al objetivo", "Cabeza — detrás de la bola, ojos en la bola", "Peso — 70% pie izquierdo"],
  P8: ["Extensión de brazos — completa hacia el objetivo", "Cara del palo — a 45° (toe up)", "Plano del palo — apuntando a la línea de juego", "Rotación de antebrazos — completada", "Peso — 90% pie izquierdo"],
  P9: ["Extensión completa — brazo derecho al objetivo", "Plano del palo — apuntando a la línea de juego", "Rotación de antebrazos — completada", "Cadera izquierda — abierta sin bloqueo", "Peso — 95% pie izquierdo"],
  P10: ["Balance — equilibrio total, puede sostener", "Peso — 100% pie izquierdo, talón derecho levantado", "Cadera y hombros — de frente al objetivo", "Palo — detrás del cuello/hombro izquierdo", "Columna — vertical, postura erguida"],
};

const CRITERIOS_BIRDIES: Record<string, string[]> = {
  P1: ["Agarra el palo con las dos manos", "Se para derecho frente a la bola", "Dobla un poquito las rodillas"],
  P4: ["Lleva el palo hacia atrás", "Gira el cuerpo (se le ve la espalda)", "El peso va hacia atrás"],
  P7: ["Mira la bola hasta golpearla", "Toca la bola con la cara del palo", "El cuerpo acompaña el golpe"],
  P10: ["Termina el swing completo", "Queda parado en balance", "La barriga queda mirando al objetivo"],
};

const CRITERIOS_AGUILAS: Record<string, string[]> = {
  P1: ["Grip — las dos manos bien puestas", "Postura — dobla rodillas, inclínate desde la cadera", "Posición de la bola — al centro para hierros", "Alineación — cara al objetivo, cuerpo paralelo", "Distancia — un puño entre grip y muslo"],
  P2: ["Posición de la vara — sobre la línea de juego", "Cara del palo — paralela a la columna", "Triángulo — brazos y hombros se mueven juntos", "Carga de muñecas — iniciando", "Peso — comenzando a ir hacia atrás"],
  P4: ["Rotación de hombros — se ve la espalda", "Rotación de caderas — gira con los hombros", "Posición del palo — arriba y controlado", "Cara del palo — perpendicular a la columna", "Peso — cargado hacia atrás"],
  P7: ["Manos adelante de la bola", "Cara del palo cuadrada", "Cabeza abajo, ojos en la bola", "Caderas girando al objetivo", "Peso pasando al pie izquierdo"],
  P10: ["Termina el swing completo", "Balance total — puede quedarse quieto", "Barriga de frente al objetivo", "Peso en pie izquierdo", "Palo detrás del hombro"],
};

const POSICIONES_GRUPO: Record<string, string[]> = {
  Birdies: ["P1", "P4", "P7", "P10"],
  "Águilas": ["P1", "P2", "P4", "P7", "P10"],
  Albatros: ["P1","P2","P3","P4","P5","P6","P7","P8","P9","P10"],
  "Grupo +14": ["P1","P2","P3","P4","P5","P6","P7","P8","P9","P10"],
  Competencia: ["P1","P2","P3","P4","P5","P6","P7","P8","P9","P10"],
  Damas: ["P1","P2","P3","P4","P5","P6","P7","P8","P9","P10"],
};

const POSICIONES_NOMBRES: Record<string, string> = {
  P1: "Setup", P2: "Palo paralelo — backswing", P3: "Brazo izq. paralelo",
  P4: "Top backswing", P5: "Brazo der. — inicio downswing", P6: "Palo paralelo — downswing",
  P7: "Impacto", P8: "Palo paralelo — follow through", P9: "Brazo der. — follow through", P10: "Finish completo",
};

const POSICIONES_FASES = [
  { label: "Backswing", posiciones: ["P1","P2","P3","P4"] },
  { label: "Downswing", posiciones: ["P5","P6","P7"] },
  { label: "Follow through", posiciones: ["P8","P9","P10"] },
];

type Student = {
  id: string; full_name: string; birth_date: string | null;
  status: "activo" | "inactivo"; grupo_activo: string | null; gender: string | null;
  parent_name: string | null; parent_phone: string | null; parent_email: string | null;
  observations: string | null; enrollment_date: string | null;
};

type EditForm = {
  full_name: string; birth_date: string; status: "activo" | "inactivo";
  grupo_activo: string; parent_name: string; parent_phone: string;
  parent_email: string; observations: string;
};

type PosState = { na: boolean; criterios: CritValue[]; obsOpen: boolean; obs: string; };

type SwingForm = {
  evaluation_type: "inicial" | "periódica" | "graduación";
  evaluation_date: string;
  positions: Record<string, PosState>;
  professor_comment: string;
};

type SwingEvaluation = {
  id: string; student_id: string; student_name: string; grupo: string;
  evaluation_date: string; evaluation_type: string;
  p1_score: number|null; p2_score: number|null; p3_score: number|null;
  p4_score: number|null; p5_score: number|null; p6_score: number|null;
  p7_score: number|null; p8_score: number|null; p9_score: number|null;
  p10_score: number|null; score_promedio: number|null;
  p1_criterios: CritValue[]|null; p1_obs: string|null; p1_na: boolean;
  p2_criterios: CritValue[]|null; p2_obs: string|null; p2_na: boolean;
  p3_criterios: CritValue[]|null; p3_obs: string|null; p3_na: boolean;
  p4_criterios: CritValue[]|null; p4_obs: string|null; p4_na: boolean;
  p5_criterios: CritValue[]|null; p5_obs: string|null; p5_na: boolean;
  p6_criterios: CritValue[]|null; p6_obs: string|null; p6_na: boolean;
  p7_criterios: CritValue[]|null; p7_obs: string|null; p7_na: boolean;
  p8_criterios: CritValue[]|null; p8_obs: string|null; p8_na: boolean;
  p9_criterios: CritValue[]|null; p9_obs: string|null; p9_na: boolean;
  p10_criterios: CritValue[]|null; p10_obs: string|null; p10_na: boolean;
  ai_analysis: string|null; ai_generated_at: string|null;
  professor_comment: string|null; created_at: string;
};

type AiAnalysis = {
  resumen: string;
  prioridades: { orden: number; posicion: string; titulo: string; descripcion: string; instruccion_profesor: string; conexion_fisica: string|null; drills: string[]; }[];
  fortalezas: string[];
  plan_clase: { minutos: string; actividad: string; tipo: string; }[];
  nota_edad: string;
};

function getCriteriosGrupo(grupo: string, posicion: string): string[] {
  if (grupo === "Birdies") return CRITERIOS_BIRDIES[posicion] || [];
  if (grupo === "Águilas") return CRITERIOS_AGUILAS[posicion] || [];
  return CRITERIOS_POR_POSICION[posicion] || [];
}

function critScore(val: CritValue): number|null {
  if (val === "cumple") return 10;
  if (val === "progreso") return 6;
  if (val === "no") return 2;
  return null;
}

function calcPosScore(criterios: CritValue[]): number|null {
  const scores = criterios.map(critScore).filter((v): v is number => v !== null);
  if (!scores.length) return null;
  return Math.round(scores.reduce((a,b) => a+b, 0) / scores.length * 10) / 10;
}

function calcPromedio(positions: Record<string, PosState>): number|null {
  const scores: number[] = [];
  Object.values(positions).forEach((p) => {
    if (p.na) return;
    const s = calcPosScore(p.criterios);
    if (s !== null) scores.push(s);
  });
  if (!scores.length) return null;
  return Math.round(scores.reduce((a,b) => a+b, 0) / scores.length * 100) / 100;
}

function scoreColor(score: number|null) {
  if (score === null) return { text: "#9CA3AF", bg: "#F9FAFB", bar: "#E5E7EB" };
  if (score >= 8) return { text: "#1D4ED8", bg: "#EFF6FF", bar: "#3B82F6" };
  if (score >= 6) return { text: "#1B4D2E", bg: "#F0FDF4", bar: "#22C55E" };
  if (score >= 4) return { text: "#92400E", bg: "#FFFBEB", bar: "#F59E0B" };
  return { text: "#991B1B", bg: "#FEF2F2", bar: "#EF4444" };
}

function scoreLabel(score: number|null): string {
  if (score === null) return "—";
  if (score >= 8) return "Excelente";
  if (score >= 6) return "Cumple";
  if (score >= 4) return "En progreso";
  return "Bajo";
}

function calcularEdad(birthDate: string|null): string {
  if (!birthDate) return "—";
  const hoy = new Date(); const nac = new Date(birthDate);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return `${edad} años`;
}

function calcularEdadNum(birthDate: string|null): number|null {
  if (!birthDate) return null;
  const hoy = new Date(); const nac = new Date(birthDate);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}

function formatFecha(dateStr: string|null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
}

function initiales(name: string): string {
  return name.split(" ").slice(0,2).map((n) => n[0]).join("").toUpperCase();
}

function defaultSwingForm(grupo: string): SwingForm {
  const posiciones = POSICIONES_GRUPO[grupo] || POSICIONES_GRUPO["Albatros"];
  const positions: Record<string, PosState> = {};
  posiciones.forEach((p) => {
    const criterios = getCriteriosGrupo(grupo, p);
    positions[p] = { na: false, criterios: criterios.map(() => null), obsOpen: false, obs: "" };
  });
  return { evaluation_type: "inicial", evaluation_date: new Date().toISOString().split("T")[0], positions, professor_comment: "" };
}

export default function StudentProfile({ studentId }: { studentId: string }) {
  const router = useRouter();
  const [student, setStudent] = useState<Student|null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("datos");
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<EditForm|null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string|null>(null);
  const [swingEvals, setSwingEvals] = useState<SwingEvaluation[]>([]);
  const [swingLoading, setSwingLoading] = useState(false);
  const [showSwingForm, setShowSwingForm] = useState(false);
  const [swingForm, setSwingForm] = useState<SwingForm|null>(null);
  const [swingSaving, setSwingSaving] = useState(false);
  const [swingSaveError, setSwingSaveError] = useState<string|null>(null);
  const [expandedEval, setExpandedEval] = useState<string|null>(null);
  const [analyzingId, setAnalyzingId] = useState<string|null>(null);
  const [aiResults, setAiResults] = useState<Record<string, AiAnalysis>>({});

  useEffect(() => {
    async function fetchStudent() {
      const { data, error } = await supabase.from("students")
        .select("id,full_name,birth_date,status,grupo_activo,gender,parent_name,parent_phone,parent_email,observations,enrollment_date")
        .eq("id", studentId).single();
      if (!error) setStudent(data);
      setLoading(false);
    }
    fetchStudent();
  }, [studentId]);

  useEffect(() => {
    if (activeTab !== "tecnicos") return;
    async function fetchSwing() {
      setSwingLoading(true);
      const { data, error } = await supabase.from("swing_evaluations").select("*")
        .eq("student_id", studentId).order("evaluation_date", { ascending: false });
      if (!error && data) {
        setSwingEvals(data);
        const aiMap: Record<string, AiAnalysis> = {};
        data.forEach((ev) => {
          if (!ev.ai_analysis) return;
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let p: any = typeof ev.ai_analysis === 'string' ? JSON.parse(ev.ai_analysis) : ev.ai_analysis;
            // Unwrap up to 3 levels of nested JSON in resumen (handles double-encoding from older saves)
            for (let i = 0; i < 3; i++) {
              if (typeof p?.resumen !== 'string' || !p.resumen.trim().startsWith('{')) break;
              try {
                const inner = JSON.parse(p.resumen);
                if (inner?.resumen !== undefined) { p = inner; } else break;
              } catch {
                const match = String(p.resumen).match(/\{[\s\S]*\}/);
                if (match) { try { const inner = JSON.parse(match[0]); if (inner?.resumen !== undefined) { p = inner; } } catch {} }
                break;
              }
            }
            if (p && typeof p === 'object' && typeof p.resumen === 'string' && !p.resumen.trim().startsWith('{')) {
              aiMap[ev.id] = p as AiAnalysis;
            }
          } catch {}
        });
        setAiResults(aiMap);
      }
      setSwingLoading(false);
    }
    fetchSwing();
  }, [activeTab, studentId]);

  function openEdit() {
    if (!student) return;
    setForm({ full_name: student.full_name, birth_date: student.birth_date ?? "", status: student.status, grupo_activo: student.grupo_activo ?? "", parent_name: student.parent_name ?? "", parent_phone: student.parent_phone ?? "", parent_email: student.parent_email ?? "", observations: student.observations ?? "" });
    setSaveError(null); setIsEditing(true);
  }
  function closeEdit() { setIsEditing(false); setForm(null); setSaveError(null); }
  function setField<K extends keyof EditForm>(key: K, value: EditForm[K]) { setForm((prev) => prev ? { ...prev, [key]: value } : prev); }

  async function handleSave() {
    if (!form || !student) return;
    setSaving(true); setSaveError(null);
    const payload = { full_name: form.full_name.trim(), birth_date: form.birth_date||null, status: form.status, grupo_activo: form.grupo_activo||null, parent_name: form.parent_name.trim()||null, parent_phone: form.parent_phone.trim()||null, parent_email: form.parent_email.trim()||null, observations: form.observations.trim()||null };
    const { error } = await supabase.from("students").update(payload).eq("id", student.id);
    if (error) { setSaveError(error.message); setSaving(false); return; }
    setStudent((prev) => prev ? { ...prev, ...payload } : prev);
    setSaving(false); closeEdit();
  }

  function openSwingForm() {
    const grupo = student?.grupo_activo || "Albatros";
    setSwingForm(defaultSwingForm(grupo));
    setSwingSaveError(null); setShowSwingForm(true);
  }
  function closeSwingForm() { setShowSwingForm(false); setSwingForm(null); setSwingSaveError(null); }

  function setPosNA(pid: string, na: boolean) {
    setSwingForm((prev) => { if (!prev) return prev; return { ...prev, positions: { ...prev.positions, [pid]: { ...prev.positions[pid], na } } }; });
  }

  function setCrit(pid: string, idx: number, val: CritValue) {
    setSwingForm((prev) => {
      if (!prev) return prev;
      const crits = [...prev.positions[pid].criterios];
      crits[idx] = crits[idx] === val ? null : val;
      return { ...prev, positions: { ...prev.positions, [pid]: { ...prev.positions[pid], criterios: crits } } };
    });
  }

  function toggleObs(pid: string) {
    setSwingForm((prev) => { if (!prev) return prev; return { ...prev, positions: { ...prev.positions, [pid]: { ...prev.positions[pid], obsOpen: !prev.positions[pid].obsOpen } } }; });
  }

  function setObs(pid: string, obs: string) {
    setSwingForm((prev) => { if (!prev) return prev; return { ...prev, positions: { ...prev.positions, [pid]: { ...prev.positions[pid], obs } } }; });
  }

  async function handleSaveSwing() {
    if (!swingForm || !student) return;
    setSwingSaving(true); setSwingSaveError(null);
    const grupo = student.grupo_activo || "Albatros";
    const promedio = calcPromedio(swingForm.positions);
    const id = `swing_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    const posPayload: Record<string, unknown> = {};
    Object.entries(swingForm.positions).forEach(([pid, ps]) => {
      const key = pid.toLowerCase();
      const rawScore = ps.na ? null : calcPosScore(ps.criterios);
posPayload[`${key}_score`] = rawScore !== null ? Math.round(rawScore) : null;
      posPayload[`${key}_criterios`] = ps.na ? null : ps.criterios;
      posPayload[`${key}_obs`] = ps.obs.trim() || null;
      posPayload[`${key}_na`] = ps.na;
    });
    const payload = { id, student_id: student.id, student_name: student.full_name, grupo, evaluation_date: swingForm.evaluation_date, evaluation_type: swingForm.evaluation_type, score_promedio: promedio, professor_comment: swingForm.professor_comment.trim()||null, ...posPayload };
    const { error } = await supabase.from("swing_evaluations").insert(payload);
    if (error) { setSwingSaveError(error.message); setSwingSaving(false); return; }
    const newEval = { ...payload, ai_analysis: null, ai_generated_at: null, created_at: new Date().toISOString() } as unknown as SwingEvaluation;
    setSwingEvals((prev) => [newEval, ...prev]);
    setSwingSaving(false); closeSwingForm(); setExpandedEval(id);
  }

  async function handleAnalyzeAI(ev: SwingEvaluation) {
    if (!student) return;
    setAnalyzingId(ev.id);
    try {
      const res = await fetch("/api/swing-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ student: { ...student, edad: calcularEdadNum(student.birth_date) }, evaluation: ev, physicalTest: null }) });
      const data = await res.json();
      if (data.analysis) {
        setAiResults((prev) => ({ ...prev, [ev.id]: data.analysis }));
        await supabase.from("swing_evaluations").update({ ai_analysis: JSON.stringify(data.analysis), ai_generated_at: new Date().toISOString() }).eq("id", ev.id);
      }
    } catch (err) { console.error("Error IA:", err); }
    setAnalyzingId(null);
  }

  if (loading) return <div className="flex items-center justify-center py-32 text-gray-400"><svg className="animate-spin mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Cargando perfil...</div>;
  if (!student) return <div className="flex flex-col items-center justify-center py-32 text-gray-400"><p>Alumno no encontrado.</p></div>;

  const grupo = student.grupo_activo || "Albatros";
  const posicionesActivas = POSICIONES_GRUPO[grupo] || POSICIONES_GRUPO["Albatros"];
  const TABS: { key: Tab; label: string }[] = [{ key:"datos", label:"Datos personales" }, { key:"tecnicos", label:"Tests técnicos" }, { key:"fisicos", label:"Tests físicos" }, { key:"hitos", label:"Hitos" }];

  return (
    <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        Volver a alumnos
      </button>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-4">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center justify-center w-16 h-16 rounded-full text-xl font-bold shrink-0" style={{ backgroundColor:"#1B4D2E1A", color:"#1B4D2E" }}>{initiales(student.full_name)}</span>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{student.full_name}</h1>
              {student.grupo_activo && <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor:"#1B4D2E15", color:"#1B4D2E", border:"1px solid #1B4D2E25" }}>{student.grupo_activo}</span>}
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${student.status==="activo"?"bg-emerald-50 text-emerald-700 border border-emerald-200":"bg-gray-100 text-gray-500 border border-gray-200"}`}>{student.status}</span>
            </div>
            <p className="text-sm text-gray-500 mt-1">{calcularEdad(student.birth_date)}{student.enrollment_date && <span className="ml-3 text-gray-400">· Ingresó {formatFecha(student.enrollment_date)}</span>}</p>
          </div>
          <button onClick={openEdit} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium shrink-0" style={{ backgroundColor:"#1B4D2E", color:"white" }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Editar
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 mb-4">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(({ key, label }) => <button key={key} onClick={() => setActiveTab(key)} className="px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all" style={activeTab===key?{ backgroundColor:"#1B4D2E", color:"white" }:{ color:"#374151" }}>{label}</button>)}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">

        {activeTab === "datos" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Field label="Nombre completo" value={student.full_name}/>
            <Field label="Fecha de nacimiento" value={formatFecha(student.birth_date)}/>
            <Field label="Edad" value={calcularEdad(student.birth_date)}/>
            <Field label="Grupo" value={student.grupo_activo}/>
            <Field label="Estado" value={student.status}/>
            <Field label="Fecha de ingreso" value={formatFecha(student.enrollment_date)}/>
            <div className="sm:col-span-2 border-t border-gray-100 pt-4 mt-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Contacto del acudiente</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Field label="Nombre del acudiente" value={student.parent_name}/>
                <Field label="Teléfono" value={student.parent_phone}/>
                <Field label="Email" value={student.parent_email}/>
              </div>
            </div>
            {student.observations && <div className="sm:col-span-2 border-t border-gray-100 pt-4 mt-2"><p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Observaciones</p><p className="text-sm text-gray-700">{student.observations}</p></div>}
          </div>
        )}

        {activeTab === "tecnicos" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Evaluación técnica de swing</h2>
                <p className="text-xs text-gray-400 mt-0.5">{grupo} · {posicionesActivas.length} posiciones</p>
              </div>
              <button onClick={openSwingForm} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor:"#1B4D2E" }}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
                Nueva evaluación
              </button>
            </div>

            {swingLoading ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <svg className="animate-spin mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                Cargando...
              </div>
            ) : swingEvals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="mb-3"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
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
                      <button onClick={() => setExpandedEval(isOpen ? null : ev.id)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{formatFecha(ev.evaluation_date)}</p>
                          <p className="text-xs text-gray-500 mt-0.5 capitalize">{ev.evaluation_type} · {ev.grupo}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <EvalTypeBadge type={ev.evaluation_type}/>
                          {ev.score_promedio !== null && <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor:scoreColor(ev.score_promedio).bg, color:scoreColor(ev.score_promedio).text }}>{ev.score_promedio.toFixed(1)}/10</span>}
                          {ai && <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700">IA ✓</span>}
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className={`text-gray-400 transition-transform ml-1 ${isOpen?"rotate-180":""}`}><path d="M19 9l-7 7-7-7"/></svg>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="border-t border-gray-50">
                          <div className="px-5 pt-5 pb-3">
                            {POSICIONES_FASES.map((fase) => {
                              const fasePosiciones = fase.posiciones.filter((p) => posActivas.includes(p));
                              if (!fasePosiciones.length) return null;
                              return (
                                <div key={fase.label} className="mb-4">
                                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{fase.label}</p>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {fasePosiciones.map((p) => {
                                      const naKey = `${p.toLowerCase()}_na` as keyof SwingEvaluation;
                                      const scoreKey = `${p.toLowerCase()}_score` as keyof SwingEvaluation;
                                      const criteriosKey = `${p.toLowerCase()}_criterios` as keyof SwingEvaluation;
                                      const obsKey = `${p.toLowerCase()}_obs` as keyof SwingEvaluation;
                                      const isNa = ev[naKey] as boolean;
                                      const score = ev[scoreKey] as number|null;
                                      const criterios = ev[criteriosKey] as CritValue[]|null;
                                      const obs = ev[obsKey] as string|null;
                                      const c = scoreColor(isNa ? null : score);
                                      return (
                                        <div key={p} className="rounded-lg p-3" style={{ backgroundColor: isNa ? "#F9FAFB" : c.bg }}>
                                          <div className="flex items-center justify-between mb-1">
                                            <p className="text-xs font-semibold" style={{ color: isNa ? "#9CA3AF" : c.text }}>{p}</p>
                                            {isNa && <span className="text-xs text-gray-400 italic">N/A</span>}
                                          </div>
                                          <p className="text-gray-500 mb-2 leading-tight" style={{ fontSize:"10px" }}>{POSICIONES_NOMBRES[p]}</p>
                                          {!isNa && <>
                                            <p className="text-xl font-bold" style={{ color:c.text }}>{score?.toFixed(1) ?? "—"}</p>
                                            <div className="h-1 rounded-full mt-1.5" style={{ backgroundColor:"#E5E7EB" }}><div className="h-1 rounded-full" style={{ width:score?`${score*10}%`:"0%", backgroundColor:c.bar }}/></div>
                                            <p className="mt-1" style={{ color:c.text, fontSize:"10px" }}>{scoreLabel(score)}</p>
                                            {criterios && <div className="mt-2 space-y-0.5">{criterios.map((crit, i) => <div key={i} className="flex items-center gap-1"><span style={{ fontSize:"10px" }}>{crit==="cumple"?"✅":crit==="progreso"?"⚠️":crit==="no"?"❌":"○"}</span><span style={{ fontSize:"9px", color:"#6B7280", lineHeight:"1.3" }}>{getCriteriosGrupo(ev.grupo, p)[i]?.split("—")[0]?.trim()}</span></div>)}</div>}
                                            {obs && <p className="text-gray-500 mt-2 italic border-t border-gray-100 pt-1" style={{ fontSize:"10px" }}>{obs}</p>}
                                          </>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}

                            {ev.professor_comment && <div className="bg-gray-50 rounded-lg p-3 mb-4"><p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Observaciones generales</p><p className="text-sm text-gray-700">{ev.professor_comment}</p></div>}

                            {!ai && (
                              <button onClick={() => handleAnalyzeAI(ev)} disabled={isAnalyzing} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border-2 border-dashed transition-all" style={{ borderColor:isAnalyzing?"#C4B5FD":"#7C3AED", color:isAnalyzing?"#7C3AED":"#5B21B6", backgroundColor:isAnalyzing?"#F5F3FF":"transparent" }}>
                                {isAnalyzing ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Analizando con IA...</> : <>
                                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
                                  Analizar con IA — guía para el profesor
                                </>}
                              </button>
                            )}
                          </div>

                          {ai && (
                            <div className="border-t border-gray-100 px-5 py-6">
                              <div className="flex items-center justify-between mb-6">
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">Análisis IA — Guía del profesor</p>
                                  {ev.ai_generated_at && <p className="text-xs text-gray-400 mt-0.5">Generado {formatFecha(ev.ai_generated_at.split("T")[0])}</p>}
                                </div>
                                <button onClick={() => handleAnalyzeAI(ev)} disabled={analyzingId !== null} className="text-xs text-gray-500 hover:text-gray-700 underline disabled:opacity-40">
                                  {analyzingId === ev.id ? "Analizando..." : "Regenerar"}
                                </button>
                              </div>

                              <div className="mb-5 pb-5 border-b border-gray-100">
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Resumen técnico</p>
                                <p className="text-sm text-gray-700 leading-relaxed">{ai.resumen}</p>
                              </div>

                              {ai.prioridades?.length > 0 && (
                                <div className="mb-5 pb-5 border-b border-gray-100">
                                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Prioridades de trabajo</p>
                                  <div className="space-y-5">
                                    {ai.prioridades.map((pr) => (
                                      <div key={pr.orden} className="flex gap-4">
                                        <span className="text-sm font-bold text-gray-300 w-5 shrink-0 pt-0.5">{pr.orden}.</span>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-semibold text-gray-900">{pr.titulo}</p>
                                          <p className="text-xs text-gray-400 mb-2">{pr.posicion}</p>
                                          <p className="text-sm text-gray-700 leading-relaxed mb-3">{pr.descripcion}</p>
                                          <div className="bg-gray-50 rounded-lg px-3 py-2.5 mb-2">
                                            <p className="text-xs font-semibold text-gray-500 mb-1">Para el profesor</p>
                                            <p className="text-xs text-gray-700 leading-relaxed">{pr.instruccion_profesor}</p>
                                          </div>
                                          {pr.conexion_fisica && <p className="text-xs text-gray-500 mb-2"><span className="font-semibold">Conexión TPI:</span> {pr.conexion_fisica}</p>}
                                          {pr.drills?.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                              {pr.drills.map((d, i) => <span key={i} className="text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-600 bg-white">{d}</span>)}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {ai.fortalezas?.length > 0 && (
                                <div className="mb-5 pb-5 border-b border-gray-100">
                                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Fortalezas — mantener</p>
                                  <ul className="space-y-1">
                                    {ai.fortalezas.map((f, i) => (
                                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                        <span className="text-gray-300 shrink-0 mt-0.5">—</span>
                                        <span>{f}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {ai.plan_clase?.length > 0 && (
                                <div className="mb-5 pb-5 border-b border-gray-100">
                                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Plan próxima clase</p>
                                  <div className="space-y-2">
                                    {ai.plan_clase.map((step, i) => (
                                      <div key={i} className="flex items-start gap-3">
                                        <span className="text-xs text-gray-400 font-mono min-w-[44px] pt-0.5">{step.minutos}&apos;</span>
                                        <span className="text-sm text-gray-700 flex-1">{step.actividad}</span>
                                        <span className="text-xs text-gray-400 capitalize whitespace-nowrap">{step.tipo.replace("_"," ")}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {ai.nota_edad && (
                                <div>
                                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Nota pedagógica</p>
                                  <p className="text-xs text-gray-600 leading-relaxed">{ai.nota_edad}</p>
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

        {activeTab === "fisicos" && <div className="flex flex-col items-center justify-center py-16 text-gray-400"><svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="mb-3"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg><p className="text-sm">Tests físicos TPI — próximamente</p></div>}
        {activeTab === "hitos" && <div className="flex flex-col items-center justify-center py-16 text-gray-400"><svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="mb-3"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg><p className="text-sm">Hitos personales — próximamente</p></div>}
      </div>

      {isEditing && form && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4" style={{ backgroundColor:"rgba(0,0,0,0.45)" }} onClick={(e) => { if (e.target===e.currentTarget) closeEdit(); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100"><h2 className="text-base font-semibold text-gray-900">Editar perfil</h2><button onClick={closeEdit} className="text-gray-400 hover:text-gray-600" disabled={saving}><svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
            <div className="px-6 py-5 space-y-4">
              <FormField label="Nombre completo" required><input type="text" value={form.full_name} onChange={(e) => setField("full_name", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] focus:ring-1 focus:ring-[#1B4D2E]"/></FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Fecha de nacimiento"><input type="date" value={form.birth_date} onChange={(e) => setField("birth_date", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E]"/></FormField>
                <FormField label="Estado"><select value={form.status} onChange={(e) => setField("status", e.target.value as "activo"|"inactivo")} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] bg-white"><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select></FormField>
              </div>
              <FormField label="Grupo" hint="Selecciona solo para Damas o Competencia"><select value={form.grupo_activo} onChange={(e) => setField("grupo_activo", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] bg-white"><option value="">Automático (según edad)</option><option value="Damas">Damas</option><option value="Competencia">Competencia</option></select></FormField>
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Acudiente</p>
                <div className="space-y-4">
                  <FormField label="Nombre"><input type="text" value={form.parent_name} onChange={(e) => setField("parent_name", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E]"/></FormField>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="Teléfono"><input type="tel" value={form.parent_phone} onChange={(e) => setField("parent_phone", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E]"/></FormField>
                    <FormField label="Email"><input type="email" value={form.parent_email} onChange={(e) => setField("parent_email", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E]"/></FormField>
                  </div>
                </div>
              </div>
              <FormField label="Observaciones"><textarea value={form.observations} onChange={(e) => setField("observations", e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] resize-none"/></FormField>
              {saveError && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">Error: {saveError}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={closeEdit} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">Cancelar</button>
              <button onClick={handleSave} disabled={saving||!form.full_name.trim()} className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor:"#1B4D2E" }}>
                {saving && <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>}
                {saving?"Guardando...":"Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSwingForm && swingForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4" style={{ backgroundColor:"rgba(0,0,0,0.45)" }} onClick={(e) => { if (e.target===e.currentTarget) closeSwingForm(); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div><h2 className="text-base font-semibold text-gray-900">Nueva evaluación técnica de swing</h2><p className="text-xs text-gray-400 mt-0.5">{student.full_name} · {grupo}</p></div>
              <button onClick={closeSwingForm} className="text-gray-400 hover:text-gray-600" disabled={swingSaving}><svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12"/></svg></button>
            </div>
            <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[72vh]">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Tipo" required>
                  <select value={swingForm.evaluation_type} onChange={(e) => setSwingForm((prev) => prev?{...prev,evaluation_type:e.target.value as SwingForm["evaluation_type"]}:prev)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] bg-white">
                    <option value="inicial">Inicial</option><option value="periódica">Periódica</option><option value="graduación">Graduación</option>
                  </select>
                </FormField>
                <FormField label="Fecha" required>
                  <input type="date" value={swingForm.evaluation_date} onChange={(e) => setSwingForm((prev) => prev?{...prev,evaluation_date:e.target.value}:prev)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E]"/>
                </FormField>
              </div>

              {Object.entries(swingForm.positions).map(([pid, ps]) => {
                const criterios = getCriteriosGrupo(grupo, pid);
                const posScore = calcPosScore(ps.criterios);
                return (
                  <div key={pid} className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor:"#E6F1FB", color:"#185FA5" }}>{pid}</span>
                        <span className="text-sm font-medium text-gray-800">{POSICIONES_NOMBRES[pid]}</span>
                        {!ps.na && posScore !== null && <span className="text-xs font-bold" style={{ color:scoreColor(posScore).text }}>{posScore.toFixed(1)}/10</span>}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setPosNA(pid, false)} className={`text-xs px-3 py-1 rounded-full border transition-all ${!ps.na?"bg-blue-50 text-blue-700 border-blue-200 font-medium":"border-gray-200 text-gray-400"}`}>Evaluar</button>
                        <button onClick={() => setPosNA(pid, true)} className={`text-xs px-3 py-1 rounded-full border transition-all ${ps.na?"bg-gray-100 text-gray-500 border-gray-300":"border-gray-200 text-gray-400"}`}>N/A</button>
                      </div>
                    </div>
                    {!ps.na && (
                      <div className="px-4 py-3">
                        <div className="space-y-2">
                          {criterios.map((crit, i) => (
                            <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                              <span className="text-xs text-gray-700 flex-1 pr-3">{crit}</span>
                              <div className="flex gap-1.5">
                                {(["cumple","progreso","no"] as CritValue[]).map((val) => {
  const isActive = ps.criterios[i]===val;
  const s = { cumple:{ac:"bg-emerald-50 border-emerald-300",ic:"✅"}, progreso:{ac:"bg-amber-50 border-amber-300",ic:"⚠️"}, no:{ac:"bg-red-50 border-red-300",ic:"❌"} }[val as "cumple"|"progreso"|"no"];
  return <button key={val} onClick={() => setCrit(pid, i, val)} className={`w-8 h-7 rounded border flex items-center justify-center text-sm transition-all ${isActive ? s.ac + " shadow-sm" : "border-gray-300 bg-gray-100 hover:bg-gray-200"}`}>{s.ic}</button>;
})}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2">
                          {!ps.obsOpen ? (
                            <button onClick={() => toggleObs(pid)} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 mt-1">
                              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14"/></svg>
                              Agregar observación
                            </button>
                          ) : (
                            <div className="mt-2">
                              <p className="text-xs text-gray-400 mb-1">Observación del profesor</p>
                              <textarea value={ps.obs} onChange={(e) => setObs(pid, e.target.value)} rows={2} placeholder="Ej: tiende a levantar el codo derecho, mejoró vs sesión anterior..." className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-[#1B4D2E] bg-gray-50"/>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {ps.na && <div className="px-4 py-3 border-t border-gray-50"><p className="text-xs text-gray-400 italic">Pendiente — se evaluará en próxima sesión</p></div>}
                  </div>
                );
              })}

              <FormField label="Observaciones generales">
                <textarea value={swingForm.professor_comment} onChange={(e) => setSwingForm((prev) => prev?{...prev,professor_comment:e.target.value}:prev)} rows={3} placeholder="Observaciones generales sobre la sesión..." className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] resize-none"/>
              </FormField>

              <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
                <span className="text-sm text-gray-600">Promedio evaluación</span>
                <span className="text-xl font-bold" style={{ color:scoreColor(calcPromedio(swingForm.positions)).text }}>
                  {calcPromedio(swingForm.positions)!==null?`${calcPromedio(swingForm.positions)?.toFixed(1)}/10`:"—"}
                </span>
              </div>

              {swingSaveError && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">Error: {swingSaveError}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={closeSwingForm} disabled={swingSaving} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">Cancelar</button>
              <button onClick={handleSaveSwing} disabled={swingSaving||!swingForm.evaluation_date} className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor:"#1B4D2E" }}>
                {swingSaving && <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>}
                {swingSaving?"Guardando...":"Guardar evaluación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EvalTypeBadge({ type }: { type: string }) {
  const map: Record<string,{bg:string;color:string}> = { inicial:{bg:"#C9A84C20",color:"#8B6914"}, "periódica":{bg:"#EFF6FF",color:"#1D4ED8"}, "graduación":{bg:"#F5F3FF",color:"#6D28D9"} };
  const s = map[type] ?? { bg:"#F3F4F6", color:"#6B7280" };
  return <span className="px-2.5 py-1 rounded-full text-xs font-medium capitalize" style={{ backgroundColor:s.bg, color:s.color }}>{type.charAt(0).toUpperCase()+type.slice(1)}</span>;
}

function Field({ label, value }: { label: string; value: string|null|undefined }) {
  return <div><p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p><p className="text-sm text-gray-800">{value||"—"}</p></div>;
}

function FormField({ label, children, required, hint }: { label: string; children: React.ReactNode; required?: boolean; hint?: string; }) {
  return <div><label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}{required&&<span className="text-red-400 ml-0.5">*</span>}</label>{children}{hint&&<p className="text-xs text-gray-400 mt-1">{hint}</p>}</div>;
}
