import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isStaffRole, type Rol } from "@/lib/roles";

export async function POST(request: NextRequest) {
  const { email } = await request.json();
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "email es requerido" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("app_users")
    .select("rol, activo")
    .eq("email", email.trim())
    .maybeSingle();

  if (!data || !data.activo) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({ found: true, isStaff: isStaffRole(data.rol as Rol) });
}
