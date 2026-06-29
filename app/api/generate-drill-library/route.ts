import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

function normalizeLugar(raw: string): string {
  const r = (raw ?? "").toLowerCase().trim();
  if (r.includes("pacos") || r.includes("fabios")) return "campo_pacos_fabios";
  if (r.includes("infantil")) return "campo_infantil";
  if (r.includes("putting") || r.includes("fundadores")) return "putting_green_fundadores";
  return "campo_practica";
}

export async function POST(_req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "API key no configurada" }, { status: 500 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { count } = await supabase.from("drills").select("*", { count: "exact", head: true });
  if ((count ?? 0) > 0) {
    return Response.json(
      { error: "La biblioteca ya tiene drills. Elimina los existentes antes de generar la biblioteca base." },
      { status: 409 }
    );
  }

  const system = `Eres experto en pedagogía de golf con certificación TPI Junior y conocimiento del modelo LTAD (Long-Term Athlete Development).
Diseñas ejercicios progresivos para la Escuela de Golf del Country Club de Bogotá.
Devuelve SOLO un array JSON válido. Sin texto previo, sin backticks, sin comentarios.`;

  const userMsg = `Genera exactamente 52 drills pedagógicos para la biblioteca base de la Escuela de Golf CCB.

DISTRIBUCIÓN OBLIGATORIA:
1. 30 drills TÉCNICOS — 3 drills por cada posición P1 a P10 (total: 10 posiciones × 3 = 30)
   - P1: Setup/Postura, P2: Takeaway, P3: Media subida, P4: Top backswing
   - P5: Inicio downswing, P6: Impacto, P7: Follow through, P8, P9, P10
2. 8 drills JUEGO CORTO — 2 chipping, 2 bunker, 2 approach, 2 de 50-100yds
3. 8 drills PUTTING — 3 distancia, 3 dirección, 2 presión competitiva
4. 6 drills CAMPO (juegos con reglas) — 2 skills, 2 matchplay, 2 scramble

VALORES VÁLIDOS:
- categoria: "tecnico" | "juego_corto" | "putting" | "campo"
- subcategoria técnico: "P1" | "P2" | ... | "P10"
- subcategoria juego_corto: "chipping" | "bunker" | "approach" | "50-100yds"
- subcategoria putting: "distancia" | "direccion" | "presion"
- subcategoria campo: "skills" | "matchplay" | "scramble"
- lugar: "campo_practica" | "putting_green_fundadores" | "campo_pacos_fabios" | "campo_infantil"
- nivel_recomendado: array con uno o más de ["birdies","aguilas","albatros","mas14","competencia","damas"]

CRITERIOS PEDAGÓGICOS TPI:
- Cada drill técnico debe trabajar UN aspecto específico de la posición
- Incluir sensación propioceptiva concreta (qué debe SENTIR el alumno)
- Métrica de éxito observable y medible
- Error técnico específico que corrige
- Rating 1-5 según impacto pedagógico (3=estándar, 4=muy efectivo, 5=excepcional)

FORMATO de cada drill (devuelve array de 52 objetos con exactamente estos campos):
{
  "titulo": "string máx 40 chars",
  "descripcion": "string — instrucciones claras para el instructor, 2-4 oraciones",
  "categoria": "tecnico|juego_corto|putting|campo",
  "subcategoria": "string",
  "posicion_swing": ["P1"] o null (solo para técnico),
  "nivel_recomendado": ["aguilas","albatros"],
  "lugar": "campo_practica|putting_green_fundadores|campo_pacos_fabios|campo_infantil",
  "duracion_minutos": número,
  "repeticiones": "string ej: 3 series de 10",
  "error_que_corrige": "string",
  "sensacion_buscada": "string",
  "metrica_exito": "string",
  "variante_presion": "string o null",
  "reglas_campo": null o [{"texto":"regla"}] SOLO para categoria=campo,
  "rating": 3
}

Devuelve el array JSON completo con los 52 drills.`;

  let anthropicRes: Response;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let apiData: any;
  try {
    anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 16000,
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
  let drillsRaw: any[];
  try {
    const cleaned = raw.replace(/^```json\s*/,"").replace(/^```\s*/,"").replace(/\s*```$/,"").trim();
    const parsed = JSON.parse(cleaned);
    drillsRaw = Array.isArray(parsed) ? parsed : parsed.drills ?? [];
  } catch {
    const m = raw.match(/\[[\s\S]*\]/);
    try { drillsRaw = m ? JSON.parse(m[0]) : []; } catch { drillsRaw = []; }
  }

  if (!drillsRaw.length) {
    return Response.json({ error: "La IA no generó drills válidos" }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = drillsRaw.map((d: any) => ({
    titulo: (String(d.titulo ?? "Drill")).substring(0, 40),
    descripcion: d.descripcion ?? "",
    categoria: d.categoria ?? "tecnico",
    subcategoria: d.subcategoria ?? null,
    posicion_swing: d.posicion_swing ?? null,
    nivel_recomendado: d.nivel_recomendado ?? null,
    lugar: normalizeLugar(d.lugar ?? ""),
    duracion_minutos: d.duracion_minutos ?? null,
    repeticiones: d.repeticiones ?? null,
    error_que_corrige: d.error_que_corrige ?? null,
    sensacion_buscada: d.sensacion_buscada ?? null,
    metrica_exito: d.metrica_exito ?? null,
    variante_presion: d.variante_presion ?? null,
    reglas_campo: d.reglas_campo ?? null,
    rating: d.rating ?? 3,
    aprobado: false,
    generado_por_ia: true,
  }));

  const { data: inserted, error: dbError } = await supabase.from("drills").insert(payload).select("id");

  if (dbError) {
    return Response.json({ error: "Error insertando drills", detail: dbError.message }, { status: 500 });
  }

  return Response.json({ insertados: inserted?.length ?? payload.length });
}
