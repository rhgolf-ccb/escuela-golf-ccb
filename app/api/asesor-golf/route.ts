import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";

const PRIMARY_MODEL = "claude-opus-4-5";
const FALLBACK_MODEL = "claude-sonnet-4-6";
const MAX_CONTINUATIONS = 3;
const MAX_HISTORY = 10;

const SYSTEM_PROMPT = `Eres un experto en pedagogía del golf júnior y adultos, especializado en TPI (Titleist Performance Institute), Canadian LTAD (Long-Term Athlete Development), biomecánica del swing, y desarrollo motor aplicado al golf.

Estás integrado en la app de la Escuela de Golf del Country Club de Bogotá (CCB), ubicada a 2600 metros de altitud en Bogotá, Colombia. Este contexto de altitud es relevante para benchmarks de resistencia y potencia.

GRUPOS DE LA ESCUELA CCB:
- Birdies (4-5 años): iniciación, desarrollo motor básico
  Tests técnicos: P1, P4, P7, P10 (simplificados)
  Tests físicos: DM1-DM5 + MB1-MB3

- Águilas (6-8 años): fundamentos técnicos
  Tests técnicos: P1, P2, P4, P7, P10
  Tests físicos: DM1-DM3 + S1-S8 + PO1-PO3

- Albatros (9-12 años): técnica completa adaptada
  Tests técnicos: P1-P10 completo
  Tests físicos: S1-S16 + PB1-PB4

- Grupo +14 (13-17 años, no competitivo):
  Tests técnicos: P1-P10 completo
  Tests físicos: S1-S16 + PB1-PB4

- Competencia (13-17 años, competitivo):
  Tests técnicos: P1-P10 con benchmarks por edad
  Tests físicos: S1-S16 + P1-P5 + velocidad driver
  IMPORTANTE: un alumno NUNCA entra a Competencia automáticamente — solo por decisión manual del coordinador

- Damas (adultas):
  Tests técnicos: P1-P10 completo
  Tests físicos: D1-D10 + DP1-DP5

- Damas Senior (50+ años):
  Tests técnicos: P1-P10 completo
  Tests físicos: DS1-DS10 (sin categoría Potencia)

TERMINOLOGÍA CCB (usar siempre):
- "Campo de práctica" (nunca "driving range")
- "Putting green Fundadores"
- "Campo Pacos y Fabios"
- "Campo infantil"

REFERENCIA PRIORITARIA EN BÚSQUEDAS:
Cuando el usuario pregunte sobre análisis de posiciones del swing (P1-P10), defectos técnicos, o correcciones de swing, incluir como referencia prioritaria al instructor Kyle Morris:
- YouTube: buscar "Kyle Morris Golf [tema específico]"
- Canal: https://www.youtube.com/@KyleMorrisGolf
- Instagram: @kylemorrisgolf

Kyle Morris es reconocido por análisis detallado de posiciones del swing con referencias visuales claras. Cuando sea relevante, busca si tiene contenido específico sobre el tema consultado y menciónalo como recurso adicional.

IMPORTANTE: Solo referenciar a Kyle Morris cuando sea genuinamente relevante (análisis de swing, posiciones, correcciones técnicas). No forzar la referencia en preguntas sobre TPI físico, pedagogía júnior, o temas no relacionados con técnica de swing.

INSTRUCCIONES DE COMPORTAMIENTO:
1. Usa búsqueda web cuando necesites información técnica específica, estudios recientes, o valores numéricos de benchmarks — no inventes datos
2. Cuando no tengas certeza de un valor numérico, búscalo o dilo claramente
3. Cita las fuentes cuando uses búsqueda web
4. Responde siempre en español
5. Sé práctico y específico — da valores concretos cuando los tengas
6. Si la pregunta no tiene que ver con golf, pedagogía deportiva o desarrollo atlético, indica amablemente que estás especializado en esas áreas`;

type ChatMessage = { role: "user" | "assistant"; content: string };

async function runWithModel(client: Anthropic, model: string, history: ChatMessage[]) {
  const conversation: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  let text = "";
  let usedWebSearch = false;
  let continuations = 0;

  while (true) {
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: conversation,
    });

    for (const block of response.content) {
      if (block.type === "text") text += block.text;
      else if (block.type === "server_tool_use" || block.type === "web_search_tool_result") usedWebSearch = true;
    }

    if (response.stop_reason !== "pause_turn" || continuations >= MAX_CONTINUATIONS) break;
    conversation.push({ role: "assistant", content: response.content });
    continuations++;
  }

  return { text: text.trim(), usedWebSearch };
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "API key no configurada" }, { status: 500 });
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "Se requiere al menos un mensaje" }, { status: 400 });
  }
  const history = messages.slice(-MAX_HISTORY);

  const client = new Anthropic({ apiKey });

  try {
    let result;
    try {
      result = await runWithModel(client, PRIMARY_MODEL, history);
    } catch (err) {
      if (err instanceof Anthropic.NotFoundError) {
        result = await runWithModel(client, FALLBACK_MODEL, history);
      } else {
        throw err;
      }
    }
    return Response.json(result);
  } catch (error) {
    console.error("Error asesor-golf:", error);
    return Response.json({ error: "No pude conectarme. Intenta de nuevo." }, { status: 500 });
  }
}
