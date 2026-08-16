import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { STAFF_ROLES, type Rol } from "@/lib/roles";

// Mover programación ya guardada, en vez de borrarla y rehacerla: plan_id y
// sesion_id son ON DELETE CASCADE hacia reservas, así que recrear la sesión
// perdería las reservas de los alumnos. El movimiento entero vive en dos
// funciones de Postgres (ver supabase/migrations/20260816_mover_programacion.sql)
// para que sea atómico: con updates sueltos, un fallo a mitad deja el plan en
// una semana y sus sesiones en otra.

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

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

// Las funciones SQL devuelven jsonb con una de tres formas: {error},
// {needs_confirm, ...} o el resultado del movimiento.
function responderRpc(data: unknown): Response {
  const res = (data ?? {}) as Record<string, unknown>;
  if (res.error) return Response.json(res, { status: 400 });
  if (res.needs_confirm) return Response.json(res, { status: 409 });
  return Response.json(res);
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.res;
  const { body } = auth;
  const admin = createSupabaseAdminClient();

  if (body.kind === "semana") {
    const { plan_id, nueva_semana_inicio, conflicto } = body as {
      plan_id?: string; nueva_semana_inicio?: string; conflicto?: string;
    };
    if (!plan_id) return Response.json({ error: "plan_id requerido" }, { status: 400 });
    if (!nueva_semana_inicio || !FECHA_RE.test(nueva_semana_inicio)) {
      return Response.json({ error: "nueva_semana_inicio debe ser una fecha YYYY-MM-DD" }, { status: 400 });
    }
    if (conflicto && conflicto !== "cancelar" && conflicto !== "reemplazar") {
      return Response.json({ error: 'conflicto debe ser "cancelar" o "reemplazar"' }, { status: 400 });
    }
    const { data, error } = await admin.rpc("mover_plan_semana", {
      p_plan_id: plan_id,
      p_nueva_semana: nueva_semana_inicio,
      p_conflicto: conflicto ?? null,
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return responderRpc(data);
  }

  if (body.kind === "dia") {
    const { sesion_id, nueva_fecha, reemplazar } = body as {
      sesion_id?: string; nueva_fecha?: string; reemplazar?: boolean;
    };
    if (!sesion_id) return Response.json({ error: "sesion_id requerido" }, { status: 400 });
    if (!nueva_fecha || !FECHA_RE.test(nueva_fecha)) {
      return Response.json({ error: "nueva_fecha debe ser una fecha YYYY-MM-DD" }, { status: 400 });
    }
    const { data, error } = await admin.rpc("mover_sesion_dia", {
      p_sesion_id: sesion_id,
      p_nueva_fecha: nueva_fecha,
      p_reemplazar: reemplazar === true,
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return responderRpc(data);
  }

  return Response.json({ error: 'kind debe ser "semana" o "dia"' }, { status: 400 });
}
