"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/lib/supabase";
import { TOOL_STATUS_LABELS, formatTime, MARKDOWN_COMPONENTS, streamAsesorChat } from "@/lib/paco-chat-shared";

type Message = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  usedWebSearch?: boolean;
  isError?: boolean;
  isWelcome?: boolean;
  savedToNotes?: boolean;
  drillsResult?: string | null;
};

const MAX_HISTORY = 10;
const DRILL_KEYWORDS = /\bdrills?\b|\bejercicios?\b/i;

function shouldOfferSaveToNotes(content: string): boolean {
  return content.trim().split(/\s+/).filter(Boolean).length > 40;
}

function shouldOfferSaveDrills(content: string): boolean {
  return DRILL_KEYWORDS.test(content);
}

export default function PacoContextChat({
  studentId,
  studentName,
  studentContext,
  studentGrupo,
  onClose,
}: {
  studentId: string;
  studentName: string;
  studentContext: string;
  studentGrupo?: string | null;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      role: "assistant",
      content: `¡Hola! Soy Paco. Ya tengo cargado el contexto de **${studentName}** — pregúntame lo que necesites: análisis técnico, plan de drills, ejercicios correctivos o cualquier duda sobre su desarrollo.`,
      timestamp: Date.now(),
      isWelcome: true,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [savingNotesIdx, setSavingNotesIdx] = useState<number | null>(null);
  const [savingDrillsIdx, setSavingDrillsIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMessage: Message = { role: "user", content: trimmed, timestamp: Date.now() };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);
    setToolStatus(null);

    const history = nextMessages.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content }));

    let finalText: string | null = null;
    let usedWebSearch = false;
    let gotError = false;

    try {
      await streamAsesorChat({ messages: history, studentContext }, (evt) => {
        if (evt.type === "tool_status" && evt.tool) setToolStatus(evt.tool);
        else if (evt.type === "done") {
          finalText = evt.text ?? "";
          usedWebSearch = !!evt.usedWebSearch;
        } else if (evt.type === "error") gotError = true;
      });
    } catch {
      gotError = true;
    }

    if (gotError || finalText === null) {
      setMessages((prev) => [...prev, { role: "assistant", content: "No pude conectarme. Intenta de nuevo.", timestamp: Date.now(), isError: true }]);
    } else {
      setMessages((prev) => [...prev, { role: "assistant", content: finalText || "No obtuve respuesta.", timestamp: Date.now(), usedWebSearch }]);
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

  async function handleSaveToNotes(idx: number, content: string) {
    setSavingNotesIdx(idx);
    try {
      const fecha = new Date().toISOString().split("T")[0];
      const fechaLegible = new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
      const { error } = await supabase.from("notas_profesor").insert({
        alumno_id: studentId,
        contenido: `Plan Paco — ${fechaLegible}\n\n${content}`,
        fecha,
        profesor_nombre: "Robert Instructor",
      });
      if (error) throw error;
      setMessages((prev) => prev.map((m, i) => (i === idx ? { ...m, savedToNotes: true } : m)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al guardar en notas");
    }
    setSavingNotesIdx(null);
  }

  async function handleSaveDrills(idx: number, content: string) {
    setSavingDrillsIdx(idx);
    try {
      const res = await fetch("/api/extract-drills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content, grupo: studentGrupo ?? null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar los drills");
      setMessages((prev) => prev.map((m, i) => (i === idx ? { ...m, drillsResult: data.mensaje } : m)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al guardar los drills");
    }
    setSavingDrillsIdx(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ backgroundColor: "rgba(0,0,0,0.45)" }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex flex-col h-full w-full sm:w-[440px] bg-white shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3.5 shrink-0" style={{ backgroundColor: "#1a3a2a" }}>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">Consultar a Paco 🦅</p>
            <p className="text-[11px] text-white/70 truncate">Contexto: {studentName}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-white/70 hover:text-white p-1 shrink-0">
            <i className="ti ti-x" style={{ fontSize: 18 }} />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
              <div
                className="max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm"
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

              {m.role === "assistant" && !m.isError && !m.isWelcome && (
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {shouldOfferSaveToNotes(m.content) && (
                    m.savedToNotes ? (
                      <span className="text-[11px] font-medium px-2 py-1 rounded-md text-emerald-700 bg-emerald-50">✓ Guardado en notas</span>
                    ) : (
                      <button
                        onClick={() => handleSaveToNotes(i, m.content)}
                        disabled={savingNotesIdx === i}
                        className="text-[11px] font-medium px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {savingNotesIdx === i ? "Guardando..." : `Guardar en notas de ${studentName.split(" ")[0]}`}
                      </button>
                    )
                  )}
                  {shouldOfferSaveDrills(m.content) && (
                    m.drillsResult ? (
                      <span className="text-[11px] font-medium px-2 py-1 rounded-md text-emerald-700 bg-emerald-50">{m.drillsResult}</span>
                    ) : (
                      <button
                        onClick={() => handleSaveDrills(i, m.content)}
                        disabled={savingDrillsIdx === i}
                        className="text-[11px] font-medium px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {savingDrillsIdx === i ? "Analizando..." : "Guardar drills en librería"}
                      </button>
                    )
                  )}
                </div>
              )}

              <div className="flex items-center gap-1.5 mt-1 px-1">
                {m.usedWebSearch && (
                  <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                    <i className="ti ti-search" style={{ fontSize: 10 }} /> Consultó fuentes web
                  </span>
                )}
                <span className="text-[10px] text-gray-400">{formatTime(m.timestamp)}</span>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-1.5 px-1">
              <span className="text-xs text-gray-400">{toolStatus ? TOOL_STATUS_LABELS[toolStatus] ?? "Consultando..." : "Pensando..."}</span>
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
            placeholder={`Pregunta sobre ${studentName.split(" ")[0]}...`}
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
