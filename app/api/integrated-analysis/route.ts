import type { NextRequest } from "next/server";

function calcularGrupoEfectivo(student: { birth_date?: string | null; grupo_activo?: string | null }): string {
  if (student.grupo_activo === "Competencia") return "Competencia";
  if (student.grupo_activo === "Damas") return "Damas";
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
    D1: { nombre: "Overhead Deep Squat (movilidad global tobillo-cadera-hombro, postura en el setup)", swing: "P1, P10" },
    D2: { nombre: "Toe Touch (flexibilidad cadena posterior)", swing: "P1" },
    D4: { nombre: "Torso Rotation (rotación torácica con caderas fijas, causa común de backswing corto)", swing: "P4, P7" },
    D6: { nombre: "Ankle Mobility (dorsiflexión de tobillo)", swing: "P1, P10" },
    D7: { nombre: "Single Leg Balance (equilibrio estático, carga y transferencia de peso)", swing: "P5, P10" },
    D9: { nombre: "Bridge with Leg Extension (fuerza de glúteo, indicador de sway y early extension)", swing: "P5, P6" },
    D10: { nombre: "Pelvic Tilt (disociación pélvica, postura en el setup)", swing: "P1, P4" },
    D11: { nombre: "Cervical Rotation (movilidad de rotación cervical, seguimiento visual de la pelota)", swing: "P7" },
    D12: { nombre: "Hip Internal Rotation (rotación interna de cadera, causa de early extension)", swing: "P6, P7" },
    DP1: { nombre: "Salto Vertical (potencia explosiva de piernas)" },
    DP2: { nombre: "Sit Up and Throw 1.5 kg (potencia de core)" },
    DP3: { nombre: "Lanzamiento Rotacional 1.5 kg (potencia rotacional)", swing: "P4–P7" },
    DP4: { nombre: "Fuerza de Agarre (fuerza de manos y antebrazos)", swing: "P1" },
    DP5: { nombre: "Velocidad de Swing (potencia total del swing)", swing: "P4–P10" },
  },
};

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "API key no configurada" }, { status: 500 });
  }

  const body = await request.json();
  const { student, swingEvaluation, physicalEvaluation, trackman_data } = body;

  const hasSwing = swingEvaluation != null;
  const hasPhysical = physicalEvaluation != null;
  const hasTrackman = trackman_data != null;

  if (!hasSwing && !hasPhysical && !hasTrackman) {
    return Response.json({ error: "No hay datos suficientes para generar el análisis" }, { status: 400 });
  }

  const grupo = calcularGrupoEfectivo(student);
  const fuentes = [hasSwing && "técnico", hasPhysical && "físico TPI", hasTrackman && "Trackman"].filter(Boolean).join(" + ");

  // Build swing summary — only evaluated positions
  const swingLines: string[] = [];
  const swingWeakPositions: string[] = [];
  if (hasSwing) {
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
      if (score < 6) swingWeakPositions.push(`P${p} — ${POSICIONES_NOMBRES[p]} (${score}/10)`);
    }
  }

  // Build physical summary — only non-NA tests, with full test names for AI context
  const testsData: Record<string, { result: string | null; obs: string | null; na: boolean }> =
    hasPhysical ? (physicalEvaluation.tests_data || {}) : {};
  const testInfoMap = hasPhysical
    ? (TPI_TESTS_INFO[physicalEvaluation.grupo] || TPI_TESTS_INFO["Albatros"] || {})
    : {};

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

  const instruccionesGrupo: Record<string, string> = {
    Birdies: "Niño 4-5 años. Lenguaje de juego. Máximo 2 prioridades simples. Sin términos técnicos. Los ejercicios deben ser juegos divertidos.",
    "Águilas": "Niño 6-8 años. Lenguaje simple con referencias visuales. Máximo 3 prioridades. Ejercicios cortos y atractivos.",
    Albatros: "Jugador 9-12 años. Terminología técnica básica. Conecta claramente cada limitación física con el error de swing que causa. Drills concretos.",
    "Grupo +14": "Jugador 14+. Terminología TPI completa. Análisis biomecánico detallado. Las conexiones físico-técnico deben ser precisas y cuantificadas.",
    Competencia: "Jugador competitivo 13-17 años. Máxima profundidad técnica. El plan de clase debe ser un protocolo de entrenamiento estructurado con progresiones.",
    Damas: "Jugadora adulta. Considera hiperlaxitud y biomecánica femenina. Enfoque en estabilidad y eficiencia. Los ejercicios deben ser funcionales.",
  };

  const systemPrompt = `Eres un coach de golf certificado TPI con especialidad en la conexión entre limitaciones físicas y defectos técnicos del swing. Analizas los datos disponibles de este alumno y generas un análisis integrado para el profesor.

INSTRUCCIONES PARA ESTE GRUPO (${grupo}):
${instruccionesGrupo[grupo] || instruccionesGrupo["Albatros"]}

FUENTES DISPONIBLES EN ESTE ANÁLISIS: ${fuentes}
- Si solo tienes datos técnicos: analiza las posiciones débiles del swing y genera recomendaciones técnicas.
- Si solo tienes datos físicos: analiza las limitaciones TPI y su impacto potencial en el swing.
- Si solo tienes Trackman: interpreta las métricas y su relación con posibles patrones de swing.
- Si tienes combinaciones, conecta los datos entre sí con precisión biomecánica.
En el campo "resumen_integrado" SIEMPRE indica qué fuentes utilizaste (ej: "Análisis basado en técnico + Trackman:...").

PRINCIPIO FUNDAMENTAL: Solo incluye conexiones donde haya datos reales. No inventes métricas ni hallazgos que no estén en los datos.

CRÍTICO: Responde SIEMPRE en español. Responde ÚNICAMENTE con el objeto JSON puro sin backticks, sin texto antes ni después. Solo el JSON empezando con { y terminando con }. Sé conciso — cada campo debe respetar su límite de longitud estrictamente, sin relleno.

{
  "resumen_integrado": "Comienza con 'Análisis basado en [fuentes]:'. Luego 1-2 oraciones explicando el hallazgo principal y la conexión más importante entre los datos disponibles.",
  "prioridades_cruzadas": [
    {
      "orden": 1,
      "titulo": "nombre del problema combinado (máx 6 palabras)",
      "limitacion_fisica": "código test + hallazgo si hay datos físicos, o 'Sin datos físicos' si no hay screening",
      "error_tecnico": "posición + descripción si hay datos técnicos, o 'Sin evaluación técnica' si no hay swing",
      "descripcion": "explicación biomecánica o técnica precisa según los datos disponibles. Máx 2 oraciones.",
      "ejercicio_fisico": "ejercicio correctivo específico con instrucción de ejecución y sets/reps, máx 2 oraciones",
      "drill_tecnico": "drill de swing específico que trabaja el patrón, máx 1-2 oraciones",
      "progresion": "cómo secuenciar el trabajo físico y técnico en el tiempo, máx 2 oraciones"
    }
  ],
  "plan_sesion": "plan de trabajo para la próxima sesión en 1-2 oraciones directas basado en las fuentes disponibles.",
  "nota_trackman": "si hay datos Trackman, interpreta la métrica más relevante en relación con las limitaciones o patrones identificados, máx 2 oraciones. Si no hay datos Trackman, usa null."
}

Máximo 2 prioridades. Adapta el contenido a las fuentes disponibles — no dejes campos vacíos innecesariamente.`;

  const swingSection = hasSwing ? `
════════════════════════════════════════
EVALUACIÓN TÉCNICA DE SWING
Fecha: ${swingEvaluation.evaluation_date} | Tipo: ${swingEvaluation.evaluation_type}
Promedio: ${swingEvaluation.score_promedio !== null ? `${swingEvaluation.score_promedio}/10` : "—"}

POSICIONES EVALUADAS:
${swingLines.join("\n") || "  (sin posiciones evaluadas)"}

POSICIONES CON PRIORIDAD (score < 6):
${swingWeakPositions.join(", ") || "  ninguna"}${swingEvaluation.professor_comment ? `\nObservaciones del profesor: ${swingEvaluation.professor_comment}` : ""}` : "";

  const physicalSection = hasPhysical ? `
════════════════════════════════════════
SCREENING FÍSICO TPI
Fecha: ${physicalEvaluation.evaluation_date} | Grupo: ${physicalEvaluation.grupo}
Promedio: ${physicalEvaluation.score_promedio != null ? `${physicalEvaluation.score_promedio}/10` : "—"}

TODOS LOS TESTS:
${physLines.join("\n") || "  (sin tests evaluados)"}

LIMITACIONES IDENTIFICADAS (bajo o progreso):
${physLimitations.join(", ") || "  ninguna"}${physicalEvaluation.professor_comment ? `\nObservaciones: ${physicalEvaluation.professor_comment}` : ""}` : "";

  const trackmanSection = hasTrackman ? `
════════════════════════════════════════
DATOS TRACKMAN DE LA ÚLTIMA SESIÓN:
${trackman_data.club_usado ? `- Club: ${trackman_data.club_usado}` : ""}
${trackman_data.club_speed_mph != null ? `- Club Speed: ${trackman_data.club_speed_mph} mph` : ""}
${trackman_data.ball_speed_mph != null ? `- Ball Speed: ${trackman_data.ball_speed_mph} mph` : ""}
${trackman_data.smash_factor != null ? `- Smash Factor: ${trackman_data.smash_factor}` : ""}
${trackman_data.attack_angle_deg != null ? `- Attack Angle: ${trackman_data.attack_angle_deg}°` : ""}
${trackman_data.club_path_deg != null ? `- Club Path: ${trackman_data.club_path_deg}°` : ""}
${trackman_data.face_angle_deg != null ? `- Face Angle: ${trackman_data.face_angle_deg}°` : ""}
${trackman_data.face_to_path_deg != null ? `- Face to Path: ${trackman_data.face_to_path_deg}°` : ""}
${trackman_data.launch_angle_deg != null ? `- Launch Angle: ${trackman_data.launch_angle_deg}°` : ""}
${trackman_data.spin_rate_rpm != null ? `- Spin Rate: ${trackman_data.spin_rate_rpm} rpm` : ""}
${trackman_data.carry_yards != null ? `- Carry: ${trackman_data.carry_yards} yds` : ""}
${trackman_data.total_yards != null ? `- Total: ${trackman_data.total_yards} yds` : ""}
${trackman_data.notas_adicionales ? `- Notas: ${trackman_data.notas_adicionales}` : ""}
Correlaciona estas métricas con los errores técnicos identificados (ej. si hay over-the-plane en P5 y el path es out-to-in, confirma la conexión causal).` : "";

  const userMessage = `ALUMNO: ${student.full_name}
GRUPO: ${grupo}
EDAD: ${student.edad || "no especificada"} años
FUENTES: ${fuentes}
${swingSection}${physicalSection}${trackmanSection}`;

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
        max_tokens: 2000,
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
