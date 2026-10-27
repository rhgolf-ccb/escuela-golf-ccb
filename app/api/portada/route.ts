import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { ADMIN_ROLES, type Rol } from "@/lib/roles";
import { PORTADA_BUCKET } from "@/lib/portada";

// Cambiar la foto de Inicio: la ve todo el staff, así que solo la cambian
// coordinador, director y administrativo.
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { data: caller } = await supabase.from("app_users").select("rol").eq("id", user.id).maybeSingle();
  const rol = caller?.rol as Rol | undefined;
  if (!rol || !ADMIN_ROLES.includes(rol)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("foto") as File | null;
  if (!file || !file.type.startsWith("image/")) {
    return Response.json({ error: "Falta la foto" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  // El bucket se crea la primera vez que alguien cambia la foto; así no hace
  // falta migración.
  const { data: bucket } = await admin.storage.getBucket(PORTADA_BUCKET);
  if (!bucket) {
    const { error } = await admin.storage.createBucket(PORTADA_BUCKET, { public: true });
    if (error) return Response.json({ error: `No se pudo crear el espacio de la foto: ${error.message}` }, { status: 500 });
  }

  const { data: anteriores } = await admin.storage.from(PORTADA_BUCKET).list("", { limit: 100 });

  const path = `inicio-${Date.now()}.jpg`;
  const { error: uploadError } = await admin.storage.from(PORTADA_BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
  });
  if (uploadError) return Response.json({ error: `Error subiendo la foto: ${uploadError.message}` }, { status: 500 });

  // Se borran después de subir la nueva: si la subida falla, queda la anterior.
  const viejos = (anteriores ?? []).map((f) => f.name).filter((n) => n !== path);
  if (viejos.length) await admin.storage.from(PORTADA_BUCKET).remove(viejos);

  return Response.json({ url: admin.storage.from(PORTADA_BUCKET).getPublicUrl(path).data.publicUrl });
}
