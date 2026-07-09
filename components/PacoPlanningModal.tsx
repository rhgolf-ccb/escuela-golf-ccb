"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/lib/supabase";
import { TOOL_STATUS_LABELS, formatTime, MARKDOWN_COMPONENTS, streamAsesorChat, PACO_LIMIT_MESSAGE } from "@/lib/paco-chat-shared";
import type { SesionJuvenilData, SesionJuvenilLegacy } from "./JuvenileClassModal";
import {
  toISODate,
  getFechaForDia,
  DIAS_POR_TIPO,
  DIA_LABEL,
  TIPO_SESION_LABEL,
  LUGAR_LABEL,
  TIPO_PLAN_LABEL,
  CAL_EVENT,
  type TipoPlan,
  type DiaSemana,
  type TipoSesion,
  type Lugar,
  type Drill,
  type EstacionDamas,
  type PreviewSesion,
  type PlanSemanal,
  type SesionSemana,
} from "./ProgramacionModule";

type Message = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  usedWebSearch?: boolean;
  isError?: boolean;
  isWelcome?: boolean;
};

type Preview = { descripcion_tema: string; sesiones: PreviewSesion[]; sesion_juvenil?: SesionJuvenilData | null };

type RawPlanSesion = {
  dia_semana: DiaSemana; tipo_sesion: TipoSesion; lugar: Lugar;
  hora_inicio?: string; hora_fin?: string; objetivo?: string;
  drills?: Drill[]; juego_competitivo?: string | null;
  estaciones_damas?: EstacionDamas[] | null; notas?: string | null;
};
type RawPlan = { descripcion_tema?: string; sesion_juvenil?: SesionJuvenilLegacy | null; sesiones?: RawPlanSesion[] };

function buildPreviewFromPlan(semana: Date, plan: RawPlan): Preview {
  const sesiones: PreviewSesion[] = (plan.sesiones ?? []).map((s) => ({
    dia_semana: s.dia_semana,
    fecha: getFechaForDia(semana, s.dia_semana),
    tipo_sesion: s.tipo_sesion,
    lugar: s.lugar,
    hora_inicio: s.hora_inicio ?? "",
    hora_fin: s.hora_fin ?? "",
    objetivo: s.objetivo ?? "",
    drills: s.drills ?? [],
    juego_competitivo: s.juego_competitivo ?? null,
    estaciones_damas: s.estaciones_damas ?? null,
    notas: s.notas ?? null,
  }));
  return { descripcion_tema: plan.descripcion_tema ?? "", sesiones, sesion_juvenil: plan.sesion_juvenil ?? null };
}

const WELCOME_BY_TIPO: Record<TipoPlan, string> = {
  juvenil:
    "Listo, vamos con Juvenil esta semana. Cuéntame: ¿cuántas estaciones quieres por día — 2, 3 o 4? ¿Incluimos estación física algún día? ¿Hay algún problema técnico específico que quieras trabajar esta semana — por ejemplo sway en Águilas, backswing corto, setup?",
  competencia:
    "Perfecto, semana de Competencia. Ya sé que el martes es tiro largo, miércoles putt y campo, jueves juego corto y sábado campo de práctica. ¿Incluimos estación física algún día esta semana? ¿Hay torneo próximo que deba tener en cuenta? ¿Algún aspecto técnico prioritario esta semana?",
  damas:
    "Vamos con Damas. ¿Esta semana es sesión normal de viernes o hay día de campo también? ¿Incluimos bunker en la estación de juego corto? ¿Calentamiento estándar con baile y movilidad funcional?",
};

const MAX_HISTORY = 10;
const LUGARES: Lugar[] = ["campo_practica", "putting_green", "campo_infantil", "campo_pacos_fabios", "campo_completo"];

