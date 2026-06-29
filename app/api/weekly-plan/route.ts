import type { NextRequest } from "next/server";

// Horarios reales de la escuela (sábado y domingo juvenil tienen 2 sesiones)
const HORARIOS: Record<string, Record<string, { hi: string; hf: string }[]>> = {
  juvenil: {
    martes:    [{ hi: "16:30", hf: "17:30" }],
    miercoles: [{ hi: "16:30", hf: "17:30" }],
    jueves:    [{ hi: "16:30", hf: "17:30" }],
    sabado:    [{ hi: "09:15", hf: "10:00" }, { hi: "10:00", hf: "11:00" }],
    domingo:   [{ hi: "09:15", hf: "10:00" }, { hi: "10:00", hf: "11:00" }],
  },
  competencia: {
    martes:    [{ hi: "16:00", hf: "17:30" }],
    miercoles: [{ hi: "16:00", hf: "17:30" }],
    jueves:    [{ hi: "16:00", hf: "17:30" }],
    sabado:    [{ hi: "08:30", hf: "09:30" }],
  },
  damas: {
    viernes: [{ hi: "10:30", hf: "12:00" }],
  },
};

const DIAS: Record<string, string[]> = {
  juvenil: ["martes", "miercoles", "jueves", "sabado", "domingo"],
  competencia: ["martes", "miercoles", "jueves", "sabado"],
  damas: ["viernes"],
};

