import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "API key no configurada" }, { status: 500 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const body = await request.json();
  const { imagen_base64, media_type, alumno_id } = body;

  if (!imagen_base64 || !alumno_id) {
    return Response.json({ error: "Faltan datos requeridos" }, { status: 400 });
  }

  const systemPrompt = `Eres un experto en análisis de datos Trackman para golf.
Extrae del pantallazo todos los datos visibles y devuelve SOLO un JSON con esta estructura:
{
  "club_speed_mph": number | null,
  "ball_speed_mph": number | null,
  "smash_factor": number | null,
  "launch_angle_deg": number | null,
  "spin_rate_rpm": number | null,
  "carry_yards": number | null,
  "total_yards": number | null,
  "attack_angle_deg": number | null,
  "club_path_deg": number | null,
  "face_angle_deg": number | null,
  "face_to_path_deg": number | null,
  "club_usado": string | null,
  "notas_adicionales": string | null
}
Si un dato no es visible en la imagen, devuelve null para ese campo. Sin texto extra, solo JSON.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: (media_type as string) || "image/jpeg",
                  data: imagen_base64,
                },
              },
              { type: "text", text: "Extrae todos los datos Trackman visibles en este pantallazo." },
            ],
          },
        ],
      }),
    });

    const apiData = await response.json();
    if (!response.ok) {
      return Response.json({ error: apiData.error?.message || "Error de API" }, { status: response.status });
    }

    const rawText = (apiData.content?.[0]?.text || "").trim();
    let datos;
    try {
      datos = JSON.parse(rawText);
    } catch {
      try {
        const cleaned = rawText.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
        datos = JSON.parse(cleaned);
      } catch {
        try {
          const match = rawText.match(/\{[\s\S]*\}/);
          datos = match ? JSON.parse(match[0]) : { notas_adicionales: rawText };
        } catch {
          datos = { notas_adicionales: rawText };
        }
      }
    }

    const today = new Date().toISOString().split("T")[0];
    const { data: session, error: dbError } = await supabase
      .from("trackman_sessions")
      .insert({ alumno_id, fecha: today, datos })
      .select()
      .single();

    if (dbError) {
      console.error("Error saving trackman session:", dbError);
      return Response.json({ datos, saved: false });
    }

    return Response.json({ datos, session, saved: true });
  } catch (error) {
    console.error("Error trackman-analysis:", error);
    return Response.json({ error: "Error al conectar con el agente IA" }, { status: 500 });
  }
}
