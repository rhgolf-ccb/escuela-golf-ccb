import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "API key no configurada" }, { status: 500 });
  }

  const body = await request.json();
  const { student, evaluation, physicalTest } = body;

  // Definición de posiciones por grupo
  const posicionesGrupo: Record<string, string[]> = {
    Birdies: ["P1", "P4", "P7"],
    "Águilas": ["P1", "P2", "P4", "P7", "P10"],
    Albatros: ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10"],
    Competencia: ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10"],
    Damas: ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10"],
  };

  const posicionesNombres: Record<string, string> = {
    P1: "Posición inicial (grip, postura, alineación, ball position)",
    P2: "Palo paralelo al piso — inicio backswing",
    P3: "Brazo izquierdo paralelo al piso",
    P4: "Top backswing",
    P5: "Brazo derecho paralelo al piso — inicio downswing",
    P6: "Palo paralelo al piso — downswing",
    P7: "Impacto",
    P8: "Palo paralelo al piso — follow through",
    P9: "Brazo derecho paralelo al piso — follow through",
    P10: "Finish completo",
  };

  const grupo = student.grupo_activo || "Albatros";
  const posicionesActivas = posicionesGrupo[grupo] || posicionesGrupo["Albatros"];

  // Construir resumen de scores
  const scoresMap: Record<string, number | null> = {
    P1: evaluation.p1_score,
    P2: evaluation.p2_score,
    P3: evaluation.p3_score,
    P4: evaluation.p4_score,
    P5: evaluation.p5_score,
    P6: evaluation.p6_score,
    P7: evaluation.p7_score,
    P8: evaluation.p8_score,
    P9: evaluation.p9_score,
    P10: evaluation.p10_score,
  };

  const swingScores = posicionesActivas
    .map((p) => {
      const score = scoresMap[p];
      const nivel =
        score === null || score === undefined
          ? "no evaluado"
          : score >= 8
          ? "excelente"
          : score >= 6
          ? "cumple"
          : score >= 4
          ? "en progreso"
          : "bajo — prioridad";
      return `  ${p} — ${posicionesNombres[p]}: ${score ?? "—"}/10 (${nivel})`;
    })
    .join("\n");

  const juegoCorto = [
    evaluation.juego_corto_putting != null
      ? `Putting: ${evaluation.juego_corto_putting}/10`
      : null,
    evaluation.juego_corto_chipping != null
      ? `Chipping: ${evaluation.juego_corto_chipping}/10`
      : null,
    evaluation.juego_corto_bunker != null
      ? `Bunker: ${evaluation.juego_corto_bunker}/10`
      : null,
  ]
    .filter(Boolean)
    .join(", ");

  const mental = [
    evaluation.mental_rutina != null
      ? `Rutina previa: ${evaluation.mental_rutina}/10`
      : null,
    evaluation.mental_reglas != null
      ? `Reglas y etiqueta: ${evaluation.mental_reglas}/10`
      : null,
  ]
    .filter(Boolean)
    .join(", ");

  // Contexto físico TPI si existe
  const contextoFisico = physicalTest
    ? `
DATOS TEST FÍSICO TPI (evaluación más reciente):
- Movilidad T-spine: ${physicalTest.tspine ?? "no evaluado"}
- Rotación cadera: ${physicalTest.hip_rotation ?? "no evaluado"}
- Estabilidad core: ${physicalTest.core_stability ?? "no evaluado"}
- Flexibilidad hombros: ${physicalTest.shoulder_flexibility ?? "no evaluado"}
- Balance: ${physicalTest.balance ?? "no evaluado"}
Nota: usa estos datos para conectar limitaciones físicas con patrones de swing cuando sea relevante.`
    : "No hay test físico TPI disponible para este alumno.";

  const instruccionesGrupo: Record<string, string> = {
    Birdies:
      "El alumno tiene 4-5 años. USA LENGUAJE DE JUEGO en las instrucciones al profesor — 'agarra el palo como un helado', 'apunta al árbol', etc. NUNCA uses términos técnicos. El objetivo es exploración y diversión, no técnica. Máximo 2 sugerencias simples.",
    "Águilas":
      "El alumno tiene 6-8 años. Usa lenguaje simple y referencias visuales concretas. Las correcciones deben hacerse con demostraciones físicas, no explicaciones verbales largas. Máximo 1 corrección por categoría.",
    Albatros:
      "El alumno tiene 9-12 años. Puedes usar terminología técnica básica de golf pero siempre con una explicación práctica. Los drills deben ser concretos y realizables en clase. Conecta los errores técnicos con sus causas físicas cuando tengas datos TPI.",
    Competencia:
      "El alumno está en grupo Competencia (13-17 años, nivel avanzado). Usa terminología técnica completa. Puedes mencionar conceptos como attack angle, face-to-path, lag, early extension. Conecta con datos de Trackman si el profesor los tiene. Las prioridades deben ser precisas y medibles.",
    Damas:
      "Grupo Damas. Usa terminología técnica completa adaptada. Considera que pueden tener menor rotación de cadera que juniors masculinos — no lo trates como déficit sino como característica a trabajar con ejercicios específicos.",
  };

  const systemPrompt = `Eres un experto en pedagogía del golf con certificación TPI (Titleist Performance Institute) y especialización en desarrollo juvenil según el modelo LTAD (Long-Term Athlete Development) canadiense.

Tu función es analizar evaluaciones de swing de alumnos de la Escuela de Golf del Country Club de Bogotá (CCB) y generar guías de instrucción claras, priorizadas y accionables para los profesores.

GRUPOS CCB:
- Birdies: 4-5 años
- Águilas: 6-8 años  
- Albatros: 9-12 años
- Grupo +14: 13-17 años no competitivo
- Competencia: 13-17 años competitivo (asignación manual siempre)
- Damas: adultas

INSTRUCCIONES ESPECÍFICAS PARA ESTE GRUPO:
${instruccionesGrupo[grupo] || instruccionesGrupo["Albatros"]}

FORMATO DE RESPUESTA — responde SIEMPRE en este formato JSON exacto:
{
  "resumen": "2-3 oraciones resumiendo el estado técnico general del alumno",
  "prioridades": [
    {
      "orden": 1,
      "posicion": "P4-P5",
      "titulo": "Título corto del problema",
      "descripcion": "Explicación del problema en términos que el profesor entienda y pueda observar en clase",
      "instruccion_profesor": "Qué hacer exactamente en clase — concreto y práctico",
      "conexion_fisica": "Conexión con test físico TPI si aplica, o null",
      "drills": ["Nombre del drill 1", "Nombre del drill 2"]
    }
  ],
  "fortalezas": ["Fortaleza 1 con score", "Fortaleza 2 con score"],
  "plan_clase": [
    { "minutos": "0-10", "actividad": "Descripción", "tipo": "fisico|tecnico|juego_corto|mental" }
  ],
  "nota_edad": "Consideración especial por edad/grupo que el profesor debe tener en mente"
}

Incluye máximo 3 prioridades. Sé específico, práctico y directo. No uses frases genéricas.`;

  const userMessage = `ALUMNO: ${student.full_name}
GRUPO: ${grupo}
EDAD: ${student.edad || "no especificada"}
TIPO DE EVALUACIÓN: ${evaluation.evaluation_type}
FECHA: ${evaluation.evaluation_date}

SCORES DE SWING (escala 1-10):
${swingScores}
${juegoCorto ? `\nJUEGO CORTO: ${juegoCorto}` : ""}
${mental ? `\nMENTAL Y REGLAS: ${mental}` : ""}
PROMEDIO GENERAL: ${evaluation.score_promedio ?? "—"}/10

${evaluation.professor_comment ? `OBSERVACIONES DEL PROFESOR: ${evaluation.professor_comment}` : ""}

${contextoFisico}

Genera el análisis completo para guiar al profesor en las próximas clases.`;

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

    const rawText = data.content?.[0]?.text || "";

    // Parsear JSON de la respuesta
    let analysis;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { resumen: rawText };
    } catch {
      analysis = { resumen: rawText };
    }

    return Response.json({ analysis, raw: rawText });
  } catch (error) {
    return Response.json(
      { error: "Error al conectar con el agente IA" },
      { status: 500 }
    );
  }
}