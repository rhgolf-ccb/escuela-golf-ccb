import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "API key no configurada" }, { status: 500 });
  }

  const body = await request.json();
  const { student, evaluation, physicalTest } = body;

  const posicionesGrupo: Record<string, string[]> = {
    Birdies: ["P1", "P4", "P7", "P10"],
    "Águilas": ["P1", "P2", "P4", "P7", "P10"],
    Albatros: ["P1","P2","P3","P4","P5","P6","P7","P8","P9","P10"],
    Competencia: ["P1","P2","P3","P4","P5","P6","P7","P8","P9","P10"],
    Damas: ["P1","P2","P3","P4","P5","P6","P7","P8","P9","P10"],
  };

  const posicionesNombres: Record<string, string> = {
    P1: "Posición inicial (grip, postura, alineación, posición de la bola)",
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

  const scoresMap: Record<string, number | null> = {
    P1: evaluation.p1_score, P2: evaluation.p2_score, P3: evaluation.p3_score,
    P4: evaluation.p4_score, P5: evaluation.p5_score, P6: evaluation.p6_score,
    P7: evaluation.p7_score, P8: evaluation.p8_score, P9: evaluation.p9_score,
    P10: evaluation.p10_score,
  };

  const criteriosMap: Record<string, string[] | null> = {
    P1: evaluation.p1_criterios, P2: evaluation.p2_criterios, P3: evaluation.p3_criterios,
    P4: evaluation.p4_criterios, P5: evaluation.p5_criterios, P6: evaluation.p6_criterios,
    P7: evaluation.p7_criterios, P8: evaluation.p8_criterios, P9: evaluation.p9_criterios,
    P10: evaluation.p10_criterios,
  };

  const naMap: Record<string, boolean> = {
    P1: evaluation.p1_na, P2: evaluation.p2_na, P3: evaluation.p3_na,
    P4: evaluation.p4_na, P5: evaluation.p5_na, P6: evaluation.p6_na,
    P7: evaluation.p7_na, P8: evaluation.p8_na, P9: evaluation.p9_na,
    P10: evaluation.p10_na,
  };

  const swingScores = posicionesActivas.map((p) => {
    if (naMap[p]) return `  ${p} — ${posicionesNombres[p]}: N/A (pendiente de evaluar)`;
    const score = scoresMap[p];
    const criterios = criteriosMap[p];
    const nivel = score === null ? "no evaluado" : score >= 8 ? "excelente" : score >= 6 ? "cumple" : score >= 4 ? "en progreso" : "bajo — prioridad";
    const detalle = criterios ? criterios.map((c, i) => `${i+1}:${c}`).join(", ") : "";
    return `  ${p} — ${posicionesNombres[p]}: ${score ?? "—"}/10 (${nivel})${detalle ? ` | Criterios: ${detalle}` : ""}`;
  }).join("\n");

  const contextoFisico = physicalTest
    ? `DATOS TEST FÍSICO TPI: movilidad T-spine: ${physicalTest.tspine ?? "no evaluado"}, rotación cadera: ${physicalTest.hip_rotation ?? "no evaluado"}, estabilidad core: ${physicalTest.core_stability ?? "no evaluado"}`
    : "No hay test físico TPI disponible para este alumno.";

  const instruccionesGrupo: Record<string, string> = {
    Birdies: "El alumno tiene 4-5 años. USA LENGUAJE DE JUEGO — 'agarra el palo como un helado', 'apunta al árbol'. NUNCA uses términos técnicos. Máximo 2 sugerencias simples.",
    "Águilas": "El alumno tiene 6-8 años. Lenguaje simple y referencias visuales. Correcciones con demostraciones físicas. Máximo 1 corrección por categoría.",
    Albatros: "El alumno tiene 9-12 años. Terminología técnica básica con explicación práctica. Drills concretos. Conecta errores técnicos con causas físicas cuando tengas datos TPI.",
    Competencia: "El alumno está en grupo Competencia (13-17 años, nivel avanzado). Usa terminología técnica completa. Las prioridades deben ser precisas y medibles.",
    Damas: "Grupo Damas adultas. Terminología técnica completa. Considera características biomecánicas femeninas — menor rotación de cadera es normal.",
  };

  const systemPrompt = `Eres un experto en pedagogía del golf con certificación TPI y especialización LTAD. Analizas evaluaciones de swing de alumnos de la Escuela de Golf del Country Club de Bogotá (CCB).

INSTRUCCIONES PARA ESTE GRUPO (${grupo}):
${instruccionesGrupo[grupo] || instruccionesGrupo["Albatros"]}

ESTILO DE REDACCIÓN: Tono técnico y formal de coaching deportivo. Oraciones cortas y directas. Sin frases motivacionales genéricas ("gran potencial", "sigue así"). Usa nomenclatura técnica de golf (on-plane, lag, shaft lean, etc.) cuando el grupo lo permite. Sé conciso — cada campo debe respetar su límite de longitud estrictamente, sin relleno.

CRÍTICO: Responde ÚNICAMENTE con un objeto JSON válido. Sin texto antes, sin texto después, sin markdown, sin backticks, sin explicaciones. Solo el JSON puro empezando con { y terminando con }.

El JSON debe tener exactamente esta estructura:
{
  "resumen": "párrafo técnico de 2 oraciones sobre el estado actual del swing, tono formal y objetivo, sin frases genéricas",
  "prioridades": [
    {
      "orden": 1,
      "posicion": "código de posición(es) afectadas, ej: P2 / P3",
      "titulo": "máx 6 palabras, nombre técnico del defecto",
      "descripcion": "observación técnica objetiva del problema, 1 oración corta",
      "instruccion_profesor": "indicación directa y accionable para el profesor en clase, máx 2 oraciones",
      "conexion_fisica": "restricción física TPI relacionada, máx 1 oración, o null si no hay test disponible",
      "drills": ["nombre del drill específico con descripción breve (1 línea)"]
    }
  ],
  "fortalezas": ["observación técnica positiva concreta (1 línea)", "segunda fortaleza (1 línea)"],
  "plan_clase": [
    { "minutos": "0-10", "actividad": "descripción específica de la actividad en 1 línea", "tipo": "fisico" }
  ],
  "nota_edad": "consideración pedagógica concisa por edad y nivel del grupo, 1 oración"
}

Máximo 2 prioridades, con exactamente 1 drill cada una. Máximo 3 bloques en plan_clase. Solo incluye posiciones evaluadas (no N/A). Los tipos de plan_clase son: fisico, tecnico, juego_corto, mental.`;

  const userMessage = `ALUMNO: ${student.full_name}
GRUPO: ${grupo}
EDAD: ${student.edad || "no especificada"} años
TIPO: ${evaluation.evaluation_type}
FECHA: ${evaluation.evaluation_date}

EVALUACIÓN DE SWING:
${swingScores}

PROMEDIO: ${evaluation.score_promedio ?? "—"}/10
${evaluation.professor_comment ? `\nOBSERVACIONES DEL PROFESOR: ${evaluation.professor_comment}` : ""}

${contextoFisico}`;

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
        max_tokens: 1600,
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
      // Intento 1: parse directo
      analysis = JSON.parse(rawText);
    } catch {
      try {
        // Intento 2: limpiar backticks y parsear
        const cleaned = rawText.replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/\s*```$/,'').trim();
        analysis = JSON.parse(cleaned);
      } catch {
        try {
          // Intento 3: extraer objeto JSON con regex
          const match = rawText.match(/\{[\s\S]*\}/);
          analysis = match ? JSON.parse(match[0]) : { resumen: rawText };
        } catch {
          analysis = { resumen: rawText };
        }
      }
    }

    return Response.json({ analysis });
  } catch (error) {
    console.error("Error swing-analysis:", error);
    return Response.json({ error: "Error al conectar con el agente IA" }, { status: 500 });
  }
}
