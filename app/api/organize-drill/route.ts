import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

function normalizeLugar(raw: string): string {
  const r = (raw ?? "").toLowerCase().trim();
  if (r.includes("pacos") || r.includes("fabios")) return "campo_pacos_fabios";
  if (r.includes("infantil")) return "campo_infantil";
  if (r.includes("putting") || r.includes("fundadores")) return "putting_green_fundadores";
  return "campo_practica";
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "API key no configurada" }, { status: 500 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { descripcion_libre } = await req.json() as { descripcion_libre: string };
  if (!descripcion_libre?.trim()) return Response.json({ error: "descripcion_libre requerida" }, { status: 400 });

  const system = `Eres experto en pedagogía de golf y metodología TPI (Titleist Performance Institute) para desarrollo de jóvenes golfistas.
Organizas descripciones de drills en formato JSON estructurado para la biblioteca de entrenamiento de la Escuela de Golf del Country Club de Bogotá.

Categorías válidas:
- tecnico: drills de swing (posiciones P1-P10)
- juego_corto: chipping, bunker, approach, 50-100yds
- putting: distancia, direccion, presion
- campo: juegos en el campo (skills, matchplay, scramble)

Lugares — devuelve el valor exacto:
- "campo_practica" → Campo de práctica principal (tiro largo, posiciones de swing)
- "putting_green_fundadores" → Putting Green de los Fundadores
- "campo_pacos_fabios" → Campo Pacos & Fabios (campo corto par 3)
- "campo_infantil" → Campo Infantil (niños más pequeños)

Niveles disponibles: birdies (6-8 años), aguilas (9-11 años), albatros (12-14 años), mas14 (+14 años), competencia, damas

Posiciones swing TPI: P1 (setup/postura), P2 (takeaway), P3 (media subida), P4 (top backswing), P5 (inicio downswing), P6 (impacto), P7 (follow through), P8, P9, P10

Devuelve SOLO JSON válido sin backticks ni texto adicional.`;

  const userMsg = `Organiza este drill en el formato estructurado:
"${descripcion_libre}"

Devuelve exactamente este JSON:
{
  "titulo": "título conciso del drill (máx 40 chars)",
  "descripcion": "descripción detallada y clara para el instructor con pasos de ejecución",
  "categoria": "tecnico|juego_corto|putting|campo",
  "subcategoria": "la subcategoría más específica (ej: P3, chipping, distancia, matchplay)",
  "posicion_swing": ["P3","P4"] o null si no es drill técnico de swing,
  "nivel_recomendado": ["competencia","mas14"] — lista de niveles apropiados,
  "lugar": "campo_practica|putting_green_fundadores|campo_pacos_fabios|campo_infantil",
  "duracion_minutos": número entero o null,
  "repeticiones": "ej: 3 series de 10" o null,
  "error_que_corrige": "el error técnico específico que corrige" o null,
  "sensacion_buscada": "la sensación propioceptiva o clave de movimiento que busca" o null,
  "metrica_exito": "cómo medir objetivamente si el drill fue exitoso" o null,
  "variante_presion": "cómo agregar presión competitiva al drill" o null,
  "reglas_campo": null o [{"texto":"regla 1"},{"texto":"regla 2"}] SOLO si es juego de campo (categoria=campo),
  "rating": número del 1 al 5 según utilidad pedagógica TPI
}`;

  let anthropicRes: Response;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let apiData: any;
  try {
    anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    apiData = await anthropicRes.json();
  } catch (err) {
    return Response.json({ error: "Error conectando con Anthropic", detail: String(err) }, { status: 502 });
  }

  if (!anthropicRes.ok) {
    return Response.json({ error: apiData?.error?.message || "Error de API" }, { status: anthropicRes.status });
  }

  const raw = (apiData.content?.[0]?.text ?? "").trim();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    try { parsed = m ? JSON.parse(m[0]) : null; } catch { parsed = null; }
  }

  if (!parsed || typeof parsed !== "object") {
    return Response.json({ error: "Respuesta IA inválida" }, { status: 500 });
  }

  parsed.lugar = normalizeLugar(parsed.lugar ?? "");

  const { data: saved, error: dbError } = await supabase.from("drills").insert({
    titulo: (String(parsed.titulo ?? "Drill sin título")).substring(0, 40),
    descripcion: parsed.descripcion ?? "",
    categoria: parsed.categoria ?? "tecnico",
    subcategoria: parsed.subcategoria ?? null,
    posicion_swing: parsed.posicion_swing ?? null,
    nivel_recomendado: parsed.nivel_recomendado ?? null,
    lugar: parsed.lugar,
    duracion_minutos: parsed.duracion_minutos ?? null,
    repeticiones: parsed.repeticiones ?? null,
    error_que_corrige: parsed.error_que_corrige ?? null,
    sensacion_buscada: parsed.sensacion_buscada ?? null,
    metrica_exito: parsed.metrica_exito ?? null,
    variante_presion: parsed.variante_presion ?? null,
    reglas_campo: parsed.reglas_campo ?? null,
    rating: parsed.rating ?? 3,
    aprobado: false,
    generado_por_ia: true,
  }).select().single();

  if (dbError) {
    return Response.json({ error: "Error guardando en base de datos", detail: dbError.message }, { status: 500 });
  }

  return Response.json({ drill: saved });
}
