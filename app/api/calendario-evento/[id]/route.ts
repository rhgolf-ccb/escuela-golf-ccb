import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { STAFF_ROLES, type Rol } from "@/lib/roles";

async function requireStaff() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };
  const { data: caller } = await supabase.from("app_users").select("rol").eq("id", user.id).maybeSingle();
  const rol = caller?.rol as Rol | undefined;
  if (!rol || !STAFF_ROLES.includes(rol)) {
    return { error: Response.json({ error: "forbidden" }, { status: 403 }) };
  }
  return {};
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const { id } = await params;

  let body: { nombre?: string; fecha_inicio?: string; fecha_fin?: string | null; descripcion?: string | null; tipo?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body JSON inválido" }, { status: 400 });
  }
  const { nombre, fecha_inicio, fecha_fin, descripcion, tipo } = body;
  if (!nombre?.trim() || !fecha_inicio) {
    return Response.json({ error: "Nombre y fecha son requeridos" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("eventos_calendario").update({
    nombre: nombre.trim(), fecha_inicio, fecha_fin: fecha_fin || null,
    descripcion: descripcion?.trim() || null, tipo: tipo === "especial" ? "especial" : "institucional",
  }).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const { id } = await params;

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("eventos_calendario").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
