import type { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "API key no configurada" }, { status: 500 });

  const { descripcion_libre } = await req.json() as { descripcion_libre: string };
  if (!descripcion_libre?.trim()) return Response.json({ error: "descripcion_libre requerida" }, { status: 400 });

  const system = `Eres instructor senior de golf del Country Club de Bogotá.
Organiza la descripción de un drill en formato JSON estructurado para la biblioteca de drills.

Categorías válidas: tecnico, juego_corto, putting, campo
Subcategorías técnico: P1, P2, P3, P4, P5, P6, P7, P8, P9, P10
Subcategorías juego_corto: chipping, bunker, approach, 50-100yds
Subcategorías putting: distancia, direccion, presion
Subcategorías campo: skills, matchplay, scramble
Lugares válidos: campo_practica, putting_green_fundadores, campo_pacos_fabios, campo_infantil
Niveles: birdies, aguilas, albatros, mas14, competencia, damas
Posiciones swing: P1 (setup/postura), P2 (takeaway), P3 (media subida), P4 (top backswing), P5 (inicio downswing), P6 (impacto), P7 (follow through), P8, P9, P10

Devuelve SOLO JSON válido sin backticks ni texto adicional.`;

  const userMsg = `Organiza este drill en el formato estructurado:
"${descripcion_libre}"

Devuelve este JSON:
{
  "titulo": "título conciso del drill (máx 60 chars)",
  "descripcion": "descripción detallada clara para el instructor",
  "categoria": "tecnico|juego_corto|putting|campo",
  "subcategoria": "la subcategoría más específica",
  "posicion_swing": ["P3","P4"] o null si no aplica,
  "nivel_recomendado": ["competencia","mas14"] — lista de niveles apropiados,
  "lugar": "campo_practica|putting_green_fundadores|campo_pacos_fabios|campo_infantil",
  "duracion_minutos": número o null,
  "repeticiones": "ej: 3 series de 10" o null,
  "error_que_corrige": "el error técnico específico que corrige" o null,
  "sensacion_buscada": "la sensación propioceptiva que busca" o null,
  "metrica_exito": "cómo medir si el drill fue exitoso" o null,
  "variante_presion": "cómo agregar presión competitiva" o null,
  "reglas_campo": null o [{"texto":"regla 1"},{"texto":"regla 2"}] si es juego de campo,
  "rating": 3
}`;

  let anthropicRes: Response;
  let apiData: Record<string, unknown>;
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
    apiData = await anthropicRes.json() as Record<string, unknown>;
  } catch (err) {
    return Response.json({ error: "Error conectando con Anthropic", detail: String(err) }, { status: 502 });
  }

  if (!anthropicRes.ok) {
    const msg = (apiData as { error?: { message?: string } }).error?.message || "Error de API";
    return Response.json({ error: msg }, { status: anthropicRes.status });
  }

  const raw = (apiData as { content?: { text?: string }[] }).content?.[0]?.text ?? "";
  let parsed: unknown;
  try { parsed = JSON.parse(raw.trim()); } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    try { parsed = m ? JSON.parse(m[0]) : null; } catch { parsed = null; }
  }

  if (!parsed || typeof parsed !== "object") {
    return Response.json({ error: "Respuesta IA inválida" }, { status: 500 });
  }

  return Response.json({ drill: parsed });
}
