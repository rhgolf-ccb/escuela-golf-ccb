import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  const { email } = await request.json();
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "email es requerido" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("app_users")
    .select("activo, password_set")
    .eq("email", email.trim())
    .maybeSingle();

  if (!data || !data.activo) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({ found: true, passwordSet: data.password_set });
}
