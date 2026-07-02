"use client";

import { useEffect, useRef, useState } from "react";

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
    "Hola, soy el asesor especializado de la Escuela de Golf CCB. Puedo ayudarte con preguntas sobre swing, protocolos TPI, benchmarks por grupo, pedagogía júnior y desarrollo atlético. ¿En qué te puedo ayudar?",
  timestamp: Date.now(),
};

const SUGGESTIONS = [
  "¿Qué tests aplican a Birdies?",
  "Benchmarks TPI Competencia 15 años",
  "¿Cómo afecta la altitud al swing?",
];

const MAX_HISTORY = 10;

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

export default function AsesorGolfChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
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
      const data = await res.json();

      if (!res.ok || data.error) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "No pude conectarme. Intenta de nuevo.", timestamp: Date.now(), isError: true },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.text || "No obtuve respuesta.", timestamp: Date.now(), usedWebSearch: !!data.usedWebSearch },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "No pude conectarme. Intenta de nuevo.", timestamp: Date.now(), isError: true },
      ]);
    } finally {
      setIsLoading(false);
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

  const hasUserSentMessage = messages.some((m) => m.role === "user");

  return (
    <>
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-label="Asesor Golf CCB"
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
                  <p className="text-sm font-semibold text-white truncate">Asesor Golf CCB</p>
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
                  className="max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap"
                  style={
                    m.role === "user"
                      ? { backgroundColor: "#1a3a2a", color: "#ffffff" }
                      : { backgroundColor: "var(--surface-1)", color: m.isError ? "#b91c1c" : "#1f2937", border: "0.5px solid var(--border-strong)" }
                  }
                >
                  {m.content}
                </div>
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
                <span className="text-xs text-gray-400">Consultando fuentes...</span>
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
