import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ANTHROPIC_MODEL } from "@/lib/anthropic-model";

function normalizeLugar(raw: string): string {
  const r = (raw ?? "").toLowerCase().trim();
  if (r.includes("pacos") || r.includes("fabios")) return "campo_pacos_fabios";
  if (r.includes("infantil")) return "campo_infantil";
  if (r.includes("putting") || r.includes("fundadores")) return "putting_green_fundadores";
  return "campo_practica";
}

function parseJsonArray(raw: string): unknown[] {
  const attempts = [
    raw.trim(),
    raw.replace(/```json/gi, "").replace(/```/g, "").trim(),
  ];
  for (const s of attempts) {
    try {
      const p = JSON.parse(s);
      if (Array.isArray(p)) return p;
      if (p && Array.isArray(p.drills)) return p.drills;
    } catch { /* continue */ }
  }
  const m = raw.match(/\[[\s\S]*\]/);
  if (m) {
    try {
      const p = JSON.parse(m[0]);
      return Array.isArray(p) ? p : [];
    } catch { /* continue */ }
  }
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeDrill(d: any) {
  return {
    titulo: String(d.titulo ?? "Drill").substring(0, 40),
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
  };
}

const SYSTEM = `Eres experto en pedagogía de golf con certificación TPI Junior y conocimiento del modelo LTAD.
Diseñas ejercicios progresivos para la Escuela de Golf del Country Club de Bogotá.
Devuelve SOLO un array JSON válido. Sin texto previo, sin backticks, sin comentarios.`;

const DRILL_SCHEMA = `{
  "titulo": "string máx 40 chars",
  "descripcion": "instrucciones claras 2-4 oraciones para el instructor",
  "categoria": "tecnico|juego_corto|putting|campo",
  "subcategoria": "string",
  "posicion_swing": ["P1"] o null,
  "nivel_recomendado": ["aguilas","albatros"],
  "lugar": "campo_practica|putting_green_fundadores|campo_pacos_fabios|campo_infantil",
  "duracion_minutos": número entero,
  "repeticiones": "3 series de 10",
  "error_que_corrige": "string",
  "sensacion_buscada": "string",
  "metrica_exito": "string medible",
  "variante_presion": "string o null",
  "reglas_campo": null o [{"texto":"regla"}],
  "rating": 3
}`;

async function claudeCall(apiKey: string, prompt: string): Promise<unknown[]> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data?.error?.message ?? `Error API ${res.status}`);
  const raw = (data.content?.[0]?.text ?? "").trim();
  const drills = parseJsonArray(raw);
  if (!drills.length) throw new Error("La IA no devolvió drills válidos (respuesta vacía o malformada)");
  return drills;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function insertBatch(supabase: any, drills: any[]): Promise<number> {
  const { data, error } = await supabase
    .from("drills")
    .insert(drills.map(normalizeDrill))
    .select("id");
  if (error) throw new Error(`Error DB: ${error.message}`);
  return data?.length ?? drills.length;
}

