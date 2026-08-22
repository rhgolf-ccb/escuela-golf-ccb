"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/lib/supabase";
import { shouldOfferPdf } from "@/lib/pdf-generator";
import { TOOL_STATUS_LABELS, formatTime, MARKDOWN_COMPONENTS, streamAsesorChat, todayISODate, lunesISODate, detectPlanKind, extractPlanTitle, PACO_LIMIT_MESSAGE, PACO_LIMIT_MESSAGE_SEMANAL, type PacoUsage } from "@/lib/paco-chat-shared";
import { formatWhatsAppMessage, openWhatsApp } from "@/lib/whatsapp-formatter";
import { pacoLimitFor, pacoLimiteSemanalFor, isFamiliaCompetencia, type Rol } from "@/lib/roles";

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

// Las familias tienen su propia bienvenida y sus propios atajos: los del staff
// hablan de benchmarks TPI y protocolos, que no es lo que le sirve a un niño.
const WELCOME_MESSAGE_FAMILIA: Message = {
  role: "assistant",
  content:
    "¡Hola! Soy Paco 🦅, el águila de la Escuela de Golf. Pregúntame lo que quieras de golf: cómo practicar en casa, cómo calmar los nervios antes de un torneo, reglas, o qué hacer para mejorar tu putt. ¿Empezamos?",
  timestamp: Date.now(),
};

const SUGGESTIONS = [
  "¿Qué tests aplican a Birdies?",
  "Benchmarks TPI Competencia 15 años",
  "¿Cómo afecta la altitud al swing?",
];

const SUGGESTIONS_FAMILIA = [
  "¿Qué puedo practicar en casa esta semana?",
  "¿Cómo calmo los nervios en un torneo?",
  "¿Cómo mejoro mi putt desde 2 metros?",
];

const MAX_HISTORY = 10;

