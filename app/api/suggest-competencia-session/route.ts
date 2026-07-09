import type { NextRequest } from "next/server";
import { PACO_PLANNING_KNOWLEDGE } from "@/lib/paco-planning-knowledge";

const CATEGORIA_LABEL: Record<string, string> = {
  tiro_largo:   "Tiro Largo — swing en campo de práctica",
  juego_corto:  "Juego Corto — chipping, approach y bunker",
  putt:         "Putting — control de distancia y dirección",
  campo:        "Día de campo — juego real en Pacos y Fabios",
  test_tecnico: "Test Técnico P1-P10",
  test_fisico:  "Test Físico TPI",
};

const LUGAR_DEFAULT: Record<string, string> = {
  tiro_largo:   "campo_practica",
  juego_corto:  "campo_practica",
  putt:         "putting_green",
  campo:        "campo_pacos_fabios",
  test_tecnico: "campo_practica",
  test_fisico:  "campo_practica",
};

function parseJSON(raw: string): unknown {
  try { return JSON.parse(raw); } catch { /* */ }
  const cleaned = raw.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
  try { return JSON.parse(cleaned); } catch { /* */ }
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* */ } }
  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { categoria: string; dia_semana: string };
  const { categoria, dia_semana } = body;

  const categoriaLabel = CATEGORIA_LABEL[categoria] ?? categoria;
  const lugar = LUGAR_DEFAULT[categoria] ?? "campo_practica";

  const system = `Entrenador golf junior Competencia CCB (13-17 años, swing en construcción).
CATEGORÍA: ${categoriaLabel} | DÍA: ${dia_semana} | LUGAR: ${lugar}

Genera plan de sesión con drills GENERALES (no hiper-específicos), claros y ejecutables.
- tiro_largo/juego_corto/putt: 2-3 drills prácticos con foco técnico claro.
- campo: actividad de juego (4-6 hoyos, objetivo de score/puntos).
- test: protocolo de evaluación simple.

Devuelve SOLO JSON válido:
{
  "foco_principal": "string (1 línea clara)",
  "lugar": "${lugar}",
  "drills": [
    { "titulo": "string", "descripcion": "string (2 líneas)", "duracion_min": 20, "repeticiones": "string" }
  ],
  "juego_competitivo": "string o null"
}

${PACO_PLANNING_KNOWLEDGE}`;

  const nonce = Math.random().toString(36).slice(2, 8);
  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    cache: "no-store",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: `Sesión ${dia_semana} — ${categoriaLabel}. [${nonce}]` }],
    }),
  });

  const aiData = await aiRes.json() as { content?: { text: string }[]; error?: { message: string } };
  if (!aiRes.ok) return Response.json({ error: aiData.error?.message ?? "Error IA" }, { status: 500 });

  const raw = aiData.content?.[0]?.text ?? "";
  const parsed = parseJSON(raw) as { foco_principal?: string; drills?: unknown[] } | null;
  if (!parsed?.foco_principal) return Response.json({ error: "Respuesta IA inválida", raw }, { status: 500 });

  return Response.json({ ...parsed, lugar });
}
