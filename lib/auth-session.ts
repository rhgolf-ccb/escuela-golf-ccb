import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isStaffRole, type Rol } from "@/lib/roles";

export async function finalizePostAuthRedirect(
  supabase: SupabaseClient,
  request: NextRequest
): Promise<NextResponse> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const { data: appUser } = await supabase
    .from("app_users")
    .select("rol, activo, password_set")
    .eq("id", user.id)
    .maybeSingle();

  if (!appUser || !appUser.activo) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?blocked=1", request.url));
  }

  const admin = createSupabaseAdminClient();
  await admin.from("app_users").update({ last_sign_in: new Date().toISOString() }).eq("id", user.id);
  await supabase.from("access_logs").insert({
    user_id: user.id,
    accion: "login",
    dispositivo: request.headers.get("user-agent"),
    ip: request.headers.get("x-forwarded-for"),
  });

  const dest = !appUser.password_set
    ? "/set-password"
    : isStaffRole(appUser.rol as Rol) ? "/" : "/mi-perfil";
  return NextResponse.redirect(new URL(dest, request.url));
}
