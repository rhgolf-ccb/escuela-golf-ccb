import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { STAFF_ROLES, type Rol } from "@/lib/roles";

const CATEGORIAS_VALIDAS = ["tecnico", "juego_corto", "putting", "campo"] as const;
type Categoria = (typeof CATEGORIAS_VALIDAS)[number];

const EXTRACT_MODEL = "claude-haiku-4-5";

const EXTRACT_SYSTEM_PROMPT = `Extraes drills de golf de un texto en español escrito por un asesor para un profesor. Un drill es un ejercicio práctico y repetible con instrucciones concretas — no cuentan observaciones generales, diagnósticos o recomendaciones sin estructura de ejercicio.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, sin backticks:
{
  "drills": [
    { "titulo": "nombre corto del drill", "descripcion": "instrucciones de ejecución en 1-3 oraciones", "categoria": "tecnico|juego_corto|putting|campo" }
  ]
}

Si no hay ningún drill identificable en el texto, responde { "drills": [] }.`;

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "API key no configurada" }, { status: 500 });

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data: caller } = await supabase.from("app_users").select("rol").eq("id", user.id).maybeSingle();
  if (!caller || !STAFF_ROLES.includes(caller.rol as Rol)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { text?: string; grupo?: string | null };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body JSON inválido" }, { status: 400 });
  }
  const text = body.text;
  if (!text || typeof text !== "string") {
    return Response.json({ error: "Se requiere el texto a analizar" }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });
  let extracted: { titulo: string; descripcion: string; categoria: string }[] = [];
  try {
    const response = await client.messages.create({
      model: EXTRACT_MODEL,
      max_tokens: 1024,
      system: EXTRACT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
    });
    const raw = response.content.find((b) => b.type === "text")?.text?.trim() ?? "{}";
    let parsed: { drills?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { drills: [] };
    }
    if (Array.isArray(parsed.drills)) {
      extracted = (parsed.drills as Record<string, unknown>[])
        .filter((d) => typeof d.titulo === "string" && typeof d.descripcion === "string")
        .map((d) => ({
          titulo: String(d.titulo).trim(),
          descripcion: String(d.descripcion).trim(),
          categoria: typeof d.categoria === "string" ? d.categoria : "tecnico",
        }));
    }
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Error al analizar el texto" }, { status: 500 });
  }

  if (extracted.length === 0) {
    return Response.json({ inserted: [], skipped: [], mensaje: "No se identificaron drills en esta respuesta." });
  }

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin.from("drills").select("titulo");
  const existingTitles = new Set((existing ?? []).map((d) => d.titulo.trim().toLowerCase()));

  const nuevos = extracted.filter((d) => !existingTitles.has(d.titulo.toLowerCase()));
  const skipped = extracted.filter((d) => existingTitles.has(d.titulo.toLowerCase())).map((d) => d.titulo);

  if (nuevos.length === 0) {
    return Response.json({ inserted: [], skipped, mensaje: "Todos los drills mencionados ya existen en la librería." });
  }

  const payload = nuevos.map((d) => ({
    titulo: d.titulo,
    descripcion: d.descripcion,
    categoria: (CATEGORIAS_VALIDAS as readonly string[]).includes(d.categoria) ? (d.categoria as Categoria) : "tecnico",
    lugar: "campo_practica",
    nivel_recomendado: body.grupo ? [body.grupo] : null,
    generado_por_ia: true,
    aprobado: false,
    created_by: user.id,
  }));

  const { data: inserted, error: insertError } = await admin.from("drills").insert(payload).select("titulo");
  if (insertError) return Response.json({ error: insertError.message }, { status: 500 });

  return Response.json({
    inserted: (inserted ?? []).map((d) => d.titulo),
    skipped,
    mensaje: `Se guardaron ${inserted?.length ?? 0} drill(s) nuevos en la librería (pendientes de aprobación).`,
  });
}
