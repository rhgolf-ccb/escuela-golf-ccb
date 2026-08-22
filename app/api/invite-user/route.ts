import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { generateAuthLink, sendEmailViaResend } from "@/lib/auth-link";
import { ADMIN_ROLES, isStaff, type Rol } from "@/lib/roles";

const VALID_ROLES: Rol[] = [
  "coordinador",
  "director",
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

  const { email, nombre, rol, estudianteIds, password } = await request.json();
  if (!email || !rol || !VALID_ROLES.includes(rol)) {
    return NextResponse.json({ error: "email y rol (válido) son requeridos" }, { status: 400 });
  }

  // Con contraseña, la cuenta queda lista de una: no se manda correo y el
  // coordinador entrega el link de la app y la clave por donde ya habla con la
  // familia (WhatsApp). Sin contraseña se mantiene el camino de siempre —
  // invitación por correo y el usuario crea la suya al entrar.
  const conPassword = typeof password === "string" && password.length > 0;
  if (conPassword && password.length < 8) {
    return NextResponse.json({ error: "la contraseña debe tener mínimo 8 caracteres" }, { status: 400 });
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
    ...(conPassword ? { password } : {}),
  });
  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message ?? "no se pudo crear el usuario" }, { status: 500 });
  }

  const userId = created.user.id;

  let sessionDays: number | null = null;
  if (!isStaff(rol)) {
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
    // Sin esto, proxy.ts lo mandaría a /set-password apenas entre, que es
    // justo el paso que la contraseña inicial se ahorra.
    password_set: conPassword,
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

  let emailWarning: string | null = null;
  if (!conPassword) {
    const { link, error: linkError } = await generateAuthLink(email, request.nextUrl.origin);
    if (linkError || !link) {
      emailWarning = linkError ?? "no se pudo generar el link de acceso";
    } else {
      emailWarning = await sendEmailViaResend(
        email,
        "Tu acceso a la Escuela de Golf CCB",
        `<p>Hola${nombre ? ` ${nombre}` : ""},</p>
<p>Te dieron acceso al portal de la Escuela de Golf CCB.</p>
<p><a href="${link}">Ingresar ahora</a></p>
<p>Si el botón no funciona, copia y pega este link en tu navegador:<br>${link}</p>`
      );
    }
  }

  await supabase.from("access_logs").insert({
    user_id: userId,
    accion: "invite_sent",
    detalle: conPassword
      ? `creado por ${user.email ?? user.id} con rol ${rol} y contraseña inicial (sin correo)`
      : `invitado por ${user.email ?? user.id} con rol ${rol}${emailWarning ? ` (email falló: ${emailWarning})` : ""}`,
  });

  return NextResponse.json({ ok: true, userId, emailWarning, conPassword });
}
