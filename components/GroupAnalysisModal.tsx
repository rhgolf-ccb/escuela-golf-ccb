"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/lib/supabase";
import { TOOL_STATUS_LABELS, formatTime, MARKDOWN_COMPONENTS, streamAsesorChat, PACO_LIMIT_MESSAGE } from "@/lib/paco-chat-shared";
import { formatWhatsAppMessage, openWhatsApp } from "@/lib/whatsapp-formatter";
import { POSICIONES_NOMBRES, physResultToScore, type PhysicalResult } from "./StudentProfile";

type Message = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  isError?: boolean;
};

const MAX_HISTORY = 10;

const QUICK_ACTIONS = [
  { label: "Generar plan semanal enfocado en los problemas detectados", query: "Genera un plan semanal enfocado en los problemas detectados en este grupo." },
  { label: "Lista de drills recomendados para el grupo esta semana", query: "Dame una lista de drills recomendados para este grupo para esta semana." },
  { label: "Alumnos que necesitan sesión individual urgente", query: "¿Qué alumnos de este grupo necesitan una sesión individual urgente y por qué?" },
  { label: "Comparar con evaluación anterior del grupo", query: "Compara el estado actual del grupo con la evaluación anterior de cada alumno." },
];

type SwingRow = {
  student_id: string;
  evaluation_date: string;
  score_promedio: number | null;
  [key: string]: unknown;
};

type PhysicalRow = {
  student_id: string;
  evaluation_date: string;
  score_promedio: number | null;
  tests_data: Record<string, { result: PhysicalResult; obs: string | null; na: boolean }> | null;
};

async function buildGroupContext(grupo: string, students: { id: string; full_name: string }[]): Promise<string> {
  const ids = students.map((s) => s.id);
  const unMesAtras = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  const [swingRes, physicalRes, notasRes, asistRes, protocolosRes] = await Promise.all([
    supabase
      .from("swing_evaluations")
      .select("student_id,evaluation_date,score_promedio,p1_score,p2_score,p3_score,p4_score,p5_score,p6_score,p7_score,p8_score,p9_score,p10_score,p1_na,p2_na,p3_na,p4_na,p5_na,p6_na,p7_na,p8_na,p9_na,p10_na")
      .in("student_id", ids)
      .order("evaluation_date", { ascending: false }),
    supabase.from("physical_evaluations").select("student_id,evaluation_date,score_promedio,tests_data").in("student_id", ids).order("evaluation_date", { ascending: false }),
    supabase.from("notas_profesor").select("alumno_id").in("alumno_id", ids).eq("origen", "paco").gte("fecha", unMesAtras),
    supabase.from("reservas").select("estudiante_id, asistio, sesiones_semana!inner(fecha)").in("estudiante_id", ids).gte("sesiones_semana.fecha", unMesAtras),
    supabase.from("protocolo_tests").select("codigo, nombre").eq("grupo", grupo).eq("tipo", "fisico"),
  ]);

  const swingByStudent = new Map<string, SwingRow[]>();
  ((swingRes.data as SwingRow[]) ?? []).forEach((row) => {
    const arr = swingByStudent.get(row.student_id) ?? [];
    arr.push(row);
    swingByStudent.set(row.student_id, arr);
  });

  const physicalByStudent = new Map<string, PhysicalRow[]>();
  ((physicalRes.data as PhysicalRow[]) ?? []).forEach((row) => {
    const arr = physicalByStudent.get(row.student_id) ?? [];
    arr.push(row);
    physicalByStudent.set(row.student_id, arr);
  });

  const planActivoSet = new Set(((notasRes.data ?? []) as { alumno_id: string }[]).map((n) => n.alumno_id));

  const asistenciaByStudent = new Map<string, { asistidas: number; total: number }>();
  ((asistRes.data ?? []) as { estudiante_id: string; asistio: boolean | null }[]).forEach((r) => {
    const cur = asistenciaByStudent.get(r.estudiante_id) ?? { asistidas: 0, total: 0 };
    cur.total++;
    if (r.asistio) cur.asistidas++;
    asistenciaByStudent.set(r.estudiante_id, cur);
  });

  const physicalNombres: Record<string, string> = {};
  ((protocolosRes.data ?? []) as { codigo: string; nombre: string }[]).forEach((t) => {
    physicalNombres[t.codigo] = t.nombre;
  });

  const porAlumnoLines: string[] = [];
  const sinTests: string[] = [];
  const posicionScores: Record<string, number[]> = {};
  const screenScores: Record<string, number[]> = {};

  students.forEach((s) => {
    const swingEvals = swingByStudent.get(s.id) ?? [];
    const physicalEvals = physicalByStudent.get(s.id) ?? [];
    const asistencia = asistenciaByStudent.get(s.id);
    const pct = asistencia && asistencia.total > 0 ? Math.round((asistencia.asistidas / asistencia.total) * 100) : null;
    const planActivo = planActivoSet.has(s.id) ? "Sí" : "No";

    const faltantes: string[] = [];
    let tecnicoTxt = "sin test técnico registrado";
    if (swingEvals.length) {
      const latest = swingEvals[0];
      tecnicoTxt = `técnico ${latest.score_promedio ?? "—"}/10 (${latest.evaluation_date})`;
      for (let i = 1; i <= 10; i++) {
        if (latest[`p${i}_na`]) continue;
        const score = latest[`p${i}_score`] as number | null;
        if (score === null || score === undefined) continue;
        (posicionScores[`P${i}`] ??= []).push(score);
      }
    } else {
      faltantes.push("técnico");
    }

    let fisicoTxt = "sin test físico registrado";
    if (physicalEvals.length) {
      const latest = physicalEvals[0];
      fisicoTxt = `físico ${latest.score_promedio ?? "—"}/10 (${latest.evaluation_date})`;
      if (latest.tests_data) {
        Object.entries(latest.tests_data).forEach(([codigo, t]) => {
          if (t.na) return;
          const score = physResultToScore(t.result);
          if (score === null) return;
          (screenScores[codigo] ??= []).push(score);
        });
      }
    } else {
      faltantes.push("físico");
    }

    porAlumnoLines.push(
      `- ${s.full_name}: ${tecnicoTxt} | ${fisicoTxt} | asistencia último mes: ${pct !== null ? `${pct}%` : "sin datos"} | plan de trabajo activo: ${planActivo}`
    );
    if (faltantes.length) sinTests.push(`- ${s.full_name} (falta: ${faltantes.join(" y ")})`);
  });

  const avg = (nums: number[]) => Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;

  const promediosTecnicos = Object.entries(posicionScores)
    .map(([pos, scores]) => `${pos} (${POSICIONES_NOMBRES[pos] ?? pos}): ${avg(scores)}/10 (n=${scores.length})`)
    .join("\n");

  const promediosFisicos = Object.entries(screenScores)
    .map(([codigo, scores]) => `${codigo} (${physicalNombres[codigo] ?? codigo}): ${avg(scores)}/10 (n=${scores.length})`)
    .join("\n");

  const parts: string[] = [
    `Grupo: ${grupo}`,
    `Alumnos activos analizados: ${students.length}`,
    `RESULTADOS POR ALUMNO:\n${porAlumnoLines.join("\n")}`,
  ];
  if (promediosTecnicos) parts.push(`PROMEDIOS GRUPALES POR POSICIÓN TÉCNICA (P1-P10):\n${promediosTecnicos}`);
  if (promediosFisicos) parts.push(`PROMEDIOS GRUPALES POR SCREEN FÍSICO:\n${promediosFisicos}`);
  if (sinTests.length) parts.push(`ALUMNOS SIN TESTS COMPLETADOS:\n${sinTests.join("\n")}`);

  return parts.join("\n\n");
}

