"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/lib/supabase";
import { shouldOfferPdf } from "@/lib/pdf-generator";
import { TOOL_STATUS_LABELS, formatTime, MARKDOWN_COMPONENTS, streamAsesorChat, todayISODate, detectPlanKind, extractPlanTitle, PACO_LIMIT_MESSAGE, type PacoUsage } from "@/lib/paco-chat-shared";
import { formatWhatsAppMessage, openWhatsApp } from "@/lib/whatsapp-formatter";
import { pacoLimitFor, type Rol } from "@/lib/roles";

type Message = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  usedWebSearch?: boolean;
  isError?: boolean;
};

const WELCOME_MESSAGE: Message = {
  role: "assistant",
  content:
    "¡Hola! Soy Paco, el asesor de golf de la Escuela CCB. Puedo ayudarte con swing, protocolos TPI, benchmarks por grupo, pedagogía júnior y desarrollo atlético. ¿En qué te puedo ayudar?",
  timestamp: Date.now(),
};

const SUGGESTIONS = [
  "¿Qué tests aplican a Birdies?",
  "Benchmarks TPI Competencia 15 años",
  "¿Cómo afecta la altitud al swing?",
];

const MAX_HISTORY = 10;

export default function AsesorGolfChat({ rol }: { rol: Rol | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [usage, setUsage] = useState<PacoUsage | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading, isOpen]);

  useEffect(() => {
    if (!rol) return;
    const limit = pacoLimitFor(rol);
    if (limit === null) return;
    supabase
      .from("paco_usage")
      .select("mensajes_count")
      .eq("fecha", todayISODate())
      .maybeSingle()
      .then(({ data }) => setUsage({ count: data?.mensajes_count ?? 0, limit }));
  }, [rol]);

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

    try {
      const history = nextMessages
        .filter((m) => m !== WELCOME_MESSAGE)
        .slice(-MAX_HISTORY)
        .map((m) => ({ role: m.role, content: m.content }));

      let finalText: string | null = null;
      let usedWebSearch = false;
      let gotError = false;
      let limitReached = false;

      await streamAsesorChat({ messages: history }, (evt) => {
        if (evt.type === "tool_status" && evt.tool) setToolStatus(evt.tool);
        else if (evt.type === "done") {
          finalText = evt.text ?? "";
          usedWebSearch = !!evt.usedWebSearch;
          if (evt.usage) setUsage(evt.usage);
        } else if (evt.type === "limit_reached") {
          limitReached = true;
          if (evt.usage) setUsage(evt.usage);
        } else if (evt.type === "error") gotError = true;
      });

      if (limitReached) {
        setMessages((prev) => [...prev, { role: "assistant", content: PACO_LIMIT_MESSAGE, timestamp: Date.now() }]);
      } else if (gotError || finalText === null) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "No pude conectarme. Intenta de nuevo.", timestamp: Date.now(), isError: true },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: finalText || "No obtuve respuesta.", timestamp: Date.now(), usedWebSearch },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "No pude conectarme. Intenta de nuevo.", timestamp: Date.now(), isError: true },
      ]);
    } finally {
      setIsLoading(false);
      setToolStatus(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function handleNuevaConsulta() {
    setMessages([WELCOME_MESSAGE]);
    setInput("");
  }

  async function handleDownloadPdf(content: string) {
    const { generateCCBPdf } = await import("@/lib/pdf-generator");
    generateCCBPdf(content, { documentName: "Consulta a Paco" });
  }

  function handleSendWhatsApp(content: string) {
    const kind = detectPlanKind(content);
    const docType = kind === "torneo" ? "plan_torneo" : "festival";
    openWhatsApp(formatWhatsAppMessage(content, docType, extractPlanTitle(content)));
  }

  const hasUserSentMessage = messages.some((m) => m.role === "user");
  const limitReached = usage !== null && usage.limit !== null && usage.count >= usage.limit;

  return (
    <>
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-label="Paco — Asesor de Golf"
        className="fixed flex items-center justify-center rounded-full shadow-lg transition-all hover:opacity-90 hover:scale-105"
        style={{ bottom: 24, right: 24, width: 52, height: 52, backgroundColor: "#1a3a2a", zIndex: 50 }}
      >
        <i className="ti ti-robot" style={{ color: "#ffffff", fontSize: 24 }} />
      </button>

      {isOpen && (
        <div
          className="fixed flex flex-col overflow-hidden shadow-xl asesor-golf-panel-enter w-[90vw] sm:w-[380px]"
          style={{
            bottom: 88,
            right: 24,
            height: 520,
            maxHeight: "70vh",
            borderRadius: 16,
            backgroundColor: "var(--surface-2)",
            border: "0.5px solid var(--border-strong)",
            zIndex: 50,
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ backgroundColor: "#1a3a2a" }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <i className="ti ti-robot" style={{ color: "#ffffff", fontSize: 20 }} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-white truncate">Paco — Asesor de Golf</p>
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-white/15 text-white shrink-0">Opus 4</span>
                </div>
                <p className="text-[11px] text-white/70 truncate">Especialista en TPI · Swing · Pedagogía</p>
              </div>
              {usage && usage.limit !== null && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-white/10 text-white/70 shrink-0">
                  Consultas hoy: {usage.count}/{usage.limit}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={handleNuevaConsulta} title="Nueva consulta" className="text-white/70 hover:text-white p-1">
                <i className="ti ti-refresh" style={{ fontSize: 16 }} />
              </button>
              <button onClick={() => setIsOpen(false)} aria-label="Cerrar" className="text-white/70 hover:text-white p-1">
                <i className="ti ti-x" style={{ fontSize: 18 }} />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className="max-w-[85%] rounded-2xl px-3 py-2 text-sm"
                  style={
                    m.role === "user"
                      ? { backgroundColor: "#1a3a2a", color: "#ffffff" }
                      : { backgroundColor: "var(--surface-1)", color: m.isError ? "#b91c1c" : "#1f2937", border: "0.5px solid var(--border-strong)" }
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
                {m.role === "assistant" && !m.isError && (shouldOfferPdf(m.content) || detectPlanKind(m.content)) && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    {shouldOfferPdf(m.content) && (
                      <button
                        onClick={() => handleDownloadPdf(m.content)}
                        className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        <i className="ti ti-file-type-pdf" style={{ fontSize: 12 }} /> Descargar PDF
                      </button>
                    )}
                    {detectPlanKind(m.content) && (
                      <button
                        onClick={() => handleSendWhatsApp(m.content)}
                        className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        <i className="ti ti-brand-whatsapp" style={{ fontSize: 12 }} /> Enviar por WhatsApp
                      </button>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-1.5 mt-0.5 px-1">
                  {m.usedWebSearch && (
                    <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                      <i className="ti ti-search" style={{ fontSize: 10 }} /> Consultó fuentes web
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400">{formatTime(m.timestamp)}</span>
                </div>
              </div>
            ))}

            {!hasUserSentMessage && !isLoading && (
              <div className="flex flex-col gap-1.5 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="text-left text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                    style={{ backgroundColor: "var(--surface-1)" }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

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

          <div className="flex items-center gap-2 px-3 py-2.5 border-t shrink-0" style={{ borderColor: "var(--border-strong)" }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading || limitReached}
              placeholder={limitReached ? "Límite diario alcanzado" : "Pregunta sobre swing, TPI, benchmarks..."}
              className="flex-1 min-w-0 text-sm px-3 py-2 rounded-full border border-gray-200 focus:outline-none focus:border-[#1a3a2a] disabled:opacity-60"
              style={{ backgroundColor: "var(--surface-1)" }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={isLoading || !input.trim() || limitReached}
              aria-label="Enviar"
              className="flex items-center justify-center w-9 h-9 rounded-full shrink-0 disabled:opacity-40 transition-opacity"
              style={{ backgroundColor: "#1a3a2a" }}
            >
              <i className="ti ti-send" style={{ color: "#ffffff", fontSize: 16 }} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
