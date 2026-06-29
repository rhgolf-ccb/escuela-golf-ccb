"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────
type TipoPlan = "juvenil" | "competencia" | "damas";
type DiaSemana = "martes" | "miercoles" | "jueves" | "viernes" | "sabado" | "domingo";
type TipoSesion = "tiro_largo" | "juego_corto" | "putt" | "campo" | "test_tecnico" | "test_fisico" | "competencia" | "damas_estaciones";
type Lugar = "driving_range" | "putting_green" | "campo_infantil" | "campo_pacos_fabios" | "campo_completo";

interface Drill {
  titulo: string;
  descripcion: string;
  dificultad_birdies?: string | null;
  dificultad_aguilas?: string | null;
  dificultad_albatros?: string | null;
  dificultad_mas14?: string | null;
}

interface EstacionDamas {
  nombre: string;
  lugar: string;
  duracion_min: number;
  descripcion: string;
}

interface PlanSemanal {
  id: string;
  semana_inicio: string;
  tipo_plan: TipoPlan;
  tema_semanal: string;
  descripcion_tema: string;
  objetivo_mensual: string | null;
  created_at: string;
}

interface SesionSemana {
  id: string;
  plan_id: string;
  dia_semana: DiaSemana;
  fecha: string;
  tipo_sesion: TipoSesion;
  lugar: Lugar;
  hora_inicio: string | null;
  hora_fin: string | null;
  objetivo: string;
  drills: Drill[];
  juego_competitivo: string | null;
  estaciones_damas: EstacionDamas[] | null;
  notas: string | null;
  asistencia_registrada: boolean;
}

interface SesionForm {
  tipo_sesion: TipoSesion;
  lugar: Lugar;
  hora_inicio: string;
  hora_fin: string;
  objetivo: string;
  drills: Drill[];
  juego_competitivo: string;
  estaciones_damas: EstacionDamas[];
  notas: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const DIAS_POR_TIPO: Record<TipoPlan, DiaSemana[]> = {
  juvenil: ["martes", "jueves", "sabado", "domingo"],
  competencia: ["martes", "miercoles", "jueves", "sabado"],
  damas: ["viernes"],
};

const DIA_LABEL: Record<DiaSemana, string> = {
  martes: "Martes", miercoles: "Miércoles", jueves: "Jueves",
  viernes: "Viernes", sabado: "Sábado", domingo: "Domingo",
};

const DIA_OFFSET: Record<DiaSemana, number> = {
  martes: 1, miercoles: 2, jueves: 3, viernes: 4, sabado: 5, domingo: 6,
};

const TIPO_SESION_LABEL: Record<TipoSesion, string> = {
  tiro_largo: "Tiro Largo", juego_corto: "Juego Corto", putt: "Putt",
  campo: "Campo", test_tecnico: "Test Técnico", test_fisico: "Test Físico",
  competencia: "Competencia", damas_estaciones: "Estaciones",
};

const TIPO_SESION_COLOR: Record<TipoSesion, { bg: string; text: string }> = {
  tiro_largo: { bg: "#dbeafe", text: "#1e40af" },
  juego_corto: { bg: "#dcfce7", text: "#166534" },
  putt: { bg: "#fef9c3", text: "#854d0e" },
  campo: { bg: "#f0fdf4", text: "#15803d" },
  test_tecnico: { bg: "#fce7f3", text: "#9d174d" },
  test_fisico: { bg: "#ede9fe", text: "#6d28d9" },
  competencia: { bg: "#fff7ed", text: "#9a3412" },
  damas_estaciones: { bg: "#fdf2f8", text: "#86198f" },
};

const LUGAR_LABEL: Record<Lugar, string> = {
  driving_range: "Driving Range", putting_green: "Putting Green",
  campo_infantil: "Campo Infantil", campo_pacos_fabios: "Pacos/Fabios",
  campo_completo: "Campo Completo",
};

const TIPO_PLAN_LABEL: Record<TipoPlan, string> = {
  juvenil: "Juvenil", competencia: "Competencia", damas: "Damas",
};

const TIPO_PLAN_COLOR: Record<TipoPlan, string> = {
  juvenil: "#1B4D2E", competencia: "#1e40af", damas: "#86198f",
};

// ── Date helpers ──────────────────────────────────────────────────────────────
function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function getFechaForDia(monday: Date, dia: DiaSemana): string {
  return toISODate(addDays(monday, DIA_OFFSET[dia]));
}

function formatWeekRange(monday: Date): string {
  const domingo = addDays(monday, 6);
  const optsShort: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
  const optsLong: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };
  return `${monday.toLocaleDateString("es-CO", optsShort)} — ${domingo.toLocaleDateString("es-CO", optsLong)}`;
}

