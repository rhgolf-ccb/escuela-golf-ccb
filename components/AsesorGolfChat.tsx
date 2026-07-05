"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { shouldOfferPdf } from "@/lib/pdf-asesor";

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

const TOOL_STATUS_LABELS: Record<string, string> = {
  web_search: "🔍 Buscando en internet...",
  buscar_alumno: "👤 Buscando alumno...",
  obtener_tests_alumno: "📋 Cargando tests...",
  obtener_asistencia_alumno: "📅 Revisando asistencia...",
  obtener_notas_alumno: "📝 Cargando notas...",
  obtener_grupo: "👥 Consultando grupo...",
  obtener_sesiones_semana: "🗓️ Revisando programación...",
  obtener_drills: "🏌️ Buscando drills...",
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

const MARKDOWN_COMPONENTS = {
  h1: (props: React.ComponentProps<"h1">) => <h1 className="text-base font-bold mt-2 mb-1 first:mt-0" style={{ color: "#1a3a2a" }} {...props} />,
  h2: (props: React.ComponentProps<"h2">) => <h2 className="text-[15px] font-bold mt-2 mb-1 first:mt-0" style={{ color: "#1a3a2a" }} {...props} />,
  h3: (props: React.ComponentProps<"h3">) => <h3 className="text-sm font-bold mt-1.5 mb-1 first:mt-0" style={{ color: "#1a3a2a" }} {...props} />,
  p: (props: React.ComponentProps<"p">) => <p className="mb-1.5 last:mb-0 leading-relaxed" {...props} />,
  ul: (props: React.ComponentProps<"ul">) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5 last:mb-0" {...props} />,
  ol: (props: React.ComponentProps<"ol">) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5 last:mb-0" {...props} />,
  li: (props: React.ComponentProps<"li">) => <li className="leading-relaxed" {...props} />,
  strong: (props: React.ComponentProps<"strong">) => <strong className="font-semibold text-gray-900" {...props} />,
  hr: () => <hr className="my-2 border-t border-gray-200" />,
  a: (props: React.ComponentProps<"a">) => <a className="underline" style={{ color: "#1a3a2a" }} target="_blank" rel="noreferrer" {...props} />,
  table: (props: React.ComponentProps<"table">) => (
    <div className="overflow-x-auto mb-1.5 last:mb-0">
      <table className="w-full border-collapse text-[11px]" {...props} />
    </div>
  ),
  thead: (props: React.ComponentProps<"thead">) => <thead {...props} />,
  th: (props: React.ComponentProps<"th">) => (
    <th className="border px-1.5 py-1 text-left font-semibold text-white" style={{ backgroundColor: "#1a3a2a", borderColor: "#1a3a2a" }} {...props} />
  ),
  td: (props: React.ComponentProps<"td">) => <td className="border border-gray-200 px-1.5 py-1 even:bg-transparent" {...props} />,
  tr: (props: React.ComponentProps<"tr">) => <tr className="odd:bg-gray-50" {...props} />,
  code: (props: React.ComponentProps<"code">) => <code className="text-[11px] bg-gray-100 rounded px-1 py-0.5" {...props} />,
};

export default function AsesorGolfChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading, isOpen]);

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

      const res = await fetch("/api/asesor-golf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok || !res.body) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "No pude conectarme. Intenta de nuevo.", timestamp: Date.now(), isError: true },
        ]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalText: string | null = null;
      let usedWebSearch = false;
      let gotError = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data:")) continue;
          let evt: { type: string; tool?: string; text?: string; usedWebSearch?: boolean };
          try {
            evt = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }
          if (evt.type === "tool_status" && evt.tool) setToolStatus(evt.tool);
          else if (evt.type === "done") {
            finalText = evt.text ?? "";
            usedWebSearch = !!evt.usedWebSearch;
          } else if (evt.type === "error") gotError = true;
        }
      }

      if (gotError || finalText === null) {
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
    const { generateAsesorPdf } = await import("@/lib/pdf-asesor");
    generateAsesorPdf(content);
  }

  const hasUserSentMessage = messages.some((m) => m.role === "user");

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
                {m.role === "assistant" && !m.isError && shouldOfferPdf(m.content) && (
                  <button
                    onClick={() => handleDownloadPdf(m.content)}
                    className="flex items-center gap-1 mt-1 text-[11px] font-medium px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <i className="ti ti-file-type-pdf" style={{ fontSize: 12 }} /> Descargar PDF
                  </button>
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
              disabled={isLoading}
              placeholder="Pregunta sobre swing, TPI, benchmarks..."
              className="flex-1 min-w-0 text-sm px-3 py-2 rounded-full border border-gray-200 focus:outline-none focus:border-[#1a3a2a] disabled:opacity-60"
              style={{ backgroundColor: "var(--surface-1)" }}
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
      )}
    </>
  );
}
