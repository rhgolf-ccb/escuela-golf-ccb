import type { NextRequest } from "next/server";

const GRUPOS_LABEL: Record<string, string> = {
  juvenil: "Juvenil (Birdies/Águilas/Albatros/+14, niños de 4 a 14 años)",
  competencia: "Competencia (13-17 años, nivel competitivo)",
  damas: "Damas (adultas)",
};

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

  const { grupos, duracion_min } = body as { grupos: string[]; duracion_min: number };
  if (!duracion_min || duracion_min <= 0) {
    return Response.json({ error: "duracion_min debe ser mayor a 0" }, { status: 400 });
  }

  const esJoven = (grupos ?? []).includes("juvenil");
  const gruposStr = (grupos ?? []).map((g) => GRUPOS_LABEL[g] ?? g).join(", ") || "sin especificar";

  const system = `Eres Paco, asesor experto de golf de la Escuela de Golf CCB. El profesor necesita el calentamiento de ${duracion_min} minutos para una actividad especial.

El calentamiento estándar para actividades de golf en la Escuela CCB es movilidad articular con énfasis en caderas y hombros. El calentamiento de 10 minutos debe incluir ejercicios de movilidad articular específicos para golf: rotaciones de cadera, círculos de hombros, rotación de columna torácica, movilidad de muñecas y tobillos. Para grupos jóvenes presentar los ejercicios como juegos o retos (ej. girar las caderas como hula hoop, hacer aspas de molino con los brazos). Siempre incluir 4 a 6 ejercicios con nombre, duración y descripción breve.

Grupos participantes: ${gruposStr}
${esJoven ? "\nEste grupo es infantil — usa nombres de juego/reto para cada ejercicio y lenguaje simple y divertido en la descripción." : "\nEste grupo no es infantil — usa nombres técnicos claros y descripción directa."}

Devuelve SOLO este JSON sin texto extra ni backticks, con la suma de las duraciones igual a ${duracion_min} minutos:
{
  "ejercicios": [
    { "nombre": "string", "duracion_min": 2, "descripcion": "string breve" }
  ]
}
El array "ejercicios" debe tener entre 4 y 6 elementos.`;

  const user = `Genera el calentamiento de ${duracion_min} minutos.`;

  let anthropicRes: Response;
  let apiData: Record<string, unknown>;
  try {
    anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
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
  const parsed = parseAI(rawText) as { ejercicios?: unknown[] } | null;

  if (!parsed?.ejercicios || !Array.isArray(parsed.ejercicios) || parsed.ejercicios.length === 0) {
    return Response.json({ error: "Respuesta IA inválida — no se encontró el calentamiento", raw: rawText.slice(0, 1500) }, { status: 500 });
  }

  return Response.json({ ejercicios: parsed.ejercicios });
}
