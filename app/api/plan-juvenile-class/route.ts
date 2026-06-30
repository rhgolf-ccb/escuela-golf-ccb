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
  const {
    tema, lugar, fecha, dia_semana,
    actividades_ya_usadas_esta_semana = [] as string[],
  } = body as {
    tema: string; lugar: string; fecha: string; dia_semana: string;
    actividades_ya_usadas_esta_semana?: string[];
  };

  const actividadesUsadasLine = actividades_ya_usadas_esta_semana.length > 0
    ? `\n\nACTIVIDADES YA USADAS ESTA SEMANA: ${actividades_ya_usadas_esta_semana.join(", ")}\nIMPORTANTE: No repitas ninguna de estas actividades. Genera 3 opciones NUEVAS y diferentes para mantener la clase interesante.`
    : "";

  const system = `Eres instructor de golf para niños de 4-12 años.
Diseña clases divertidas y dinámicas de 60 min para grupo Juvenil CCB.

Grupos juntos:
- Birdies 4-5a: atención máx 8 min por actividad, necesitan movimiento constante y mucho juego
- Águilas 6-8a: pueden seguir instrucciones simples, les encantan los retos y competencias
- Albatros 9-12a: pueden enfocarse más tiempo, quieren sentirse "buenos" en lo que hacen

TEMA DEL DÍA: ${tema}
LUGAR: ${lugar}${actividadesUsadasLine}

Genera 3 opciones DISTINTAS de clase. Cada opción tiene un nombre diferente y un enfoque creativo único para el mismo tema.
Cada clase tiene máximo 3 actividades. Cada actividad es un JUEGO que trabaja el objetivo sin que el niño lo note.

Ejemplo: si el tema es "swing", en lugar de "drill de backswing" → "Juego del semáforo: el palo se detiene en verde (P3) antes de seguir a rojo (P4)".

Para cada actividad:
- Nombre divertido (no técnico)
- Cómo se juega (muy simple, 2-3 líneas)
- Adaptación Birdies (más fácil/más corto)
- Adaptación Albatros (más retador)
- Cómo se gana o cuál es el reto

Devuelve SOLO JSON válido, sin texto adicional ni backticks:
{
  "opciones": [
    {
      "nombre_clase": "string (ej: 'Día del semáforo')",
      "objetivo_simple": "string (para los padres, ej: 'Practicar el movimiento de subida del palo de forma divertida')",
      "lugar": "${lugar}",
      "actividades": [
        {
          "nombre": "string (divertido, no técnico)",
          "duracion_min": 20,
          "como_se_juega": "string (simple, 2-3 líneas)",
          "adaptacion_birdies": "string",
          "adaptacion_albatros": "string",
          "como_se_gana": "string",
          "materiales": "string"
        }
      ],
      "actividad_estrella": "string (la más divertida — destacarla para los padres)"
    },
    { ... segunda opción diferente ... },
    { ... tercera opción diferente ... }
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
      model: "claude-sonnet-4-6",
      max_tokens: 6000,
      system,
      messages: [{
        role: "user",
        content: `Diseña 3 opciones de clase para ${dia_semana} ${fecha}. Tema: ${tema}. Lugar: ${lugar}.`,
      }],
    }),
  });

  const aiData = await res.json();
  if (!res.ok) {
    return Response.json({ error: aiData.error?.message ?? "Error IA" }, { status: 500 });
  }

  const raw: string = aiData.content?.[0]?.text ?? "";
  const parsed = parseJSON(raw) as { opciones?: unknown[] } | null;
  if (!parsed || !Array.isArray(parsed.opciones) || parsed.opciones.length === 0) {
    return Response.json({ error: "JSON inválido o sin opciones", raw }, { status: 500 });
  }
  return Response.json(parsed);
}
