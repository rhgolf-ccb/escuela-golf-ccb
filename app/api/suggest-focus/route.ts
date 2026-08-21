import type { NextRequest } from "next/server";
import { ANTHROPIC_MODEL } from "@/lib/anthropic-model";

function parseAI(raw: string): unknown {
  try { return JSON.parse(raw.trim()); } catch { /* */ }
  const stripped = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(stripped); } catch { /* */ }
  const m = stripped.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* */ } }
  return null;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "API key no configurada" }, { status: 500 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const { tipo_plan, mes_actual, contexto_evaluaciones, foco_mes, semana_numero_del_mes, modo } = body as {
    tipo_plan: string;
    mes_actual?: string;
    contexto_evaluaciones?: string;
    foco_mes?: string;
    semana_numero_del_mes?: number;
    modo: "foco" | "tema";
  };

  let system: string;
  let user: string;

  if (modo === "foco") {
    system = `Eres coordinador pedagógico de golf junior CCB. Sugiere opciones de foco mensual para instructores. Devuelve SOLO JSON válido sin backticks ni texto adicional.`;
    user = `Sugiere 4 opciones de foco mensual para el grupo ${tipo_plan} considerando:
- Mes actual: ${mes_actual ?? "mes en curso"}
- Estado evaluaciones: ${contexto_evaluaciones ?? "sin información específica"}

Para Competencia los focos deben ser técnicos y medibles (ej: "Velocidad de swing +5 mph", "Corrección de posición P3").
Para Juvenil más amplios y lúdicos (ej: "Confianza en el short game", "Exploración del campo completo").
Para Birdies (4-5 años) los focos son de juego y desarrollo, nunca técnicos ni medibles (ej: "Le pego y termino parado", "Puntería a un paso", "Girar y pegar jugando"). Nada de vocabulario de swing ni de equipo de adultos: las varas o palos de velocidad, los balones medicinales y las bandas de resistencia no se usan a esta edad.

Devuelve SOLO JSON:
{
  "sugerencias": [
    { "titulo": "string corto (max 6 palabras)", "descripcion_corta": "string de 1 frase explicativa" },
    { "titulo": "string corto (max 6 palabras)", "descripcion_corta": "string de 1 frase explicativa" },
    { "titulo": "string corto (max 6 palabras)", "descripcion_corta": "string de 1 frase explicativa" },
    { "titulo": "string corto (max 6 palabras)", "descripcion_corta": "string de 1 frase explicativa" }
  ]
}`;
  } else {
    system = `Eres coordinador pedagógico de golf junior CCB. Sugiere temas semanales coherentes con el foco del mes dado. Devuelve SOLO JSON válido sin backticks ni texto adicional.`;
    user = `Dado el foco del mes '${foco_mes}' para grupo ${tipo_plan}, sugiere 4 temas para la semana ${semana_numero_del_mes ? `#${semana_numero_del_mes} del mes` : "actual"} que sean coherentes y progresivos.

Para Competencia considera la estructura fija de días:
Mar=tiro largo, Mié=juego corto/mental, Jue=putt/campo, Sáb=campo práctica/torneo.
Para Birdies (4-5 años) los temas son juegos de transferencia al golf (contacto, puntería, equilibrio al terminar el golpe, coordinación con palo y bola) — nunca temas técnicos, ni equipo de adultos (varas de velocidad, balones medicinales, bandas de resistencia).

Devuelve SOLO JSON:
{
  "sugerencias": [
    { "titulo": "string corto (max 6 palabras)", "descripcion_corta": "string de 1 frase explicativa" },
    { "titulo": "string corto (max 6 palabras)", "descripcion_corta": "string de 1 frase explicativa" },
    { "titulo": "string corto (max 6 palabras)", "descripcion_corta": "string de 1 frase explicativa" },
    { "titulo": "string corto (max 6 palabras)", "descripcion_corta": "string de 1 frase explicativa" }
  ]
}`;
  }

  let anthropicRes: Response;
  let apiData: Record<string, unknown>;
  try {
    anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 800,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    apiData = await anthropicRes.json() as Record<string, unknown>;
  } catch (err) {
    console.error("[suggest-focus] Error llamando Anthropic:", err);
    return Response.json({ error: "Error conectando con Anthropic" }, { status: 502 });
  }

  if (!anthropicRes.ok) {
    const errMsg = (apiData as { error?: { message?: string } }).error?.message || "Error de API";
    return Response.json({ error: errMsg }, { status: anthropicRes.status });
  }

  const rawText: string = (apiData as { content?: { text?: string }[] }).content?.[0]?.text ?? "";
  const parsed = parseAI(rawText) as { sugerencias?: { titulo: string; descripcion_corta: string }[] } | null;

  if (!parsed?.sugerencias) {
    return Response.json({ error: "Respuesta IA inválida" }, { status: 500 });
  }

  return Response.json({ sugerencias: parsed.sugerencias });
}
