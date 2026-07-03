import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { generateAuthLink, sendEmailViaResend } from "@/lib/auth-link";

export async function POST(request: NextRequest) {
  const { email } = await request.json();
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "email es requerido" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("app_users")
    .select("nombre, activo, password_set")
    .eq("email", email.trim())
    .maybeSingle();

  if (!data || !data.activo) {
    return NextResponse.json({ ok: true });
  }

  const { link, error: linkError } = await generateAuthLink(email.trim(), request.nextUrl.origin);
  if (linkError || !link) {
    return NextResponse.json({ error: linkError ?? "no se pudo generar el link" }, { status: 500 });
  }

  const nombre = data.nombre ?? null;
  const subject = data.password_set
    ? "Tu enlace de acceso a la Escuela de Golf CCB"
    : "Completa tu acceso a la Escuela de Golf CCB";
  const intro = data.password_set
    ? "Solicitaste un enlace de acceso al portal de la Escuela de Golf CCB."
    : "Aún no has creado tu contraseña. Haz clic para completar tu acceso y crearla.";

  const emailError = await sendEmailViaResend(
    email.trim(),
    subject,
    `<p>Hola${nombre ? ` ${nombre}` : ""},</p>
<p>${intro}</p>
<p><a href="${link}">Ingresar ahora</a></p>
<p>Si el botón no funciona, copia y pega este link en tu navegador:<br>${link}</p>`
  );

  if (emailError) return NextResponse.json({ error: emailError }, { status: 500 });
  return NextResponse.json({ ok: true });
}
