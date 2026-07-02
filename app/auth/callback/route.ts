import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isStaffRole, type Rol } from "@/lib/roles";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL("/login", request.url));
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const { data: appUser } = await supabase
    .from("app_users")
    .select("rol, activo")
    .eq("id", user.id)
    .maybeSingle();

  if (!appUser || !appUser.activo) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?blocked=1", request.url));
  }

  await supabase.from("app_users").update({ last_sign_in: new Date().toISOString() }).eq("id", user.id);
  await supabase.from("access_logs").insert({
    user_id: user.id,
    accion: "login",
    dispositivo: request.headers.get("user-agent"),
    ip: request.headers.get("x-forwarded-for"),
  });

  const dest = isStaffRole(appUser.rol as Rol) ? "/" : "/mi-perfil";
  return NextResponse.redirect(new URL(dest, request.url));
}
