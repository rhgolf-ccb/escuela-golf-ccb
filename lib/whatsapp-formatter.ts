export type WhatsAppDocType = "analisis_grupal" | "programacion_semanal" | "reporte_alumno" | "plan_drills" | "actividad_especial" | "plan_torneo" | "festival";

const TITLE_EMOJI: Record<WhatsAppDocType, string> = {
  analisis_grupal: "🏌️",
  programacion_semanal: "📅",
  reporte_alumno: "👤",
  plan_drills: "🎯",
  actividad_especial: "🌟",
  plan_torneo: "🏆",
  festival: "🎪",
};

const HEADING_EMOJI: Record<WhatsAppDocType, { pattern: RegExp; emoji: string }[]> = {
  analisis_grupal: [
    { pattern: /alerta|crític|atenci[oó]n|riesgo|urgente/i, emoji: "⚠️" },
    { pattern: /estad[ií]stica|promedio|patr[oó]n|resultado/i, emoji: "📊" },
    { pattern: /recomendaci|enfoque|acci[oó]n|plan/i, emoji: "✅" },
  ],
  programacion_semanal: [
    { pattern: /horario|hora/i, emoji: "🕐" },
    { pattern: /ubicaci|lugar|campo|cancha/i, emoji: "📍" },
    { pattern: /objetivo/i, emoji: "🎯" },
  ],
  reporte_alumno: [
    { pattern: /progreso/i, emoji: "📈" },
    { pattern: /logro/i, emoji: "🏆" },
    { pattern: /observaci|nota/i, emoji: "📝" },
  ],
  plan_drills: [
    { pattern: /ejercicio f[ií]sico|f[ií]sico/i, emoji: "💪" },
    { pattern: /drill/i, emoji: "💪" },
    { pattern: /duraci[oó]n|tiempo|minuto/i, emoji: "⏱️" },
    { pattern: /lugar|ubicaci/i, emoji: "📍" },
  ],
  actividad_especial: [
    { pattern: /horario|hora/i, emoji: "🕐" },
    { pattern: /ubicaci|lugar|campo|cancha/i, emoji: "📍" },
    { pattern: /estaci[oó]n/i, emoji: "🎯" },
    { pattern: /grupo/i, emoji: "👥" },
  ],
  plan_torneo: [
    { pattern: /objetivo/i, emoji: "🎯" },
    { pattern: /m[eé]trica|seguimiento/i, emoji: "📊" },
    { pattern: /recordatorio|[aá]nimo|motiv/i, emoji: "💪" },
    { pattern: /f[ií]sico/i, emoji: "🏋️" },
  ],
  festival: [
    { pattern: /horario|hora|orden del d[ií]a/i, emoji: "🕐" },
    { pattern: /ubicaci|lugar|campo|cancha/i, emoji: "📍" },
    { pattern: /premio/i, emoji: "🏅" },
    { pattern: /puntuaci[oó]n|puntaje/i, emoji: "📊" },
  ],
};

const FOOTER = "Escuela de Golf CCB — escuela.golfccb.com";

function stripMarkdown(content: string): string {
  return content
    .replace(/^\s*(---|\*\*\*)\s*$/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/[*`]/g, "")
    .replace(/—/g, "-")
    .replace(/◆\s*/g, "• ")
    .replace(/^[-]\s+/gm, "• ")
    .replace(/\|/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tagHeadings(content: string, docType: WhatsAppDocType): string {
  const rules = HEADING_EMOJI[docType];
  return content.replace(/^(#{1,6})\s+(.*)$/gm, (_match, _hashes: string, text: string) => {
    const rule = rules.find((r) => r.pattern.test(text));
    return rule ? `${rule.emoji} ${text}` : text;
  });
}

function truncateSmart(text: string, budget: number): string {
  if (text.length <= budget) return text;
  const cut = text.slice(0, budget);
  const lastSentenceEnd = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "), cut.lastIndexOf(".\n"));
  if (lastSentenceEnd > budget * 0.5) return cut.slice(0, lastSentenceEnd + 1).trim();
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : budget).trim()}…`;
}

/**
 * Estándar de mensajes de WhatsApp de la Escuela de Golf CCB. Toda generación
 * de mensaje para compartir por WhatsApp pasa por esta función.
 */
export function formatWhatsAppMessage(content: string, docType: WhatsAppDocType, titulo: string, options?: { maxLen?: number }): string {
  const maxLen = options?.maxLen ?? 800;
  const tituloLine = `${TITLE_EMOJI[docType]} ${titulo}`;
  const body = stripMarkdown(tagHeadings(content, docType));

  const budget = maxLen - tituloLine.length - FOOTER.length - 4;
  const truncatedBody = truncateSmart(body, Math.max(budget, 0));

  return `${tituloLine}\n\n${truncatedBody}\n\n${FOOTER}`;
}

export function openWhatsApp(text: string, phone?: string | null) {
  const digits = phone?.replace(/\D/g, "");
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  window.open(`${base}?text=${encodeURIComponent(text)}`, "_blank");
}
