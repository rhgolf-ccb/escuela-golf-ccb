"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/lib/supabase";
import { TOOL_STATUS_LABELS, formatTime, MARKDOWN_COMPONENTS, streamAsesorChat, PACO_LIMIT_MESSAGE } from "@/lib/paco-chat-shared";
import { DRILLS_CATEGORIA_JUVENIL, type CategoriaEstacion, type DrillJuvenilEstacion, type EstacionJuvenil } from "./JuvenileClassModal";
import EstacionLibraryPicker from "./EstacionLibraryPicker";
import {
  toISODate,
  getFechaForDia,
  DIAS_POR_TIPO,
  DIA_LABEL,
  TIPO_SESION_LABEL,
  LUGAR_LABEL,
  TIPO_PLAN_LABEL,
  CAL_EVENT,
  CATEGORIA_ESTACION_LABEL,
  type CategoriaEstacionEspecial,
  type TipoPlan,
  type DiaSemana,
  type TipoSesion,
  type Lugar,
  type Drill,
  type EstacionDamas,
  type PreviewSesion,
  type PlanSemanal,
  type SesionSemana,
  type HorarioDefecto,
} from "./ProgramacionModule";

type Message = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  usedWebSearch?: boolean;
  isError?: boolean;
  isWelcome?: boolean;
};

type JuvenilDiaSemana = "martes" | "miercoles" | "jueves" | "sabado" | "domingo";
type TipoDiaJuvenil = "estaciones" | "solo_putt" | "solo_juego_corto" | "campo" | "test_tecnico" | "test_fisico";
type SesionJuvenilDiaPreview = { dia_semana: JuvenilDiaSemana; tipo: TipoDiaJuvenil; estaciones: EstacionJuvenil[]; notas: string };
const JUVENIL_HORARIOS_COMPARTIDOS: Record<string, string> = {
  sabado: "Aplica para ambos horarios: 9:15 AM y 10:00 AM",
  domingo: "Aplica para ambos horarios: 9:15 AM y 10:00 AM",
};
const TIPO_DIA_JUVENIL_LABEL: Record<TipoDiaJuvenil, string> = {
  estaciones: "3 estaciones",
  solo_putt: "Solo putt",
  solo_juego_corto: "Solo juego corto",
  campo: "Salida al campo",
  test_tecnico: "Test técnico",
  test_fisico: "Test físico",
};

type Preview = { descripcion_tema: string; sesiones: PreviewSesion[]; sesion_juvenil?: SesionJuvenilDiaPreview[] | null };

type RawPlanSesion = {
  dia_semana: DiaSemana; tipo_sesion: TipoSesion; lugar: Lugar;
  hora_inicio?: string; hora_fin?: string; objetivo?: string;
  drills?: Drill[]; juego_competitivo?: string | null;
  estaciones_damas?: EstacionDamas[] | null; notas?: string | null;
};
type RawPlan = {
  descripcion_tema?: string;
  sesion_juvenil?: SesionJuvenilDiaPreview[] | null;
  dias_modificados?: string[];
  sesiones?: RawPlanSesion[];
};

function normalizeDiaJuvenil(d: Partial<SesionJuvenilDiaPreview> & { dia_semana: JuvenilDiaSemana }): SesionJuvenilDiaPreview {
  return {
    dia_semana: d.dia_semana,
    tipo: d.tipo ?? "estaciones",
    estaciones: d.estaciones ?? [],
    notas: d.notas ?? "",
  };
}

// La hora de cada sesión respeta lo que proponga Paco/el profesor cuando es
// válida (ej. el día de campo de Damas, que sí puede tener una hora distinta
// al bloque fijo) — pero si Paco la dejó vacía (el bug típico en Competencia)
// se completa de inmediato con horarios_defecto, para que la vista previa
// nunca muestre un campo de hora en blanco. Publicar aplica la misma regla
// como red de seguridad final en el backend.
function resolverHoraDefecto(horariosDefecto: HorarioDefecto[], tipoPlan: TipoPlan, dia: DiaSemana): { hora_inicio: string; hora_fin: string } {
  const slot = horariosDefecto
    .filter((h) => h.tipo_plan === tipoPlan && h.dia_semana === dia)
    .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))[0];
  return slot ? { hora_inicio: slot.hora_inicio.slice(0, 5), hora_fin: slot.hora_fin.slice(0, 5) } : { hora_inicio: "", hora_fin: "" };
}