function buildPrompt(tipoPlan: string, tema: string, contexto: Record<string, unknown>): { system: string; user: string } {
  const dias = DIAS[tipoPlan] ?? [];
  const semanaInicio = (contexto.semana_inicio as string) ?? "próxima semana";
  const focoMes = (contexto.foco_mes as string) || null;
  const focoMesLine = focoMes ? `\nFOCO DEL MES: ${focoMes} — asegúrate de que cada sesión contribuya a este objetivo mayor.` : "";
  const evCtx = contexto.evaluaciones_recientes
    ? `\n\nContexto evaluaciones recientes del grupo:\n${JSON.stringify(contexto.evaluaciones_recientes, null, 2)}`
    : "";

  if (tipoPlan === "juvenil") {
    const sesionSlots = dias.flatMap((d) => {
      const slots = HORARIOS[tipoPlan]?.[d] ?? [{ hi: "16:30", hf: "17:30" }];
      return slots.map((h) => ({ dia: d, ...h }));
    });

    const diasSchema = sesionSlots.map(({ dia, hi, hf }) => `{
      "dia_semana": "${dia}",
      "hora_inicio": "${hi}",
      "hora_fin": "${hf}",
      "tipo_sesion": "<tiro_largo|juego_corto|putt|campo|test_tecnico|test_fisico>",
      "lugar": "<driving_range|putting_green|campo_infantil|campo_pacos_fabios|campo_completo>",
      "objetivo": "foco concreto de la sesión — qué van a lograr al terminar",
      "drills": [
        {
          "titulo": "nombre del drill",
          "descripcion": "instrucción clara para el instructor",
          "dificultad_birdies": "versión muy simple lúdica para 4-5 años",
          "dificultad_aguilas": "versión con referencia visual para 6-8 años",
          "dificultad_albatros": "versión técnica completa para 9-12 años",
          "dificultad_mas14": "versión con mayor exigencia para 13-17 años"
        }
      ],
      "juego_competitivo": "actividad final con puntos que los niños disfruten",
      "estaciones_damas": null,
      "notas": null
    }`);

    const system = `Eres experto en pedagogía de golf junior TPI y LTAD.
Diseña el plan semanal para grupo Juvenil CCB (Birdies 4-5 años, Águilas 6-8, Albatros 9-12, +14 13-17).

Días y horarios:
- Martes, miércoles, jueves 4:30-5:30pm campo de prácticas
- Sábado 9:15-10:00am y 10:00-11:00am (DOS sesiones con grupos diferentes o énfasis distinto)
- Domingo 9:15-10:00am y 10:00-11:00am (DOS sesiones)

Tema de la semana: ${tema}${focoMesLine}${evCtx}

REGLAS PEDAGÓGICAS:
- Máximo 3 drills por sesión — calidad sobre cantidad
- Cada drill tiene una descripción general más adaptación diferenciada por grupo (Birdies/Águilas/Albatros/+14)
- Birdies: versión lúdica, muy simple, con juego o historia
- Águilas: versión con referencia visual clara (palos en el piso, targets, colores)
- Albatros: versión técnica completa con puntos clave de ejecución
- +14: versión con mayor exigencia, métricas y autocorrección
- OBLIGATORIO: UN juego competitivo por sesión que entusiasme a los niños
- Lenguaje motivador en español colombiano

Devuelve SOLO JSON válido comenzando con { sin backticks ni texto adicional.`;

    const user = `Genera el plan semanal JUVENIL para la semana del ${semanaInicio}.
Tema: ${tema}

Devuelve este JSON exacto:
{
  "descripcion_tema": "descripción pedagógica del tema (2-3 oraciones) con enfoque por edades",
  "sesiones": [${diasSchema.join(",\n  ")}]
}`;

    return { system, user };
  }

  if (tipoPlan === "competencia") {
    // Schema compacto de drill para no repetirlo 8+ veces en el prompt
    const drillRef = `{"titulo":"string","descripcion":"string","metrica_exito":"string","variante_presion":"string","conexion_tecnica":"string","dificultad_birdies":null,"dificultad_aguilas":null,"dificultad_albatros":null,"dificultad_mas14":null}`;

    const diasSchema = dias.map((d) => {
      const h = (HORARIOS[tipoPlan]?.[d] ?? [{ hi: "16:00", hf: "17:30" }])[0];

      if (d === "martes") {
        return `{
      "dia_semana": "martes",
      "hora_inicio": "${h.hi}",
      "hora_fin": "${h.hf}",
      "tipo_sesion": "tiro_largo",
      "lugar": "driving_range",
      "objetivo": "foco concreto de la sesión con métrica",
      "opciones_actividad": [
        {"id":1,"titulo":"Toma de tests / Evaluación","descripcion_corta":"Test técnico P1-P10, test físico TPI o medición Trackman.","justificacion":"<1 frase>","es_recomendada":false,"drills":[${drillRef},${drillRef}]},
        {"id":2,"titulo":"Corrección técnica con drill","descripcion_corta":"Trabajar el error técnico más crítico identificado.","justificacion":"<1 frase>","es_recomendada":false,"drills":[${drillRef},${drillRef}]},
        {"id":3,"titulo":"Sesión de potencia y velocidad","descripcion_corta":"Velocidad de swing, SuperSpeed o potencia con medición.","justificacion":"<1 frase>","es_recomendada":false,"drills":[${drillRef},${drillRef}]},
        {"id":4,"titulo":"Filmación y análisis","descripcion_corta":"Grabar swing frente y lado, analizar posiciones P1-P10.","justificacion":"<1 frase>","es_recomendada":false,"drills":[${drillRef},${drillRef}]}
      ],
      "drills": [],
      "juego_competitivo": "string o null",
      "estaciones_damas": null,
      "notas": null
    }`;
      }

      return `{
      "dia_semana": "${d}",
      "hora_inicio": "${h.hi}",
      "hora_fin": "${h.hf}",
      "tipo_sesion": "<tiro_largo|juego_corto|putt|campo|test_tecnico|test_fisico|competencia>",
      "lugar": "<driving_range|putting_green|campo_infantil|campo_pacos_fabios|campo_completo>",
      "objetivo": "foco concreto con métrica de sesión",
      "drills": [${drillRef},${drillRef}],
      "juego_competitivo": "string o null",
      "estaciones_damas": null,
      "notas": null
    }`;
    });

    const system = `Eres entrenador de alto rendimiento golf junior.
Diseña plan semanal Competencia CCB (13-17 años, nivel competitivo).

Días y horarios:
- Martes, miércoles, jueves 4:00-5:30pm campo de prácticas
- Sábado 8:30-9:30am campo completo (simulación de torneo / condiciones reales)

Tema de la semana: ${tema}${focoMesLine}${evCtx}

REGLAS:
- Martes y jueves: práctica técnica con métricas medibles
- Miércoles: puede ser Trackman, test físico o trabajo mental/estratégico
- Sábado: campo completo o simulación de torneo con presión real
- OBLIGATORIO por drill: métrica de éxito clara, variante de presión, conexión con error técnico
- Al menos UN ejercicio de simulación de torneo por semana (sábado)
- Lenguaje técnico y exigente — tratar como profesionales junior
- Máximo 2-3 drills por sesión (opciones de martes: máximo 2 drills cada una), altamente específicos

MARTES — OPCIONES DE TIPO DE SESIÓN:
Incluye las 4 opciones en "opciones_actividad". Para cada una:
- Elige UNA como recomendada (es_recomendada: true) según contexto del tema y período
- Justifica en 1 frase corta por qué esa opción es la más apropiada ahora
- Las otras 3 justifica brevemente por qué son alternativas válidas
- Genera drills ESPECÍFICOS para cada opción (no genéricos)
Opciones a evaluar:
A) Toma de tests: evalúa estado actual del alumno (inicio de período, sin datos recientes)
B) Corrección técnica: trabaja el error más crítico si hay análisis disponible
C) Potencia y velocidad: aumenta club speed medible si está por debajo del objetivo
D) Filmación y análisis: consciencia propioceptiva si no hay filmación reciente

Devuelve SOLO JSON válido comenzando con { sin backticks ni texto adicional.`;

    const user = `Genera el plan semanal COMPETENCIA para la semana del ${semanaInicio}.
Tema: ${tema}

Devuelve este JSON exacto:
{
  "descripcion_tema": "descripción técnica del tema con enfoque en rendimiento competitivo",
  "sesiones": [${diasSchema.join(",\n  ")}]
}`;

    return { system, user };
  }

  // Damas
  const system = `Eres instructor de golf especializado en adultas.
Diseña la sesión semanal para el grupo Damas CCB.

Viernes 10:30am-12:00m (90 minutos).
Tema: ${tema}${focoMesLine}${evCtx}

FORMATO OBLIGATORIO — siempre 3 estaciones rotativas de 25 min cada una:
1. Juego largo → driving range (drives, hierros largos)
2. Juego corto → área de chips/pitches/bunker
3. Putt → putting green (longitud, dirección, rutina)

REGLAS:
- Tono positivo, inclusivo, celebra el progreso de cada persona
- Lenguaje simple, sin jerga técnica innecesaria
- Cada estación tiene descripción clara con objetivo específico

Devuelve SOLO JSON válido comenzando con { sin backticks ni texto adicional.`;

  const user = `Genera el plan DAMAS del viernes para la semana del ${semanaInicio}.
Tema: ${tema}

Devuelve este JSON exacto:
{
  "descripcion_tema": "descripción amena del tema para las damas (tono cercano y motivador)",
  "sesiones": [{
    "dia_semana": "viernes",
    "tipo_sesion": "damas_estaciones",
    "lugar": "driving_range",
    "hora_inicio": "10:30",
    "hora_fin": "12:00",
    "objetivo": "objetivo de la sesión en lenguaje simple",
    "drills": [],
    "juego_competitivo": null,
    "estaciones_damas": [
      {"nombre": "Juego Largo", "lugar": "Driving Range", "duracion_min": 25, "descripcion": "actividad relacionada con ${tema}", "objetivo_especifico": "qué mejoran en este bloque"},
      {"nombre": "Juego Corto", "lugar": "Área de chips y pitches", "duracion_min": 25, "descripcion": "actividad de chips/pitches/bunker relacionada con ${tema}", "objetivo_especifico": "qué mejoran en este bloque"},
      {"nombre": "Putt", "lugar": "Putting Green", "duracion_min": 25, "descripcion": "trabajo de putt relacionado con ${tema}", "objetivo_especifico": "qué mejoran en este bloque"}
    ],
    "notas": null
  }]
}`;

  return { system, user };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseAI(raw: string): any {
  // 1. Try as-is
  try { return JSON.parse(raw.trim()); } catch { /* */ }

  // 2. Strip all markdown code fences (```json ... ``` or ``` ... ```)
  const stripped = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  try { return JSON.parse(stripped); } catch { /* */ }

  // 3. Extract first { ... } block (handles leading/trailing text)
  const m = stripped.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* */ } }

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeDrill(d: any): any {
  return {
    ...d,
    metrica_exito: d.metrica_exito ?? null,
    variante_presion: d.variante_presion ?? null,
    conexion_tecnica: d.conexion_tecnica ?? null,
    dificultad_birdies: d.dificultad_birdies ?? null,
    dificultad_aguilas: d.dificultad_aguilas ?? null,
    dificultad_albatros: d.dificultad_albatros ?? null,
    dificultad_mas14: d.dificultad_mas14 ?? null,
  };
}

