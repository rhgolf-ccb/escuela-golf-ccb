import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { DIRECTOR_COORD_ROLES, type Rol } from "@/lib/roles";

async function requireDirectorCoord() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };
  const { data: caller } = await supabase.from("app_users").select("rol").eq("id", user.id).maybeSingle();
  const rol = caller?.rol as Rol | undefined;
  if (!rol || !DIRECTOR_COORD_ROLES.includes(rol)) {
    return { error: Response.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { userId: user.id };
}

async function extractTextFromPdf(base64: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("API key no configurada");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          { type: "text", text: "Extrae todo el texto de este documento tal cual, sin resumir ni comentar. Devuelve solo el texto extraído." },
        ],
      }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Error extrayendo texto del PDF");
  return (data.content?.[0]?.text ?? "").trim();
}

export async function GET() {
  const auth = await requireDirectorCoord();
  if (auth.error) return auth.error;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("paco_knowledge").select("*").order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ documentos: data });
}

export async function POST(req: NextRequest) {
  const auth = await requireDirectorCoord();
  if (auth.error) return auth.error;

  const formData = await req.formData();
  const titulo = (formData.get("titulo") as string | null)?.trim();
  const tema = (formData.get("tema") as string | null)?.trim() || null;
  const file = formData.get("archivo") as File | null;

  if (!titulo || !file) {
    return Response.json({ error: "Título y archivo son requeridos" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  let contenido: string;
  try {
    contenido = isPdf ? await extractTextFromPdf(buffer.toString("base64")) : buffer.toString("utf-8");
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Error extrayendo el texto del documento" }, { status: 500 });
  }

  if (!contenido.trim()) {
    return Response.json({ error: "No se pudo extraer texto del documento" }, { status: 500 });
  }

  const admin = createSupabaseAdminClient();
  const ext = isPdf ? "pdf" : "txt";
  const path = `${Date.now()}-${titulo.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.${ext}`;
  const { error: uploadError } = await admin.storage.from("paco-knowledge").upload(path, buffer, {
    contentType: isPdf ? "application/pdf" : "text/plain",
  });
  if (uploadError) return Response.json({ error: `Error subiendo el archivo: ${uploadError.message}` }, { status: 500 });

  const { data: urlData } = admin.storage.from("paco-knowledge").getPublicUrl(path);

  const { data: row, error: insertError } = await admin.from("paco_knowledge").insert({
    titulo, tema, contenido, archivo_url: urlData.publicUrl, activo: true,
  }).select().single();
  if (insertError) return Response.json({ error: insertError.message }, { status: 500 });

  return Response.json({ documento: row });
}
