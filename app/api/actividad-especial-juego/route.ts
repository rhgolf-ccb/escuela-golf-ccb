import type { NextRequest } from "next/server";

const CATEGORIA_LABEL: Record<string, string> = {
  juego_largo: "Juego Largo (tiro largo, drives, hierros)",
  juego_corto: "Juego Corto (chips, pitches, bunker)",
  putt: "Putt (putting green)",
};

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

  const { categoria, grupos, duracion_min, evitar } = body as {
    categoria: string; grupos: string[]; duracion_min: number; evitar?: string[];
  };

  if (!categoria || !CATEGORIA_LABEL[categoria]) {
    return Response.json({ error: `Categoría inválida: "${categoria}"` }, { status: 400 });
  }
  if (!duracion_min || duracion_min <= 0) {
    return Response.json({ error: "duracion_min debe ser mayor a 0" }, { status: 400 });
  }

  const esJoven = (grupos ?? []).includes("juvenil");
  const gruposStr = (grupos ?? []).map((g) => GRUPOS_LABEL[g] ?? g).join(", ") || "sin especificar";
  const evitarStr = evitar?.length ? `\n\nYa se sugirieron estos juegos, no los repitas: ${evitar.join(", ")}.` : "";

  const tonoInstruccion = esJoven
    ? `Cuando diseñes juegos para actividades especiales con grupos jóvenes usa lenguaje simple y divertido, nombres creativos para cada juego, reglas claras en máximo 3 pasos y siempre incluye el objetivo de golf de cada juego explicado en términos que un niño de 6 años entienda. Para Summer Camps y festivales el tono es festivo y motivador.`
    : `El grupo no es infantil — usa lenguaje pedagógico claro y directo, apropiado para adolescentes o adultos, sin infantilizar el contenido.`;

  const system = `Eres Paco, asesor experto de golf de la Escuela de Golf CCB. El profesor está armando una actividad especial con estructura de estaciones y necesita 3 opciones de juego para la estación de ${CATEGORIA_LABEL[categoria]}.

Grupos participantes: ${gruposStr}
Duración de la estación: ${duracion_min} minutos

${tonoInstruccion}

Nunca uses el término driving range — siempre campo de práctica. Usa las ubicaciones reales del CCB (Campo de práctica, Putting green Fundadores, Campo Pacos y Fabios, Campo infantil) en "materiales" o instrucciones si aplica.${evitarStr}

Devuelve SOLO este JSON sin texto extra ni backticks:
{
  "opciones": [
    {
      "nombre": "nombre creativo del juego",
      "objetivo_pedagogico": "qué mejora este juego a nivel técnico/golf",
      "materiales": "materiales necesarios del CCB para este juego",
      "instrucciones_profesor": "cómo organizar y dirigir el juego, paso a paso",
      "explicacion_ninos": "cómo explicárselo directamente a los participantes, en su lenguaje",
      "reglas": ["paso 1", "paso 2", "paso 3 (máximo)"]
    }
  ]
}
El array "opciones" debe tener exactamente 3 elementos.`;

  const user = `Genera 3 opciones de juego para la estación de ${CATEGORIA_LABEL[categoria]}.`;

  let anthropicRes: Response;
  let apiData: Record<string, unknown>;
  try {
    anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
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
  const parsed = parseAI(rawText) as { opciones?: unknown[] } | null;

  if (!parsed?.opciones || !Array.isArray(parsed.opciones) || parsed.opciones.length === 0) {
    return Response.json({ error: "Respuesta IA inválida — no se encontraron opciones de juego", raw: rawText.slice(0, 1500) }, { status: 500 });
  }

  return Response.json({ opciones: parsed.opciones });
}
