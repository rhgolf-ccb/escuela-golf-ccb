import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { ADMIN_ROLES, isStaffRole, type Rol } from "@/lib/roles";

const VALID_ROLES: Rol[] = [
  "coordinador",
  "director",
  "profesor",
  "administrativo",
  "padre_competencia",
  "padre_otros",
  "alumno_competencia",
];

async function sendInviteEmail(email: string, nombre: string | null, actionLink: string): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return "RESEND_API_KEY no configurada";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Escuela de Golf CCB <noreply@golfccb.com>",
      to: email,
      subject: "Tu acceso a la Escuela de Golf CCB",
      html: `<p>Hola${nombre ? ` ${nombre}` : ""},</p>
<p>Te dieron acceso al portal de la Escuela de Golf CCB.</p>
<p><a href="${actionLink}">Ingresar ahora</a></p>
<p>Si el botón no funciona, copia y pega este link en tu navegador:<br>${actionLink}</p>`,
    }),
  });
  if (res.ok) return null;
  const body = await res.json().catch(() => ({}));
  return body.message ?? `Resend respondió ${res.status}`;
}

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

  let sessionDays: number | null = null;
  if (!isStaffRole(rol)) {
    const { data: config } = await supabase.from("app_config").select("value").eq("key", "session_days").maybeSingle();
    sessionDays = config?.value ? Number(config.value) : 30;
  }

  const { error: insertError } = await supabase.from("app_users").insert({
    id: userId,
    email,
    nombre: nombre ?? null,
    rol,
    created_by: user.id,
    session_days: sessionDays,
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

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  let emailWarning: string | null = null;
  if (linkError || !linkData?.properties?.hashed_token) {
    emailWarning = "usuario creado pero no se pudo generar el link de acceso";
  } else {
    const actionLink = `${request.nextUrl.origin}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=${linkData.properties.verification_type}`;
    emailWarning = await sendInviteEmail(email, nombre ?? null, actionLink);
  }

  await supabase.from("access_logs").insert({
    user_id: userId,
    accion: "invite_sent",
    detalle: `invitado por ${user.email ?? user.id} con rol ${rol}${emailWarning ? ` (email falló: ${emailWarning})` : ""}`,
  });

  return NextResponse.json({ ok: true, userId, emailWarning });
}
