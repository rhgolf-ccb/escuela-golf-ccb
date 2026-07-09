export const TOOL_STATUS_LABELS: Record<string, string> = {
  web_search: "🔍 Buscando en internet...",
  buscar_alumno: "👤 Buscando alumno...",
  obtener_tests_alumno: "📋 Cargando tests...",
  obtener_asistencia_alumno: "📅 Revisando asistencia...",
  obtener_notas_alumno: "📝 Cargando notas...",
  obtener_grupo: "👥 Consultando grupo...",
  obtener_sesiones_semana: "🗓️ Revisando programación...",
  obtener_drills: "🏌️ Buscando drills...",
};

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

export function todayISODate(): string {
  return new Date().toISOString().split("T")[0];
}

export const PACO_LIMIT_MESSAGE = "Has alcanzado tu límite diario de consultas. Vuelve mañana 🦅";

export type PlanKind = "torneo" | "festival" | null;

// Detecta planes de torneo/festival por el título fijo que el system prompt
// le exige a Paco (ver PACO_ADVANCED_PLANNING) — permite ofrecer WhatsApp/tag
// de notas sin depender de heurísticas de contenido más frágiles.
export function detectPlanKind(content: string): PlanKind {
  if (/^#{0,3}\s*plan de preparaci[oó]n\s*—/im.test(content)) return "torneo";
  if (/^#{0,3}\s*festival\s*—/im.test(content)) return "festival";
  return null;
}

export function extractPlanTitle(content: string): string {
  const firstLine = content.split("\n").find((l) => l.trim().length > 0) ?? "";
  return firstLine.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim();
}

// Estándar visual de contenido de Paco (chat flotante, modal de perfil de
// alumno, análisis grupal, planificación de programación).
export const MARKDOWN_COMPONENTS = {
  h1: (props: React.ComponentProps<"h1">) => <h1 className="text-base mt-2 mb-2 first:mt-0" style={{ color: "#1a3a2a", fontWeight: 600 }} {...props} />,
  h2: (props: React.ComponentProps<"h2">) => <h2 className="text-[15px] mt-2 mb-2 first:mt-0" style={{ color: "#1a3a2a", fontWeight: 600 }} {...props} />,
  h3: (props: React.ComponentProps<"h3">) => <h3 className="text-sm mt-1.5 mb-2 first:mt-0" style={{ color: "#1a3a2a", fontWeight: 600 }} {...props} />,
  p: (props: React.ComponentProps<"p">) => <p className="mb-1.5 last:mb-0" style={{ lineHeight: 1.6 }} {...props} />,
  ul: (props: React.ComponentProps<"ul">) => <ul className="list-disc pl-5 mb-1.5 space-y-1 last:mb-0" {...props} />,
  ol: (props: React.ComponentProps<"ol">) => <ol className="list-decimal pl-5 mb-1.5 space-y-1 last:mb-0" {...props} />,
  li: (props: React.ComponentProps<"li">) => <li style={{ lineHeight: 1.6 }} {...props} />,
  strong: (props: React.ComponentProps<"strong">) => <strong className="font-semibold" style={{ color: "#1a3a2a" }} {...props} />,
  hr: () => <hr style={{ borderTop: "1px solid #e0e0e0", marginTop: 16, marginBottom: 16 }} />,
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
  td: (props: React.ComponentProps<"td">) => <td className="border px-1.5 py-1" style={{ borderColor: "#e0e0e0" }} {...props} />,
  tr: (props: React.ComponentProps<"tr">) => <tr className="odd:bg-[#f0f5f0]" {...props} />,
  code: (props: React.ComponentProps<"code">) => <code className="text-[11px] bg-gray-100 rounded px-1 py-0.5" {...props} />,
};

export type PacoUsage = { count: number; limit: number | null };
export type StreamEvent = { type: string; tool?: string; text?: string; usedWebSearch?: boolean; usage?: PacoUsage; message?: string };

export async function streamAsesorChat(body: Record<string, unknown>, onEvent: (evt: StreamEvent) => void): Promise<void> {
  const res = await fetch("/api/asesor-golf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    const data = await res.json().catch(() => null);
    onEvent({ type: "limit_reached", usage: data?.usage });
    return;
  }

  if (!res.ok || !res.body) {
    onEvent({ type: "error" });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk.trim();
      if (!line.startsWith("data:")) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()));
      } catch {
        continue;
      }
    }
  }
}
