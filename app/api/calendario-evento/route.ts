import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { STAFF_ROLES, type Rol } from "@/lib/roles";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data: caller } = await supabase.from("app_users").select("rol").eq("id", user.id).maybeSingle();
  const rol = caller?.rol as Rol | undefined;
  if (!rol || !STAFF_ROLES.includes(rol)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  if (body.kind === "evento") {
    const { nombre, fecha_inicio, fecha_fin, descripcion, tipo } = body as {
      nombre?: string; fecha_inicio?: string; fecha_fin?: string | null; descripcion?: string | null; tipo?: string;
    };
    if (!nombre?.trim() || !fecha_inicio) {
      return Response.json({ error: "Nombre y fecha son requeridos" }, { status: 400 });
    }
    const { data, error } = await admin.from("eventos_calendario").insert({
      nombre: nombre.trim(), fecha_inicio, fecha_fin: fecha_fin || null,
      descripcion: descripcion?.trim() || null, tipo: tipo === "especial" ? "especial" : "institucional",
    }).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ evento: data });
  }

  if (body.kind === "sin_escuela") {
    const { fecha_inicio, fecha_fin, motivo } = body as { fecha_inicio?: string; fecha_fin?: string; motivo?: string | null };
    if (!fecha_inicio || !fecha_fin) {
      return Response.json({ error: "El rango de fechas es requerido" }, { status: 400 });
    }
    const { data, error } = await admin.from("dias_sin_escuela").insert({
      fecha_inicio, fecha_fin, motivo: motivo?.trim() || null,
    }).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ dia_sin_escuela: data });
  }

  return Response.json({ error: "kind debe ser 'evento' o 'sin_escuela'" }, { status: 400 });
}
