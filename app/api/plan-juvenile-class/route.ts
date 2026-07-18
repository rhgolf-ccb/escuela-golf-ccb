import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ANTHROPIC_MODEL } from "@/lib/anthropic-model";

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseJSON(raw: string): unknown {
  try { return JSON.parse(raw); } catch { /* */ }
  const cleaned = raw.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
  try { return JSON.parse(cleaned); } catch { /* */ }
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* */ } }
  return null;
}

// ── Route ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    plan_id?: string;
    tema: string; lugar: string; fecha: string; dia_semana: string;
    actividades_ya_usadas_esta_semana?: string[];
  };
  const {
    plan_id,
    tema, lugar, fecha, dia_semana,
    actividades_ya_usadas_esta_semana: actividadesFrontend = [],
  } = body;

  // ── 1. Query Supabase for activities already used this week ──────────────
  let nombresUsados: string[] = [];

  if (plan_id) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data: sesiones, error } = await supabase
        .from("sesiones_semana")
        .select("sesion_juvenil")
        .eq("plan_id", plan_id)
        .not("sesion_juvenil", "is", null);

      if (error) {
        console.error("[plan-juvenile-class] Supabase error:", error.message);
      } else {
        nombresUsados = (sesiones ?? [])
          .flatMap((s: { sesion_juvenil?: { actividades?: { nombre: string }[] } | null }) =>
            s.sesion_juvenil?.actividades?.map((a) => a.nombre) ?? []
          )
          .filter((n): n is string => Boolean(n));
        console.log("[plan-juvenile-class] Actividades ya usadas (DB):", nombresUsados);
      }
    } catch (err) {
      console.error("[plan-juvenile-class] Error querying Supabase:", err);
    }
  }

  // Merge with frontend list as fallback
  const todasUsadas = Array.from(new Set([...nombresUsados, ...actividadesFrontend]));
  console.log("[plan-juvenile-class] Total actividades a evitar:", todasUsadas);

  // ── 2. Build system prompt ────────────────────────────────────────────────
  const actividadesUsadasLine = todasUsadas.length > 0
    ? `\n\nACTIVIDADES YA USADAS ESTA SEMANA: ${todasUsadas.join(", ")}

REGLA OBLIGATORIA: Ninguna de las 3 opciones puede usar ningún nombre de esta lista, ni variaciones mínimas de esos nombres. Deben ser actividades conceptualmente diferentes, con nombres completamente nuevos.`
    : "";

  const system = `Eres instructor de golf para niños de 4-12 años.
Diseña clases divertidas y dinámicas de 60 min para grupo Juvenil CCB.

Grupos juntos:
- Birdies 4-5a: atención máx 8 min por actividad, necesitan movimiento constante y mucho juego
- Águilas 6-8a: pueden seguir instrucciones simples, les encantan los retos y competencias
- Albatros 9-12a: pueden enfocarse más tiempo, quieren sentirse "buenos" en lo que hacen

TEMA DEL DÍA: ${tema}
LUGAR: ${lugar}${actividadesUsadasLine}

Genera 3 opciones DISTINTAS de clase. Cada opción tiene un nombre diferente y un enfoque creativo único.
Cada clase tiene exactamente 3 actividades. Cada actividad es un JUEGO que trabaja el objetivo sin que el niño lo note.
Las 3 opciones deben tener nombres de actividades completamente distintos entre sí.

Devuelve SOLO JSON válido, sin texto adicional ni backticks:
{
  "opciones": [
    {
      "nombre_clase": "string",
      "objetivo_simple": "string (para los padres, 1 línea)",
      "lugar": "${lugar}",
      "actividades": [
        {
          "nombre": "string (nombre divertido, corto)",
          "duracion_min": 20,
          "como_se_juega": "string (2-3 líneas)",
          "adaptacion_birdies": "string (1 línea)",
          "adaptacion_albatros": "string (1 línea)",
          "como_se_gana": "string (1 línea)",
          "materiales": "string (1 línea)"
        }
      ],
      "actividad_estrella": "string (nombre de la actividad más divertida)"
    },
    { },
    { }
  ]
}`;

  console.log("[plan-juvenile-class] System prompt length:", system.length);

  // ── 3. Call Anthropic ─────────────────────────────────────────────────────
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
      model: ANTHROPIC_MODEL,
      max_tokens: 1500,
      system,
      messages: [{
        role: "user",
        content: `Genera 3 opciones para ${dia_semana} ${fecha}. Tema: ${tema}. [${nonce}]`,
      }],
    }),
  });

  const aiData = await aiRes.json() as {
    content?: { text: string }[];
    error?: { message: string };
  };
  if (!aiRes.ok) {
    console.error("[plan-juvenile-class] Anthropic error:", aiData.error?.message);
    return Response.json({ error: aiData.error?.message ?? "Error IA" }, { status: 500 });
  }

  const raw: string = aiData.content?.[0]?.text ?? "";
  console.log("[plan-juvenile-class] Raw response length:", raw.length);

  const parsed = parseJSON(raw) as { opciones?: unknown[] } | null;
  if (!parsed || !Array.isArray(parsed.opciones) || parsed.opciones.length === 0) {
    console.error("[plan-juvenile-class] JSON parse failed. Raw:", raw.slice(0, 300));
    return Response.json({ error: "JSON inválido o sin opciones", raw }, { status: 500 });
  }

  return Response.json(parsed);
}