function buildPreviewFromPlan(semana: Date, plan: RawPlan, tipoPlan: TipoPlan, horariosDefecto: HorarioDefecto[]): Preview {
  const sesiones: PreviewSesion[] = (plan.sesiones ?? []).map((s) => {
    const horaDefecto = resolverHoraDefecto(horariosDefecto, tipoPlan, s.dia_semana);
    return {
      dia_semana: s.dia_semana,
      fecha: getFechaForDia(semana, s.dia_semana),
      tipo_sesion: s.tipo_sesion,
      lugar: s.lugar,
      hora_inicio: s.hora_inicio || horaDefecto.hora_inicio,
      hora_fin: s.hora_fin || horaDefecto.hora_fin,
      objetivo: s.objetivo ?? "",
      drills: s.drills ?? [],
      juego_competitivo: s.juego_competitivo ?? null,
      estaciones_damas: s.estaciones_damas ?? null,
      notas: s.notas ?? null,
    };
  });
  const sesionJuvenil = plan.sesion_juvenil ? plan.sesion_juvenil.map(normalizeDiaJuvenil) : null;
  return { descripcion_tema: plan.descripcion_tema ?? "", sesiones, sesion_juvenil: sesionJuvenil };
}

// Fusiona una respuesta nueva de Paco con la vista previa actual. Para Juvenil,
// si ya había una vista previa (no es la primera generación) y la respuesta
// declara qué días cambiaron (dias_modificados), solo esos días se reemplazan
// — el resto de la vista previa (incluyendo ediciones manuales del profesor)
// queda intacto en vez de perderse por una regeneración completa. Si el campo
// viene vacío (el modelo lo olvidó), se cae al reemplazo total de siempre para
// no reintroducir el bug de "la vista previa no se actualiza".
function mergePlanPreview(semana: Date, plan: RawPlan, prev: Preview | null, tipoPlan: TipoPlan, horariosDefecto: HorarioDefecto[]): Preview {
  const candidato = buildPreviewFromPlan(semana, plan, tipoPlan, horariosDefecto);
  if (tipoPlan !== "juvenil" || !prev || !prev.sesion_juvenil || !candidato.sesion_juvenil) return candidato;
  const modificados = plan.dias_modificados;
  if (!modificados || modificados.length === 0) return candidato;

  const base = [...prev.sesion_juvenil];
  for (const dia of modificados) {
    const nuevo = candidato.sesion_juvenil.find((d) => d.dia_semana === dia);
    if (!nuevo) continue;
    const idx = base.findIndex((d) => d.dia_semana === dia);
    if (idx >= 0) base[idx] = nuevo;
    else base.push(nuevo);
  }
  return { ...prev, descripcion_tema: candidato.descripcion_tema || prev.descripcion_tema, sesion_juvenil: base };
}

// Resumen en texto plano del estado actual de la vista previa Juvenil, para que
// Paco sepa exactamente qué hay ya generado (incluyendo ediciones manuales del
// profesor) y pueda modificar solo lo pedido en vez de adivinar o regenerar todo.
function resumenPreviewJuvenil(preview: Preview): string {
  if (!preview.sesion_juvenil || preview.sesion_juvenil.length === 0) return "";
  const partes = preview.sesion_juvenil.map((dia) => {
    const label = DIA_LABEL[dia.dia_semana];
    if (dia.tipo !== "estaciones" && dia.tipo !== "solo_putt" && dia.tipo !== "solo_juego_corto") {
      return `${label}: día especial (${TIPO_DIA_JUVENIL_LABEL[dia.tipo]}) — notas: ${dia.notas || "(sin notas)"}`;
    }
    const estaciones = dia.estaciones
      .map((e) => `${CATEGORIA_ESTACION_LABEL[e.categoria as CategoriaEstacionEspecial] ?? e.categoria} [${e.drills.map((d) => d.titulo).join(", ")}] · desafío: ${e.desafio || "(sin desafío)"}`)
      .join(" | ");
    return `${label}: ${estaciones || "(sin estaciones)"}`;
  });
  return `Programación actual en la vista previa (cópiala tal cual salvo lo que el profesor pida cambiar):\n${partes.join("\n")}`;
}

