"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/lib/supabase";
import { MARKDOWN_COMPONENTS, streamAsesorChat, PACO_LIMIT_MESSAGE } from "@/lib/paco-chat-shared";
import { formatWhatsAppMessage, openWhatsApp } from "@/lib/whatsapp-formatter";

const ALL_DIAS = ["martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const DIA_LABEL: Record<string, string> = {
  martes: "Martes", miercoles: "Miércoles", jueves: "Jueves", viernes: "Viernes", sabado: "Sábado", domingo: "Domingo",
};

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

async function buildIndividualPlanContext(studentId: string, studentName: string, semanaInicio: string): Promise<string> {
  const [swingRes, physicalRes, notasRes, drillsRes, planRes] = await Promise.all([
    supabase.from("swing_evaluations").select("*").eq("student_id", studentId).order("evaluation_date", { ascending: false }).limit(1),
    supabase.from("physical_evaluations").select("*").eq("student_id", studentId).order("evaluation_date", { ascending: false }).limit(1),
    supabase.from("notas_profesor").select("contenido, fecha").eq("alumno_id", studentId).order("fecha", { ascending: false }).limit(5),
    supabase.from("drills").select("titulo, descripcion, categoria, error_que_corrige, duracion_minutos").eq("aprobado", true).contains("nivel_recomendado", ["Competencia"]).limit(40),
    supabase.from("planes_semanales").select("id").eq("tipo_plan", "competencia").eq("semana_inicio", semanaInicio).maybeSingle(),
  ]);

  let diasConSesion: string[] = [];
  if (planRes.data?.id) {
    const { data: sesiones } = await supabase.from("sesiones_semana").select("dia_semana").eq("plan_id", planRes.data.id);
    diasConSesion = (sesiones ?? []).map((s) => s.dia_semana as string);
  }
  const diasLibres = ALL_DIAS.filter((d) => !diasConSesion.includes(d));

  const parts: string[] = [
    `Alumno: ${studentName}`,
    `Semana del: ${semanaInicio}`,
    `Días CON sesión en la escuela esa semana: ${diasConSesion.length ? diasConSesion.map((d) => DIA_LABEL[d]).join(", ") : "ninguno registrado"}`,
    `Días SIN sesión en la escuela esa semana (días libres para el plan de trabajo en casa): ${diasLibres.length ? diasLibres.map((d) => DIA_LABEL[d]).join(", ") : "ninguno — el alumno tiene sesión todos los días posibles"}`,
  ];

  const swing = (swingRes.data as Record<string, string | number | boolean | null>[])?.[0];
  if (swing) {
    const lines: string[] = [];
    for (let i = 1; i <= 10; i++) {
      if (swing[`p${i}_na`]) continue;
      const score = swing[`p${i}_score`];
      if (score === null || score === undefined) continue;
      const obs = swing[`p${i}_obs`];
      lines.push(`P${i}: ${score}/10${obs ? ` — ${obs}` : ""}`);
    }
    if (lines.length) parts.push(`Últimos tests técnicos (${swing.evaluation_date}):\n${lines.join("\n")}`);
  } else {
    parts.push("Sin tests técnicos registrados.");
  }

  const physical = (physicalRes.data as { evaluation_date: string; tests_data: Record<string, { result: string | null; obs: string | null; na: boolean }> | null }[])?.[0];
  if (physical?.tests_data) {
    const lines = Object.entries(physical.tests_data)
      .filter(([, t]) => !t.na && t.result)
      .map(([codigo, t]) => `${codigo}: ${t.result}${t.obs ? ` — ${t.obs}` : ""}`);
    if (lines.length) parts.push(`Últimos tests físicos (${physical.evaluation_date}):\n${lines.join("\n")}`);
  } else {
    parts.push("Sin tests físicos registrados.");
  }

  const notas = (notasRes.data ?? []) as { contenido: string; fecha: string }[];
  if (notas.length) parts.push(`Últimas notas del profesor:\n${notas.map((n) => `- ${n.fecha}: ${n.contenido}`).join("\n")}`);

  const drills = (drillsRes.data ?? []) as { titulo: string; descripcion: string; categoria: string; error_que_corrige: string | null; duracion_minutos: number | null }[];
  if (drills.length) {
    parts.push(
      `Drills disponibles en la librería:\n${drills
        .map((d) => `- ${d.titulo} (${d.categoria}${d.duracion_minutos ? `, ${d.duracion_minutos} min` : ""}): ${d.descripcion}${d.error_que_corrige ? ` — corrige: ${d.error_que_corrige}` : ""}`)
        .join("\n")}`
    );
  }

  return parts.join("\n\n");
}