function formatDiaFecha(fecha: string): string {
  const d = new Date(fecha + "T00:00:00");
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

function formatHora(t: string | null): string {
  if (!t) return "";
  return t.slice(0, 5);
}

function defaultDrill(): Drill {
  return { titulo: "", descripcion: "", dificultad_birdies: "", dificultad_aguilas: "", dificultad_albatros: "", dificultad_mas14: "" };
}

function defaultEstacion(): EstacionDamas {
  return { nombre: "", lugar: "", duracion_min: 20, descripcion: "" };
}

function defaultSesionForm(tipoPlan: TipoPlan): SesionForm {
  return {
    tipo_sesion: tipoPlan === "damas" ? "damas_estaciones" : "tiro_largo",
    lugar: "driving_range",
    hora_inicio: "",
    hora_fin: "",
    objetivo: "",
    drills: [],
    juego_competitivo: "",
    estaciones_damas: tipoPlan === "damas" ? [defaultEstacion(), defaultEstacion(), defaultEstacion()] : [],
    notas: "",
  };
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProgramacionModule() {
  const router = useRouter();
  const [semana, setSemana] = useState<Date>(() => getMonday(new Date()));
  const [activeTab, setActiveTab] = useState<TipoPlan>("juvenil");
  const [plan, setPlan] = useState<PlanSemanal | null>(null);
  const [sesiones, setSesiones] = useState<SesionSemana[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedDias, setExpandedDias] = useState<Set<string>>(new Set());

  // Create plan modal
  const [showCrearModal, setShowCrearModal] = useState(false);
  const [planForm, setPlanForm] = useState({ tema_semanal: "", descripcion_tema: "", objetivo_mensual: "" });
  const [creandoPlan, setCreandoPlan] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // Edit tema modal
  const [showEditTema, setShowEditTema] = useState(false);
  const [temaForm, setTemaForm] = useState({ tema_semanal: "", descripcion_tema: "", objetivo_mensual: "" });
  const [savingTema, setSavingTema] = useState(false);

  // Edit sesion modal
  const [editSesionCtx, setEditSesionCtx] = useState<{ dia: DiaSemana; fecha: string; sesion: SesionSemana | null } | null>(null);
  const [sesionForm, setSesionForm] = useState<SesionForm | null>(null);
  const [savingSesion, setSavingSesion] = useState(false);
  const [sesionError, setSesionError] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchPlan = useCallback(async () => {
    setLoading(true);
    setExpandedDias(new Set());
    const semanaStr = toISODate(semana);
    const { data: planData } = await supabase
      .from("planes_semanales")
      .select("*")
      .eq("semana_inicio", semanaStr)
      .eq("tipo_plan", activeTab)
      .maybeSingle();

    if (planData) {
      setPlan(planData as PlanSemanal);
      const { data: sesData } = await supabase
        .from("sesiones_semana")
        .select("*")
        .eq("plan_id", planData.id)
        .order("fecha");
      setSesiones((sesData as SesionSemana[]) ?? []);
    } else {
      setPlan(null);
      setSesiones([]);
    }
    setLoading(false);
  }, [semana, activeTab]);

  useEffect(() => { fetchPlan(); }, [fetchPlan]);

  // ── Week nav ───────────────────────────────────────────────────────────────
  const prevWeek = () => setSemana((s) => addDays(s, -7));
  const nextWeek = () => setSemana((s) => addDays(s, 7));
  const goToday = () => setSemana(getMonday(new Date()));

  // ── Toggle expanded ────────────────────────────────────────────────────────
  function toggleDia(dia: string) {
    setExpandedDias((prev) => {
      const next = new Set(prev);
      next.has(dia) ? next.delete(dia) : next.add(dia);
      return next;
    });
  }

  // ── Create plan ────────────────────────────────────────────────────────────
  async function handleCrearPlan(conIA: boolean) {
    if (!planForm.tema_semanal.trim()) { setPlanError("El tema semanal es requerido."); return; }
    setPlanError(null);
    conIA ? setGeneratingAI(true) : setCreandoPlan(true);

    try {
      // 1. Create plan record
      const { data: newPlan, error: planErr } = await supabase
        .from("planes_semanales")
        .insert({
          semana_inicio: toISODate(semana),
          tipo_plan: activeTab,
          tema_semanal: planForm.tema_semanal.trim(),
          descripcion_tema: planForm.descripcion_tema.trim(),
          objetivo_mensual: planForm.objetivo_mensual.trim() || null,
        })
        .select()
        .single();

      if (planErr || !newPlan) throw new Error(planErr?.message || "Error al crear plan");

      const dias = DIAS_POR_TIPO[activeTab];

      if (conIA) {
        // 2. Call AI API
        const aiRes = await fetch("/api/plan-semanal-ia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo_plan: activeTab,
            semana_inicio: toISODate(semana),
            tema_semanal: planForm.tema_semanal.trim(),
            descripcion_tema: planForm.descripcion_tema.trim(),
            objetivo_mensual: planForm.objetivo_mensual.trim() || null,
          }),
        });
        const aiData = await aiRes.json();
        if (!aiRes.ok || !aiData.sesiones) throw new Error(aiData.error || "Error en la respuesta de IA");

        // 3. Insert AI-generated sessions
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const s of aiData.sesiones as any[]) {
          await supabase.from("sesiones_semana").insert({
            plan_id: newPlan.id,
            dia_semana: s.dia_semana,
            fecha: getFechaForDia(semana, s.dia_semana as DiaSemana),
            tipo_sesion: s.tipo_sesion,
            lugar: s.lugar,
            hora_inicio: s.hora_inicio || null,
            hora_fin: s.hora_fin || null,
            objetivo: s.objetivo || "",
            drills: s.drills || [],
            juego_competitivo: s.juego_competitivo || null,
            estaciones_damas: s.estaciones_damas || null,
            notas: s.notas || null,
          });
        }
      } else {
        // 3. Insert blank sessions for each day
        for (const dia of dias) {
          await supabase.from("sesiones_semana").insert({
            plan_id: newPlan.id,
            dia_semana: dia,
            fecha: getFechaForDia(semana, dia),
            tipo_sesion: activeTab === "damas" ? "damas_estaciones" : "tiro_largo",
            lugar: "driving_range",
            objetivo: "",
            drills: [],
            estaciones_damas: activeTab === "damas" ? [] : null,
          });
        }
      }

      setShowCrearModal(false);
      setPlanForm({ tema_semanal: "", descripcion_tema: "", objetivo_mensual: "" });
      showToast(conIA ? "Plan generado con IA ✓" : "Plan creado ✓");
      await fetchPlan();
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setCreandoPlan(false);
      setGeneratingAI(false);
    }
  }

  // ── Edit tema ──────────────────────────────────────────────────────────────
  function openEditTema() {
    if (!plan) return;
    setTemaForm({ tema_semanal: plan.tema_semanal, descripcion_tema: plan.descripcion_tema, objetivo_mensual: plan.objetivo_mensual ?? "" });
    setShowEditTema(true);
  }

  async function handleSaveTema() {
    if (!plan) return;
    setSavingTema(true);
    await supabase.from("planes_semanales").update({
      tema_semanal: temaForm.tema_semanal.trim(),
      descripcion_tema: temaForm.descripcion_tema.trim(),
      objetivo_mensual: temaForm.objetivo_mensual.trim() || null,
    }).eq("id", plan.id);
    setPlan((p) => p ? { ...p, ...temaForm, objetivo_mensual: temaForm.objetivo_mensual || null } : p);
    setSavingTema(false);
    setShowEditTema(false);
    showToast("Tema actualizado ✓");
  }

  // ── Edit sesion ────────────────────────────────────────────────────────────
  function openEditSesion(dia: DiaSemana, sesion: SesionSemana | null) {
    const fecha = getFechaForDia(semana, dia);
    const form: SesionForm = sesion ? {
      tipo_sesion: sesion.tipo_sesion,
      lugar: sesion.lugar,
      hora_inicio: formatHora(sesion.hora_inicio),
      hora_fin: formatHora(sesion.hora_fin),
      objetivo: sesion.objetivo,
      drills: sesion.drills ?? [],
      juego_competitivo: sesion.juego_competitivo ?? "",
      estaciones_damas: sesion.estaciones_damas ?? [],
      notas: sesion.notas ?? "",
    } : defaultSesionForm(activeTab);
    setEditSesionCtx({ dia, fecha, sesion });
    setSesionForm(form);
    setSesionError(null);
  }

  async function handleSaveSesion() {
    if (!sesionForm || !editSesionCtx || !plan) return;
    setSavingSesion(true);
    setSesionError(null);
    try {
      const payload = {
        plan_id: plan.id,
        dia_semana: editSesionCtx.dia,
        fecha: editSesionCtx.fecha,
        tipo_sesion: sesionForm.tipo_sesion,
        lugar: sesionForm.lugar,
        hora_inicio: sesionForm.hora_inicio || null,
        hora_fin: sesionForm.hora_fin || null,
        objetivo: sesionForm.objetivo.trim(),
        drills: sesionForm.drills,
        juego_competitivo: sesionForm.juego_competitivo.trim() || null,
        estaciones_damas: activeTab === "damas" ? sesionForm.estaciones_damas : null,
        notas: sesionForm.notas.trim() || null,
      };

      if (editSesionCtx.sesion) {
        await supabase.from("sesiones_semana").update(payload).eq("id", editSesionCtx.sesion.id);
      } else {
        await supabase.from("sesiones_semana").insert(payload);
      }

      setEditSesionCtx(null);
      setSesionForm(null);
      showToast("Sesión guardada ✓");
      await fetchPlan();
    } catch (err) {
      setSesionError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSavingSesion(false);
    }
  }

  // ── PDF semanal ────────────────────────────────────────────────────────────
  async function handlePdfSemanal() {
    if (!plan) return;
    const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
      import("jspdf"), import("html2canvas"),
    ]);
    const el = document.getElementById("plan-pdf-content");
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 1.8, backgroundColor: "#fff", useCORS: true });
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = (canvas.height * pdfW) / canvas.width;
    const pageH = pdf.internal.pageSize.getHeight();
    let y = 0;
    while (y < pdfH) {
      if (y > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, -y, pdfW, pdfH);
      y += pageH;
    }
    pdf.save(`Plan_${activeTab}_${toISODate(semana)}.pdf`);
  }

  // ── Computed ───────────────────────────────────────────────────────────────
  const diasRequeridos = DIAS_POR_TIPO[activeTab];
  const planCompleto = plan !== null && diasRequeridos.every((d) => sesiones.some((s) => s.dia_semana === d && s.objetivo.trim() !== ""));
  const accentColor = TIPO_PLAN_COLOR[activeTab];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg pointer-events-none">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#4ade80" strokeWidth={2.5}><path d="M3 10l4 4 9-9"/></svg>
          {toast}
        </div>
      )}

      {/* ── Week selector ── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <button onClick={prevWeek} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 18l-6-6 6-6"/></svg>
          Anterior
        </button>
        <div className="text-center">
          <h1 className="text-base font-bold text-gray-900">{formatWeekRange(semana)}</h1>
          <button onClick={goToday} className="text-xs text-gray-400 hover:text-gray-600 mt-0.5 transition-colors">ir a esta semana</button>
        </div>
        <button onClick={nextWeek} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          Siguiente
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {(["juvenil", "competencia", "damas"] as TipoPlan[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg transition-all border-b-2 -mb-px ${activeTab === tab ? "border-current" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            style={activeTab === tab ? { color: TIPO_PLAN_COLOR[tab], borderColor: TIPO_PLAN_COLOR[tab] } : {}}
          >
            {TIPO_PLAN_LABEL[tab]}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-400">
          <svg className="animate-spin mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
          Cargando...
        </div>
      ) : !plan ? (
        /* ── Empty state ── */
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: accentColor + "15" }}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke={accentColor} strokeWidth={1.5}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          </div>
          <p className="text-base font-semibold text-gray-700 mb-1">Sin plan para esta semana</p>
          <p className="text-sm text-gray-400 mb-6">No hay plan {TIPO_PLAN_LABEL[activeTab]} para la semana seleccionada.</p>
          <button
            onClick={() => { setPlanForm({ tema_semanal: "", descripcion_tema: "", objetivo_mensual: "" }); setPlanError(null); setShowCrearModal(true); }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm transition-all hover:brightness-110"
            style={{ background: accentColor }}
          >
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
            Crear plan con IA
          </button>
        </div>
      ) : (
        /* ── Plan view ── */
        <div id="plan-pdf-content">
          {/* Tema card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: accentColor }} />
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Tema semanal · {TIPO_PLAN_LABEL[activeTab]}</span>
                </div>
                <h2 className="text-lg font-bold text-gray-900 mb-1">{plan.tema_semanal}</h2>
                {plan.descripcion_tema && <p className="text-sm text-gray-600">{plan.descripcion_tema}</p>}
                {plan.objetivo_mensual && (
                  <div className="mt-3 flex items-start gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth={2} className="mt-0.5 shrink-0"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                    <span className="text-xs text-gray-500"><span className="font-semibold">Objetivo mensual:</span> {plan.objetivo_mensual}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {planCompleto && (
                  <button onClick={handlePdfSemanal} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                    PDF semanal
                  </button>
                )}
                <button onClick={openEditTema} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              </div>
            </div>
          </div>

          {/* Day cards */}
          <div className="space-y-3">
            {diasRequeridos.map((dia) => {
              const sesion = sesiones.find((s) => s.dia_semana === dia) ?? null;
              const fecha = getFechaForDia(semana, dia);
              const isExpanded = expandedDias.has(dia);
              const tipColor = sesion ? TIPO_SESION_COLOR[sesion.tipo_sesion] : null;

              return (
                <div key={dia} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  {/* Card header */}
                  <div
                    className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => sesion && toggleDia(dia)}
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="w-20 shrink-0">
                        <p className="text-sm font-bold text-gray-900">{DIA_LABEL[dia]}</p>
                        <p className="text-xs text-gray-400">{formatDiaFecha(fecha)}</p>
                      </div>
                      {sesion ? (
                        <>
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: tipColor!.bg, color: tipColor!.text }}>
                            {TIPO_SESION_LABEL[sesion.tipo_sesion]}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            {LUGAR_LABEL[sesion.lugar]}
                          </span>
                          {sesion.hora_inicio && (
                            <span className="text-xs text-gray-400">{formatHora(sesion.hora_inicio)}–{formatHora(sesion.hora_fin)}</span>
                          )}
                          {sesion.asistencia_registrada && (
                            <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="#059669" strokeWidth={2.5}><path d="M3 10l4 4 9-9"/></svg>
                              Asistencia ✓
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-gray-300 italic">Sin sesión definida</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); openEditSesion(dia, sesion); }}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        {sesion ? "Editar" : "+ Agregar"}
                      </button>
                      {sesion && (
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className={`text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}><path d="M19 9l-7 7-7-7"/></svg>
                      )}
                    </div>
                  </div>

                  {/* Expanded body */}
                  {isExpanded && sesion && (
                    <div className="px-5 pb-5 border-t border-gray-50">
                      <div className="pt-4 space-y-4">
                        {/* Objetivo */}
                        {sesion.objetivo && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Objetivo</p>
                            <p className="text-sm text-gray-700">{sesion.objetivo}</p>
                          </div>
                        )}

                        {/* Estaciones damas */}
                        {sesion.estaciones_damas && sesion.estaciones_damas.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Estaciones</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              {sesion.estaciones_damas.map((est, i) => (
                                <div key={i} className="bg-fuchsia-50 border border-fuchsia-100 rounded-lg p-3">
                                  <p className="text-xs font-bold text-fuchsia-800 mb-0.5">Estación {i + 1}: {est.nombre}</p>
                                  <p className="text-xs text-fuchsia-700 mb-1">{est.lugar} · {est.duracion_min} min</p>
                                  <p className="text-xs text-gray-600">{est.descripcion}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Drills */}
                        {sesion.drills && sesion.drills.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Drills ({sesion.drills.length})</p>
                            <div className="space-y-3">
                              {sesion.drills.map((drill, i) => (
                                <div key={i} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                                  <p className="text-sm font-semibold text-gray-900 mb-1">{i + 1}. {drill.titulo}</p>
                                  <p className="text-xs text-gray-600 mb-2">{drill.descripcion}</p>
                                  {activeTab === "juvenil" && (drill.dificultad_birdies || drill.dificultad_aguilas || drill.dificultad_albatros || drill.dificultad_mas14) && (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                      {[
                                        { label: "Birdies", val: drill.dificultad_birdies, color: "#dbeafe", tc: "#1e40af" },
                                        { label: "Águilas", val: drill.dificultad_aguilas, color: "#dcfce7", tc: "#166534" },
                                        { label: "Albatros", val: drill.dificultad_albatros, color: "#fef9c3", tc: "#854d0e" },
                                        { label: "+14", val: drill.dificultad_mas14, color: "#ede9fe", tc: "#6d28d9" },
                                      ].filter((x) => x.val).map((x) => (
                                        <div key={x.label} className="rounded-md p-2" style={{ background: x.color }}>
                                          <p className="text-[10px] font-bold mb-0.5" style={{ color: x.tc }}>{x.label}</p>
                                          <p className="text-[11px] text-gray-700">{x.val}</p>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Juego competitivo */}
                        {sesion.juego_competitivo && (
                          <div className="bg-orange-50 border border-orange-100 rounded-lg p-3">
                            <p className="text-xs font-semibold text-orange-700 mb-1">🏆 Juego competitivo</p>
                            <p className="text-xs text-gray-700">{sesion.juego_competitivo}</p>
                          </div>
                        )}

                        {/* Notas */}
                        {sesion.notas && (
                          <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3">
                            <p className="text-xs font-semibold text-yellow-700 mb-1">📝 Notas</p>
                            <p className="text-xs text-gray-700">{sesion.notas}</p>
                          </div>
                        )}

                        {/* Action: asistencia */}
                        <div className="pt-2 border-t border-gray-100">
                          <button
                            onClick={() => router.push(`/programacion/sesion/${sesion.id}`)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${sesion.asistencia_registrada ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "text-white"}`}
                            style={sesion.asistencia_registrada ? {} : { background: accentColor }}
                          >
                            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                            {sesion.asistencia_registrada ? "Ver asistencia" : "Pasar asistencia"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Crear plan
      ════════════════════════════════════════════════════════════════════════ */}
      {showCrearModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => { if (!creandoPlan && !generatingAI) setShowCrearModal(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Nuevo plan — {TIPO_PLAN_LABEL[activeTab]}</h2>
              <button onClick={() => setShowCrearModal(false)} disabled={creandoPlan || generatingAI} className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-xs text-gray-400">Semana del {formatWeekRange(semana)}</p>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tema semanal <span className="text-red-400">*</span></label>
                <input
                  value={planForm.tema_semanal}
                  onChange={(e) => setPlanForm((f) => ({ ...f, tema_semanal: e.target.value }))}
                  placeholder="ej: Control del putt corto, Fundamentos del iron play..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Descripción del tema</label>
                <textarea
                  value={planForm.descripcion_tema}
                  onChange={(e) => setPlanForm((f) => ({ ...f, descripcion_tema: e.target.value }))}
                  placeholder="Contexto pedagógico, enfoque de la semana..."
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Objetivo mensual <span className="text-gray-400 font-normal">(opcional)</span></label>
                <input
                  value={planForm.objetivo_mensual}
                  onChange={(e) => setPlanForm((f) => ({ ...f, objetivo_mensual: e.target.value }))}
                  placeholder="Meta del mes para este grupo..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
              </div>
              {planError && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{planError}</p>}
            </div>
            <div className="px-6 pb-5 flex gap-2">
              <button
                onClick={() => handleCrearPlan(true)}
                disabled={creandoPlan || generatingAI}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: accentColor }}
              >
                {generatingAI ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Generando con IA...</> : <><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>Crear con IA</>}
              </button>
              <button
                onClick={() => handleCrearPlan(false)}
                disabled={creandoPlan || generatingAI}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {creandoPlan ? "Creando..." : "Crear plan vacío"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Editar tema
      ════════════════════════════════════════════════════════════════════════ */}
      {showEditTema && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowEditTema(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Editar tema semanal</h2>
              <button onClick={() => setShowEditTema(false)} className="text-gray-400 hover:text-gray-600">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tema semanal</label>
                <input value={temaForm.tema_semanal} onChange={(e) => setTemaForm((f) => ({ ...f, tema_semanal: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Descripción</label>
                <textarea value={temaForm.descripcion_tema} onChange={(e) => setTemaForm((f) => ({ ...f, descripcion_tema: e.target.value }))} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Objetivo mensual</label>
                <input value={temaForm.objetivo_mensual} onChange={(e) => setTemaForm((f) => ({ ...f, objetivo_mensual: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-2">
              <button onClick={handleSaveTema} disabled={savingTema} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: accentColor }}>
                {savingTema ? "Guardando..." : "Guardar cambios"}
              </button>
              <button onClick={() => setShowEditTema(false)} className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Editar / crear sesión
      ════════════════════════════════════════════════════════════════════════ */}
      {editSesionCtx && sesionForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => { if (!savingSesion) { setEditSesionCtx(null); setSesionForm(null); } }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-6" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <div>
                <h2 className="font-bold text-gray-900">{editSesionCtx.sesion ? "Editar sesión" : "Nueva sesión"} — {DIA_LABEL[editSesionCtx.dia]}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{formatDiaFecha(editSesionCtx.fecha)}</p>
              </div>
              <button onClick={() => { setEditSesionCtx(null); setSesionForm(null); }} className="text-gray-400 hover:text-gray-600">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Tipo sesión + Lugar */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tipo de sesión</label>
                  <select
                    value={sesionForm.tipo_sesion}
                    onChange={(e) => setSesionForm((f) => f ? { ...f, tipo_sesion: e.target.value as TipoSesion } : f)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
                  >
                    {(Object.keys(TIPO_SESION_LABEL) as TipoSesion[]).map((t) => (
                      <option key={t} value={t}>{TIPO_SESION_LABEL[t]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Lugar</label>
                  <select
                    value={sesionForm.lugar}
                    onChange={(e) => setSesionForm((f) => f ? { ...f, lugar: e.target.value as Lugar } : f)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
                  >
                    {(Object.keys(LUGAR_LABEL) as Lugar[]).map((l) => (
                      <option key={l} value={l}>{LUGAR_LABEL[l]}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Horario */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Hora inicio</label>
                  <input type="time" value={sesionForm.hora_inicio} onChange={(e) => setSesionForm((f) => f ? { ...f, hora_inicio: e.target.value } : f)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Hora fin</label>
                  <input type="time" value={sesionForm.hora_fin} onChange={(e) => setSesionForm((f) => f ? { ...f, hora_fin: e.target.value } : f)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
                </div>
              </div>

              {/* Objetivo */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Objetivo de la sesión</label>
                <textarea
                  value={sesionForm.objetivo}
                  onChange={(e) => setSesionForm((f) => f ? { ...f, objetivo: e.target.value } : f)}
                  placeholder="Qué van a lograr al finalizar esta sesión..."
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none"
                />
              </div>

              {/* ── Estaciones damas ── */}
              {activeTab === "damas" && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-gray-700">Estaciones ({sesionForm.estaciones_damas.length})</label>
                    <button
                      onClick={() => setSesionForm((f) => f ? { ...f, estaciones_damas: [...f.estaciones_damas, defaultEstacion()] } : f)}
                      className="text-xs text-fuchsia-700 font-medium hover:underline"
                    >+ Agregar estación</button>
                  </div>
                  <div className="space-y-3">
                    {sesionForm.estaciones_damas.map((est, i) => (
                      <div key={i} className="border border-fuchsia-100 bg-fuchsia-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-fuchsia-800">Estación {i + 1}</span>
                          <button onClick={() => setSesionForm((f) => f ? { ...f, estaciones_damas: f.estaciones_damas.filter((_, j) => j !== i) } : f)} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <input placeholder="Nombre" value={est.nombre} onChange={(e) => setSesionForm((f) => { if (!f) return f; const d = [...f.estaciones_damas]; d[i] = { ...d[i], nombre: e.target.value }; return { ...f, estaciones_damas: d }; })} className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-fuchsia-400" />
                          <input placeholder="Lugar/área" value={est.lugar} onChange={(e) => setSesionForm((f) => { if (!f) return f; const d = [...f.estaciones_damas]; d[i] = { ...d[i], lugar: e.target.value }; return { ...f, estaciones_damas: d }; })} className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-fuchsia-400" />
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <input type="number" min={5} max={60} placeholder="min" value={est.duracion_min} onChange={(e) => setSesionForm((f) => { if (!f) return f; const d = [...f.estaciones_damas]; d[i] = { ...d[i], duracion_min: +e.target.value }; return { ...f, estaciones_damas: d }; })} className="w-20 border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-fuchsia-400" />
                          <span className="text-xs text-gray-400">minutos</span>
                        </div>
                        <textarea placeholder="Descripción de la actividad..." value={est.descripcion} onChange={(e) => setSesionForm((f) => { if (!f) return f; const d = [...f.estaciones_damas]; d[i] = { ...d[i], descripcion: e.target.value }; return { ...f, estaciones_damas: d }; })} rows={2} className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-fuchsia-400 resize-none" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Drills (no damas) ── */}
              {activeTab !== "damas" && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-gray-700">Drills ({sesionForm.drills.length})</label>
                    <button
                      onClick={() => setSesionForm((f) => f ? { ...f, drills: [...f.drills, defaultDrill()] } : f)}
                      className="text-xs font-medium hover:underline" style={{ color: accentColor }}
                    >+ Agregar drill</button>
                  </div>
                  <div className="space-y-3">
                    {sesionForm.drills.map((drill, i) => (
                      <div key={i} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-gray-600">Drill {i + 1}</span>
                          <button onClick={() => setSesionForm((f) => f ? { ...f, drills: f.drills.filter((_, j) => j !== i) } : f)} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
                        </div>
                        <input
                          placeholder="Título del drill"
                          value={drill.titulo}
                          onChange={(e) => setSesionForm((f) => { if (!f) return f; const d = [...f.drills]; d[i] = { ...d[i], titulo: e.target.value }; return { ...f, drills: d }; })}
                          className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs mb-2 focus:outline-none focus:ring-1 focus:ring-green-500"
                        />
                        <textarea
                          placeholder="Descripción y ejecución..."
                          value={drill.descripcion}
                          onChange={(e) => setSesionForm((f) => { if (!f) return f; const d = [...f.drills]; d[i] = { ...d[i], descripcion: e.target.value }; return { ...f, drills: d }; })}
                          rows={2}
                          className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs mb-2 resize-none focus:outline-none focus:ring-1 focus:ring-green-500"
                        />
                        {activeTab === "juvenil" && (
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { key: "dificultad_birdies" as const, label: "Birdies", color: "#dbeafe" },
                              { key: "dificultad_aguilas" as const, label: "Águilas", color: "#dcfce7" },
                              { key: "dificultad_albatros" as const, label: "Albatros", color: "#fef9c3" },
                              { key: "dificultad_mas14" as const, label: "+14", color: "#ede9fe" },
                            ].map(({ key, label, color }) => (
                              <div key={key} className="rounded p-1.5" style={{ background: color }}>
                                <p className="text-[10px] font-bold text-gray-500 mb-1">{label}</p>
                                <textarea
                                  placeholder={`Adaptación para ${label}...`}
                                  value={drill[key] ?? ""}
                                  onChange={(e) => setSesionForm((f) => { if (!f) return f; const d = [...f.drills]; d[i] = { ...d[i], [key]: e.target.value }; return { ...f, drills: d }; })}
                                  rows={2}
                                  className="w-full bg-white border border-gray-200 rounded px-1.5 py-1 text-[11px] resize-none focus:outline-none focus:ring-1 focus:ring-green-400"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Juego competitivo */}
              {activeTab !== "damas" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Juego competitivo <span className="text-gray-400 font-normal">(opcional)</span></label>
                  <textarea
                    value={sesionForm.juego_competitivo}
                    onChange={(e) => setSesionForm((f) => f ? { ...f, juego_competitivo: e.target.value } : f)}
                    placeholder="Descripción del juego o actividad competitiva al final de la sesión..."
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none"
                  />
                </div>
              )}

              {/* Notas */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Notas <span className="text-gray-400 font-normal">(opcional)</span></label>
                <textarea
                  value={sesionForm.notas}
                  onChange={(e) => setSesionForm((f) => f ? { ...f, notas: e.target.value } : f)}
                  placeholder="Observaciones adicionales para el instructor..."
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none"
                />
              </div>

              {sesionError && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{sesionError}</p>}
            </div>

            {/* Modal footer */}
            <div className="px-6 pb-5 flex gap-2 border-t border-gray-100 pt-4">
              <button onClick={handleSaveSesion} disabled={savingSesion} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: accentColor }}>
                {savingSesion ? "Guardando..." : "Guardar sesión"}
              </button>
              <button onClick={() => { setEditSesionCtx(null); setSesionForm(null); }} className="px-5 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