// ── Batch generators ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function batchTecnico(apiKey: string, supabase: any): Promise<number> {
  const p1p5 = await claudeCall(apiKey, `Genera exactamente 15 drills TÉCNICOS de swing — 3 drills por cada posición P1 a P5.

Posiciones:
- P1 Setup/Postura: alineación, posición corporal, agarre, distancia al balón
- P2 Takeaway: inicio del swing, posición del palo en los primeros 30cm, rotación de hombros
- P3 Media subida: posición del palo paralelo al suelo en backswing, plano de swing
- P4 Top backswing: posición en lo alto del backswing, rotación de caderas vs hombros
- P5 Inicio downswing: transición, inicio de cadera, lag del palo

Haz 3 drills por posición con dificultad progresiva (básico → intermedio → avanzado).
Todos: lugar "campo_practica", categoria "tecnico", posicion_swing con la posición correspondiente.
Criterios TPI: error específico que corrige, sensación propioceptiva clara, métrica observable.

Devuelve array JSON de exactamente 15 objetos:
${DRILL_SCHEMA}`);

  const inserted1 = await insertBatch(supabase, p1p5);

  const p6p10 = await claudeCall(apiKey, `Genera exactamente 15 drills TÉCNICOS de swing — 3 drills por cada posición P6 a P10.

Posiciones:
- P6 Impacto: posición del cuerpo y palo en el momento del impacto, compresión del balón
- P7 Follow through: extensión de brazos después del impacto, rotación de antebrazo
- P8 Post-impacto: rotación de cadera y hombro hacia el target
- P9 Final del swing / acabada: posición del cuerpo en el finish
- P10 Balance y finish: balance sobre pierna delantera, postura final completa

Haz 3 drills por posición con dificultad progresiva (básico → intermedio → avanzado).
Todos: lugar "campo_practica", categoria "tecnico", posicion_swing con la posición correspondiente.
Criterios TPI: error específico que corrige, sensación propioceptiva clara, métrica observable.

Devuelve array JSON de exactamente 15 objetos:
${DRILL_SCHEMA}`);

  const inserted2 = await insertBatch(supabase, p6p10);
  return inserted1 + inserted2;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function batchJuegoCorto(apiKey: string, supabase: any): Promise<number> {
  const drills = await claudeCall(apiKey, `Genera exactamente 8 drills de JUEGO CORTO para la Escuela de Golf CCB.

Distribución exacta:
- 2 drills de chipping (subcategoria "chipping") — contacto limpio, distancia, aterrizaje
- 2 drills de bunker (subcategoria "bunker") — entrada a la arena, distancia de seguimiento
- 2 drills de approach (subcategoria "approach") — 30-80yds, control de altura y spin
- 2 drills de 50-100yds (subcategoria "50-100yds") — control de distancia con wedges

Todos: categoria "juego_corto", posicion_swing null, reglas_campo null.
Lugar: "campo_practica" para chipping y approach; "campo_pacos_fabios" para bunker.
nivel_recomendado variado según dificultad.
Métrica de éxito concreta (puntos, número de aciertos en zona, etc.).

Devuelve array JSON de exactamente 8 objetos:
${DRILL_SCHEMA}`);

  return insertBatch(supabase, drills);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function batchPutting(apiKey: string, supabase: any): Promise<number> {
  const drills = await claudeCall(apiKey, `Genera exactamente 8 drills de PUTTING para la Escuela de Golf CCB.

Distribución exacta:
- 3 drills de distancia (subcategoria "distancia") — control de velocidad, lag putting, zona de parada
- 3 drills de dirección (subcategoria "direccion") — alineación de cara, lectura de green, línea de putt
- 2 drills de presión (subcategoria "presion") — formato competitivo, consecuencias por miss

Todos: categoria "putting", lugar "putting_green_fundadores", posicion_swing null, reglas_campo null.
Los drills de presión incluyen formato competitivo claro en variante_presion.
Métrica: número de putts embocados, distancia de los miss, porcentaje de éxito.

Devuelve array JSON de exactamente 8 objetos:
${DRILL_SCHEMA}`);

  return insertBatch(supabase, drills);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function batchCampo(apiKey: string, supabase: any): Promise<number> {
  const drills = await claudeCall(apiKey, `Genera exactamente 6 JUEGOS DE CAMPO para la Escuela de Golf CCB.

Distribución exacta:
- 2 juegos de skills (subcategoria "skills") — habilidades específicas en hoyo completo
- 2 juegos de matchplay (subcategoria "matchplay") — competencia hoyo a hoyo entre alumnos
- 2 juegos de scramble (subcategoria "scramble") — formato por equipos cooperativo

Todos: categoria "campo", lugar "campo_pacos_fabios" o "campo_infantil", posicion_swing null.
OBLIGATORIO: reglas_campo con 3-5 reglas claras del juego en [{"texto":"regla"}].
Descripción incluye: objetivo, equipos/formato, cómo se gana.
Un instructor puede explicarlo en 2 minutos.

Devuelve array JSON de exactamente 6 objetos:
${DRILL_SCHEMA}`);

  return insertBatch(supabase, drills);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "API key no configurada" }, { status: 500 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const body = await req.json() as { batch?: string };
  const batch = body.batch;
  if (!batch) return Response.json({ error: "Campo 'batch' requerido" }, { status: 400 });

  try {
    let insertados = 0;
    if (batch === "tecnico")     insertados = await batchTecnico(apiKey, supabase);
    else if (batch === "juego_corto") insertados = await batchJuegoCorto(apiKey, supabase);
    else if (batch === "putting")     insertados = await batchPutting(apiKey, supabase);
    else if (batch === "campo")       insertados = await batchCampo(apiKey, supabase);
    else return Response.json({ error: `Batch desconocido: ${batch}` }, { status: 400 });

    return Response.json({ insertados, batch });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
