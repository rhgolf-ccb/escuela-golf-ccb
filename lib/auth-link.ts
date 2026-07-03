import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function generateAuthLink(email: string, origin: string): Promise<{ link: string | null; error: string | null }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data?.properties?.hashed_token) {
    return { link: null, error: error?.message ?? "no se pudo generar el link de acceso" };
  }
  const link = `${origin}/auth/confirm?token_hash=${data.properties.hashed_token}&type=${data.properties.verification_type}`;
  return { link, error: null };
}

export async function sendEmailViaResend(to: string, subject: string, html: string): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return "RESEND_API_KEY no configurada";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Escuela de Golf CCB <noreply@golfccb.com>", to, subject, html }),
  });
  if (res.ok) return null;
  const body = await res.json().catch(() => ({}));
  return body.message ?? `Resend respondió ${res.status}`;
}