export default function AsesorGolfChat({ rol }: { rol: Rol | null }) {
  // Una familia de Competencia ve otro Paco: otra bienvenida, otros atajos y
  // cupo semanal en vez de diario. Lo que puede preguntar lo limita el servidor.
  const esFamilia = !!rol && isFamiliaCompetencia(rol);
  const bienvenida = esFamilia ? WELCOME_MESSAGE_FAMILIA : WELCOME_MESSAGE;
  const sugerencias = esFamilia ? SUGGESTIONS_FAMILIA : SUGGESTIONS;

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([bienvenida]);
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
    const limit = esFamilia ? pacoLimiteSemanalFor(rol) : pacoLimitFor(rol);
    if (limit === null) return;
    // paco_usage guarda una fila por día y solo deja ver las propias (RLS).
    // El cupo de la familia es de la semana, así que se suman los días desde
    // el lunes en vez de leer el de hoy.
    const consulta = esFamilia
      ? supabase.from("paco_usage").select("mensajes_count").gte("fecha", lunesISODate())
      : supabase.from("paco_usage").select("mensajes_count").eq("fecha", todayISODate());
    consulta.then(({ data }) => {
      const count = (data ?? []).reduce((acc, f) => acc + (f.mensajes_count ?? 0), 0);
      setUsage({ count, limit, periodo: esFamilia ? "semana" : "dia" });
    });
  }, [rol, esFamilia]);

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
        .filter((m) => m !== bienvenida)
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
        setMessages((prev) => [...prev, { role: "assistant", content: esFamilia ? PACO_LIMIT_MESSAGE_SEMANAL : PACO_LIMIT_MESSAGE, timestamp: Date.now() }]);
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
    setMessages([bienvenida]);
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
        // El botón y el panel se montan al final del layout, no dentro de
        // ningún módulo: cada uno tiene que activar el tema por su cuenta o las
        // variables --ui-* no existen para ellos y el color sale vacío.
        className="tema-oscuro fixed flex items-center justify-center rounded-full shadow-lg transition-all hover:opacity-90 hover:scale-105"
        style={{ bottom: 24, right: 24, width: 52, height: 52, backgroundColor: "var(--ui-gold)", zIndex: 50 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/Paco_transparente.png" alt="Paco" className="w-8 h-8 object-contain" />
      </button>

      {isOpen && (
        <div
          className="tema-oscuro fixed flex flex-col overflow-hidden shadow-xl asesor-golf-panel-enter w-[90vw] sm:w-[380px]"
          style={{
            bottom: 88,
            right: 24,
            height: 520,
            maxHeight: "70vh",
            borderRadius: 16,
            backgroundColor: "var(--ui-card)",
            border: "1px solid var(--ui-border)",
            zIndex: 50,
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ backgroundColor: "var(--ui-gold)" }}>
            <div className="flex items-center gap-2.5 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/Paco_transparente.png" alt="Paco" className="w-6 h-6 object-contain shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-(--ui-bg) truncate">Paco — Asesor de Golf</p>
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-(--ui-bg)/15 text-(--ui-bg) shrink-0">Sonnet 5</span>
                </div>
                <p className="text-[11px] text-(--ui-bg)/70 truncate">Especialista en TPI · Swing · Pedagogía</p>
              </div>
              {usage && usage.limit !== null && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-(--ui-bg)/10 text-(--ui-bg)/70 shrink-0">
                  {usage.periodo === "semana" ? "Esta semana" : "Consultas hoy"}: {usage.count}/{usage.limit}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={handleNuevaConsulta} title="Nueva consulta" className="text-(--ui-bg)/70 hover:text-(--ui-bg) p-1">
                <i className="ti ti-refresh" style={{ fontSize: 16 }} />
              </button>
              <button onClick={() => setIsOpen(false)} aria-label="Cerrar" className="text-(--ui-bg)/70 hover:text-(--ui-bg) p-1">
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
                      ? { backgroundColor: "var(--ui-gold)", color: "var(--ui-bg)" }
                      : { backgroundColor: "var(--ui-card-alt)", color: m.isError ? "var(--ui-bad)" : "var(--ui-text)", border: "1px solid var(--ui-border)" }
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
                        className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border border-(--ui-border) text-(--ui-text-2) hover:bg-(--ui-card-alt) transition-colors"
                      >
                        <i className="ti ti-file-type-pdf" style={{ fontSize: 12 }} /> Descargar PDF
                      </button>
                    )}
                    {detectPlanKind(m.content) && (
                      <button
                        onClick={() => handleSendWhatsApp(m.content)}
                        className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border border-(--ui-border) text-(--ui-text-2) hover:bg-(--ui-card-alt) transition-colors"
                      >
                        <i className="ti ti-brand-whatsapp" style={{ fontSize: 12 }} /> Enviar por WhatsApp
                      </button>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-1.5 mt-0.5 px-1">
                  {m.usedWebSearch && (
                    <span className="text-[10px] text-(--ui-text-3) flex items-center gap-0.5">
                      <i className="ti ti-search" style={{ fontSize: 10 }} /> Consultó fuentes web
                    </span>
                  )}
                  <span className="text-[10px] text-(--ui-text-3)">{formatTime(m.timestamp)}</span>
                </div>
              </div>
            ))}

            {!hasUserSentMessage && !isLoading && (
              <div className="flex flex-col gap-1.5 pt-1">
                {sugerencias.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="text-left text-xs px-3 py-2 rounded-lg border border-(--ui-border) text-(--ui-text-2) hover:bg-(--ui-card-alt) transition-colors"
                    style={{ backgroundColor: "var(--ui-card-alt)", color: "var(--ui-text)", border: "1px solid var(--ui-border)" }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {isLoading && (
              <div className="flex items-center gap-1.5 px-1">
                <span className="text-xs text-(--ui-text-3)">{toolStatus ? TOOL_STATUS_LABELS[toolStatus] ?? "Consultando..." : "Pensando..."}</span>
                <span className="flex gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-(--ui-text-3) animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1 h-1 rounded-full bg-(--ui-text-3) animate-bounce" style={{ animationDelay: "120ms" }} />
                  <span className="w-1 h-1 rounded-full bg-(--ui-text-3) animate-bounce" style={{ animationDelay: "240ms" }} />
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 px-3 py-2.5 border-t shrink-0" style={{ borderColor: "var(--ui-border)" }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading || limitReached}
              placeholder={limitReached ? "Límite diario alcanzado" : "Pregunta sobre swing, TPI, benchmarks..."}
              className="flex-1 min-w-0 text-sm px-3 py-2 rounded-full border border-(--ui-border) focus:outline-none focus:border-[var(--ui-gold)] disabled:opacity-60"
              style={{ backgroundColor: "var(--ui-card-alt)", color: "var(--ui-text)", border: "1px solid var(--ui-border)" }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={isLoading || !input.trim() || limitReached}
              aria-label="Enviar"
              className="flex items-center justify-center w-9 h-9 rounded-full shrink-0 disabled:opacity-40 transition-opacity"
              style={{ backgroundColor: "var(--ui-gold)" }}
            >
              <i className="ti ti-send" style={{ color: "var(--ui-bg)", fontSize: 16 }} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