export default function GroupAnalysisModal({
  grupo,
  students,
  onClose,
}: {
  grupo: string;
  students: { id: string; full_name: string }[];
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [initialAnalysis, setInitialAnalysis] = useState<string | null>(null);
  const groupContextRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  useEffect(() => {
    async function runInitialAnalysis() {
      setIsLoading(true);
      const groupContext = await buildGroupContext(grupo, students);
      groupContextRef.current = groupContext;

      let finalText: string | null = null;
      let gotError = false;
      let limitReached = false;
      try {
        await streamAsesorChat(
          {
            messages: [{ role: "user", content: "Genera el análisis inicial de este grupo con el formato solicitado." }],
            groupContext,
          },
          (evt) => {
            if (evt.type === "tool_status" && evt.tool) setToolStatus(evt.tool);
            else if (evt.type === "done") finalText = evt.text ?? "";
            else if (evt.type === "limit_reached") limitReached = true;
            else if (evt.type === "error") gotError = true;
          }
        );
      } catch {
        gotError = true;
      }

      if (limitReached) {
        setMessages([{ role: "assistant", content: PACO_LIMIT_MESSAGE, timestamp: Date.now() }]);
      } else if (gotError || finalText === null) {
        setMessages([{ role: "assistant", content: "No pude generar el análisis grupal. Intenta de nuevo.", timestamp: Date.now(), isError: true }]);
      } else {
        setInitialAnalysis(finalText);
        setMessages([{ role: "assistant", content: finalText || "No obtuve respuesta.", timestamp: Date.now() }]);
      }
      setIsLoading(false);
      setToolStatus(null);
    }
    runInitialAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    // eslint-disable-next-line react-hooks/purity -- only reachable from user-triggered send actions, never render
    const userMessage: Message = { role: "user", content: trimmed, timestamp: Date.now() };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);
    setToolStatus(null);

    const history = nextMessages.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content }));

    let finalText: string | null = null;
    let gotError = false;
    let limitReached = false;

    try {
      await streamAsesorChat({ messages: history, groupContext: groupContextRef.current }, (evt) => {
        if (evt.type === "tool_status" && evt.tool) setToolStatus(evt.tool);
        else if (evt.type === "done") finalText = evt.text ?? "";
        else if (evt.type === "limit_reached") limitReached = true;
        else if (evt.type === "error") gotError = true;
      });
    } catch {
      gotError = true;
    }

    if (limitReached) {
      setMessages((prev) => [...prev, { role: "assistant", content: PACO_LIMIT_MESSAGE, timestamp: Date.now() }]);
    } else if (gotError || finalText === null) {
      setMessages((prev) => [...prev, { role: "assistant", content: "No pude conectarme. Intenta de nuevo.", timestamp: Date.now(), isError: true }]);
    } else {
      setMessages((prev) => [...prev, { role: "assistant", content: finalText || "No obtuve respuesta.", timestamp: Date.now() }]);
    }
    setIsLoading(false);
    setToolStatus(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  async function handleDownloadPdf() {
    if (!initialAnalysis) return;
    const { generateCCBPdf } = await import("@/lib/pdf-generator");
    generateCCBPdf(initialAnalysis, { documentName: `Análisis Grupal — ${grupo}`, filenamePrefix: `Grupal-${grupo}` });
  }

  function handleSendWhatsApp() {
    if (!initialAnalysis) return;
    openWhatsApp(formatWhatsAppMessage(initialAnalysis, "analisis_grupal", `Análisis grupal — ${grupo}`));
  }

  const hasUserSentMessage = messages.some((m) => m.role === "user");

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ backgroundColor: "rgba(0,0,0,0.45)" }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex flex-col h-full w-full sm:w-[480px] bg-white shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3.5 shrink-0" style={{ backgroundColor: "#1a3a2a" }}>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">Análisis grupal con Paco 🦅</p>
            <p className="text-[11px] text-white/70 truncate">{grupo} · {students.length} alumnos</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-white/70 hover:text-white p-1 shrink-0">
            <i className="ti ti-x" style={{ fontSize: 18 }} />
          </button>
        </div>

        {initialAnalysis && (
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-gray-100 shrink-0 flex-wrap">
            <button
              onClick={handleDownloadPdf}
              className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              <i className="ti ti-file-type-pdf" style={{ fontSize: 12 }} /> Descargar reporte grupal PDF
            </button>
            <button
              onClick={handleSendWhatsApp}
              className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              <i className="ti ti-brand-whatsapp" style={{ fontSize: 12 }} /> Compartir resumen por WhatsApp
            </button>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
              <div
                className="max-w-[95%] rounded-2xl px-3.5 py-2.5 text-sm"
                style={
                  m.role === "user"
                    ? { backgroundColor: "#1a3a2a", color: "#ffffff" }
                    : { backgroundColor: "#f8f9fa", color: m.isError ? "#b91c1c" : "#1f2937", border: "0.5px solid #e5e7eb" }
                }
              >
                {m.role === "assistant" && !m.isError ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                    {m.content}
                  </ReactMarkdown>
                ) : (
                  <span className="whitespace-pre-wrap">{m.content}</span>
                )}
              </div>
              <span className="text-[10px] text-gray-400 mt-1 px-1">{formatTime(m.timestamp)}</span>
            </div>
          ))}

          {!hasUserSentMessage && initialAnalysis && !isLoading && (
            <div className="flex flex-col gap-1.5 pt-1">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  onClick={() => sendMessage(a.query)}
                  className="text-left text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}

          {isLoading && (
            <div className="flex items-center gap-1.5 px-1">
              <span className="text-xs text-gray-400">
                {toolStatus ? TOOL_STATUS_LABELS[toolStatus] ?? "Consultando..." : messages.length === 0 ? "Analizando al grupo..." : "Pensando..."}
              </span>
              <span className="flex gap-0.5">
                <span className="w-1 h-1 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1 h-1 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: "120ms" }} />
                <span className="w-1 h-1 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: "240ms" }} />
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 shrink-0">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder="Pregunta sobre el grupo..."
            className="flex-1 min-w-0 text-sm px-3 py-2 rounded-full border border-gray-200 focus:outline-none focus:border-[#1a3a2a] disabled:opacity-60"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={isLoading || !input.trim()}
            aria-label="Enviar"
            className="flex items-center justify-center w-9 h-9 rounded-full shrink-0 disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: "#1a3a2a" }}
          >
            <i className="ti ti-send" style={{ color: "#ffffff", fontSize: 16 }} />
          </button>
        </div>
      </div>
    </div>
  );
}
