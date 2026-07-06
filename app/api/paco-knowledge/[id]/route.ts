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
  return {};
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireDirectorCoord();
  if (auth.error) return auth.error;
  const { id } = await params;

  let body: { activo?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body JSON inválido" }, { status: 400 });
  }
  if (typeof body.activo !== "boolean") {
    return Response.json({ error: "Falta el campo activo" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("paco_knowledge").update({ activo: body.activo }).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireDirectorCoord();
  if (auth.error) return auth.error;
  const { id } = await params;

  const admin = createSupabaseAdminClient();
  const { data: doc } = await admin.from("paco_knowledge").select("archivo_url").eq("id", id).maybeSingle();
  if (doc?.archivo_url) {
    const marker = "/paco-knowledge/";
    const idx = doc.archivo_url.indexOf(marker);
    if (idx >= 0) {
      const path = doc.archivo_url.slice(idx + marker.length);
      await admin.storage.from("paco-knowledge").remove([path]);
    }
  }

  const { error } = await admin.from("paco_knowledge").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