const WELCOME_BY_TIPO: Record<TipoPlan, string> = {
  juvenil: "Listo, vamos con Juvenil esta semana. Marca abajo lo que quieres trabajar y seguimos con la programación.",
  competencia:
    "Perfecto, semana de Competencia. Ya sé que el martes es tiro largo, miércoles putt y campo, jueves juego corto y sábado campo de práctica. Marca abajo lo que aplique esta semana y seguimos.",
  damas: "Vamos con Damas. Marca abajo cómo es la semana y seguimos con la programación.",
};

// ── Opciones rápidas (checkboxes) para el primer turno — evitan que el
// profesor tenga que escribir las respuestas a las preguntas iniciales.
type Torneo = "no" | "1semana" | "2semanas" | "estefinde";
type TipoSemanaDamas = "normal" | "normal_mas_campo" | "solo_campo";

type OpcionesEstado = {
  estaciones: string[];
  enfoqueFisico: string[];
  fisicoComp: boolean;
  torneo: Torneo;
  enfoqueTecnico: string[];
  enfoqueTecnicoOtro: string;
  tipoSemanaDamas: TipoSemanaDamas;
  horaCampoDamas: string;
  bunkerDamas: boolean;
  calentamientoDamas: boolean;
};

const OPCIONES_INICIALES: OpcionesEstado = {
  estaciones: [],
  enfoqueFisico: [],
  fisicoComp: false,
  torneo: "no",
  enfoqueTecnico: [],
  enfoqueTecnicoOtro: "",
  tipoSemanaDamas: "normal",
  horaCampoDamas: "",
  bunkerDamas: false,
  calentamientoDamas: true,
};

const ESTACIONES_JUVENIL = ["Juego largo", "Juego corto", "Putt", "Física"];
const ENFOQUE_FISICO_OPCIONES: Record<"juvenil" | "competencia", string[]> = {
  juvenil: ["Movilidad de cadera y rotación", "Estabilidad de tronco", "Coordinación y equilibrio", "Potencia"],
  competencia: ["Movilidad", "Estabilidad / Core", "Potencia y velocidad", "Prevención de lesiones"],
};
const ENFOQUE_TECNICO_OPCIONES: Record<"juvenil" | "competencia", string[]> = {
  juvenil: [
    "Sway / rotación descentrada (Águilas)",
    "Backswing corto, no llega al hombro (Águilas)",
    "Coordinación general (Birdies)",
    "Contacto con la pelota (Birdies)",
    "Finish en balance (Birdies)",
    "Ninguno en particular",
  ],
  competencia: ["Lag", "Plano del swing", "Setup", "Tempo", "Ninguno en particular"],
};
const TORNEO_OPCIONES: { value: Torneo; label: string }[] = [
  { value: "no", label: "Sin torneo próximo" },
  { value: "1semana", label: "Torneo en 1 semana" },
  { value: "2semanas", label: "Torneo en 2 semanas" },
  { value: "estefinde", label: "Torneo este fin de semana" },
];
const TIPO_SEMANA_DAMAS_OPCIONES: { value: TipoSemanaDamas; label: string }[] = [
  { value: "normal", label: "Sesión normal de viernes" },
  { value: "normal_mas_campo", label: "Viernes + día de campo" },
  { value: "solo_campo", label: "Solo día de campo" },
];

