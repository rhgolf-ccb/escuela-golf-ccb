import type { NextRequest } from "next/server";
import { ANTHROPIC_MODEL } from "@/lib/anthropic-model";

const DIAS_SESION: Record<string, string[]> = {
  juvenil: ["martes", "jueves", "sabado", "domingo"],
  competencia: ["martes", "miercoles", "jueves", "sabado"],
  damas: ["viernes"],
};

const GRUPOS_DESC: Record<string, string> = {
  juvenil: "Águilas (6-8 años), Albatros (9-12 años), +14 (mayores de 14 años)",
  competencia: "Jugadores en desarrollo competitivo de alto rendimiento",
  damas: "Damas adultas — sesión de viernes con 3 estaciones rotativas de ~20 min cada una",
};

const HORARIOS_TIPICOS: Record<string, Record<string, string>> = {
  juvenil: { martes: "15:00-17:30", jueves: "15:00-17:30", sabado: "08:00-11:00", domingo: "14:00-16:30" },
  competencia: { martes: "07:00-09:30", miercoles: "07:00-09:30", jueves: "07:00-09:30", sabado: "07:00-10:00" },
  damas: { viernes: "09:00-11:00" },
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "API key no configurada" }, { status: 500 });

  const body = await req.json();
  const { tipo_plan, semana_inicio, tema_semanal, descripcion_tema, objetivo_mensual } = body as {
    tipo_plan: string; semana_inicio: string; tema_semanal: string;
    descripcion_tema: string; objetivo_mensual?: string;
  };

  const dias = DIAS_SESION[tipo_plan] ?? [];
  const esDamas = tipo_plan === "damas";
  const esCompetencia = tipo_plan === "competencia";

  const drillSchema = esDamas
    ? "[]"
    : esCompetencia
    ? `[{"titulo":"nombre del drill","descripcion":"descripción y ejecución del drill","dificultad_birdies":null,"dificultad_aguilas":null,"dificultad_albatros":null,"dificultad_mas14":null}]`
    : `[{"titulo":"nombre del drill","descripcion":"descripción general","dificultad_birdies":"cómo lo hacen los Birdies (4-5 años)","dificultad_aguilas":"cómo lo hacen las Águilas (6-8 años)","dificultad_albatros":"cómo lo hacen Albatros (9-12 años)","dificultad_mas14":"cómo lo hacen los +14"}]`;

  const estacionSchema = esDamas
    ? `[{"nombre":"nombre estación","lugar":"Campo de práctica / Putting Green / Campo Infantil","duracion_min":20,"descripcion":"qué practican en esta estación"}]`
    : "null";

  const systemPrompt = `Eres un entrenador senior de la Escuela de Golf del Country Club de Bogotá (Colombia). Diseñas planes de entrenamiento semanales pedagógicos, progresivos y motivadores. Usas terminología de golf en español colombiano.

Devuelve SOLO un JSON válido empezando con { sin ningún texto, backticks, ni markdown adicional.`;

  const horariosDias = dias.map((d) => {
    const h = HORARIOS_TIPICOS[tipo_plan]?.[d] ?? "08:00-10:00";
    return `${d}: ${h}`;
  }).join(", ");

  const userMsg = `Genera el plan semanal para la semana del ${semana_inicio}, grupo ${tipo_plan.toUpperCase()}.

TEMA: ${tema_semanal}
DESCRIPCIÓN: ${descripcion_tema}
${objetivo_mensual ? `OBJETIVO MENSUAL: ${objetivo_mensual}` : ""}
GRUPOS: ${GRUPOS_DESC[tipo_plan]}
DÍAS: ${dias.join(", ")}
HORARIOS TÍPICOS: ${horariosDias}

${esDamas ? "Para Damas: la sesión del viernes usa 3 estaciones rotativas. El campo estaciones_damas debe tener exactamente 3 elementos." : ""}
${!esDamas ? `Genera 3-4 drills por sesión relacionados con el tema "${tema_semanal}".` : ""}

Devuelve exactamente este JSON:
{
  "sesiones": [
    ${dias.map((dia) => {
      const [hi, hf] = (HORARIOS_TIPICOS[tipo_plan]?.[dia] ?? "08:00-10:00").split("-");
      return `{
      "dia_semana": "${dia}",
      "tipo_sesion": "tiro_largo",
      "lugar": "campo_practica",
      "hora_inicio": "${hi}",
      "hora_fin": "${hf}",
      "objetivo": "objetivo específico de esta sesión relacionado con ${tema_semanal}",
      "drills": ${drillSchema},
      "juego_competitivo": ${esDamas ? "null" : '"descripción del juego competitivo o null si no aplica"'},
      "estaciones_damas": ${estacionSchema},
      "notas": null
    }`;
    }).join(",\n    ")}
  ]
}

Elige tipo_sesion y lugar coherentes con el dia y el tema. Opciones tipo_sesion: tiro_largo, juego_corto, putt, campo, test_tecnico, test_fisico, competencia${esDamas ? ", damas_estaciones" : ""}. Opciones lugar: campo_practica, putting_green, campo_infantil, campo_pacos_fabios, campo_completo.`;

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userMsg }],
    }),
  });

  const apiData = await anthropicRes.json();
  if (!anthropicRes.ok) {
    return Response.json({ error: apiData.error?.message || "Error de API" }, { status: anthropicRes.status });
  }

  const rawText = (apiData.content?.[0]?.text || "").trim();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try { parsed = JSON.parse(rawText); }
  catch {
    try { parsed = JSON.parse(rawText.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim()); }
    catch {
      const m = rawText.match(/\{[\s\S]*\}/);
      try { parsed = m ? JSON.parse(m[0]) : null; } catch { parsed = null; }
    }
  }

  if (!parsed?.sesiones) return Response.json({ error: "Respuesta IA inválida" }, { status: 500 });

  return Response.json({ sesiones: parsed.sesiones });
}