// Normalize field names the AI might use as aliases
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeSesion(s: any): any {
  return {
    ...s,
    objetivo: s.objetivo ?? s.foco_principal ?? "",
    juego_competitivo: s.juego_competitivo ?? s.simulacion_torneo ?? null,
    opciones_actividad: s.opciones_actividad
      ? s.opciones_actividad.map((opt: any) => ({
          ...opt,
          justificacion: opt.justificacion ?? "",
          es_recomendada: opt.es_recomendada ?? false,
          drills: (opt.drills ?? []).map(normalizeDrill),
        }))
      : null,
    drills: (s.drills ?? []).map(normalizeDrill),
  };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "API key no configurada" }, { status: 500 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  console.log("[weekly-plan] Request recibido:", JSON.stringify({
    tipo_plan: body.tipo_plan,
    tema_semanal: body.tema_semanal,
    semana_inicio: body.semana_inicio,
    foco_mes: body.foco_mes,
    tiene_contexto: !!body.contexto_grupo,
  }));

  const { tipo_plan, tema_semanal, semana_inicio, foco_mes, contexto_grupo = {} } = body as {
    tipo_plan: string;
    tema_semanal: string;
    semana_inicio: string;
    foco_mes?: string;
    contexto_grupo?: Record<string, unknown>;
  };

  if (!tipo_plan || !tema_semanal) {
    return Response.json({ error: "tipo_plan y tema_semanal son requeridos" }, { status: 400 });
  }

  const contexto = { ...contexto_grupo, semana_inicio, foco_mes: foco_mes ?? null };
  const { system, user } = buildPrompt(tipo_plan, tema_semanal, contexto);

  // Competencia genera mucho más contenido (4 opciones × 2 drills × 4 días)
  const maxTokens = tipo_plan === "competencia" ? 16000 : 8000;

  console.log("[weekly-plan] API key existe:", !!apiKey);
  console.log("[weekly-plan] max_tokens:", maxTokens, "| prompt user length:", user.length, "chars");

  let anthropicRes: Response;
  let apiData: Record<string, unknown>;
  try {
    anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    apiData = await anthropicRes.json() as Record<string, unknown>;
  } catch (err) {
    console.error("[weekly-plan] Error llamando Anthropic:", err);
    return Response.json({ error: "Error conectando con Anthropic", detail: String(err) }, { status: 502 });
  }

  if (!anthropicRes.ok) {
    const errMsg = (apiData as { error?: { message?: string } }).error?.message || "Error de API";
    console.error("[weekly-plan] Anthropic error:", anthropicRes.status, errMsg);
    return Response.json({ error: errMsg }, { status: anthropicRes.status });
  }

  const stopReason: string = (apiData as { stop_reason?: string }).stop_reason ?? "unknown";
  const rawText: string = (apiData as { content?: { text?: string }[] }).content?.[0]?.text ?? "";
  const usage = (apiData as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;

  console.log("[weekly-plan] stop_reason:", stopReason);
  console.log("[weekly-plan] tokens — input:", usage?.input_tokens, "| output:", usage?.output_tokens);
  console.log("[weekly-plan] rawText primeros 500 chars:", rawText.slice(0, 500));
  console.log("[weekly-plan] rawText longitud total:", rawText.length, "chars");

  if (stopReason === "max_tokens") {
    console.error("[weekly-plan] TRUNCADO POR max_tokens — aumentar límite. Output tokens usados:", usage?.output_tokens);
    console.error("[weekly-plan] Raw truncado:", rawText.slice(-200));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try {
    parsed = parseAI(rawText);
  } catch (err) {
    console.error("[weekly-plan] Error en parseAI:", err);
    parsed = null;
  }

  console.log("[weekly-plan] JSON parseado — tiene sesiones:", !!parsed?.sesiones, "| count:", parsed?.sesiones?.length ?? 0);

  if (!parsed?.sesiones) {
    console.error("[weekly-plan] Respuesta inválida. Raw completo:", rawText);
    return Response.json(
      {
        error: stopReason === "max_tokens"
          ? `Respuesta truncada por límite de tokens (${usage?.output_tokens} usados / ${maxTokens} máx)`
          : "Respuesta IA inválida — no se encontró campo 'sesiones' en el JSON",
        stop_reason: stopReason,
        output_tokens: usage?.output_tokens,
        raw: rawText.slice(0, 2000),
      },
      { status: 500 }
    );
  }

  return Response.json({
    descripcion_tema: parsed.descripcion_tema ?? "",
    sesiones: parsed.sesiones.map(normalizeSesion),
  });
}
