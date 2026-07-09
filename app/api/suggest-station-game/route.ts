import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PACO_PLANNING_KNOWLEDGE } from "@/lib/paco-planning-knowledge";

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
  };
  const { plan_id, categoria } = body;
  const categoriaLabel = CATEGORIA_LABEL[categoria] ?? categoria;

  // ── Query Supabase for drills already used this week in this category ─────
  let titulosUsados: string[] = [];
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
        const fromDB = (data as { sesion_juvenil?: { tipo?: string; estaciones?: { categoria: string; drills?: { titulo: string }[] }[] } | null }[])
          .flatMap((s) => {
            if (s.sesion_juvenil?.tipo !== "estaciones") return [];
            return (s.sesion_juvenil.estaciones ?? [])
              .filter((e) => e.categoria === categoria)
              .flatMap((e) => (e.drills ?? []).map((d) => d.titulo))
              .filter(Boolean);
          });
        titulosUsados = Array.from(new Set(fromDB));
      }
    } catch (err) {
      console.error("[suggest-station-game] Supabase error:", err);
    }
  }

  const usadosLine = titulosUsados.length > 0
    ? `\nDRILLS YA USADOS ESTA SEMANA EN ESTA ESTACIÓN: ${titulosUsados.join(", ")}\nREGLA: No repitas ninguno. Los nuevos deben tener títulos completamente diferentes.`
    : "";

  const system = `Sesión de golf para niños/jóvenes 4-17 años (Birdies 4-5a, Águilas 6-8a, Albatros 9-12a, +14).
ESTACIÓN: ${categoriaLabel}${usadosLine}
Sugiere 2 a 3 drills técnicos concretos y ejecutables para esta estación (no genéricos), y 1 desafío o juego competitivo de cierre apropiado para la edad del grupo.
Devuelve SOLO JSON:
{"drills":[{"titulo":"","descripcion":""}],"desafio":""}

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
      max_tokens: 800,
      system,
      messages: [{ role: "user", content: `Sugiere drills y desafío para: ${categoriaLabel}. [${nonce}]` }],
    }),
  });

  const aiData = await aiRes.json() as { content?: { text: string }[]; error?: { message: string } };
  if (!aiRes.ok) return Response.json({ error: aiData.error?.message ?? "Error IA" }, { status: 500 });

  const raw = aiData.content?.[0]?.text ?? "";
  const parsed = parseJSON(raw) as { drills?: unknown[]; desafio?: string } | null;
  if (!parsed || !Array.isArray(parsed.drills) || parsed.drills.length === 0) {
    return Response.json({ error: "Sin opciones", raw }, { status: 500 });
  }
  return Response.json(parsed);
}
