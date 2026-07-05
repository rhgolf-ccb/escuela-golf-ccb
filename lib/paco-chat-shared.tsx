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

export const MARKDOWN_COMPONENTS = {
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
