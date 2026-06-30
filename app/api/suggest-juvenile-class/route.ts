import type { NextRequest } from "next/server";

function parseJSON(raw: string): unknown {
  try { return JSON.parse(raw); } catch { /* */ }
  const cleaned = raw.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
  try { return JSON.parse(cleaned); } catch { /* */ }
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* */ } }
  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { fecha, dia_semana, ultima_sesion, contexto_tests } = body;

  const ultimaSesionStr = ultima_sesion
    ? `Objetivo: ${ultima_sesion.objetivo || "—"}, Tipo: ${ultima_sesion.tipo_sesion || "—"}, Lugar: ${ultima_sesion.lugar || "—"}, Fecha: ${ultima_sesion.fecha || "—"}`
    : "No hay registro de última sesión";

  const testsStr = contexto_tests?.length
    ? contexto_tests.map((t: { grupo: string; score_promedio: number; evaluation_date: string }) =>
        `${t.grupo}: score ${t.score_promedio} (${t.evaluation_date})`
      ).join(", ")
    : "Sin datos de tests recientes";

  const system = `Eres el asistente pedagógico de la Escuela de Golf CCB para grupo Juvenil.

Grupos que van juntos:
- Birdies: 4-5 años, primer contacto con golf
- Águilas: 6-8 años, aprendizaje de movimientos
- Albatros: 9-12 años, desarrollo técnico

Última sesión realizada: ${ultimaSesionStr}
Estado tests del grupo: ${testsStr}

Sugiere 3 opciones de tema para la próxima clase. Cada opción debe ser progresiva y coherente con lo último trabajado.

Devuelve SOLO JSON válido, sin texto adicional:
{
  "sugerencias": [
    {
      "id": 1,
      "tema": "string (máx 40 chars)",
      "tipo": "tiro_largo|juego_corto|putt|campo|mixto",
      "lugar": "string (lugar real CCB: Campo de práctica, Putting Green Fundadores, Campo Pacos y Fabios, Campo infantil)",
      "justificacion": "string (1 oración corta — por qué este tema ahora)",
      "recomendada": true
    },
    {
      "id": 2,
      "tema": "string",
      "tipo": "tiro_largo|juego_corto|putt|campo|mixto",
      "lugar": "string",
      "justificacion": "string",
      "recomendada": false
    },
    {
      "id": 3,
      "tema": "string",
      "tipo": "tiro_largo|juego_corto|putt|campo|mixto",
      "lugar": "string",
      "justificacion": "string",
      "recomendada": false
    }
  ]
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system,
      messages: [{ role: "user", content: `Fecha de la clase: ${fecha} (${dia_semana}). Sugiere 3 temas.` }],
    }),
  });

  const aiData = await res.json();
  if (!res.ok) {
    return Response.json({ error: aiData.error?.message ?? "Error IA" }, { status: 500 });
  }

  const raw: string = aiData.content?.[0]?.text ?? "";
  const parsed = parseJSON(raw);
  if (!parsed) return Response.json({ error: "JSON inválido", raw }, { status: 500 });
  return Response.json(parsed);
}
