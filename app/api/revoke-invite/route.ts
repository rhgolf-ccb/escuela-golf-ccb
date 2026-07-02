import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
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

  const { userId, action } = await request.json();
  if (!userId || (action !== "suspend" && action !== "reactivate")) {
    return NextResponse.json({ error: "userId y action ('suspend' | 'reactivate') son requeridos" }, { status: 400 });
  }
  if (userId === user.id) {
    return NextResponse.json({ error: "no puedes suspender tu propia cuenta" }, { status: 400 });
  }

  const { error } = await supabase
    .from("app_users")
    .update({ activo: action === "reactivate" })
    .eq("id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("access_logs").insert({
    user_id: userId,
    accion: action === "reactivate" ? "reactivated" : "suspended",
    detalle: `por ${user.email ?? user.id}`,
  });

  return NextResponse.json({ ok: true });
}
