import type { NextRequest } from "next/server";

function calcularGrupoEfectivo(student: { birth_date?: string | null; grupo_activo?: string | null }): string {
  if (student.grupo_activo === "Competencia") return "Competencia";
  if (student.grupo_activo === "Damas") {
    if (student.birth_date) {
      const hoy = new Date();
      const nac = new Date(student.birth_date);
      let edad = hoy.getFullYear() - nac.getFullYear();
      const m = hoy.getMonth() - nac.getMonth();
      if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
      if (edad >= 50) return "Damas Senior";
    }
    return "Damas";
  }
  if (!student.birth_date) return "Albatros";
  const hoy = new Date();
  const nac = new Date(student.birth_date);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  if (edad <= 5) return "Birdies";
  if (edad <= 8) return "Águilas";
  if (edad <= 12) return "Albatros";
  return "Grupo +14";
}

const POSICIONES_NOMBRES: Record<string, string> = {
  P1: "Setup", P2: "Backswing — palo paralelo", P3: "Backswing — brazo izq. paralelo",
  P4: "Top backswing", P5: "Downswing — inicio", P6: "Downswing — palo paralelo",
  P7: "Impacto", P8: "Follow through — palo paralelo", P9: "Follow through — brazo der.", P10: "Finish completo",
};

const TPI_TESTS_INFO: Record<string, Record<string, { nombre: string; swing?: string }>> = {
  Birdies: {
    DM1: { nombre: "Lanzar una pelota (coordinación rotacional)", swing: "P4–P7" },
    DM2: { nombre: "Atrapar una pelota (coordinación óculo-manual)" },
    DM3: { nombre: "Saltar en un pie (equilibrio unipodal)", swing: "P5, P10" },
    DM4: { nombre: "Skipping (coordinación dinámica)" },
    DM5: { nombre: "Equilibrio en movimiento (control postural dinámico)", swing: "P10" },
    MB1: { nombre: "Overhead Deep Squat (movilidad general, postura global)", swing: "P1, P10" },
    MB2: { nombre: "Single Leg Balance 3 seg (equilibrio estático unipodal)", swing: "P5, P10" },
    MB3: { nombre: "Torso Rotation (rotación de tronco sobre caderas)", swing: "P4, P7" },
  },
  "Águilas": {
    DM1: { nombre: "Lanzar con rotación (coordinación rotacional + transferencia de peso)", swing: "P4–P7" },
    DM2: { nombre: "Atrapar en movimiento (coordinación dinámica)" },
    DM3: { nombre: "Saltar y caer en equilibrio (potencia + estabilidad de aterrizaje)", swing: "P10" },
    S1: { nombre: "Overhead Deep Squat (movilidad global, postura, dorsiflexión)", swing: "P1, P10" },
    S2: { nombre: "Toe Touch (flexibilidad isquiotibiales y cadena posterior)", swing: "P1" },
    S3: { nombre: "Single Leg Balance 7 seg (equilibrio estático unipodal)", swing: "P5, P10" },
    S4: { nombre: "Torso Rotation (rotación de tronco sobre caderas)", swing: "P4, P7" },
    S5: { nombre: "Pelvic Tilt (control lumbo-pélvico, lordosis funcional)", swing: "P1, P4" },
    S6: { nombre: "Ankle Mobility (movilidad de tobillo, dorsiflexión)", swing: "P1, P10" },
    S7: { nombre: "Hip Sway Test (estabilidad lateral de cadera en carga)", swing: "P4, P7" },
    S8: { nombre: "Hip Rotation Awareness (conciencia de rotación interna/externa de cadera)", swing: "P5, P7" },
    PO1: { nombre: "Salto Vertical (potencia explosiva de piernas)" },
    PO2: { nombre: "Lanzamiento Rotacional 0.5 kg (potencia rotacional)", swing: "P4–P7" },
    PO3: { nombre: "Fuerza de Agarre (fuerza de manos y antebrazos)", swing: "P1" },
  },
  Albatros: {
    S1: { nombre: "Overhead Deep Squat (movilidad global, postura, dorsiflexión)", swing: "P1, P10" },
    S2: { nombre: "Toe Touch (flexibilidad isquiotibiales y cadena posterior)", swing: "P1" },
    S3: { nombre: "90/90 Stretch (flexibilidad isquiotibiales en posición sentada)", swing: "P4, P5" },
    S4: { nombre: "Pelvic Tilt (control lumbo-pélvico, lordosis funcional)", swing: "P1, P4" },
    S5: { nombre: "Torso Rotation (rotación de tronco sobre caderas fijas)", swing: "P4, P7" },
    S6: { nombre: "Cervical Rotation (rotación cervical, seguimiento visual del objetivo)", swing: "P7" },
    S7: { nombre: "Shoulder Horizontal Abduction (movilidad posterior de hombro, plano horizontal)", swing: "P3, P8, P9" },
    S8: { nombre: "Wrist Flexion/Extension (movilidad de muñeca, control del face)", swing: "P2, P3, P6" },
    S9: { nombre: "Ankle Mobility (movilidad de tobillo, dorsiflexión)", swing: "P1, P10" },
    S10: { nombre: "Single Leg Balance 10 seg (equilibrio estático unipodal)", swing: "P5, P10" },
    S11: { nombre: "Hip Internal Rotation (rotación interna de cadera, X-Factor)", swing: "P4, P7" },
    S12: { nombre: "Hip External Rotation (rotación externa de cadera)", swing: "P5, P7" },
    S13: { nombre: "Lower Quarter Rotation (rotación global del tren inferior)", swing: "P5, P7" },
    S14: { nombre: "Seated Trunk Rotation (rotación de tronco disociada de caderas)", swing: "P4, P5" },
    S15: { nombre: "Lat Length (longitud del dorsal ancho, restricción en follow through)", swing: "P3, P8, P9" },
    S16: { nombre: "Bridge with Leg Extension (fuerza glúteo, estabilidad lumbo-pélvica)", swing: "P5, P6" },
    PB1: { nombre: "Salto Vertical (potencia explosiva de piernas)" },
    PB2: { nombre: "Lanzamiento Rotacional 1 kg (potencia rotacional)", swing: "P4–P7" },
    PB3: { nombre: "Sit Up and Throw 1 kg (potencia de core)" },
    PB4: { nombre: "Fuerza de Agarre (fuerza de manos y antebrazos)", swing: "P1" },
  },
  "Grupo +14": {
    S1: { nombre: "Overhead Deep Squat (movilidad global, postura, dorsiflexión)", swing: "P1, P10" },
    S2: { nombre: "Toe Touch (flexibilidad isquiotibiales y cadena posterior)", swing: "P1" },
    S3: { nombre: "90/90 Stretch (flexibilidad isquiotibiales en posición sentada)", swing: "P4, P5" },
    S4: { nombre: "Pelvic Tilt (control lumbo-pélvico, lordosis funcional)", swing: "P1, P4" },
    S5: { nombre: "Torso Rotation (rotación de tronco sobre caderas fijas)", swing: "P4, P7" },
    S6: { nombre: "Cervical Rotation (rotación cervical, seguimiento visual del objetivo)", swing: "P7" },
    S7: { nombre: "Shoulder Horizontal Abduction (movilidad posterior de hombro, plano horizontal)", swing: "P3, P8, P9" },
    S8: { nombre: "Wrist Flexion/Extension (movilidad de muñeca, control del face)", swing: "P2, P3, P6" },
    S9: { nombre: "Ankle Mobility (movilidad de tobillo, dorsiflexión)", swing: "P1, P10" },
    S10: { nombre: "Single Leg Balance 10 seg (equilibrio estático unipodal)", swing: "P5, P10" },
    S11: { nombre: "Hip Internal Rotation (rotación interna de cadera, X-Factor)", swing: "P4, P7" },
    S12: { nombre: "Hip External Rotation (rotación externa de cadera)", swing: "P5, P7" },
    S13: { nombre: "Lower Quarter Rotation (rotación global del tren inferior)", swing: "P5, P7" },
    S14: { nombre: "Seated Trunk Rotation (rotación de tronco disociada de caderas)", swing: "P4, P5" },
    S15: { nombre: "Lat Length (longitud del dorsal ancho, restricción en follow through)", swing: "P3, P8, P9" },
    S16: { nombre: "Bridge with Leg Extension (fuerza glúteo, estabilidad lumbo-pélvica)", swing: "P5, P6" },
    PB1: { nombre: "Salto Vertical (potencia explosiva de piernas)" },
    PB2: { nombre: "Lanzamiento Rotacional 1 kg (potencia rotacional)", swing: "P4–P7" },
    PB3: { nombre: "Sit Up and Throw 1 kg (potencia de core)" },
    PB4: { nombre: "Fuerza de Agarre (fuerza de manos y antebrazos)", swing: "P1" },
  },
  Competencia: {
    S1: { nombre: "Overhead Deep Squat (movilidad global, postura, dorsiflexión)", swing: "P1, P10" },
    S2: { nombre: "Toe Touch (flexibilidad isquiotibiales y cadena posterior)", swing: "P1" },
    S3: { nombre: "90/90 Stretch (flexibilidad isquiotibiales en posición sentada)", swing: "P4, P5" },
    S4: { nombre: "Pelvic Tilt (control lumbo-pélvico, lordosis funcional)", swing: "P1, P4" },
    S5: { nombre: "Torso Rotation (rotación de tronco sobre caderas fijas)", swing: "P4, P7" },
    S6: { nombre: "Cervical Rotation (rotación cervical, seguimiento visual del objetivo)", swing: "P7" },
    S7: { nombre: "Shoulder Horizontal Abduction (movilidad posterior de hombro, plano horizontal)", swing: "P3, P8, P9" },
    S8: { nombre: "Wrist Flexion/Extension (movilidad de muñeca, control del face)", swing: "P2, P3, P6" },
    S9: { nombre: "Ankle Mobility (movilidad de tobillo, dorsiflexión)", swing: "P1, P10" },
    S10: { nombre: "Single Leg Balance 10 seg (equilibrio estático unipodal)", swing: "P5, P10" },
    S11: { nombre: "Hip Internal Rotation (rotación interna de cadera, X-Factor)", swing: "P4, P7" },
    S12: { nombre: "Hip External Rotation (rotación externa de cadera)", swing: "P5, P7" },
    S13: { nombre: "Lower Quarter Rotation (rotación global del tren inferior)", swing: "P5, P7" },
    S14: { nombre: "Seated Trunk Rotation (rotación de tronco disociada de caderas)", swing: "P4, P5" },
    S15: { nombre: "Lat Length (longitud del dorsal ancho, restricción en follow through)", swing: "P3, P8, P9" },
    S16: { nombre: "Bridge with Leg Extension (fuerza glúteo, estabilidad lumbo-pélvica)", swing: "P5, P6" },
    P1: { nombre: "Salto Vertical (potencia explosiva de piernas)" },
    P2: { nombre: "Sit Up and Throw 2 kg (potencia de core)" },
    P3: { nombre: "Lanzamiento Rotacional 2 kg (potencia rotacional)", swing: "P4–P7" },
    P4: { nombre: "Fuerza de Agarre (fuerza de manos y antebrazos)", swing: "P1" },
    P5: { nombre: "Velocidad de Swing con Driver (potencia total del swing)", swing: "P4–P10" },
  },
  Damas: {
    D1: { nombre: "Overhead Deep Squat (movilidad global, notar valgo de rodilla)", swing: "P1, P10" },
    D2: { nombre: "Toe Touch (flexibilidad cadena posterior)", swing: "P1" },
    D3: { nombre: "90/90 Stretch (flexibilidad isquiotibiales en posición sentada)", swing: "P4, P5" },
    D4: { nombre: "Torso Rotation (rotación de tronco sobre caderas fijas)", swing: "P4, P7" },
    D5: { nombre: "Shoulder Horizontal Abduction (movilidad hombro, documentar hiperlaxitud)", swing: "P3, P8, P9" },
    D6: { nombre: "Ankle Mobility (movilidad de tobillo, dorsiflexión)", swing: "P1, P10" },
    D7: { nombre: "Single Leg Balance 12 seg (equilibrio estático unipodal)", swing: "P5, P10" },
    D8: { nombre: "Hip Sway Test (estabilidad lateral de cadera en carga)", swing: "P4, P7" },
    D9: { nombre: "Bridge with Leg Extension (fuerza glúteo, estabilidad lumbo-pélvica)", swing: "P5, P6" },
    D10: { nombre: "Pelvic Tilt (control lumbo-pélvico, lordosis funcional)", swing: "P1, P4" },
    DP1: { nombre: "Salto Vertical (potencia explosiva de piernas)" },
    DP2: { nombre: "Sit Up and Throw 1.5 kg (potencia de core)" },
    DP3: { nombre: "Lanzamiento Rotacional 1.5 kg (potencia rotacional)", swing: "P4–P7" },
    DP4: { nombre: "Fuerza de Agarre (fuerza de manos y antebrazos)", swing: "P1" },
    DP5: { nombre: "Velocidad de Swing (potencia total del swing)", swing: "P4–P10" },
  },
  "Damas Senior": {
    DS1: { nombre: "Overhead Deep Squat modificado (movilidad con apoyo, sin dolor)", swing: "P1, P10" },
    DS2: { nombre: "Toe Touch (flexibilidad cadena posterior)", swing: "P1" },
    DS3: { nombre: "Torso Rotation (rotación de tronco sobre caderas)", swing: "P4, P7" },
    DS4: { nombre: "90/90 Stretch (flexibilidad isquiotibiales sentada)", swing: "P4, P5" },
    DS5: { nombre: "Pelvic Tilt (control lumbo-pélvico, lordosis funcional)", swing: "P1, P4" },
    DS6: { nombre: "Single Leg Balance (equilibrio unipodal, prevención de caídas)", swing: "P5, P10" },
    DS7: { nombre: "Hip Sway Test (estabilidad lateral de cadera en carga)", swing: "P4, P7" },
    DS8: { nombre: "Bridge with Leg Extension modificado (fuerza glúteo, estabilidad lumbo-pélvica)", swing: "P5, P6" },
    DS9: { nombre: "Fuerza de Agarre (fuerza de manos y antebrazos)", swing: "P1" },
    DS10: { nombre: "Salto Vertical en Puntillas (potencia de piernas y equilibrio)" },
  },
};

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "API key no configurada" }, { status: 500 });
  }

  const body = await request.json();
  const { student, swingEvaluation, physicalEvaluation } = body;

  const grupo = calcularGrupoEfectivo(student);

  // Build swing summary — only evaluated positions
  const swingLines: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const p = `P${i}`;
    const naKey = `p${i}_na`;
    const scoreKey = `p${i}_score`;
    const criteriosKey = `p${i}_criterios`;
    const obsKey = `p${i}_obs`;
    if (swingEvaluation[naKey]) continue;
    const score = swingEvaluation[scoreKey];
    if (score === null || score === undefined) continue;
    const nivel = score >= 8 ? "excelente" : score >= 6 ? "cumple" : score >= 4 ? "en progreso" : "bajo — prioridad";
    const criterios: (string | null)[] = swingEvaluation[criteriosKey] || [];
    const critStr = criterios.length
      ? ` | Criterios: ${criterios.map((c, idx) => `${idx + 1}:${c}`).join(", ")}`
      : "";
    const obs = swingEvaluation[obsKey] ? ` | Obs: ${swingEvaluation[obsKey]}` : "";
    swingLines.push(`  ${p} — ${POSICIONES_NOMBRES[p]}: ${score}/10 (${nivel})${critStr}${obs}`);
  }

  // Build physical summary — only non-NA tests, with full test names for AI context
  const testsData: Record<string, { result: string | null; obs: string | null; na: boolean }> =
    physicalEvaluation.tests_data || {};
  const testInfoMap = TPI_TESTS_INFO[physicalEvaluation.grupo] || TPI_TESTS_INFO["Albatros"] || {};

  function testLabel(tid: string): string {
    const info = testInfoMap[tid];
    if (!info) return tid;
    return info.swing ? `${tid} — ${info.nombre} [swing: ${info.swing}]` : `${tid} — ${info.nombre}`;
  }

  const physLines = Object.entries(testsData)
    .filter(([, t]) => !t.na && t.result)
    .map(([tid, t]) => {
      const nivel = t.result === "cumple" ? "✅ cumple" : t.result === "progreso" ? "⚠️ en progreso" : "❌ bajo";
      const obs = t.obs ? ` — obs: ${t.obs}` : "";
      return `  ${testLabel(tid)}: ${nivel}${obs}`;
    });

  const physLimitations = Object.entries(testsData)
    .filter(([, t]) => !t.na && (t.result === "bajo" || t.result === "progreso"))
    .map(([tid, t]) => `${testLabel(tid)} (${t.result})`);

  const swingWeakPositions = [];
  for (let i = 1; i <= 10; i++) {
    const score = swingEvaluation[`p${i}_score`];
    if (!swingEvaluation[`p${i}_na`] && score !== null && score !== undefined && score < 6) {
      swingWeakPositions.push(`P${i} — ${POSICIONES_NOMBRES[`P${i}`]} (${score}/10)`);
    }
  }

  const instruccionesGrupo: Record<string, string> = {
    Birdies: "Niño 4-5 años. Lenguaje de juego. Máximo 2 prioridades simples. Sin términos técnicos. Los ejercicios deben ser juegos divertidos.",
    "Águilas": "Niño 6-8 años. Lenguaje simple con referencias visuales. Máximo 3 prioridades. Ejercicios cortos y atractivos.",
    Albatros: "Jugador 9-12 años. Terminología técnica básica. Conecta claramente cada limitación física con el error de swing que causa. Drills concretos.",
    "Grupo +14": "Jugador 14+. Terminología TPI completa. Análisis biomecánico detallado. Las conexiones físico-técnico deben ser precisas y cuantificadas.",
    Competencia: "Jugador competitivo 13-17 años. Máxima profundidad técnica. El plan de clase debe ser un protocolo de entrenamiento estructurado con progresiones.",
    Damas: "Jugadora adulta. Considera hiperlaxitud y biomecánica femenina. Enfoque en estabilidad y eficiencia. Los ejercicios deben ser funcionales.",
    "Damas Senior": "Jugadora 50-70 años. PRIORIDAD: prevención de lesiones. Ejercicios de bajo impacto. Progresión conservadora. Énfasis en movilidad funcional.",
  };

  const systemPrompt = `Eres un coach de golf certificado TPI con especialidad en la conexión entre limitaciones físicas y defectos técnicos del swing. Tienes acceso tanto a la evaluación técnica de swing como al screening físico TPI de este alumno. Tu análisis debe revelar EXACTAMENTE cómo las limitaciones físicas CAUSAN los errores técnicos observados.

INSTRUCCIONES PARA ESTE GRUPO (${grupo}):
${instruccionesGrupo[grupo] || instruccionesGrupo["Albatros"]}

PRINCIPIO FUNDAMENTAL: Cada prioridad cruzada debe tener una causa física clara que explique un error técnico específico. No asumas conexiones — usa solo los datos proporcionados.

CRÍTICO: Responde SIEMPRE en español. No muestres tu razonamiento interno. No expliques tu razonamiento. Responde ÚNICAMENTE con el objeto JSON puro sin backticks, sin texto antes ni después. Solo el JSON empezando con { y terminando con }. Si no tienes suficientes datos, genera el mejor análisis posible con lo disponible.

{
  "resumen_integrado": "2-3 oraciones que expliquen cómo el perfil físico de este alumno explica los patrones técnicos observados en el swing. Menciona la conexión más importante.",
  "prioridades_cruzadas": [
    {
      "orden": 1,
      "titulo": "nombre del problema combinado (máx 6 palabras)",
      "limitacion_fisica": "código test + descripción breve del hallazgo (ej: S5 — Torso Rotation bajo, 22°)",
      "error_tecnico": "posición + descripción del error (ej: P4 — Rotación de hombros insuficiente, 6/10)",
      "descripcion": "explicación biomecánica precisa de cómo la limitación física causa o contribuye al error técnico. Máx 3 oraciones.",
      "ejercicio_fisico": "ejercicio correctivo específico con instrucción de ejecución y sets/reps",
      "drill_tecnico": "drill de swing específico que trabaja el patrón una vez mejorada la movilidad",
      "progresion": "cómo secuenciar el trabajo físico y técnico en el tiempo (ej: primero movilidad, luego drill)"
    }
  ],
  "plan_sesion": "descripción del plan de trabajo para la próxima sesión en 2-3 oraciones directas. Menciona el ejercicio físico principal, el drill técnico y el foco integrado.",
  "nota_trackman": "si el alumno tiene datos de velocidad de swing u otras métricas TrackMan mencionadas en las observaciones, interpreta la métrica más relevante en relación con las limitaciones físicas identificadas. Si no hay datos TrackMan, usa null."
}

Máximo 3 prioridades cruzadas. Solo incluye conexiones donde AMBOS lados (físico y técnico) muestren datos reales de la evaluación.`;

  const userMessage = `ALUMNO: ${student.full_name}
GRUPO: ${grupo}
EDAD: ${student.edad || "no especificada"} años

════════════════════════════════════════
EVALUACIÓN TÉCNICA DE SWING
Fecha: ${swingEvaluation.evaluation_date} | Tipo: ${swingEvaluation.evaluation_type}
Promedio: ${swingEvaluation.score_promedio !== null ? `${swingEvaluation.score_promedio}/10` : "—"}

POSICIONES EVALUADAS:
${swingLines.join("\n") || "  (sin posiciones evaluadas)"}

POSICIONES CON PRIORIDAD (score < 6):
${swingWeakPositions.join(", ") || "  ninguna"}
${swingEvaluation.professor_comment ? `\nObservaciones del profesor: ${swingEvaluation.professor_comment}` : ""}

════════════════════════════════════════
SCREENING FÍSICO TPI
Fecha: ${physicalEvaluation.evaluation_date} | Grupo: ${physicalEvaluation.grupo}
Promedio: ${physicalEvaluation.score_promedio !== null && physicalEvaluation.score_promedio !== undefined ? `${physicalEvaluation.score_promedio}/10` : "—"}

TODOS LOS TESTS:
${physLines.join("\n") || "  (sin tests evaluados)"}

LIMITACIONES IDENTIFICADAS (bajo o progreso):
${physLimitations.join(", ") || "  ninguna"}
${physicalEvaluation.professor_comment ? `\nObservaciones: ${physicalEvaluation.professor_comment}` : ""}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return Response.json({ error: data.error?.message || "Error de API" }, { status: response.status });
    }

    const rawText = (data.content?.[0]?.text || "").trim();

    let analysis;
    try {
      analysis = JSON.parse(rawText);
    } catch {
      try {
        const cleaned = rawText.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
        analysis = JSON.parse(cleaned);
      } catch {
        try {
          const match = rawText.match(/\{[\s\S]*\}/);
          analysis = match ? JSON.parse(match[0]) : { resumen_integrado: rawText };
        } catch {
          analysis = { resumen_integrado: rawText };
        }
      }
    }

    // Unwrap if the model double-encoded the full JSON inside resumen_integrado
    if (analysis && typeof analysis === "object") {
      for (let i = 0; i < 3; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = (analysis as any).resumen_integrado;
        if (typeof r !== "string" || !r.trim().startsWith("{")) break;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const inner = JSON.parse(r) as any;
          if (!inner || typeof inner !== "object") break;
          if (typeof inner.resumen_integrado === "string") { analysis = inner; continue; }
          if (inner.prioridades_cruzadas !== undefined) { analysis = { ...analysis, ...inner }; break; }
          analysis = inner;
        } catch { break; }
      }
    }

    return Response.json({ analysis });
  } catch (error) {
    console.error("Error integrated-analysis:", error);
    return Response.json({ error: "Error al conectar con el agente IA" }, { status: 500 });
  }
}
