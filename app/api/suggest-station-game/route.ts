import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const CATEGORIA_LABEL: Record<string, string> = {
  juego_largo: "Juego Largo (swing)",
  juego_corto: "Juego Corto (chip/pitch)",
  putt:        "Putting",
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
  const body = await req.json() as {
    plan_id?: string;
    categoria: "juego_largo" | "juego_corto" | "putt";
    juegos_ya_usados?: string[];
  };
  const { plan_id, categoria, juegos_ya_usados: frontendUsados = [] } = body;
  const categoriaLabel = CATEGORIA_LABEL[categoria] ?? categoria;

  // ── Query Supabase for games already used this week in this category ──────
  let nombresUsados: string[] = [...frontendUsados];
  if (plan_id) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data } = await supabase
        .from("sesiones_semana")
        .select("sesion_juvenil")
        .eq("plan_id", plan_id)
        .not("sesion_juvenil", "is", null);

      if (data) {
        const fromDB = (data as { sesion_juvenil?: { tipo?: string; estaciones?: { categoria: string; juego?: { nombre: string } }[] } | null }[])
          .flatMap((s) => {
            if (s.sesion_juvenil?.tipo !== "estaciones") return [];
            return (s.sesion_juvenil.estaciones ?? [])
              .filter((e) => e.categoria === categoria)
              .map((e) => e.juego?.nombre ?? "")
              .filter(Boolean);
          });
        nombresUsados = Array.from(new Set([...nombresUsados, ...fromDB]));
      }
    } catch (err) {
      console.error("[suggest-station-game] Supabase error:", err);
    }
  }

  console.log(`[suggest-station-game] categoria=${categoria}, yaUsados=`, nombresUsados);

  const usadosLine = nombresUsados.length > 0
    ? `\nJUEGOS YA USADOS ESTA SEMANA EN ESTA ESTACIÓN: ${nombresUsados.join(", ")}\nREGLA: No repitas ninguno. Los 3 nuevos deben tener nombres completamente diferentes.`
    : "";

  const system = `Diseña juegos de golf para niños de 4-12 años (Birdies 4-5a, Águilas 6-8a, Albatros 9-12a).

ESTACIÓN: ${categoriaLabel}${usadosLine}

Sugiere 3 juegos DISTINTOS para esta estación. Cada juego:
- Nombre creativo y corto (no términos técnicos de golf)
- Cómo se juega: 2-3 líneas simples
- Adaptación fácil para los Birdies (más pequeños)
- Adaptación retadora para los Albatros (más grandes)

Devuelve SOLO JSON válido sin texto extra:
{
  "opciones": [
    {
      "nombre": "string",
      "como_se_juega": "string",
      "adaptacion_facil": "string",
      "adaptacion_retadora": "string"
    }
  ]
}`;

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
      max_tokens: 1000,
      system,
      messages: [{ role: "user", content: `Sugiere 3 juegos para: ${categoriaLabel}. [${nonce}]` }],
    }),
  });

  const aiData = await aiRes.json() as { content?: { text: string }[]; error?: { message: string } };
  if (!aiRes.ok) return Response.json({ error: aiData.error?.message ?? "Error IA" }, { status: 500 });

  const raw = aiData.content?.[0]?.text ?? "";
  const parsed = parseJSON(raw) as { opciones?: unknown[] } | null;
  if (!parsed || !Array.isArray(parsed.opciones) || parsed.opciones.length === 0) {
    return Response.json({ error: "Sin opciones", raw }, { status: 500 });
  }
  return Response.json(parsed);
}
