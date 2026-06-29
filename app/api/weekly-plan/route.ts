import type { NextRequest } from "next/server";

const HORARIOS: Record<string, Record<string, { hi: string; hf: string }>> = {
  juvenil: {
    martes:  { hi: "15:00", hf: "17:30" },
    jueves:  { hi: "15:00", hf: "17:30" },
    sabado:  { hi: "08:00", hf: "11:00" },
    domingo: { hi: "14:00", hf: "16:30" },
  },
  competencia: {
    martes:   { hi: "07:00", hf: "09:30" },
    miercoles:{ hi: "07:00", hf: "09:30" },
    jueves:   { hi: "07:00", hf: "09:30" },
    sabado:   { hi: "07:00", hf: "10:00" },
  },
  damas: {
    viernes: { hi: "08:00", hf: "09:30" },
  },
};

const DIAS: Record<string, string[]> = {
  juvenil: ["martes", "jueves", "sabado", "domingo"],
  competencia: ["martes", "miercoles", "jueves", "sabado"],
  damas: ["viernes"],
};

function buildPrompt(tipoPlan: string, tema: string, contexto: Record<string, unknown>): { system: string; user: string } {
  const dias = DIAS[tipoPlan] ?? [];

  if (tipoPlan === "juvenil") {
    const system = `Eres un experto en pedagogía de golf junior con certificación TPI Junior y conocimiento del marco LTAD canadiense. Diseñas planes de entrenamiento semanales para la Escuela de Golf del Country Club de Bogotá (Colombia).

TEMA DE LA SEMANA: ${tema}

GRUPOS:
- Birdies (4-6 años): enfoque lúdico total, coordinación básica
- Águilas (6-8 años): habilidades básicas con referencia visual
- Albatros (9-12 años): técnica completa con comprensión
- +14 (13-17 años): técnica avanzada con autocorrección

REGLAS PEDAGÓGICAS:
- Martes: sesión técnica o práctica en instalaciones (driving range, campo infantil)
- Jueves: puede ser test técnico/físico, práctica campo o work técnico
- Sábado y domingo: campo (Pacos/Fabios o campo completo según nivel)
- Máximo 3 drills por sesión — calidad sobre cantidad
- Cada drill tiene UNA descripción general más notas de dificultad diferenciadas por grupo
  * Birdies: versión lúdica, muy simple, con juego o historia
  * Águilas: versión con referencia visual clara (palos en el piso, targets, colores)
  * Albatros: versión técnica completa con puntos clave de ejecución
  * +14: versión con mayor exigencia, métricas y autocorrección
- OBLIGATORIO: UN juego competitivo por sesión que entusiasme a los niños (puntos, retos, equipos, consecuencias divertidas)
- Lenguaje motivador, energético, en español colombiano

Devuelve SOLO JSON válido comenzando con { sin backticks ni texto adicional.`;

    const diasSchema = dias.map((d) => {
      const h = HORARIOS[tipoPlan]?.[d] ?? { hi: "15:00", hf: "17:00" };
      return `{
      "dia_semana": "${d}",
      "tipo_sesion": "<tiro_largo|juego_corto|putt|campo|test_tecnico|test_fisico>",
      "lugar": "<driving_range|putting_green|campo_infantil|campo_pacos_fabios|campo_completo>",
      "hora_inicio": "${h.hi}",
      "hora_fin": "${h.hf}",
      "objetivo": "objetivo específico y motivador",
      "drills": [
        {
          "titulo": "nombre del drill",
          "descripcion": "descripción general para el instructor",
          "dificultad_birdies": "versión lúdica para Birdies",
          "dificultad_aguilas": "versión con referencia visual para Águilas",
          "dificultad_albatros": "versión técnica para Albatros",
          "dificultad_mas14": "versión avanzada para +14"
        }
      ],
      "juego_competitivo": "descripción del juego con reglas y cómo ganar",
      "estaciones_damas": null,
      "notas": null
    }`;
    });

    const user = `Genera el plan semanal JUVENIL para la semana del ${(contexto.semana_inicio as string) ?? "próxima semana"}.
Tema: ${tema}
${contexto.evaluaciones_recientes ? `Contexto del grupo: ${JSON.stringify(contexto.evaluaciones_recientes)}` : ""}

Devuelve este JSON exacto:
{
  "descripcion_tema": "descripción pedagógica del tema (2-3 oraciones) con enfoque por edades",
  "sesiones": [${diasSchema.join(",\n  ")}]
}`;

    return { system, user };
  }

  if (tipoPlan === "competencia") {
    const evRecientes = contexto.evaluaciones_recientes;
    const planAnterior = contexto.plan_semana_anterior;

    const system = `Eres un entrenador de golf de alto rendimiento junior, especializado en desarrollo competitivo. Diseñas planes de entrenamiento semanales para el grupo Competencia de la Escuela de Golf del Country Club de Bogotá (jugadores de 13-17 años, nivel competitivo).

TEMA DE LA SEMANA: ${tema}
${evRecientes ? `DATOS RECIENTES DEL GRUPO:\n${JSON.stringify(evRecientes, null, 2)}` : ""}
${planAnterior ? `PLAN SEMANA ANTERIOR (para dar continuidad):\n${JSON.stringify(planAnterior, null, 2)}` : ""}

REGLAS:
- Martes y jueves: práctica técnica con métricas medibles
- Miércoles: puede ser Trackman, test físico, o trabajo mental/estratégico
- Sábado: campo completo o simulación de torneo con presión real
- OBLIGATORIO por drill:
  * Métrica de éxito clara (ej: "7 de 10 chips dentro de 1m del palo")
  * Variante de presión (mismo ejercicio con consecuencia o apuesta)
  * Conexión con error técnico identificado en evaluaciones recientes
- Al menos UN ejercicio de simulación de torneo por semana (sábado)
- Lenguaje técnico, exigente pero motivador — tratar como profesionales junior
- Máximo 3 drills por sesión, altamente específicos

Devuelve SOLO JSON válido comenzando con { sin backticks ni texto adicional.`;

    const diasSchema = dias.map((d) => {
      const h = HORARIOS[tipoPlan]?.[d] ?? { hi: "07:00", hf: "09:30" };
      return `{
      "dia_semana": "${d}",
      "tipo_sesion": "<tiro_largo|juego_corto|putt|campo|test_tecnico|test_fisico|competencia>",
      "lugar": "<driving_range|putting_green|campo_infantil|campo_pacos_fabios|campo_completo>",
      "hora_inicio": "${h.hi}",
      "hora_fin": "${h.hf}",
      "objetivo": "objetivo específico con métrica de sesión",
      "drills": [
        {
          "titulo": "nombre del drill",
          "descripcion": "descripción y ejecución detallada",
          "metrica_exito": "X de Y intentos / distancia / porcentaje",
          "variante_presion": "misma tarea con consecuencia o apuesta",
          "conexion_tecnica": "qué error técnico del grupo trabaja este drill",
          "dificultad_birdies": null,
          "dificultad_aguilas": null,
          "dificultad_albatros": null,
          "dificultad_mas14": null
        }
      ],
      "juego_competitivo": "simulación o competencia (especialmente sábado)",
      "estaciones_damas": null,
      "notas": null
    }`;
    });

    const user = `Genera el plan semanal COMPETENCIA para la semana del ${(contexto.semana_inicio as string) ?? "próxima semana"}.
Tema: ${tema}

Devuelve este JSON exacto:
{
  "descripcion_tema": "descripción técnica del tema con enfoque en rendimiento competitivo",
  "sesiones": [${diasSchema.join(",\n  ")}]
}`;

    return { system, user };
  }

  // Damas
  const system = `Eres un instructor de golf especializado en adultos, especialmente en el programa de damas. Diseñas sesiones semanales para el grupo Damas de la Escuela de Golf del Country Club de Bogotá.

TEMA: ${tema}

FORMATO OBLIGATORIO — siempre 3 estaciones rotativas de ~25 min cada una:
1. Juego largo → driving range (drives, hierros largos)
2. Juego corto → área de chips/pitches/bunker (chips, pitches, bunker)
3. Putt → putting green (longitud, dirección, rutina)

REGLAS:
- Sesión de viernes 08:00-09:30 (90 minutos para 3 rotaciones de 25 min + transiciones)
- Tono: positivo, inclusivo, celebra el progreso en cada persona
- Lenguaje simple, sin jerga técnica innecesaria
- Cada estación tiene descripción clara para que cualquier instructor pueda ejecutarla

Devuelve SOLO JSON válido comenzando con { sin backticks ni texto adicional.`;

  const user = `Genera el plan DAMAS del viernes para la semana del ${(contexto.semana_inicio as string) ?? "próxima semana"}.
Tema: ${tema}

Devuelve este JSON exacto:
{
  "descripcion_tema": "descripción amena del tema para las damas (tono cercano y motivador)",
  "sesiones": [{
    "dia_semana": "viernes",
    "tipo_sesion": "damas_estaciones",
    "lugar": "driving_range",
    "hora_inicio": "08:00",
    "hora_fin": "09:30",
    "objetivo": "objetivo de la sesión en lenguaje simple",
    "drills": [],
    "juego_competitivo": null,
    "estaciones_damas": [
      {"nombre": "Juego Largo", "lugar": "Driving Range", "duracion_min": 25, "descripcion": "descripción de la actividad relacionada con ${tema}"},
      {"nombre": "Juego Corto", "lugar": "Área de chips y pitches", "duracion_min": 25, "descripcion": "descripción de chips/pitches/bunker relacionada con ${tema}"},
      {"nombre": "Putt", "lugar": "Putting Green", "duracion_min": 25, "descripcion": "descripción del trabajo de putt relacionado con ${tema}"}
    ],
    "notas": null
  }]
}`;

  return { system, user };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseAI(raw: string): any {
  const clean = raw.trim();
  try { return JSON.parse(clean); } catch { /* */ }
  try { return JSON.parse(clean.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim()); } catch { /* */ }
  const m = clean.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* */ } }
  return null;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "API key no configurada" }, { status: 500 });

  const body = await req.json();
  const { tipo_plan, tema_semanal, semana_inicio, contexto_grupo = {} } = body as {
    tipo_plan: string;
    tema_semanal: string;
    semana_inicio: string;
    contexto_grupo?: Record<string, unknown>;
  };

  if (!tipo_plan || !tema_semanal) {
    return Response.json({ error: "tipo_plan y tema_semanal son requeridos" }, { status: 400 });
  }

  const contexto = { ...contexto_grupo, semana_inicio };
  const { system, user } = buildPrompt(tipo_plan, tema_semanal, contexto);

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 5000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  const apiData = await anthropicRes.json();
  if (!anthropicRes.ok) {
    return Response.json({ error: apiData.error?.message || "Error de API" }, { status: anthropicRes.status });
  }

  const rawText = apiData.content?.[0]?.text ?? "";
  const parsed = parseAI(rawText);

  if (!parsed?.sesiones) {
    return Response.json({ error: "Respuesta IA inválida", raw: rawText.slice(0, 500) }, { status: 500 });
  }

  return Response.json({
    descripcion_tema: parsed.descripcion_tema ?? "",
    sesiones: parsed.sesiones,
  });
}
