import type { NextRequest } from "next/server";
import { PACO_PLANNING_KNOWLEDGE } from "@/lib/paco-planning-knowledge";

const CATEGORIA_LABEL: Record<string, string> = {
  tiro_largo:     "Tiro Largo — swing en campo de práctica",
  juego_corto:    "Juego Corto — chipping, approach y bunker",
  putt:           "Putting — control de distancia y dirección",
  campo:          "Día de campo — juego real en Pacos y Fabios",
  test_tecnico:   "Test Técnico P1-P10",
  test_fisico:    "Test Físico TPI (evaluación de protocolos)",
  trabajo_fisico: "Trabajo Físico — estación de ejercicios de preparación física",
};

const LUGAR_DEFAULT: Record<string, string> = {
  tiro_largo:     "campo_practica",
  juego_corto:    "campo_practica",
  putt:           "putting_green",
  campo:          "campo_pacos_fabios",
  test_tecnico:   "campo_practica",
  test_fisico:    "campo_practica",
  trabajo_fisico: "campo_practica",
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
  const body = await req.json() as { categoria: string; dia_semana: string; enfoque_fisico?: string[] };
  const { categoria, dia_semana, enfoque_fisico } = body;

  const categoriaLabel = CATEGORIA_LABEL[categoria] ?? categoria;
  const lugar = LUGAR_DEFAULT[categoria] ?? "campo_practica";
  const esTrabajoFisico = categoria === "trabajo_fisico";

  const instruccionCategoria = esTrabajoFisico
    ? `Esta es una estación de TRABAJO FÍSICO — ejercicios de entrenamiento basados en el framework TPI (Titleist Performance Institute), NO drills técnicos de swing y NO es una evaluación (eso es test_fisico, un protocolo de screening TPI distinto — aquí ya sabemos qué trabajar, esto es la sesión de entrenamiento en sí).

Genera 2-3 ejercicios físicos concretos, con series/repeticiones, conectados explícitamente a la lógica TPI (qué screen o cualidad física de golf mejora cada ejercicio y por qué), enfocados específicamente en: ${enfoque_fisico?.length ? enfoque_fisico.join(", ") : "una combinación general de movilidad, estabilidad y potencia apropiada para un adolescente de 13-17 años en desarrollo"}.

EQUIPO DISPONIBLE — la escuela SOLO tiene estos tres elementos, no inventes ni sugieras otros (sin cajones, kettlebells, TRX, etc.):
- Bandas elásticas: activación muscular, movilidad articular, ejercicios de resistencia y prehabilitación
- Balones medicinales: potencia rotacional, ejercicios de core y patrones de transferencia de fuerza tipo golpe de golf
- Palos de entrenamiento de velocidad (swing speed sticks / overspeed training): potencia y velocidad de swing

Elige el equipo más apropiado según el enfoque pedido (ej. Movilidad → bandas elásticas; Potencia → balones medicinales y/o palos de velocidad; Estabilidad/Core → bandas y balones medicinales).`
    : `Genera plan de sesión con drills GENERALES (no hiper-específicos), claros y ejecutables.
- tiro_largo/juego_corto/putt: 2-3 drills prácticos con foco técnico claro.
- campo: actividad de juego (4-6 hoyos, objetivo de score/puntos).
- test_tecnico/test_fisico: protocolo de evaluación simple.`;

  const system = `Entrenador golf junior Competencia CCB (13-17 años, swing en construcción).
CATEGORÍA: ${categoriaLabel} | DÍA: ${dia_semana} | LUGAR: ${lugar}

${instruccionCategoria}

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
