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
    const system = `Diseña una clase divertida de 60 min para niños de golf (Birdies 4-5a, Águilas 6-8a, Albatros 9-12a).

TEMA: ${tema}
LUGAR: campo de prácticas

Genera exactamente 3 actividades tipo JUEGO.
Nombres creativos y divertidos, no técnicos.
Descripciones muy cortas (máx 2 líneas).

Devuelve SOLO este JSON sin texto extra:
{
  "nombre_clase": "string",
  "objetivo_simple": "string",
  "lugar": "string",
  "actividades": [
    {
      "nombre": "string",
      "duracion_min": 20,
      "como_se_juega": "string",
      "adaptacion_birdies": "string",
      "adaptacion_albatros": "string",
      "como_se_gana": "string",
      "materiales": "string"
    }
  ],
  "actividad_estrella": "string"
}`;
    const user = `Genera la clase para el tema: ${tema}`;
    return { system, user };
  }

  if (tipoPlan === "competencia") {
    const modo       = (contexto.modo       as string)   || "construccion";
    const torneo     = (contexto.torneo     as string)   || "sin_torneo";
    const posiciones = (contexto.posiciones as string[]) || [];
    const primerDia  = (contexto.primer_dia as string)   || "martes";

    // Días según primer día hábil
    const diasComp = primerDia === "miercoles"
      ? ["miercoles", "jueves", "sabado"]
      : ["martes", "miercoles", "jueves", "sabado"];

    const posicionesStr = posiciones.length > 0
      ? posiciones.join(", ")
      : "P1–P7 en orden progresivo (sin tests realizados)";

    const torneoLabel: Record<string, string> = {
      sin_torneo:        "Sin torneo esta semana",
      torneo_1_semana:   "Torneo en 1 semana",
      torneo_2_semanas:  "Torneo en 2 semanas",
      torneo_este_finde: "Torneo este fin de semana",
    };
    const torneoStr = torneoLabel[torneo] ?? torneo;
    const hayTorneo = torneo !== "sin_torneo";

    // Schema de drill para Competencia (nuevos campos pedagógicos)
    const drillComp = `{"titulo":"string","posicion_objetivo":"ej: P3 — media subida","descripcion":"descripción del movimiento correcto","error_comun":"error frecuente a evitar","sensacion":"sensación propioceptiva buscada","repeticiones":"ej: 3 series de 10","metrica_exito":"métrica medible de éxito"}`;

    const diasSchema = diasComp.map((d, idx) => {
      const h = (HORARIOS["competencia"]?.[d] ?? [{ hi: "16:00", hf: "17:30" }])[0];
      const isDia1   = idx === 0;
      const isDia2   = idx === 1;
      const isSabado = d === "sabado";

      if (isDia1) {
        if (modo === "construccion") {
          return `{
      "dia_semana": "${d}",
      "hora_inicio": "${h.hi}",
      "hora_fin": "${h.hf}",
      "tipo_sesion": "tiro_largo",
      "lugar": "campo_practica",
      "foco_principal": "Tiro largo — construcción de swing",
      "opciones_actividad": [
        {"id":1,"titulo":"Toma de datos","descripcion_corta":"Trackman o filmación de swing (recomendada si no hay datos recientes)","justificacion":"<1 frase>","es_recomendada":false,"drills":[${drillComp},${drillComp}]},
        {"id":2,"titulo":"Drills técnicos","descripcion_corta":"Drills progresivos para posiciones ${posicionesStr}","justificacion":"<1 frase>","es_recomendada":false,"drills":[${drillComp},${drillComp},${drillComp}]},
        {"id":3,"titulo":"Potencia y velocidad","descripcion_corta":"Trabajo de club speed con medición y SuperSpeed","justificacion":"<1 frase>","es_recomendada":false,"drills":[${drillComp},${drillComp}]}
      ],
      "drills": [],
      "juego_competitivo": "string o null",
      "objetivo_sesion": "string"
    }`;
        } else {
          return `{
      "dia_semana": "${d}",
      "hora_inicio": "${h.hi}",
      "hora_fin": "${h.hf}",
      "tipo_sesion": "juego_corto",
      "lugar": "campo_practica",
      "foco_principal": "Juego corto — approach shots, chipping, bunker",
      "opciones_actividad": [
        {"id":1,"titulo":"Control de distancia en chipping","descripcion_corta":"3 distancias: 10m, 20m, 30m","justificacion":"<1 frase>","es_recomendada":false,"drills":[${drillComp}]},
        {"id":2,"titulo":"Juego de bunker","descripcion_corta":"Salida y control desde arena","justificacion":"<1 frase>","es_recomendada":false,"drills":[${drillComp}]},
        {"id":3,"titulo":"Approach shots 50-100 yds","descripcion_corta":"Diferentes palos con objetivo de distancia","justificacion":"<1 frase>","es_recomendada":false,"drills":[${drillComp}]},
        {"id":4,"titulo":"Up & down challenge","descripcion_corta":"Chip + putt completando el hoyo","justificacion":"<1 frase>","es_recomendada":false,"drills":[${drillComp}]}
      ],
      "drills": [],
      "juego_competitivo": "string o null",
      "objetivo_sesion": "string"
    }`;
        }
      }

      if (isDia2 && !isSabado) {
        if (modo === "preparacion") {
          return `{
      "dia_semana": "${d}",
      "hora_inicio": "${h.hi}",
      "hora_fin": "${h.hf}",
      "tipo_sesion": "campo",
      "lugar": "campo_pacos_fabios",
      "foco_principal": "Juego en campo real — hoyos con objetivos específicos",
      "opciones_actividad": null,
      "drills": [${drillComp},${drillComp}],
      "juego_competitivo": "string o null",
      "objetivo_sesion": "string"
    }`;
        } else {
          return `{
      "dia_semana": "${d}",
      "hora_inicio": "${h.hi}",
      "hora_fin": "${h.hf}",
      "tipo_sesion": "<putt|campo>",
      "lugar": "<putting_green|campo_pacos_fabios>",
      "foco_principal": "Putting green Fundadores O Campo Pacos y Fabios — elige según alternancia semanal${hayTorneo ? " (priorizar campo real por torneo próximo)" : ""}",
      "opciones_actividad": null,
      "drills": [${drillComp},${drillComp}],
      "juego_competitivo": "string o null",
      "objetivo_sesion": "string"
    }`;
        }
      }

      if (isSabado) {
        return `{
      "dia_semana": "sabado",
      "hora_inicio": "${h.hi}",
      "hora_fin": "${h.hf}",
      "tipo_sesion": "<tiro_largo|juego_corto>",
      "lugar": "campo_practica",
      "foco_principal": "${modo === "preparacion" ? "Repaso general — mezcla juego corto y largo" : "Tiro largo O juego corto según progreso de la semana"}",
      "opciones_actividad": null,
      "drills": [${drillComp},${drillComp}],
      "juego_competitivo": "string o null",
      "objetivo_sesion": "string"
    }`;
      }

      // Día 3 (jueves en semana normal)
      return `{
      "dia_semana": "${d}",
      "hora_inicio": "${h.hi}",
      "hora_fin": "${h.hf}",
      "tipo_sesion": "${modo === "preparacion" ? "putt" : "<tiro_largo|juego_corto>"}",
      "lugar": "${modo === "preparacion" ? "putting_green" : "campo_practica"}",
      "foco_principal": "${modo === "preparacion" ? "Putting — distancias 1-5 metros bajo presión" : "Continúa tiro largo O introduce juego corto"}",
      "opciones_actividad": null,
      "drills": [${drillComp},${drillComp}],
      "juego_competitivo": "string o null",
      "objetivo_sesion": "string"
    }`;
    });

    const system = `Eres el asistente pedagógico de la Escuela de Golf del Country Club de Bogotá para el grupo Competencia (13-17 años, nivel intermedio-avanzado en construcción).

CONTEXTO IMPORTANTE:
- Son niños que practican 2-3 veces por semana
- El foco principal es CONSTRUIR SWING correctamente
- No asumir nivel competitivo alto
- Instalaciones: Campo de práctica (tiro largo Y corto), Putting green Fundadores (solo putt), Campo Pacos y Fabios (juego en campo real)
- Los SÁBADOS NUNCA se va al campo real — siempre campo_practica
- NUNCA usar el término 'Driving Range' — siempre 'Campo de práctica'

MODO DE LA SEMANA: ${modo === "construccion" ? "Construcción de swing" : "Preparación para competencia"}
TORNEO PRÓXIMO: ${torneoStr}
POSICIONES EN TRABAJO: ${posicionesStr}
PRIMER DÍA HÁBIL: ${primerDia}${focoMesLine}${evCtx}

REGLAS MODO CONSTRUCCIÓN DE SWING:
- Día 1 (tiro largo): Siempre campo_practica
  Incluir 3 opciones en opciones_actividad. Elegir UNA como recomendada (es_recomendada: true):
  * id:1 Toma de datos — Trackman o filmación (recomendada si no hay datos recientes)
  * id:2 Drills técnicos para posiciones ${posicionesStr} — 2-3 drills progresivos con posicion_objetivo
  * id:3 Trabajo de potencia y velocidad con medición de club speed
  Cada drill DEBE incluir: posicion_objetivo, descripcion, error_comun, sensacion, repeticiones, metrica_exito
- Día 2: Alternar entre putting_green (Fundadores) y campo_pacos_fabios${hayTorneo ? " — priorizar campo real por torneo" : ""}
- Día 3: campo_practica — continuar tiro largo o introducir juego corto como complemento
- Sábado: campo_practica — tiro largo O juego corto (NUNCA campo real)

REGLAS MODO PREPARACIÓN COMPETENCIA:
- Día 1: campo_practica — juego corto con opciones variadas (approach, chipping, bunker)
  Incluir 4 opciones en opciones_actividad, elegir UNA como recomendada
- Día 2: campo_pacos_fabios — juego real con hoyos y objetivos
- Día 3: putting_green — putting con presión y distancias 1-5 metros
- Sábado: campo_practica — repaso general juego corto y largo

OPCIONES JUEGO CORTO (para modo preparación):
1. Control de distancia en chipping (10m, 20m, 30m)
2. Juego de bunker — salida y control
3. Approach shots 50-100 yds diferentes palos
4. Up & down challenge (chip + putt)

OPCIONES PUTTING:
1. Putts de control de distancia 3-6-9 metros
2. Gate drill — precisión de dirección
3. Putting bajo presión: primero en hacer 10 seguidos

Devuelve SOLO JSON válido comenzando con { sin backticks ni texto adicional.`;

    const user = `Genera el plan semanal COMPETENCIA para la semana del ${semanaInicio}.
Modo: ${modo === "construccion" ? "Construcción de swing" : "Preparación para competencia"}
Posiciones en trabajo: ${posicionesStr}
Torneo próximo: ${torneoStr}
Primer día hábil: ${primerDia}

Devuelve este JSON exacto:
{
  "descripcion_plan": "descripción pedagógica del plan (2-3 oraciones)",
  "modo": "${modo}",
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
    "lugar": "campo_practica",
    "hora_inicio": "10:30",
    "hora_fin": "12:00",
    "objetivo": "objetivo de la sesión en lenguaje simple",
    "drills": [],
    "juego_competitivo": null,
    "estaciones_damas": [
      {"nombre": "Juego Largo", "lugar": "Campo de práctica", "duracion_min": 25, "descripcion": "actividad relacionada con ${tema}", "objetivo_especifico": "qué mejoran en este bloque"},
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
    metrica_exito:    d.metrica_exito    ?? null,
    variante_presion: d.variante_presion ?? null,
    conexion_tecnica: d.conexion_tecnica ?? null,
    posicion_objetivo: d.posicion_objetivo ?? null,
    error_comun:       d.error_comun       ?? null,
    sensacion:         d.sensacion         ?? null,
    repeticiones:      d.repeticiones      ?? null,
    dificultad_birdies:  d.dificultad_birdies  ?? null,
    dificultad_aguilas:  d.dificultad_aguilas  ?? null,
    dificultad_albatros: d.dificultad_albatros ?? null,
    dificultad_mas14:    d.dificultad_mas14    ?? null,
  };
}

// Normalize field names the AI might use as aliases
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeSesion(s: any): any {
  return {
    ...s,
    objetivo: s.objetivo ?? s.foco_principal ?? s.objetivo_sesion ?? "",
    juego_competitivo: s.juego_competitivo ?? s.simulacion_torneo ?? null,
    opciones_actividad: s.opciones_actividad
      ? s.opciones_actividad.map((opt: any) => ({
          ...opt,
          descripcion_corta: opt.descripcion_corta ?? opt.descripcion ?? "",
          justificacion: opt.justificacion ?? "",
          es_recomendada: opt.es_recomendada ?? opt.recomendada ?? false,
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
  const maxTokens = tipo_plan === "competencia" ? 16000 : tipo_plan === "juvenil" ? 2000 : 8000;

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

  if (tipo_plan === "juvenil") {
    console.log("[weekly-plan] JSON Juvenil — tiene actividades:", !!parsed?.actividades, "| count:", parsed?.actividades?.length ?? 0);
    if (!parsed?.actividades) {
      console.error("[weekly-plan] Respuesta Juvenil inválida. Raw completo:", rawText);
      return Response.json(
        {
          error: stopReason === "max_tokens"
            ? `Respuesta truncada por límite de tokens (${usage?.output_tokens} usados / ${maxTokens} máx)`
            : "Respuesta IA inválida — no se encontró campo 'actividades' en el JSON",
          stop_reason: stopReason,
          output_tokens: usage?.output_tokens,
          raw: rawText.slice(0, 2000),
        },
        { status: 500 }
      );
    }
    return Response.json({
      descripcion_tema: parsed.nombre_clase ?? "",
      sesion_juvenil: parsed,
      sesiones: [],
    });
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
    descripcion_tema: parsed.descripcion_tema ?? parsed.descripcion_plan ?? "",
    sesiones: parsed.sesiones.map(normalizeSesion),
  });
}
