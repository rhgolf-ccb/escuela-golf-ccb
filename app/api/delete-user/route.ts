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

  const { userId } = await request.json();
  if (!userId) {
    return NextResponse.json({ error: "userId es requerido" }, { status: 400 });
  }
  if (userId === user.id) {
    return NextResponse.json({ error: "no puedes eliminar tu propia cuenta" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  // access_logs no tiene policy de DELETE para admins, se requiere el cliente con service role.
  const { error: logsError } = await admin.from("access_logs").delete().eq("user_id", userId);
  if (logsError) return NextResponse.json({ error: logsError.message }, { status: 500 });

  const { error: vinculosError } = await supabase.from("user_estudiantes").delete().eq("user_id", userId);
  if (vinculosError) return NextResponse.json({ error: vinculosError.message }, { status: 500 });

  const { error: appUserError } = await supabase.from("app_users").delete().eq("id", userId);
  if (appUserError) return NextResponse.json({ error: appUserError.message }, { status: 500 });

  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