function buildOpcionesMensaje(tipoPlan: TipoPlan, o: OpcionesEstado): string {
  if (tipoPlan === "juvenil") {
    const partes: string[] = [
      o.estaciones.length ? `Estaciones esta semana: ${o.estaciones.join(", ")}.` : "Elige tú las estaciones de esta semana.",
    ];
    if (o.estaciones.includes("Física")) {
      partes.push(o.enfoqueFisico.length ? `Enfoque físico: ${o.enfoqueFisico.join(", ")}.` : "Enfoque físico: el que consideres según el grupo.");
    }
    const tecnico = o.enfoqueTecnico.filter((v) => v !== "Ninguno en particular");
    const otro = o.enfoqueTecnicoOtro.trim();
    partes.push(
      tecnico.length || otro
        ? `Enfoque técnico de la semana: ${[...tecnico, otro].filter(Boolean).join(", ")}.`
        : "Sin un enfoque técnico particular esta semana."
    );
    return partes.join(" ");
  }
  if (tipoPlan === "competencia") {
    const partes: string[] = [
      o.fisicoComp
        ? `Sí, incluyamos estación física${o.enfoqueFisico.length ? ` (enfoque: ${o.enfoqueFisico.join(", ")})` : ""}.`
        : "No incluyamos estación física esta semana.",
      `${TORNEO_OPCIONES.find((t) => t.value === o.torneo)?.label}.`,
    ];
    const tecnico = o.enfoqueTecnico.filter((v) => v !== "Ninguno en particular");
    const otro = o.enfoqueTecnicoOtro.trim();
    partes.push(
      tecnico.length || otro
        ? `Enfoque técnico prioritario: ${[...tecnico, otro].filter(Boolean).join(", ")}.`
        : "Sin un aspecto técnico prioritario esta semana."
    );
    return partes.join(" ");
  }
  // damas
  const tipoSemanaLabel = TIPO_SEMANA_DAMAS_OPCIONES.find((t) => t.value === o.tipoSemanaDamas)?.label;
  const horaLine = o.tipoSemanaDamas !== "normal" && o.horaCampoDamas ? ` (día de campo a las ${o.horaCampoDamas})` : "";
  return [
    `${tipoSemanaLabel}${horaLine}.`,
    o.bunkerDamas ? "Sí, incluyamos bunker en la estación de juego corto." : "No incluyamos bunker esta semana.",
    o.calentamientoDamas ? "Calentamiento estándar con baile y movilidad funcional." : "Sin el calentamiento estándar esta vez.",
  ].join(" ");
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-medium px-3 py-1.5 rounded-full border transition-colors"
      style={active ? { backgroundColor: "#1a3a2a", color: "#fff", borderColor: "#1a3a2a" } : { color: "#6b7280", borderColor: "#e5e7eb", backgroundColor: "#fff" }}
    >
      {children}
    </button>
  );
}

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
  horariosDefecto,
  onClose,
  onPublished,
}: {
  tipoPlan: TipoPlan;
  semana: Date;
  planExistente: PlanSemanal | null;
  sesionesExistentes: SesionSemana[];
  horariosDefecto: HorarioDefecto[];
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
  const inputRef = useRef<HTMLInputElement>(null);

  const [opciones, setOpciones] = useState<OpcionesEstado>(OPCIONES_INICIALES);

  const [preview, setPreview] = useState<Preview | null>(null);

  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [showConfirmReplace, setShowConfirmReplace] = useState(false);
  const [pickerFor, setPickerFor] = useState<{ diaIdx: number; estIdx: number } | null>(null);
  const [editingDiaIdx, setEditingDiaIdx] = useState<number | null>(null);
  const [tipoPendiente, setTipoPendiente] = useState<TipoDiaJuvenil | null>(null);

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
    const resumenActual = tipoPlan === "juvenil" && preview ? resumenPreviewJuvenil(preview) : "";
    const contextoConPreview = resumenActual ? `${planningContext}\n\n${resumenActual}` : planningContext;

    let finalText: string | null = null;
    let usedWebSearch = false;
    let gotError = false;
    let limitReached = false;

    try {
      await streamAsesorChat({ messages: history, planningContext: contextoConPreview }, (evt) => {
        if (evt.type === "tool_status" && evt.tool) setToolStatus(evt.tool);
        else if (evt.type === "plan_preview" && evt.plan) setPreview((prev) => mergePlanPreview(semana, evt.plan as RawPlan, prev, tipoPlan, horariosDefecto));
        else if (evt.type === "done") {
          finalText = evt.text ?? "";
          usedWebSearch = !!evt.usedWebSearch;
        } else if (evt.type === "limit_reached") limitReached = true;
        else if (evt.type === "error") {
          gotError = true;
          if (evt.debug) console.error("Paco planning error debug:", evt.debug);
        }
      });
    } catch (err) {
      gotError = true;
      console.error("Paco planning fetch/stream error:", err);
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

  function toggleOpcionArray(key: "estaciones" | "enfoqueFisico" | "enfoqueTecnico", value: string) {
    setOpciones((prev) => {
      const list = prev[key];
      return { ...prev, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
    });
  }

  function handleSubmitOpciones() {
    sendMessage(buildOpcionesMensaje(tipoPlan, opciones));
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

  function updateJuvenilDrill(diaIdx: number, estIdx: number, drillIdx: number, updates: Partial<DrillJuvenilEstacion>) {
    setPreview((prev) => {
      if (!prev || !prev.sesion_juvenil) return prev;
      const dias = [...prev.sesion_juvenil];
      const estaciones = [...dias[diaIdx].estaciones];
      const drills = [...estaciones[estIdx].drills];
      drills[drillIdx] = { ...drills[drillIdx], ...updates };
      estaciones[estIdx] = { ...estaciones[estIdx], drills };
      dias[diaIdx] = { ...dias[diaIdx], estaciones };
      return { ...prev, sesion_juvenil: dias };
    });
  }

  function removeJuvenilDrill(diaIdx: number, estIdx: number, drillIdx: number) {
    setPreview((prev) => {
      if (!prev || !prev.sesion_juvenil) return prev;
      const dias = [...prev.sesion_juvenil];
      const estaciones = [...dias[diaIdx].estaciones];
      if (estaciones[estIdx].drills.length <= 1) return prev;
      estaciones[estIdx] = { ...estaciones[estIdx], drills: estaciones[estIdx].drills.filter((_, i) => i !== drillIdx) };
      dias[diaIdx] = { ...dias[diaIdx], estaciones };
      return { ...prev, sesion_juvenil: dias };
    });
  }

  function addJuvenilDrillDeBiblioteca(diaIdx: number, estIdx: number, drill: DrillJuvenilEstacion) {
    setPreview((prev) => {
      if (!prev || !prev.sesion_juvenil) return prev;
      const dias = [...prev.sesion_juvenil];
      const estaciones = [...dias[diaIdx].estaciones];
      if (estaciones[estIdx].drills.length >= 3) return prev;
      estaciones[estIdx] = { ...estaciones[estIdx], drills: [...estaciones[estIdx].drills, drill] };
      dias[diaIdx] = { ...dias[diaIdx], estaciones };
      return { ...prev, sesion_juvenil: dias };
    });
  }

  function updateJuvenilDesafio(diaIdx: number, estIdx: number, value: string) {
    setPreview((prev) => {
      if (!prev || !prev.sesion_juvenil) return prev;
      const dias = [...prev.sesion_juvenil];
      const estaciones = [...dias[diaIdx].estaciones];
      estaciones[estIdx] = { ...estaciones[estIdx], desafio: value };
      dias[diaIdx] = { ...dias[diaIdx], estaciones };
      return { ...prev, sesion_juvenil: dias };
    });
  }

  function updateJuvenilNotas(diaIdx: number, value: string) {
    setPreview((prev) => {
      if (!prev || !prev.sesion_juvenil) return prev;
      const dias = [...prev.sesion_juvenil];
      dias[diaIdx] = { ...dias[diaIdx], notas: value };
      return { ...prev, sesion_juvenil: dias };
    });
  }

  function abrirEditorDia(diaIdx: number) {
    const dia = preview?.sesion_juvenil?.[diaIdx];
    setEditingDiaIdx(diaIdx);
    setTipoPendiente(dia?.tipo ?? "estaciones");
  }

  function cerrarEditorDia() {
    setEditingDiaIdx(null);
    setTipoPendiente(null);
  }

  function estacionesIniciales(tipo: TipoDiaJuvenil): EstacionJuvenil[] {
    if (tipo === "solo_putt") return [{ categoria: "putt", drills: [], desafio: "" }];
    if (tipo === "solo_juego_corto") return [{ categoria: "juego_corto", drills: [], desafio: "" }];
    if (tipo === "estaciones") {
      return (["juego_largo", "juego_corto", "putt"] as CategoriaEstacion[]).map((categoria) => ({ categoria, drills: [], desafio: "" }));
    }
    return [];
  }

  function guardarTipoDia(diaIdx: number) {
    if (!tipoPendiente) return;
    setPreview((prev) => {
      if (!prev || !prev.sesion_juvenil) return prev;
      const dias = [...prev.sesion_juvenil];
      const actual = dias[diaIdx];
      if (actual.tipo === tipoPendiente) return prev;
      dias[diaIdx] = {
        ...actual,
        tipo: tipoPendiente,
        estaciones: estacionesIniciales(tipoPendiente),
        notas: "",
      };
      return { ...prev, sesion_juvenil: dias };
    });
    cerrarEditorDia();
  }

  function pedirAPaco(diaIdx: number) {
    const dia = preview?.sesion_juvenil?.[diaIdx];
    if (!dia) return;
    cerrarEditorDia();
    setInput(`Para el ${DIA_LABEL[dia.dia_semana]}: `);
    requestAnimationFrame(() => inputRef.current?.focus());
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
  const hasUserSentMessage = messages.some((m) => m.role === "user");

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

            {!hasUserSentMessage && !isLoading && (
              <div className="rounded-2xl border border-gray-100 p-3.5 space-y-3">
                {tipoPlan === "juvenil" && (
                  <>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1.5">Estaciones esta semana</p>
                      <div className="flex flex-wrap gap-1.5">
                        {ESTACIONES_JUVENIL.map((op) => (
                          <Pill key={op} active={opciones.estaciones.includes(op)} onClick={() => toggleOpcionArray("estaciones", op)}>{op}</Pill>
                        ))}
                      </div>
                    </div>
                    {opciones.estaciones.includes("Física") && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1.5">Enfoque físico</p>
                        <div className="flex flex-wrap gap-1.5">
                          {ENFOQUE_FISICO_OPCIONES.juvenil.map((op) => (
                            <Pill key={op} active={opciones.enfoqueFisico.includes(op)} onClick={() => toggleOpcionArray("enfoqueFisico", op)}>{op}</Pill>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1.5">Enfoque técnico</p>
                      <div className="flex flex-wrap gap-1.5">
                        {ENFOQUE_TECNICO_OPCIONES.juvenil.map((op) => (
                          <Pill key={op} active={opciones.enfoqueTecnico.includes(op)} onClick={() => toggleOpcionArray("enfoqueTecnico", op)}>{op}</Pill>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={opciones.enfoqueTecnicoOtro}
                        onChange={(e) => setOpciones((p) => ({ ...p, enfoqueTecnicoOtro: e.target.value }))}
                        placeholder="Otro (opcional)"
                        className="w-full text-xs px-2 py-1.5 rounded-lg border border-gray-200 mt-1.5"
                      />
                    </div>
                  </>
                )}

                {tipoPlan === "competencia" && (
                  <>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1.5">¿Estación física esta semana?</p>
                      <div className="flex gap-1.5">
                        <Pill active={opciones.fisicoComp} onClick={() => setOpciones((p) => ({ ...p, fisicoComp: true }))}>Sí</Pill>
                        <Pill active={!opciones.fisicoComp} onClick={() => setOpciones((p) => ({ ...p, fisicoComp: false, enfoqueFisico: [] }))}>No</Pill>
                      </div>
                    </div>
                    {opciones.fisicoComp && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1.5">Enfoque físico</p>
                        <div className="flex flex-wrap gap-1.5">
                          {ENFOQUE_FISICO_OPCIONES.competencia.map((op) => (
                            <Pill key={op} active={opciones.enfoqueFisico.includes(op)} onClick={() => toggleOpcionArray("enfoqueFisico", op)}>{op}</Pill>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1.5">Torneo próximo</p>
                      <div className="flex flex-wrap gap-1.5">
                        {TORNEO_OPCIONES.map((t) => (
                          <Pill key={t.value} active={opciones.torneo === t.value} onClick={() => setOpciones((p) => ({ ...p, torneo: t.value }))}>{t.label}</Pill>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1.5">Enfoque técnico prioritario</p>
                      <div className="flex flex-wrap gap-1.5">
                        {ENFOQUE_TECNICO_OPCIONES.competencia.map((op) => (
                          <Pill key={op} active={opciones.enfoqueTecnico.includes(op)} onClick={() => toggleOpcionArray("enfoqueTecnico", op)}>{op}</Pill>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={opciones.enfoqueTecnicoOtro}
                        onChange={(e) => setOpciones((p) => ({ ...p, enfoqueTecnicoOtro: e.target.value }))}
                        placeholder="Otro (opcional)"
                        className="w-full text-xs px-2 py-1.5 rounded-lg border border-gray-200 mt-1.5"
                      />
                    </div>
                  </>
                )}

                {tipoPlan === "damas" && (
                  <>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1.5">Esta semana</p>
                      <div className="flex flex-wrap gap-1.5">
                        {TIPO_SEMANA_DAMAS_OPCIONES.map((t) => (
                          <Pill key={t.value} active={opciones.tipoSemanaDamas === t.value} onClick={() => setOpciones((p) => ({ ...p, tipoSemanaDamas: t.value }))}>{t.label}</Pill>
                        ))}
                      </div>
                      {opciones.tipoSemanaDamas !== "normal" && (
                        <input
                          type="time"
                          value={opciones.horaCampoDamas}
                          onChange={(e) => setOpciones((p) => ({ ...p, horaCampoDamas: e.target.value }))}
                          className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 mt-1.5"
                        />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1.5">¿Bunker en juego corto?</p>
                      <div className="flex gap-1.5">
                        <Pill active={opciones.bunkerDamas} onClick={() => setOpciones((p) => ({ ...p, bunkerDamas: true }))}>Sí</Pill>
                        <Pill active={!opciones.bunkerDamas} onClick={() => setOpciones((p) => ({ ...p, bunkerDamas: false }))}>No</Pill>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1.5">¿Calentamiento estándar con baile y movilidad?</p>
                      <div className="flex gap-1.5">
                        <Pill active={opciones.calentamientoDamas} onClick={() => setOpciones((p) => ({ ...p, calentamientoDamas: true }))}>Sí</Pill>
                        <Pill active={!opciones.calentamientoDamas} onClick={() => setOpciones((p) => ({ ...p, calentamientoDamas: false }))}>No</Pill>
                      </div>
                    </div>
                  </>
                )}

                <button
                  onClick={handleSubmitOpciones}
                  disabled={!planningContext}
                  className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: "#1a3a2a" }}
                >
                  Continuar
                </button>
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

          <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 shrink-0">
            <input
              ref={inputRef}
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
            {preview && (
              isLoading ? (
                <span className="text-xs font-medium flex items-center gap-1.5 animate-pulse" style={{ color: eventColor }}>
                  🔄 Actualizando...
                </span>
              ) : (
                <span className="text-xs text-gray-400">Editable antes de publicar</span>
              )
            )}
          </div>

          <div className={`flex-1 overflow-y-auto px-5 py-4 ${isLoading && preview ? "animate-pulse" : ""}`} style={isLoading && preview ? { boxShadow: `inset 0 0 0 2px ${eventColor}33` } : undefined}>
            {!preview ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-400">
                <p className="text-sm">Responde las preguntas de Paco en el chat — en cuanto tenga suficiente información, la programación aparece aquí lista para editar.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {preview.descripcion_tema && <p className="text-sm text-gray-600 italic">{preview.descripcion_tema}</p>}

                {tipoPlan === "juvenil" && preview.sesion_juvenil?.map((diaPlan, diaIdx) => (
                  <div key={diaPlan.dia_semana} className="rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-2.5 flex items-start justify-between gap-2" style={{ backgroundColor: eventColor }}>
                      <div>
                        <span className="text-white font-semibold text-sm">{DIA_LABEL[diaPlan.dia_semana]}</span>
                        <span className="text-white/70 text-[11px] ml-2">{TIPO_DIA_JUVENIL_LABEL[diaPlan.tipo]}</span>
                        {JUVENIL_HORARIOS_COMPARTIDOS[diaPlan.dia_semana] && (
                          <p className="text-white/70 text-[11px] mt-0.5">{JUVENIL_HORARIOS_COMPARTIDOS[diaPlan.dia_semana]}</p>
                        )}
                      </div>
                      <button
                        onClick={() => (editingDiaIdx === diaIdx ? cerrarEditorDia() : abrirEditorDia(diaIdx))}
                        aria-label={`Editar ${DIA_LABEL[diaPlan.dia_semana]}`}
                        className="text-white/80 hover:text-white shrink-0 p-1"
                      >
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                    </div>

                    {editingDiaIdx === diaIdx && (
                      <div className="p-3 space-y-2.5 bg-gray-50 border-b border-gray-100">
                        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Tipo de día</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(Object.keys(TIPO_DIA_JUVENIL_LABEL) as TipoDiaJuvenil[]).map((t) => (
                            <Pill key={t} active={tipoPendiente === t} onClick={() => setTipoPendiente(t)}>{TIPO_DIA_JUVENIL_LABEL[t]}</Pill>
                          ))}
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button onClick={cerrarEditorDia} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-white">
                            Cancelar
                          </button>
                          <button
                            onClick={() => guardarTipoDia(diaIdx)}
                            disabled={tipoPendiente === diaPlan.tipo}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40"
                            style={{ backgroundColor: eventColor }}
                          >
                            Guardar cambio
                          </button>
                          <button
                            onClick={() => pedirAPaco(diaIdx)}
                            className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium text-purple-700 border border-purple-200 hover:bg-purple-50"
                          >
                            🦅 Pedir a Paco
                          </button>
                        </div>
                        {tipoPendiente && tipoPendiente !== diaPlan.tipo && (
                          <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1.5">
                            Guardar reemplaza el contenido actual de este día por uno vacío del nuevo tipo.
                          </p>
                        )}
                      </div>
                    )}

                    {diaPlan.tipo === "campo" || diaPlan.tipo === "test_tecnico" || diaPlan.tipo === "test_fisico" ? (
                      <div className="p-4">
                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Notas</label>
                        <textarea
                          value={diaPlan.notas}
                          onChange={(e) => updateJuvenilNotas(diaIdx, e.target.value)}
                          rows={3}
                          placeholder="Describe la actividad de este día..."
                          className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 resize-none"
                        />
                      </div>
                    ) : (
                    <div className="p-4 space-y-3">
                      {diaPlan.estaciones.map((est, estIdx) => (
                        <div key={`${est.categoria}-${estIdx}`} className="border border-gray-100 rounded-lg p-3 space-y-2">
                          <p className="text-xs font-bold" style={{ color: eventColor }}>
                            {CATEGORIA_ESTACION_LABEL[est.categoria as CategoriaEstacionEspecial] ?? est.categoria}
                          </p>
                          <div className="space-y-1.5">
                            {est.drills.map((d, di) => (
                              <div key={di} className="border border-gray-100 rounded-lg p-2 bg-gray-50 space-y-1">
                                <div className="flex items-center gap-2">
                                  <input
                                    value={d.titulo}
                                    onChange={(e) => updateJuvenilDrill(diaIdx, estIdx, di, { titulo: e.target.value })}
                                    className="flex-1 text-xs font-medium border border-gray-200 rounded px-2 py-1 bg-white"
                                  />
                                  <button
                                    onClick={() => removeJuvenilDrill(diaIdx, estIdx, di)}
                                    disabled={est.drills.length <= 1}
                                    className="text-gray-300 hover:text-red-500 disabled:opacity-30 shrink-0"
                                  >
                                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12" /></svg>
                                  </button>
                                </div>
                                <textarea
                                  value={d.descripcion}
                                  onChange={(e) => updateJuvenilDrill(diaIdx, estIdx, di, { descripcion: e.target.value })}
                                  rows={2}
                                  className="w-full text-xs border border-gray-200 rounded px-2 py-1 resize-none bg-white"
                                />
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => setPickerFor({ diaIdx, estIdx })}
                            disabled={est.drills.length >= 3}
                            className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-40"
                          >
                            + Agregar de la biblioteca
                          </button>
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Desafío</label>
                            <textarea
                              value={est.desafio}
                              onChange={(e) => updateJuvenilDesafio(diaIdx, estIdx, e.target.value)}
                              rows={2}
                              className="w-full text-xs border border-gray-200 rounded px-2 py-1 resize-none"
                              placeholder="Reto o juego competitivo de cierre"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    )}
                  </div>
                ))}

                {pickerFor && preview.sesion_juvenil && (
                  <EstacionLibraryPicker
                    fuente="drills"
                    categoriaDrills={DRILLS_CATEGORIA_JUVENIL[preview.sesion_juvenil[pickerFor.diaIdx].estaciones[pickerFor.estIdx].categoria as CategoriaEstacion] ?? undefined}
                    grupos={[]}
                    yaSeleccionados={preview.sesion_juvenil[pickerFor.diaIdx].estaciones[pickerFor.estIdx].drills.map((d) => d.titulo)}
                    onAdd={(drill) => { addJuvenilDrillDeBiblioteca(pickerFor.diaIdx, pickerFor.estIdx, drill); setPickerFor(null); }}
                    onClose={() => setPickerFor(null)}
                  />
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
                disabled={publishing || isLoading}
                title={isLoading ? "Esperando actualización de Paco" : undefined}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "#1a3a2a" }}
              >
                {publishing ? "Publicando..." : isLoading ? "Esperando actualización de Paco..." : "Publicar en calendario"}
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
