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

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "API key no configurada" }, { status: 500 });
  }

  const body = await request.json();
  const { student, evaluation } = body;

  const grupo = calcularGrupoEfectivo(student);

  const testsData: Record<string, { result: string | null; obs: string | null; na: boolean }> =
    evaluation.tests_data || {};

  const testsResumen = Object.entries(testsData)
    .map(([tid, t]) => {
      if (t.na) return `  ${tid}: N/A`;
      const nivel =
        t.result === "cumple" ? "✅ cumple" :
        t.result === "progreso" ? "⚠️ en progreso" :
        t.result === "bajo" ? "❌ bajo" : "no evaluado";
      const obs = t.obs ? ` — obs: ${t.obs}` : "";
      return `  ${tid}: ${nivel}${obs}`;
    })
    .join("\n");

  const instruccionesGrupo: Record<string, string> = {
    Birdies: "Niño 4-5 años. PRIORIDAD: desarrollar patrones de movimiento fundamentales. Los ejercicios deben ser juegos. Máximo 3 recomendaciones muy simples, lenguaje lúdico.",
    "Águilas": "Niño 6-8 años. Combina desarrollo motor con inicio de conciencia corporal. Ejercicios atractivos y cortos, máximo 5 min cada uno.",
    Albatros: "Jugador 9-12 años. Usa terminología básica. Conecta cada limitación física con el defecto técnico del swing que genera.",
    "Grupo +14": "Jugador 14+. Terminología técnica TPI completa. Conecta limitaciones físicas con compensaciones específicas en el swing.",
    Competencia: "Jugador competitivo 13-17 años. Análisis técnico preciso. Cuantifica el impacto de cada limitación en el rendimiento y velocidad de swing.",
    Damas: "Jugadora adulta. Considera hiperlaxitud, patrones de movimiento femeninos, menor masa muscular. Enfoca en estabilidad y eficiencia del movimiento.",
    "Damas Senior": "Jugadora 50-70 años. PRIORIDAD: prevención de lesiones, movilidad funcional, estabilidad. Sin impacto alto. Progresión conservadora.",
  };

  const systemPrompt = `Eres un experto en TPI (Titleist Performance Institute) y fisioterapia deportiva del golf. Analizas evaluaciones físicas de alumnos de la Escuela de Golf CCB y generas guías de ejercicios correctivos para el profesor.

INSTRUCCIONES PARA ESTE GRUPO (${grupo}):
${instruccionesGrupo[grupo] || instruccionesGrupo["Albatros"]}

ESTILO: Tono técnico, coaching deportivo. Oraciones cortas y directas. Sin frases motivacionales genéricas. Usa nomenclatura TPI cuando el grupo lo permite.

CRÍTICO: Responde ÚNICAMENTE con un objeto JSON válido. Sin texto antes, sin texto después, sin markdown, sin backticks. Solo el JSON puro empezando con { y terminando con }.

{
  "resumen": "2-3 oraciones sobre el estado físico general del alumno y su impacto potencial en el swing de golf",
  "limitaciones": [
    {
      "test": "código del test evaluado (ej: S1, DM3, PB2)",
      "titulo": "nombre corto del problema físico (máx 5 palabras)",
      "nivel": "bajo o progreso",
      "descripcion": "qué significa esta limitación biomecánica para el swing, máx 2 oraciones técnicas",
      "conexion_swing": "posición(es) del swing directamente afectada(s), ej: P4 top backswing",
      "ejercicios": ["ejercicio específico con instrucción técnica breve", "segundo ejercicio"]
    }
  ],
  "patron_general": "si hay un patrón común entre las limitaciones (ej: déficit de movilidad rotacional torácica), descríbelo en 1-2 oraciones; null si no hay patrón claro",
  "fortalezas_fisicas": ["fortaleza física específica observada en los resultados", "segunda si existe"],
  "plan_trabajo": [
    { "semanas": "1-4", "objetivo": "objetivo físico medible para esas semanas", "ejercicios": ["ejercicio 1 con sets/reps", "ejercicio 2"] }
  ],
  "nota_edad": "consideración pedagógica específica para edad y grupo, máx 2 oraciones"
}

Solo incluye en limitaciones los tests con resultado bajo o en progreso. Máximo 4 limitaciones, ordenadas por impacto en el swing.`;

  const userMessage = `ALUMNO: ${student.full_name}
GRUPO: ${grupo}
EDAD: ${student.edad || "no especificada"} años
TIPO EVALUACIÓN: ${evaluation.evaluation_type}
FECHA: ${evaluation.evaluation_date}

RESULTADOS FÍSICOS TPI:
${testsResumen}

PROMEDIO GENERAL: ${evaluation.score_promedio !== null && evaluation.score_promedio !== undefined ? `${evaluation.score_promedio}/10` : "—"}
${evaluation.professor_comment ? `\nOBSERVACIONES DEL PROFESOR: ${evaluation.professor_comment}` : ""}`;

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
          analysis = match ? JSON.parse(match[0]) : { resumen: rawText };
        } catch {
          analysis = { resumen: rawText };
        }
      }
    }

    return Response.json({ analysis });
  } catch (error) {
    console.error("Error physical-analysis:", error);
    return Response.json({ error: "Error al conectar con el agente IA" }, { status: 500 });
  }
}