const SCHEDULE_DESC: Record<TipoPlan, string> = {
  juvenil:
    "Martes/Miércoles/Jueves 16:30-17:30 (1 clase). Sábado y Domingo: 2 clases cada día (09:15-10:00 y 10:00-11:00). Cada sesión sigue el modelo de 3 actividades tipo juego con adaptaciones para Birdies/Águilas/Albatros, o puede ser un día especial: test técnico, test físico, campo Pacos y Fabios, o campo infantil.",
  competencia:
    "Martes/Miércoles/Jueves 16:00-17:30, Sábado 08:30-09:30. Día 1: tiro largo en campo de práctica. Día 2: putting green Fundadores o campo Pacos y Fabios. Día 3: tiro largo o juego corto. Sábado: siempre campo de práctica, nunca campo real.",
  damas: "Viernes 10:30-12:00. Siempre 3 estaciones rotativas de 25 minutos: Juego Largo, Juego Corto, Putt.",
};

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatFechaCorta(fecha: string): string {
  return new Date(fecha + "T00:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

function resumenSesionExistente(s: SesionSemana): string {
  const partes = [DIA_LABEL[s.dia_semana], TIPO_SESION_LABEL[s.tipo_sesion] ?? s.tipo_sesion, LUGAR_LABEL[s.lugar] ?? s.lugar];
  if (s.hora_inicio) partes.push(s.hora_inicio.slice(0, 5));
  return partes.join(" — ");
}

async function buildDrillsContext(): Promise<string> {
  const { data } = await supabase.from("drills").select("titulo, categoria").eq("aprobado", true).order("categoria").limit(150);
  if (!data || data.length === 0) return "No hay drills aprobados cargados todavía en la librería.";
  const porCategoria = new Map<string, string[]>();
  for (const d of data) {
    const list = porCategoria.get(d.categoria) ?? [];
    list.push(d.titulo);
    porCategoria.set(d.categoria, list);
  }
  return Array.from(porCategoria.entries())
    .map(([cat, titulos]) => `${cat}: ${titulos.join(", ")}`)
    .join("\n");
}

function buildPlanningContext(
  tipoPlan: TipoPlan,
  semana: Date,
  planExistente: PlanSemanal | null,
  sesionesExistentes: SesionSemana[],
  drillsCtx: string
): string {
  const lunes = semana;
  const sabado = addDays(semana, 4);
  const parts: string[] = [
    `Semana: lunes ${lunes.toLocaleDateString("es-CO", { day: "numeric", month: "long" })} a sábado ${sabado.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}`,
    `Grupo a planificar: ${TIPO_PLAN_LABEL[tipoPlan]}`,
    `Estructura fija de este grupo: ${SCHEDULE_DESC[tipoPlan]}`,
    `Ubicaciones reales del CCB: Campo de práctica, Putting green Fundadores, Campo Pacos y Fabios, Campo infantil`,
    `Drills disponibles en la librería por categoría:\n${drillsCtx}`,
  ];
  if (planExistente && sesionesExistentes.length > 0) {
    parts.push(
      `Programación ya existente esta semana para ${TIPO_PLAN_LABEL[tipoPlan]} (tema: "${planExistente.tema_semanal}"):\n${sesionesExistentes.map(resumenSesionExistente).join("\n")}`
    );
  } else {
    parts.push("No hay programación registrada aún para esta semana en este grupo.");
  }
  return parts.join("\n\n");
}

export default function PacoPlanningModal({
  tipoPlan,
  semana,
  planExistente,
  sesionesExistentes,
  onClose,
  onPublished,
}: {
  tipoPlan: TipoPlan;
  semana: Date;
  planExistente: PlanSemanal | null;
  sesionesExistentes: SesionSemana[];
  onClose: () => void;
  onPublished: () => void;
}) {
  const [planningContext, setPlanningContext] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      role: "assistant",
      content: WELCOME_BY_TIPO[tipoPlan],
      timestamp: Date.now(),
      isWelcome: true,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [preview, setPreview] = useState<Preview | null>(null);

  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [showConfirmReplace, setShowConfirmReplace] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const drillsCtx = await buildDrillsContext();
      if (cancelled) return;
      setPlanningContext(buildPlanningContext(tipoPlan, semana, planExistente, sesionesExistentes, drillsCtx));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isLoading || !planningContext) return;

    const userMessage: Message = { role: "user", content: trimmed, timestamp: Date.now() };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);
    setToolStatus(null);

    const history = nextMessages.filter((m) => !m.isWelcome).slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content }));

    let finalText: string | null = null;
    let usedWebSearch = false;
    let gotError = false;
    let limitReached = false;

    try {
      await streamAsesorChat({ messages: history, planningContext }, (evt) => {
        if (evt.type === "tool_status" && evt.tool) setToolStatus(evt.tool);
        else if (evt.type === "plan_preview" && evt.plan) setPreview(buildPreviewFromPlan(semana, evt.plan as RawPlan));
        else if (evt.type === "done") {
          finalText = evt.text ?? "";
          usedWebSearch = !!evt.usedWebSearch;
        } else if (evt.type === "limit_reached") limitReached = true;
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

  function updateSesion(idx: number, updates: Partial<PreviewSesion>) {
    setPreview((prev) => {
      if (!prev) return prev;
      const list = [...prev.sesiones];
      list[idx] = { ...list[idx], ...updates };
      return { ...prev, sesiones: list };
    });
  }

  function updateDrill(sesionIdx: number, drillIdx: number, updates: Partial<Drill>) {
    setPreview((prev) => {
      if (!prev) return prev;
      const list = [...prev.sesiones];
      const drills = [...list[sesionIdx].drills];
      drills[drillIdx] = { ...drills[drillIdx], ...updates };
      list[sesionIdx] = { ...list[sesionIdx], drills };
      return { ...prev, sesiones: list };
    });
  }

  function removeDrill(sesionIdx: number, drillIdx: number) {
    setPreview((prev) => {
      if (!prev) return prev;
      const list = [...prev.sesiones];
      list[sesionIdx] = { ...list[sesionIdx], drills: list[sesionIdx].drills.filter((_, i) => i !== drillIdx) };
      return { ...prev, sesiones: list };
    });
  }

  function addDrill(sesionIdx: number) {
    setPreview((prev) => {
      if (!prev) return prev;
      const list = [...prev.sesiones];
      list[sesionIdx] = { ...list[sesionIdx], drills: [...list[sesionIdx].drills, { titulo: "", descripcion: "" }] };
      return { ...prev, sesiones: list };
    });
  }

  function updateEstacion(sesionIdx: number, estIdx: number, updates: Partial<EstacionDamas>) {
    setPreview((prev) => {
      if (!prev) return prev;
      const list = [...prev.sesiones];
      const estaciones = [...(list[sesionIdx].estaciones_damas ?? [])];
      estaciones[estIdx] = { ...estaciones[estIdx], ...updates };
      list[sesionIdx] = { ...list[sesionIdx], estaciones_damas: estaciones };
      return { ...prev, sesiones: list };
    });
  }

  function updateJuvenil(updates: Partial<SesionJuvenilLegacy>) {
    setPreview((prev) => {
      if (!prev || !prev.sesion_juvenil) return prev;
      return { ...prev, sesion_juvenil: { ...(prev.sesion_juvenil as SesionJuvenilLegacy), ...updates } };
    });
  }

  function updateJuvenilActividad(idx: number, updates: Partial<SesionJuvenilLegacy["actividades"][0]>) {
    setPreview((prev) => {
      if (!prev || !prev.sesion_juvenil) return prev;
      const leg = prev.sesion_juvenil as SesionJuvenilLegacy;
      const actividades = [...leg.actividades];
      actividades[idx] = { ...actividades[idx], ...updates };
      return { ...prev, sesion_juvenil: { ...leg, actividades } };
    });
  }

  async function doPublish() {
    if (!preview) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch("/api/publish-plan-semanal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo_plan: tipoPlan,
          semana_inicio: toISODate(semana),
          tema_semanal: preview.descripcion_tema || TIPO_PLAN_LABEL[tipoPlan],
          descripcion_tema: preview.descripcion_tema,
          objetivo_mensual: null,
          foco_mes: null,
          sesiones: tipoPlan === "juvenil" ? undefined : preview.sesiones,
          sesion_juvenil: tipoPlan === "juvenil" ? preview.sesion_juvenil : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al publicar la programación");

      onPublished();
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Error al publicar");
    }
    setPublishing(false);
  }

  function handlePublicarClick() {
    if (planExistente) {
      setShowConfirmReplace(true);
      return;
    }
    doPublish();
  }

  const eventColor = CAL_EVENT[tipoPlan]?.bg ?? "#1a3a2a";
  const diasSemana = DIAS_POR_TIPO[tipoPlan];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.45)" }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex w-full max-w-6xl h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* ── Panel izquierdo: chat ── */}
        <div className="flex flex-col w-full sm:w-[420px] shrink-0 border-r border-gray-100">
          <div className="flex items-center justify-between px-4 py-3.5 shrink-0" style={{ backgroundColor: "#1a3a2a" }}>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">Planificar con Paco 🦅</p>
              <p className="text-[11px] text-white/70 truncate">{TIPO_PLAN_LABEL[tipoPlan]} · {diasSemana.map((d) => DIA_LABEL[d]).join("/")}</p>
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="text-white/70 hover:text-white p-1 shrink-0">
              <i className="ti ti-x" style={{ fontSize: 18 }} />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className="max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm"
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
              disabled={isLoading || !planningContext}
              placeholder="Pregúntale a Paco sobre esta semana..."
              className="flex-1 min-w-0 text-sm px-3 py-2 rounded-full border border-gray-200 focus:outline-none focus:border-[#1a3a2a] disabled:opacity-60"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={isLoading || !input.trim() || !planningContext}
              aria-label="Enviar"
              className="flex items-center justify-center w-9 h-9 rounded-full shrink-0 disabled:opacity-40 transition-opacity"
              style={{ backgroundColor: "#1a3a2a" }}
            >
              <i className="ti ti-send" style={{ color: "#ffffff", fontSize: 16 }} />
            </button>
          </div>

        </div>

        {/* ── Panel derecho: vista previa ── */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 shrink-0">
            <p className="text-sm font-semibold text-gray-900">Vista previa</p>
            {preview && <span className="text-xs text-gray-400">Editable antes de publicar</span>}
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {!preview ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-400">
                <p className="text-sm">Responde las preguntas de Paco en el chat — en cuanto tenga suficiente información, la programación aparece aquí lista para editar.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {preview.descripcion_tema && <p className="text-sm text-gray-600 italic">{preview.descripcion_tema}</p>}

                {tipoPlan === "juvenil" && preview.sesion_juvenil && "actividades" in preview.sesion_juvenil && (
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-2.5" style={{ backgroundColor: eventColor }}>
                      <input
                        value={(preview.sesion_juvenil as SesionJuvenilLegacy).nombre_clase}
                        onChange={(e) => updateJuvenil({ nombre_clase: e.target.value })}
                        className="w-full bg-transparent text-white font-semibold text-sm focus:outline-none placeholder-white/60"
                      />
                    </div>
                    <div className="p-4 space-y-3">
                      <textarea
                        value={(preview.sesion_juvenil as SesionJuvenilLegacy).objetivo_simple}
                        onChange={(e) => updateJuvenil({ objetivo_simple: e.target.value })}
                        rows={2}
                        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none"
                        placeholder="Objetivo de la clase"
                      />
                      {(preview.sesion_juvenil as SesionJuvenilLegacy).actividades?.map((a, ai) => (
                        <div key={ai} className="border border-gray-100 rounded-lg p-3 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <input value={a.nombre} onChange={(e) => updateJuvenilActividad(ai, { nombre: e.target.value })} className="flex-1 text-sm font-medium border border-gray-200 rounded px-2 py-1" />
                            <input type="number" value={a.duracion_min} onChange={(e) => updateJuvenilActividad(ai, { duracion_min: Number(e.target.value) })} className="w-16 text-xs border border-gray-200 rounded px-2 py-1" />
                            <span className="text-xs text-gray-400">min</span>
                          </div>
                          <textarea value={a.como_se_juega} onChange={(e) => updateJuvenilActividad(ai, { como_se_juega: e.target.value })} rows={2} className="w-full text-xs border border-gray-200 rounded px-2 py-1 resize-none" />
                        </div>
                      ))}
                      <input
                        value={(preview.sesion_juvenil as SesionJuvenilLegacy).actividad_estrella ?? ""}
                        onChange={(e) => updateJuvenil({ actividad_estrella: e.target.value })}
                        placeholder="Actividad estrella"
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 italic"
                      />
                    </div>
                  </div>
                )}

                {preview.sesiones.map((s, si) => (
                  <div key={si} className="rounded-xl border border-gray-100 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5" style={{ backgroundColor: eventColor }}>
                      <span className="text-white font-semibold text-sm">{DIA_LABEL[s.dia_semana]} · {formatFechaCorta(s.fecha)}</span>
                      <span className="text-white/80 text-xs">{TIPO_SESION_LABEL[s.tipo_sesion] ?? s.tipo_sesion}</span>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="flex gap-2">
                        <input type="time" value={s.hora_inicio} onChange={(e) => updateSesion(si, { hora_inicio: e.target.value })} className="text-xs border border-gray-200 rounded px-2 py-1" />
                        <input type="time" value={s.hora_fin} onChange={(e) => updateSesion(si, { hora_fin: e.target.value })} className="text-xs border border-gray-200 rounded px-2 py-1" />
                        <select value={s.lugar} onChange={(e) => updateSesion(si, { lugar: e.target.value as Lugar })} className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 bg-white">
                          {LUGARES.map((l) => (
                            <option key={l} value={l}>{LUGAR_LABEL[l]}</option>
                          ))}
                        </select>
                      </div>
                      <textarea value={s.objetivo} onChange={(e) => updateSesion(si, { objetivo: e.target.value })} rows={2} placeholder="Objetivo de la sesión" className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 resize-none" />

                      {s.estaciones_damas && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-gray-500">Estaciones</p>
                          {s.estaciones_damas.map((est, ei) => (
                            <div key={ei} className="border border-gray-100 rounded-lg p-2.5 space-y-1.5">
                              <div className="flex gap-2">
                                <input value={est.nombre} onChange={(e) => updateEstacion(si, ei, { nombre: e.target.value })} className="flex-1 text-xs font-medium border border-gray-200 rounded px-2 py-1" />
                                <input type="number" value={est.duracion_min} onChange={(e) => updateEstacion(si, ei, { duracion_min: Number(e.target.value) })} className="w-14 text-xs border border-gray-200 rounded px-2 py-1" />
                              </div>
                              <input value={est.lugar} onChange={(e) => updateEstacion(si, ei, { lugar: e.target.value })} className="w-full text-xs border border-gray-200 rounded px-2 py-1" />
                              <textarea value={est.descripcion} onChange={(e) => updateEstacion(si, ei, { descripcion: e.target.value })} rows={2} className="w-full text-xs border border-gray-200 rounded px-2 py-1 resize-none" />
                            </div>
                          ))}
                        </div>
                      )}

                      {!s.estaciones_damas && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-gray-500">Drills</p>
                            <button onClick={() => addDrill(si)} className="text-xs text-blue-600 hover:underline">+ Agregar</button>
                          </div>
                          {s.drills.map((d, di) => (
                            <div key={di} className="border border-gray-100 rounded-lg p-2.5 space-y-1.5">
                              <div className="flex items-center gap-2">
                                <input value={d.titulo} onChange={(e) => updateDrill(si, di, { titulo: e.target.value })} className="flex-1 text-xs font-medium border border-gray-200 rounded px-2 py-1" placeholder="Título" />
                                <button onClick={() => removeDrill(si, di)} className="text-gray-300 hover:text-red-500 shrink-0">
                                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12" /></svg>
                                </button>
                              </div>
                              <textarea value={d.descripcion} onChange={(e) => updateDrill(si, di, { descripcion: e.target.value })} rows={2} className="w-full text-xs border border-gray-200 rounded px-2 py-1 resize-none" placeholder="Descripción" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {preview && (
            <div className="px-5 py-4 border-t border-gray-100 shrink-0 space-y-2">
              {publishError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{publishError}</p>}
              <button
                onClick={handlePublicarClick}
                disabled={publishing}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "#1a3a2a" }}
              >
                {publishing ? "Publicando..." : "Publicar en calendario"}
              </button>
            </div>
          )}
        </div>
      </div>

      {showConfirmReplace && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <p className="text-sm text-gray-800 mb-5">Ya existe programación para esta semana en este grupo. ¿Quieres reemplazarla?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirmReplace(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={() => { setShowConfirmReplace(false); doPublish(); }}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ backgroundColor: "#b91c1c" }}
              >
                Sí, reemplazar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