export default function PlanParaCasaModal({
  studentId,
  studentName,
  parentPhone,
  onClose,
}: {
  studentId: string;
  studentName: string;
  parentPhone?: string | null;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"choose" | "generating" | "result" | "error">("choose");
  const [plan, setPlan] = useState<string | null>(null);
  const [semanaLabel, setSemanaLabel] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [savedNotes, setSavedNotes] = useState(false);

  async function handleSelectSemana(offsetWeeks: 0 | 1) {
    setStep("generating");
    const monday = getMonday(new Date());
    monday.setDate(monday.getDate() + offsetWeeks * 7);
    const semanaInicio = toISODate(monday);
    const label = monday.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
    setSemanaLabel(label);

    const individualPlanContext = await buildIndividualPlanContext(studentId, studentName, semanaInicio);

    let finalText: string | null = null;
    let gotError = false;
    let limitReached = false;
    try {
      await streamAsesorChat(
        {
          messages: [{ role: "user", content: "Genera el plan de trabajo para casa de este alumno para la semana indicada." }],
          individualPlanContext,
        },
        (evt) => {
          if (evt.type === "done") finalText = evt.text ?? "";
          else if (evt.type === "limit_reached") limitReached = true;
          else if (evt.type === "error") gotError = true;
        }
      );
    } catch {
      gotError = true;
    }

    if (limitReached) {
      setErrorMsg(PACO_LIMIT_MESSAGE);
      setStep("error");
    } else if (gotError || finalText === null) {
      setErrorMsg("No pude generar el plan. Intenta de nuevo.");
      setStep("error");
    } else {
      setPlan(finalText);
      setStep("result");
    }
  }

  async function handleDownloadPdf() {
    if (!plan) return;
    const { generateCCBPdf } = await import("@/lib/pdf-generator");
    generateCCBPdf(plan, {
      documentName: `Plan de Trabajo Individual — ${studentName} — Semana del ${semanaLabel}`,
      filenamePrefix: `Plan-Casa-${studentName}`,
    });
  }

  function handleSendWhatsApp() {
    if (!plan) return;
    openWhatsApp(formatWhatsAppMessage(plan, "plan_drills", `Plan para casa — ${studentName.split(" ")[0]}`), parentPhone);
  }

  async function handleSaveNotes() {
    if (!plan) return;
    setSavingNotes(true);
    try {
      const fecha = new Date().toISOString().split("T")[0];
      const fechaLegible = new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
      const { error } = await supabase.from("notas_profesor").insert({
        alumno_id: studentId,
        contenido: `Plan para casa — ${fechaLegible}\n\n${plan}`,
        fecha,
        profesor_nombre: "Robert Instructor",
        origen: "plan-casa",
      });
      if (error) throw error;
      setSavedNotes(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al guardar en notas");
    }
    setSavingNotes(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.45)" }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex flex-col bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ backgroundColor: "#1a3a2a" }}>
          <div>
            <p className="text-sm font-semibold text-white">Plan para casa 🏠</p>
            <p className="text-[11px] text-white/70">{studentName}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-white/70 hover:text-white p-1">
            <i className="ti ti-x" style={{ fontSize: 18 }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {step === "choose" && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-gray-600 mb-1">¿Para qué semana quieres generar el plan de trabajo en casa?</p>
              <button
                onClick={() => handleSelectSemana(0)}
                className="text-left px-4 py-3 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Semana actual
              </button>
              <button
                onClick={() => handleSelectSemana(1)}
                className="text-left px-4 py-3 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Próxima semana
              </button>
            </div>
          )}

          {step === "generating" && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#1a3a2a] border-t-transparent" />
              <p className="text-sm text-gray-500">Paco está generando el plan...</p>
            </div>
          )}

          {step === "error" && (
            <div className="py-6 text-sm text-red-600">{errorMsg}</div>
          )}

          {step === "result" && plan && (
            <div className="text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                {plan}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {step === "result" && plan && (
          <div className="flex items-center gap-1.5 px-5 py-3 border-t border-gray-100 shrink-0 flex-wrap">
            <button onClick={handleDownloadPdf} className="flex items-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50">
              <i className="ti ti-file-type-pdf" style={{ fontSize: 12 }} /> Descargar PDF
            </button>
            <button onClick={handleSendWhatsApp} className="flex items-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50">
              <i className="ti ti-brand-whatsapp" style={{ fontSize: 12 }} /> Enviar por WhatsApp
            </button>
            {savedNotes ? (
              <span className="text-[11px] font-medium px-2 py-1.5 rounded-md text-emerald-700 bg-emerald-50">✓ Guardado en notas</span>
            ) : (
              <button onClick={handleSaveNotes} disabled={savingNotes} className="text-[11px] font-medium px-2 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                {savingNotes ? "Guardando..." : "Guardar en notas"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
