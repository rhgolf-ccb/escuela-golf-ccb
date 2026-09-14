import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { STAFF_ROLES, type Rol } from "@/lib/roles";
import { TIPOS_PLAN, type TipoPlan } from "@/lib/grupos";

// Un evento o un día sin clase puede ser de toda la escuela o de unos grupos.
// null es "toda la escuela" — se distingue del arreglo vacío que llega cuando
// el profesor no marcó ninguno, y que significa lo mismo.
function normalizarGrupos(raw: unknown): TipoPlan[] | null {
  if (!Array.isArray(raw)) return null;
  const validos = raw.filter((g): g is TipoPlan => TIPOS_PLAN.includes(g as TipoPlan));
  return validos.length ? validos : null;
}

// Sesiones ya programadas dentro del rango que se va a marcar sin clase. Con
// grupos, solo cuentan las de esos grupos: apagar el martes de Competencia no
// puede reportar como conflicto la clase de Damas de ese mismo día.
async function sesionesEnRango(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  fechaInicio: string, fechaFin: string, grupos: TipoPlan[] | null,
): Promise<{ data?: { id: string; fecha: string }[]; error?: string }> {
  const { data, error } = await admin
    .from("sesiones_semana")
    .select("id, fecha, planes_semanales!inner(tipo_plan)")
    .gte("fecha", fechaInicio)
    .lte("fecha", fechaFin);
  if (error) return { error: error.message };
  const filas = (data ?? []) as unknown as {
    id: string; fecha: string; planes_semanales: { tipo_plan: string } | { tipo_plan: string }[];
  }[];
  const tipoDe = (f: (typeof filas)[number]) =>
    Array.isArray(f.planes_semanales) ? f.planes_semanales[0]?.tipo_plan : f.planes_semanales?.tipo_plan;
  return {
    data: filas
      .filter((f) => !grupos || grupos.includes(tipoDe(f) as TipoPlan))
      .map((f) => ({ id: f.id, fecha: f.fecha })),
  };
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  if (body.kind === "evento") {
    const { nombre, fecha_inicio, fecha_fin, descripcion, tipo, sin_clase, sesiones_existentes } = body as {
      nombre?: string; fecha_inicio?: string; fecha_fin?: string | null; descripcion?: string | null; tipo?: string;
      sin_clase?: boolean; sesiones_existentes?: "borrar" | "conservar";
    };
    const grupos = normalizarGrupos(body.grupos);
    if (!nombre?.trim() || !fecha_inicio) {
      return Response.json({ error: "Nombre y fecha son requeridos" }, { status: 400 });
    }

    // El torneo del sábado es un evento Y un día sin clase. Se escriben las dos
    // filas de un solo golpe: pedirle al profesor que cargue lo mismo dos veces
    // era justo por donde se colaba el día que la familia veía a medias.
    const rangoFin = fecha_fin || fecha_inicio;
    if (sin_clase) {
      const { data: sesiones, error: sesErr } = await sesionesEnRango(admin, fecha_inicio, rangoFin, grupos);
      if (sesErr) return Response.json({ error: sesErr }, { status: 500 });
      if ((sesiones?.length ?? 0) > 0 && !sesiones_existentes) {
        return Response.json({
          needs_confirm: true,
          sesiones: sesiones!.length,
          fechas: [...new Set(sesiones!.map((s) => s.fecha))].sort(),
        }, { status: 409 });
      }
      if (sesiones_existentes === "borrar" && sesiones?.length) {
        const { error: delErr } = await admin.from("sesiones_semana").delete().in("id", sesiones.map((s) => s.id));
        if (delErr) return Response.json({ error: delErr.message }, { status: 500 });
      }
    }

    const { data, error } = await admin.from("eventos_calendario").insert({
      nombre: nombre.trim(), fecha_inicio, fecha_fin: fecha_fin || null,
      descripcion: descripcion?.trim() || null, tipo: tipo === "especial" ? "especial" : "institucional",
      grupos,
    }).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    let dia_sin_escuela = null;
    if (sin_clase) {
      const { data: sinFila, error: sinErr } = await admin.from("dias_sin_escuela").insert({
        fecha_inicio, fecha_fin: rangoFin, motivo: nombre.trim(), grupos,
      }).select().single();
      if (sinErr) {
        return Response.json({
          evento: data,
          error: `El evento quedó guardado, pero no se pudo marcar el día sin clase: ${sinErr.message}`,
        }, { status: 500 });
      }
      dia_sin_escuela = sinFila;
    }
    return Response.json({ evento: data, dia_sin_escuela });
  }

  if (body.kind === "sin_escuela") {
    const { fecha_inicio, fecha_fin, motivo, sesiones_existentes } = body as {
      fecha_inicio?: string; fecha_fin?: string; motivo?: string | null;
      sesiones_existentes?: "borrar" | "conservar";
    };
    const grupos = normalizarGrupos(body.grupos);
    if (!fecha_inicio || !fecha_fin) {
      return Response.json({ error: "El rango de fechas es requerido" }, { status: 400 });
    }

    // Marcar un día sin escuela sobre fechas ya programadas dejaba las sesiones
    // huérfanas: seguían saliendo en el PDF de padres. No se borran en silencio
    // — se devuelve el conflicto y el cliente decide.
    const { data: sesiones, error: sesErr } = await sesionesEnRango(admin, fecha_inicio, fecha_fin, grupos);
    if (sesErr) return Response.json({ error: sesErr }, { status: 500 });
    if ((sesiones?.length ?? 0) > 0 && !sesiones_existentes) {
      return Response.json({
        needs_confirm: true,
        sesiones: sesiones!.length,
        fechas: [...new Set(sesiones!.map((s) => s.fecha))].sort(),
      }, { status: 409 });
    }

    const { data, error } = await admin.from("dias_sin_escuela").insert({
      fecha_inicio, fecha_fin, motivo: motivo?.trim() || null, grupos,
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
      grupos: normalizarGrupos(body.grupos),
    }).eq("id", id).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ evento: data });
  }

  if (body.kind === "sin_escuela") {
    const { id, fecha_inicio, fecha_fin, motivo } = body as { id?: string; fecha_inicio?: string; fecha_fin?: string; motivo?: string | null };
    if (!id) return Response.json({ error: "id requerido" }, { status: 400 });
    if (!fecha_inicio || !fecha_fin) return Response.json({ error: "El rango de fechas es requerido" }, { status: 400 });
    const { data, error } = await admin.from("dias_sin_escuela").update({
      fecha_inicio, fecha_fin, motivo: motivo?.trim() || null, grupos: normalizarGrupos(body.grupos),
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
