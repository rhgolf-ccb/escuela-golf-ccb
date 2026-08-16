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
    const { fecha_inicio, fecha_fin, motivo, sesiones_existentes } = body as {
      fecha_inicio?: string; fecha_fin?: string; motivo?: string | null;
      sesiones_existentes?: "borrar" | "conservar";
    };
    if (!fecha_inicio || !fecha_fin) {
      return Response.json({ error: "El rango de fechas es requerido" }, { status: 400 });
    }

    // Marcar un día sin escuela sobre fechas ya programadas dejaba las sesiones
    // huérfanas: seguían saliendo en el PDF de padres. No se borran en silencio
    // — se devuelve el conflicto y el cliente decide.
    const { data: sesiones, error: sesErr } = await admin
      .from("sesiones_semana").select("id, fecha").gte("fecha", fecha_inicio).lte("fecha", fecha_fin);
    if (sesErr) return Response.json({ error: sesErr.message }, { status: 500 });
    if ((sesiones?.length ?? 0) > 0 && !sesiones_existentes) {
      return Response.json({
        needs_confirm: true,
        sesiones: sesiones!.length,
        fechas: [...new Set(sesiones!.map((s) => s.fecha as string))].sort(),
      }, { status: 409 });
    }

    const { data, error } = await admin.from("dias_sin_escuela").insert({
      fecha_inicio, fecha_fin, motivo: motivo?.trim() || null,
    }).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    let sesiones_borradas = 0;
    if (sesiones_existentes === "borrar" && sesiones?.length) {
      const { error: delErr } = await admin.from("sesiones_semana").delete().in("id", sesiones.map((s) => s.id));
      if (delErr) {
        return Response.json({
          dia_sin_escuela: data,
          error: `Se marcó el día sin escuela, pero no se pudieron borrar las sesiones: ${delErr.message}`,
        }, { status: 500 });
      }
      sesiones_borradas = sesiones.length;
    }
    return Response.json({ dia_sin_escuela: data, sesiones_borradas });
  }

  return Response.json({ error: "kind debe ser 'evento' o 'sin_escuela'" }, { status: 400 });
}

async function requireStaff(req: NextRequest): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; res: Response }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, res: Response.json({ error: "unauthorized" }, { status: 401 }) };
  const { data: caller } = await supabase.from("app_users").select("rol").eq("id", user.id).maybeSingle();
  const rol = caller?.rol as Rol | undefined;
  if (!rol || !STAFF_ROLES.includes(rol)) return { ok: false, res: Response.json({ error: "forbidden" }, { status: 403 }) };
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return { ok: false, res: Response.json({ error: "Body JSON inválido" }, { status: 400 }) }; }
  return { ok: true, body };
}

export async function PATCH(req: NextRequest) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.res;
  const { body } = auth;
  const admin = createSupabaseAdminClient();

  if (body.kind === "evento") {
    const { id, nombre, fecha_inicio, fecha_fin, descripcion, tipo } = body as {
      id?: string; nombre?: string; fecha_inicio?: string; fecha_fin?: string | null; descripcion?: string | null; tipo?: string;
    };
    if (!id) return Response.json({ error: "id requerido" }, { status: 400 });
    if (!nombre?.trim() || !fecha_inicio) return Response.json({ error: "Nombre y fecha son requeridos" }, { status: 400 });
    const { data, error } = await admin.from("eventos_calendario").update({
      nombre: nombre.trim(), fecha_inicio, fecha_fin: fecha_fin || null,
      descripcion: descripcion?.trim() || null, tipo: tipo === "especial" ? "especial" : "institucional",
    }).eq("id", id).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ evento: data });
  }

  if (body.kind === "sin_escuela") {
    const { id, fecha_inicio, fecha_fin, motivo } = body as { id?: string; fecha_inicio?: string; fecha_fin?: string; motivo?: string | null };
    if (!id) return Response.json({ error: "id requerido" }, { status: 400 });
    if (!fecha_inicio || !fecha_fin) return Response.json({ error: "El rango de fechas es requerido" }, { status: 400 });
    const { data, error } = await admin.from("dias_sin_escuela").update({
      fecha_inicio, fecha_fin, motivo: motivo?.trim() || null,
    }).eq("id", id).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ dia_sin_escuela: data });
  }

  return Response.json({ error: "kind debe ser 'evento' o 'sin_escuela'" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.res;
  const { kind, id } = auth.body as { kind?: string; id?: string };
  if (!id) return Response.json({ error: "id requerido" }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const tabla = kind === "evento" ? "eventos_calendario" : kind === "sin_escuela" ? "dias_sin_escuela" : null;
  if (!tabla) return Response.json({ error: "kind debe ser 'evento' o 'sin_escuela'" }, { status: 400 });
  const { error } = await admin.from(tabla).delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
