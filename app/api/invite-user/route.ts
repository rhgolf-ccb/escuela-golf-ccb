import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { ADMIN_ROLES, type Rol } from "@/lib/roles";

const VALID_ROLES: Rol[] = [
  "coordinador",
  "profesor",
  "administrativo",
  "padre_competencia",
  "padre_otros",
  "alumno_competencia",
];

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: caller } = await supabase
    .from("app_users")
    .select("rol")
    .eq("id", user.id)
    .maybeSingle();
  if (!caller || !ADMIN_ROLES.includes(caller.rol as Rol)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { email, nombre, rol, estudianteIds } = await request.json();
  if (!email || !rol || !VALID_ROLES.includes(rol)) {
    return NextResponse.json({ error: "email y rol (válido) son requeridos" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("app_users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "ya existe un usuario con ese email" }, { status: 409 });
  }

  const admin = createSupabaseAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message ?? "no se pudo crear el usuario" }, { status: 500 });
  }

  const userId = created.user.id;

  const { error: insertError } = await supabase.from("app_users").insert({
    id: userId,
    email,
    nombre: nombre ?? null,
    rol,
    created_by: user.id,
  });
  if (insertError) {
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  if (Array.isArray(estudianteIds) && estudianteIds.length > 0) {
    await supabase.from("user_estudiantes").insert(
      estudianteIds.map((estudiante_id: string) => ({ user_id: userId, estudiante_id }))
    );
  }

  await supabase.from("access_logs").insert({
    user_id: userId,
    accion: "invite_sent",
    detalle: `invitado por ${user.email ?? user.id} con rol ${rol}`,
  });

  return NextResponse.json({ ok: true, userId });
}
