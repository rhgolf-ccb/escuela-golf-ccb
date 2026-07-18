import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { STAFF_ROLES, type Rol } from "@/lib/roles";
import { ANTHROPIC_MODEL } from "@/lib/anthropic-model";

type Mensaje = { role: "user" | "assistant"; content: string; timestamp: number };

async function summarize(mensajes: Mensaje[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "";
  const transcript = mensajes.map((m) => `${m.role === "user" ? "Profesor" : "Paco"}: ${m.content}`).join("\n");
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 300,
        messages: [{ role: "user", content: `Resume en 2-3 oraciones, en español, de qué trató esta conversación entre un profesor de golf y Paco (asesor IA). Sé concreto sobre temas y conclusiones. Devuelve solo el resumen, sin introducción.\n\n${transcript}` }],
      }),
    });
    const data = await res.json();
    if (!res.ok) return "";
    return (data.content?.[0]?.text ?? "").trim();
  } catch {
    return "";
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data: caller } = await supabase.from("app_users").select("rol").eq("id", user.id).maybeSingle();
  const rol = caller?.rol as Rol | undefined;
  if (!rol || !STAFF_ROLES.includes(rol)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { student_id?: string | null; mensajes?: Mensaje[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body JSON inválido" }, { status: 400 });
  }
  const mensajes = body.mensajes;
  if (!Array.isArray(mensajes) || mensajes.length === 0) {
    return Response.json({ error: "No hay mensajes para guardar" }, { status: 400 });
  }

  const resumen = await summarize(mensajes);

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("paco_conversaciones").insert({
    student_id: body.student_id || null,
    user_id: user.id,
    rol,
    mensajes,
    resumen: resumen || null,
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
