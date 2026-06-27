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

  // Build physical summary — only non-NA tests
  const testsData: Record<string, { result: string | null; obs: string | null; na: boolean }> =
    physicalEvaluation.tests_data || {};
  const physLines = Object.entries(testsData)
    .filter(([, t]) => !t.na && t.result)
    .map(([tid, t]) => {
      const nivel = t.result === "cumple" ? "✅ cumple" : t.result === "progreso" ? "⚠️ en progreso" : "❌ bajo";
      const obs = t.obs ? ` — obs: ${t.obs}` : "";
      return `  ${tid}: ${nivel}${obs}`;
    });

  const physLimitations = Object.entries(testsData)
    .filter(([, t]) => !t.na && (t.result === "bajo" || t.result === "progreso"))
    .map(([tid, t]) => `${tid} (${t.result})`);

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

CRÍTICO: Responde ÚNICAMENTE con JSON válido. Sin texto extra, sin markdown, sin backticks.

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
  "plan_clase": [
    { "fase": "nombre de la fase", "minutos": "10", "actividad": "descripción específica de la actividad integrada", "tipo": "fisico|tecnico|integrado" }
  ],
  "indicadores_progreso": [
    "indicador medible concreto (ej: Torso Rotation pasar de 22° a 35°+ en 4 semanas)"
  ],
  "nota_edad": "consideración pedagógica específica para la edad y grupo. Máx 2 oraciones."
}

Máximo 3 prioridades cruzadas. Solo incluye conexiones donde AMBOS lados (físico y técnico) muestren datos reales de la evaluación. El plan de clase debe ser una sesión de 60 minutos estructurada.`;

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

    return Response.json({ analysis });
  } catch (error) {
    console.error("Error integrated-analysis:", error);
    return Response.json({ error: "Error al conectar con el agente IA" }, { status: 500 });
  }
}
