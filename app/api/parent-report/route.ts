import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

function calcularEdadNum(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const hoy = new Date();
  const nac = new Date(birthDate);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJson(raw: string | null | undefined): any {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

function formatFecha(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "API key no configurada" }, { status: 500 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const body = await request.json();
  const { alumno_id, incluir_tecnico, incluir_fisico, incluir_trackman } = body as {
    alumno_id: string;
    incluir_tecnico: boolean;
    incluir_fisico: boolean;
    incluir_trackman: boolean;
  };

  // 1. Fetch student
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, full_name, birth_date, grupo_activo, enrollment_date, parent_name, foto_url")
    .eq("id", alumno_id)
    .single();
  if (studentError || !student) return Response.json({ error: "Alumno no encontrado" }, { status: 404 });

  // 2. Fetch latest swing evaluation with AI analysis
  let swingEval = null;
  if (incluir_tecnico) {
    const { data } = await supabase
      .from("swing_evaluations")
      .select("evaluation_date, evaluation_type, score_promedio, ai_analysis, integrated_analysis")
      .eq("student_id", alumno_id)
      .order("evaluation_date", { ascending: false })
      .limit(1);
    swingEval = data?.[0] ?? null;
  }

  // 3. Fetch latest physical evaluation with AI analysis
  let physEval = null;
  if (incluir_fisico) {
    const { data } = await supabase
      .from("physical_evaluations")
      .select("evaluation_date, evaluation_type, score_promedio, ai_analysis")
      .eq("student_id", alumno_id)
      .order("evaluation_date", { ascending: false })
      .limit(1);
    physEval = data?.[0] ?? null;
  }

  // 4. Fetch latest trackman session
  let trackmanSession = null;
  if (incluir_trackman) {
    const { data } = await supabase
      .from("trackman_sessions")
      .select("fecha, datos")
      .eq("alumno_id", alumno_id)
      .order("fecha", { ascending: false })
      .limit(1);
    trackmanSession = data?.[0] ?? null;
  }

  // 5. Fetch hitos
  const { data: hitos } = await supabase
    .from("hitos")
    .select("id, titulo, descripcion, fecha, foto_url")
    .eq("alumno_id", alumno_id)
    .order("fecha", { ascending: false })
    .limit(6);

  // Parse stored AI analyses
  const swingAI = parseJson(swingEval?.ai_analysis);
  const physAI = parseJson(physEval?.ai_analysis);
  const integradoAI = parseJson(swingEval?.integrated_analysis);

  const edad = calcularEdadNum(student.birth_date);
  const hoy = new Date().toISOString().split("T")[0];

  // Build Claude prompt context
  let contexto = `ALUMNO: ${student.full_name}
GRUPO: ${student.grupo_activo ?? "—"}
EDAD: ${edad ?? "—"} años
FECHA DEL INFORME: ${formatFecha(hoy)}
`;

  if (swingAI && swingEval) {
    contexto += `
EVALUACIÓN TÉCNICA (${formatFecha(swingEval.evaluation_date)}):
Puntaje promedio: ${swingEval.score_promedio ?? "—"}/10
Resumen técnico: ${swingAI.resumen ?? ""}
Fortalezas técnicas: ${(swingAI.fortalezas ?? []).join("; ") || "no especificadas"}
Áreas de mejora: ${(swingAI.prioridades ?? []).slice(0, 3).map((p: { titulo?: string }) => p.titulo ?? "").filter(Boolean).join("; ") || "no especificadas"}
`;
  }

  if (physAI && physEval) {
    contexto += `
EVALUACIÓN FÍSICA TPI (${formatFecha(physEval.evaluation_date)}):
Puntaje promedio: ${physEval.score_promedio ?? "—"}/10
Resumen físico: ${physAI.resumen ?? ""}
Fortalezas físicas: ${(physAI.fortalezas_fisicas ?? []).join("; ") || "no especificadas"}
Aspectos físicos a desarrollar: ${(physAI.limitaciones ?? []).slice(0, 3).map((l: { titulo?: string }) => l.titulo ?? "").filter(Boolean).join("; ") || "no especificados"}
`;
  }

  if (integradoAI) {
    contexto += `
ANÁLISIS INTEGRADO:
${integradoAI.resumen_integrado ?? ""}
Plan de trabajo: ${integradoAI.plan_sesion ?? ""}
`;
  }

  if (trackmanSession) {
    const tm = trackmanSession.datos;
    contexto += `
DATOS TRACKMAN (${formatFecha(trackmanSession.fecha)}):
Club Speed: ${tm.club_speed_mph ?? "—"} mph | Ball Speed: ${tm.ball_speed_mph ?? "—"} mph
Carry: ${tm.carry_yards ?? "—"} yds | Total: ${tm.total_yards ?? "—"} yds
`;
  }

  if (hitos?.length) {
    contexto += `
LOGROS Y HITOS DEL ALUMNO:
${hitos.map((h) => `- ${h.titulo} (${formatFecha(h.fecha)})${h.descripcion ? `: ${h.descripcion}` : ""}`).join("\n")}
`;
  }

  const systemPrompt = `Eres un redactor especializado en comunicación deportiva para padres de familia. Tu tarea es generar un informe de progreso cálido, motivador y claro sobre el desarrollo de un alumno de golf.

REGLAS:
- Tono: cálido, motivador, enfocado en logros y potencial
- Lenguaje: español sencillo, sin jerga técnica de golf
- Cuando menciones aspectos a mejorar, enmarcarlos siempre como oportunidades de crecimiento, nunca como deficiencias
- Máximo 400 palabras en el resumen narrativo
- NO mencionar números de posición (P1, P5, P7) ni códigos TPI (S11, S16, DM3) — tradúcelos a lenguaje natural:
  Ejemplo: "P4 top backswing" → "la parte alta del swing"
  Ejemplo: "S11 Hip Internal Rotation" → "la flexibilidad de cadera"
  Ejemplo: "P7 impacto" → "el momento de contacto con la pelota"
- Si hay hitos o logros, menciónalos con orgullo
- Si hay datos Trackman, menciona la velocidad de swing de forma positiva y comprensible para padres

Devuelve SOLO un JSON válido sin backticks, sin texto extra, comenzando con {:
{
  "saludo": "Estimada familia [apellido del alumno],",
  "resumen_narrativo": "párrafo principal motivador de 200-400 palabras",
  "fortalezas": ["fortaleza concreta 1", "fortaleza 2", "fortaleza 3"],
  "areas_crecimiento": ["oportunidad de crecimiento 1 (tono positivo)", "oportunidad 2", "oportunidad 3"],
  "mensaje_cierre": "frase motivadora y cálida de cierre (1-2 oraciones)",
  "recomendaciones_casa": ["actividad práctica simple en casa 1", "actividad 2", "actividad 3"]
}`;

  // Call Claude
  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: `Genera el informe para los padres basado en estos datos:\n\n${contexto}` }],
    }),
  });

  const anthropicData = await anthropicRes.json();
  if (!anthropicRes.ok) return Response.json({ error: anthropicData.error?.message || "Error de API" }, { status: anthropicRes.status });

  const rawText = (anthropicData.content?.[0]?.text || "").trim();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let informe: any;
  try { informe = JSON.parse(rawText); }
  catch {
    try { informe = JSON.parse(rawText.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim()); }
    catch {
      try { const m = rawText.match(/\{[\s\S]*\}/); informe = m ? JSON.parse(m[0]) : { resumen_narrativo: rawText }; }
      catch { informe = { resumen_narrativo: rawText }; }
    }
  }

  // Build snapshot for storage and public page
  const meta = {
    alumno_nombre: student.full_name,
    alumno_grupo: student.grupo_activo,
    alumno_foto_url: student.foto_url ?? null,
    alumno_birth_date: student.birth_date,
    fecha_generacion: hoy,
    hitos: (hitos ?? []).map((h) => ({ titulo: h.titulo, descripcion: h.descripcion, fecha: h.fecha, foto_url: h.foto_url })),
  };

  const contenidoCompleto = { ...informe, _meta: meta };

  // Save to informes_padres
  const { data: saved, error: saveError } = await supabase
    .from("informes_padres")
    .insert({ alumno_id, contenido_json: contenidoCompleto, fecha: hoy })
    .select("id")
    .single();

  if (saveError) console.error("Error saving informe:", saveError);

  return Response.json({ informe, meta, informe_id: saved?.id ?? null });
}
