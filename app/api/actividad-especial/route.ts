import type { NextRequest } from "next/server";
import { PACO_PLANNING_KNOWLEDGE } from "@/lib/paco-planning-knowledge";

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
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const { descripcion, grupos, fecha, drills_ctx } = body as {
    descripcion: string; grupos: string[]; fecha: string; drills_ctx?: string;
  };

  if (!descripcion?.trim()) {
    return Response.json({ error: "Describe la actividad especial que quieres planificar" }, { status: 400 });
  }

  const gruposLabel: Record<string, string> = { juvenil: "Juvenil (Birdies/Águilas/Albatros/+14)", competencia: "Competencia", damas: "Damas" };
  const gruposStr = (grupos ?? []).map((g) => gruposLabel[g] ?? g).join(", ") || "sin especificar";
  const esJoven = (grupos ?? []).includes("juvenil");

  const system = `Eres Paco, asesor experto de golf de la Escuela de Golf CCB. El profesor te pide planificar una ACTIVIDAD ESPECIAL — un evento fuera de la estructura normal de clases (torneo interno, clínica especial, día de campo completo, evaluación masiva, etc.).

Genera el plan con formato libre: cualquier número de estaciones, sin restricciones de estaciones fijas ni días específicos. Usa los drills de la librería disponible cuando haya opciones relevantes y las ubicaciones reales del CCB (Campo de práctica, Putting green Fundadores, Campo Pacos y Fabios, Campo infantil). Nunca uses el término driving range — siempre campo de práctica.
${esJoven ? `\nCuando diseñes juegos para actividades especiales con grupos jóvenes usa lenguaje simple y divertido, nombres creativos para cada juego, reglas claras en máximo 3 pasos y siempre incluye el objetivo de golf de cada juego explicado en términos que un niño de 6 años entienda. Para Summer Camps y festivales el tono es festivo y motivador.\n` : ""}

Grupos participantes: ${gruposStr}
Fecha: ${fecha || "sin especificar"}

Drills disponibles en la librería:
${drills_ctx || "No hay drills aprobados cargados todavía."}

Devuelve SOLO este JSON sin texto extra ni backticks:
{
  "nombre": "nombre de la actividad, ej: Torneo interno de fin de mes",
  "estaciones": [
    { "nombre": "string", "lugar": "string", "horario": "ej: 30 min o 09:00-09:30", "drills": [{"titulo": "string", "descripcion": "string"}] }
  ],
  "notas": "notas adicionales relevantes o null"
}

${PACO_PLANNING_KNOWLEDGE}`;

  const user = `Planifica esta actividad especial: ${descripcion.trim()}`;

  let anthropicRes: Response;
  let apiData: Record<string, unknown>;
  try {
    anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    apiData = await anthropicRes.json() as Record<string, unknown>;
  } catch (err) {
    return Response.json({ error: "Error conectando con Anthropic", detail: String(err) }, { status: 502 });
  }

  if (!anthropicRes.ok) {
    const errMsg = (apiData as { error?: { message?: string } }).error?.message || "Error de API";
    return Response.json({ error: errMsg }, { status: anthropicRes.status });
  }

  const rawText: string = (apiData as { content?: { text?: string }[] }).content?.[0]?.text ?? "";
  const parsed = parseAI(rawText) as { nombre?: string; estaciones?: unknown[]; notas?: string | null } | null;

  if (!parsed?.nombre || !Array.isArray(parsed.estaciones)) {
    return Response.json({ error: "Respuesta IA inválida — no se encontró el plan de la actividad", raw: rawText.slice(0, 1500) }, { status: 500 });
  }

  return Response.json({ nombre: parsed.nombre, estaciones: parsed.estaciones, notas: parsed.notas ?? null });
}
