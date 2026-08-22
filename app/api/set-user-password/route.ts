import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { ADMIN_ROLES, type Rol } from "@/lib/roles";

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

  const { email, password } = await request.json();
  if (!email || typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "email y password (mínimo 8 caracteres) son requeridos" }, { status: 400 });
  }

  // Sirve para cualquier rol, staff o familia: el coordinador fija la clave y
  // la entrega por donde ya habla con esa persona, sin pasar por el correo.
  const { data: target } = await supabase
    .from("app_users")
    .select("id, rol")
    .eq("email", email)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "no existe un usuario con ese email" }, { status: 404 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(target.id, { password });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("app_users").update({ password_set: true }).eq("id", target.id);

  return NextResponse.json({ ok: true });
}
