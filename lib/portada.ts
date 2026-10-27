import { createSupabaseAdminClient } from "@/lib/supabase-admin";

// La foto de fondo de Inicio. Vive en un bucket público propio; cada cambio
// sube un archivo con nombre nuevo (inicio-<timestamp>.jpg) y borra los
// anteriores, así la URL cambia sola y ni el CDN de Supabase ni el
// optimizador de next/image sirven la foto vieja. Sin archivo en el bucket
// se usa la foto original que viene con la app.
export const PORTADA_BUCKET = "portada";
export const PORTADA_DEFAULT = "/hero-ccb.jpg";

export async function getPortadaUrl(): Promise<string> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(PORTADA_BUCKET)
    .list("", { limit: 1, sortBy: { column: "name", order: "desc" }, search: "inicio-" });
  // Si el bucket todavía no existe (nadie ha cambiado la foto) list devuelve
  // error: no es un fallo, es la foto de siempre.
  if (error || !data?.[0]) return PORTADA_DEFAULT;
  return admin.storage.from(PORTADA_BUCKET).getPublicUrl(data[0].name).data.publicUrl;
}
