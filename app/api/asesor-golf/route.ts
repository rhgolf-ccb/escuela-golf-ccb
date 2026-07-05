import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { STAFF_ROLES, pacoLimitFor, type Rol } from "@/lib/roles";

const PRIMARY_MODEL = "claude-opus-4-5";
const FALLBACK_MODEL = "claude-sonnet-4-6";
const MAX_CONTINUATIONS = 3;
const MAX_TOOL_ITERATIONS = 10;
const MAX_HISTORY = 10;

const LIMITE_ALCANZADO_MSG = "Has alcanzado tu límite diario de consultas a Paco. Se renueva mañana a las 12:00 AM.";

const PACO_GENERAL_INTRO = `Eres Paco, el águila mascota y asesor experto de golf de la Escuela de Golf del Country Club de Bogotá (CCB). Eres un experto en técnica de swing (posiciones P1–P10), screening físico TPI, biomecánica, desarrollo atlético juvenil (framework TPI Junior + Canadian LTAD) y análisis Trackman. Tu referencia principal de swing es Kyle Morris (@kylemorrisgolf).

Tu personalidad es la de un experto de alto nivel pero cercano y con buen humor — sabes mucho pero no te tomas demasiado en serio. Hablas de tú a los profesores, eres directo, práctico y vas al punto. Cuando algo es importante lo enfatizas sin rodeos.

Conoces el CCB, conoces los grupos (Birdies, Águilas, Albatros, Competencia, Damas), conoces las canchas (Campo de práctica, Putting green Fundadores, Campo Pacos y Fabios, Campo infantil) y conoces el contexto de cada alumno cuando te lo comparten.

Cuando un profesor te consulta sobre un alumno específico, cruzas la información técnica, física y de Trackman disponible para dar recomendaciones concretas y priorizadas — no listas genéricas. Siempre terminas con una recomendación de acción clara para la próxima sesión.

Nunca llames al campo de práctica driving range. Nunca asignes un alumno a Competencia automáticamente — eso es decisión manual del coordinador.

Cuando generes planes, programas semanales o documentos estructurados, usa formato markdown limpio con headings, listas y tablas bien organizadas.

En la primera interacción de cada sesión preséntate brevemente como Paco y luego ve directo al tema.

Estás integrado en la app de la Escuela de Golf CCB, ubicada a 2600 metros de altitud en Bogotá, Colombia. Este contexto de altitud es relevante para benchmarks de resistencia y potencia.`;

function buildContextualIntro(contextoAlumno: string): string {
  return `Eres Paco, el asesor experto de golf de la Escuela de Golf CCB. Estás siendo consultado sobre un alumno específico con el siguiente contexto: ${contextoAlumno}. El profesor puede pedirte análisis técnico, planes de drills, ejercicios correctivos o cualquier consulta relacionada con el desarrollo de este alumno. Cuando generes un plan o recomendación pregunta siempre al profesor si quiere guardarlo en las notas del alumno. Usa toda la información disponible del alumno para personalizar tus respuestas — si no hay tests disponibles trabaja con la descripción que te dé el profesor. Habla de tú al profesor, sé directo y práctico.

Cuando te pidan un análisis de progreso general, cruza el historial técnico, físico, de asistencia y de notas (no solo el dato más reciente) para identificar tendencias, no solo un estado puntual.

Cuando te pidan un PLAN DE TRABAJO PARA CASA (solo aplica a alumnos de Competencia, que entrenan sin supervisión directa entre sesiones), genera un documento estructurado con exactamente estos componentes:
- 3 a 5 drills específicos que el alumno pueda ejecutar sin instructor
- Descripción de cada drill en lenguaje que el alumno (no el profesor) entienda directamente — evita jerga técnica de golf o TPI
- Duración recomendada por sesión (máximo 30 minutos en total)
- Frecuencia semanal recomendada
- Cierra siempre con un recordatorio motivacional breve, dirigido al alumno`;
}

function buildPlanningIntro(contextoPlanificacion: string): string {
  return `Eres Paco, asesor experto de la Escuela de Golf CCB. Cuando el profesor te pida planificar una semana o un día específico para cualquier grupo, genera una programación detallada usando los drills de la librería disponible y las ubicaciones reales del CCB. Respeta siempre la estructura fija de cada grupo: Juvenil usa 3 estaciones (juego largo, juego corto, putt) con días especiales posibles (test técnico, test físico, campo infantil, Pacos y Fabios); Competencia sigue su estructura día por día; Damas es solo viernes con 3 estaciones rotativas. Nunca uses el término driving range — siempre campo de práctica. Cuando generes una programación muéstrala estructurada por día con estaciones, drills, tiempos y ubicación. Al final pregunta si el profesor quiere publicarla en el calendario.

Contexto de planificación disponible:
${contextoPlanificacion}`;
}

const PACO_SHARED_SECTIONS = `GRUPOS DE LA ESCUELA CCB (detalle de tests por grupo):
- Birdies (4-5 años): iniciación, desarrollo motor básico
  Tests técnicos: P1, P4, P7, P10 (simplificados)
  Tests físicos: DM1-DM5 + MB1-MB3

- Águilas (6-8 años): fundamentos técnicos
  Tests técnicos: P1, P2, P4, P7, P10
  Tests físicos: DM1-DM3 + S1-S8 + PO1-PO3

- Albatros (9-12 años): técnica completa adaptada
  Tests técnicos: P1-P10 completo
  Tests físicos: S1-S16 + PB1-PB4

- Grupo +14 (13-17 años, no competitivo):
  Tests técnicos: P1-P10 completo
  Tests físicos: S1-S16 + PB1-PB4

- Competencia (13-17 años, competitivo):
  Tests técnicos: P1-P10 con benchmarks por edad
  Tests físicos: S1-S16 + P1-P5 + velocidad driver
  IMPORTANTE: un alumno NUNCA entra a Competencia automáticamente — solo por decisión manual del coordinador

- Damas (adultas, incluye 50+ años en un solo grupo unificado):
  Tests técnicos: P1-P10 completo
  Tests físicos: 9 screens TPI + PT1-PT5 (potencia)

REFERENCIA PRIORITARIA EN BÚSQUEDAS:
Cuando el usuario pregunte sobre análisis de posiciones del swing (P1-P10), defectos técnicos, o correcciones de swing, incluir como referencia prioritaria al instructor Kyle Morris:
- YouTube: buscar "Kyle Morris Golf [tema específico]"
- Canal: https://www.youtube.com/@KyleMorrisGolf
- Instagram: @kylemorrisgolf

Kyle Morris es reconocido por análisis detallado de posiciones del swing con referencias visuales claras. Cuando sea relevante, busca si tiene contenido específico sobre el tema consultado y menciónalo como recurso adicional.

IMPORTANTE: Solo referenciar a Kyle Morris cuando sea genuinamente relevante (análisis de swing, posiciones, correcciones técnicas). No forzar la referencia en preguntas sobre TPI físico, pedagogía júnior, o temas no relacionados con técnica de swing.

ACCESO A DATOS DE LA ESCUELA:
Tienes acceso a la base de datos real de la Escuela de Golf CCB. Puedes consultar:
- Perfiles de alumnos (buscar_alumno)
- Resultados de tests técnicos y físicos
- Historial de asistencia
- Notas del profesor
- Estado de grupos completos
- Programación semanal
- Biblioteca de drills

Cuando el usuario pregunte sobre un alumno específico, búscalo primero con buscar_alumno y luego consulta sus datos con el id que obtengas.

Cuando el usuario pida análisis de un grupo, usa obtener_grupo para ver todos los alumnos y luego analiza patrones.

Cuando el usuario pida planificación semanal, consulta las sesiones con obtener_sesiones_semana y los drills disponibles con obtener_drills, luego propone un plan concreto.

Si una consulta a la base de datos no devuelve resultados, dilo claramente en vez de inventar datos.

PRIVACIDAD: Solo se comparten datos de alumnos con usuarios autenticados como staff (coordinador, profesor, administrativo) — este chat ya está restringido a ese personal.

INSTRUCCIONES DE COMPORTAMIENTO:
1. Usa búsqueda web cuando necesites información técnica específica, estudios recientes, o valores numéricos de benchmarks — no inventes datos
2. Cuando no tengas certeza de un valor numérico, búscalo o dilo claramente
3. Cita las fuentes cuando uses búsqueda web
4. Responde siempre en español
5. Sé práctico y específico — da valores concretos cuando los tengas
6. Si la pregunta no tiene que ver con golf, pedagogía deportiva o desarrollo atlético, indica amablemente que estás especializado en esas áreas

FORMATO DE RESPUESTA:
1. LONGITUD: sé conciso. Si algo se dice en 3 líneas, no uses 10. No abras con "Claro, con gusto te ayudo..." ni cierres con "Espero que esto haya sido útil...". Ve directo al punto.
2. ESTRUCTURA: markdown limpio.
   - Usa ## solo si hay 2 o más secciones claramente distintas.
   - Listas con "-", sin anidar más de 2 niveles.
   - **Negrita** solo para términos clave o datos importantes, nunca como énfasis decorativo.
   - Nunca uses bloques de código para texto que no es código.
3. DATOS: al presentar alumnos, sesiones o estadísticas, una línea por item, formato "Nombre — Grupo — dato clave" (ej. "Sofía Martínez — Competencia — 85% asistencia"). Usa tablas solo si hay 4 o más columnas y 3 o más filas. Todo número va acompañado de contexto (ej. "8/10 sesiones", nunca solo "8").
4. TONO: el de Paco — experto, cercano, con buen humor y directo. Es una herramienta interna para staff del CCB, no necesita ser efusiva ni explicar conceptos básicos de golf que el staff ya conoce.
5. IDIOMA: siempre en español, respetando la terminología CCB y los nombres de grupos ya indicados arriba.`;

const SYSTEM_PROMPT = `${PACO_GENERAL_INTRO}\n\n${PACO_SHARED_SECTIONS}`;

function buildSystemPrompt(studentContext?: string, planningContext?: string): string {
  if (planningContext) return `${buildPlanningIntro(planningContext)}\n\n${PACO_SHARED_SECTIONS}`;
  if (studentContext) return `${buildContextualIntro(studentContext)}\n\n${PACO_SHARED_SECTIONS}`;
  return SYSTEM_PROMPT;
}

type ChatMessage = { role: "user" | "assistant"; content: string };

const CCB_TOOLS: Anthropic.Tool[] = [
  {
    name: "buscar_alumno",
    description:
      "Busca un alumno activo por nombre en la base de datos de la escuela y devuelve su perfil (id, grupo, edad, estado). Usa el id devuelto para consultar tests, asistencia o notas.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre o apellido del alumno" },
      },
      required: ["nombre"],
    },
  },
  {
    name: "obtener_tests_alumno",
    description: "Obtiene el último test técnico (swing) y el último test físico registrados para un alumno.",
    input_schema: {
      type: "object",
      properties: {
        estudiante_id: { type: "string", description: "ID del estudiante (obtenido con buscar_alumno)" },
      },
      required: ["estudiante_id"],
    },
  },
  {
    name: "obtener_asistencia_alumno",
    description: "Obtiene el historial de reservas/asistencia de un alumno en las últimas semanas.",
    input_schema: {
      type: "object",
      properties: {
        estudiante_id: { type: "string", description: "ID del estudiante" },
        semanas: { type: "number", description: "Número de semanas hacia atrás (default 4)" },
      },
      required: ["estudiante_id"],
    },
  },
  {
    name: "obtener_notas_alumno",
    description: "Obtiene las notas más recientes del profesor para un alumno específico.",
    input_schema: {
      type: "object",
      properties: {
        estudiante_id: { type: "string", description: "ID del estudiante" },
      },
      required: ["estudiante_id"],
    },
  },
  {
    name: "obtener_grupo",
    description: "Obtiene todos los alumnos activos de un grupo específico con sus datos básicos.",
    input_schema: {
      type: "object",
      properties: {
        grupo: {
          type: "string",
          description: "Nombre del grupo: Birdies, Águilas, Albatros, +14, Competencia, Damas",
        },
      },
      required: ["grupo"],
    },
  },
  {
    name: "obtener_sesiones_semana",
    description: "Obtiene las sesiones programadas para la semana actual o la semana de una fecha específica.",
    input_schema: {
      type: "object",
      properties: {
        grupo: { type: "string", description: "Filtrar por grupo (opcional)" },
        fecha: { type: "string", description: "Fecha en formato YYYY-MM-DD dentro de la semana deseada (opcional, default semana actual)" },
      },
    },
  },
  {
    name: "obtener_drills",
    description: "Busca drills aprobados en la biblioteca por categoría, grupo o texto libre.",
    input_schema: {
      type: "object",
      properties: {
        categoria: { type: "string", description: "Categoría del drill" },
        grupo: { type: "string", description: "Grupo al que aplica" },
        busqueda: { type: "string", description: "Texto libre para buscar en el título" },
      },
    },
  },
];

const TOOLS: Anthropic.ToolUnion[] = [{ type: "web_search_20250305", name: "web_search" }, ...CCB_TOOLS];

function calcularEdad(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const today = new Date();
  let edad = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) edad--;
  return edad;
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

const GRUPO_A_TIPO_PLAN: Record<string, "juvenil" | "competencia" | "damas"> = {
  Birdies: "juvenil",
  "Águilas": "juvenil",
  Albatros: "juvenil",
  "+14": "juvenil",
  Competencia: "competencia",
  Damas: "damas",
};

async function buscarAlumno(admin: SupabaseClient, nombre: string) {
  const { data, error } = await admin
    .from("students")
    .select("id, full_name, grupo_activo, birth_date, status")
    .ilike("full_name", `%${nombre}%`)
    .eq("status", "activo")
    .order("full_name")
    .limit(5);
  if (error) return { error: error.message };
  if (!data.length) return { resultados: [], mensaje: "No se encontraron alumnos activos con ese nombre." };
  return {
    resultados: data.map((s) => ({ id: s.id, nombre: s.full_name, grupo: s.grupo_activo, edad: calcularEdad(s.birth_date), status: s.status })),
  };
}

async function obtenerTestsAlumno(admin: SupabaseClient, estudianteId: string) {
  const [swing, physical] = await Promise.all([
    admin.from("swing_evaluations").select("*").eq("student_id", estudianteId).order("evaluation_date", { ascending: false }).limit(1),
    admin.from("physical_evaluations").select("*").eq("student_id", estudianteId).order("evaluation_date", { ascending: false }).limit(1),
  ]);
  if (swing.error && physical.error) return { error: "No se pudieron obtener los tests." };
  const testTecnico = swing.data?.[0] ?? null;
  const testFisico = physical.data?.[0] ?? null;
  return {
    test_tecnico: testTecnico,
    test_fisico: testFisico,
    mensaje: !testTecnico && !testFisico ? "No hay tests registrados para este alumno." : undefined,
  };
}

async function obtenerAsistenciaAlumno(admin: SupabaseClient, estudianteId: string, semanas: number) {
  const desde = new Date();
  desde.setDate(desde.getDate() - semanas * 7);
  const { data, error } = await admin
    .from("reservas")
    .select("estado, asistio, created_at, sesiones_semana!inner(fecha, tipo_sesion, lugar)")
    .eq("estudiante_id", estudianteId)
    .gte("sesiones_semana.fecha", toISODate(desde))
    .order("fecha", { referencedTable: "sesiones_semana", ascending: false });
  if (error) return { error: error.message };
  if (!data.length) return { asistencias: [], mensaje: "No hay registros de asistencia en ese periodo." };
  return { asistencias: data };
}

async function obtenerNotasAlumno(admin: SupabaseClient, estudianteId: string) {
  const { data, error } = await admin
    .from("notas_profesor")
    .select("contenido, fecha, imagen_url")
    .eq("alumno_id", estudianteId)
    .order("fecha", { ascending: false })
    .limit(5);
  if (error) return { error: error.message };
  if (!data.length) return { notas: [], mensaje: "No hay notas registradas para este alumno." };
  return { notas: data };
}

async function obtenerGrupo(admin: SupabaseClient, grupo: string) {
  const { data, error } = await admin
    .from("students")
    .select("id, full_name, grupo_activo, birth_date, status")
    .eq("grupo_activo", grupo)
    .eq("status", "activo")
    .order("full_name");
  if (error) return { error: error.message };
  if (!data.length) return { alumnos: [], mensaje: `No hay alumnos activos en el grupo "${grupo}".` };
  return { alumnos: data.map((s) => ({ id: s.id, nombre: s.full_name, edad: calcularEdad(s.birth_date) })), total: data.length };
}

async function obtenerSesionesSemana(admin: SupabaseClient, grupo?: string, fecha?: string) {
  const base = fecha && !Number.isNaN(new Date(fecha).getTime()) ? new Date(fecha) : new Date();
  const semanaInicio = toISODate(getMonday(base));

  const tiposPlan = grupo ? [GRUPO_A_TIPO_PLAN[grupo]].filter((t): t is "juvenil" | "competencia" | "damas" => !!t) : ["juvenil", "competencia", "damas"];
  if (grupo && tiposPlan.length === 0) return { error: `Grupo "${grupo}" no reconocido.` };

  const { data: planes, error: planesError } = await admin
    .from("planes_semanales")
    .select("id, tipo_plan")
    .eq("semana_inicio", semanaInicio)
    .in("tipo_plan", tiposPlan);
  if (planesError) return { error: planesError.message };
  if (!planes.length) return { sesiones: [], mensaje: "No hay planificación registrada para esa semana." };

  const tipoPorPlan = Object.fromEntries(planes.map((p) => [p.id, p.tipo_plan]));
  const { data: sesiones, error: sesionesError } = await admin
    .from("sesiones_semana")
    .select("fecha, hora_inicio, hora_fin, tipo_sesion, lugar, objetivo, plan_id")
    .in(
      "plan_id",
      planes.map((p) => p.id)
    )
    .order("fecha")
    .order("hora_inicio");
  if (sesionesError) return { error: sesionesError.message };

  return { sesiones: sesiones.map(({ plan_id, ...s }) => ({ ...s, grupo: tipoPorPlan[plan_id] })) };
}

async function obtenerDrills(admin: SupabaseClient, categoria?: string, grupo?: string, busqueda?: string) {
  let query = admin
    .from("drills")
    .select("titulo, descripcion, categoria, subcategoria, nivel_recomendado, lugar, duracion_minutos, error_que_corrige")
    .eq("aprobado", true);
  if (categoria) query = query.ilike("categoria", `%${categoria}%`);
  if (grupo) query = query.contains("nivel_recomendado", [grupo]);
  if (busqueda) query = query.ilike("titulo", `%${busqueda}%`);
  const { data, error } = await query.order("titulo").limit(10);
  if (error) return { error: error.message };
  if (!data.length) return { drills: [], mensaje: "No se encontraron drills con esos criterios." };
  return { drills: data };
}

async function ejecutarTool(admin: SupabaseClient, name: string, input: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case "buscar_alumno":
        return await buscarAlumno(admin, String(input.nombre ?? ""));
      case "obtener_tests_alumno":
        return await obtenerTestsAlumno(admin, String(input.estudiante_id ?? ""));
      case "obtener_asistencia_alumno":
        return await obtenerAsistenciaAlumno(admin, String(input.estudiante_id ?? ""), Number(input.semanas) > 0 ? Number(input.semanas) : 4);
      case "obtener_notas_alumno":
        return await obtenerNotasAlumno(admin, String(input.estudiante_id ?? ""));
      case "obtener_grupo":
        return await obtenerGrupo(admin, String(input.grupo ?? ""));
      case "obtener_sesiones_semana":
        return await obtenerSesionesSemana(admin, input.grupo as string | undefined, input.fecha as string | undefined);
      case "obtener_drills":
        return await obtenerDrills(admin, input.categoria as string | undefined, input.grupo as string | undefined, input.busqueda as string | undefined);
      default:
        return { error: `Tool desconocida: ${name}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error ejecutando la consulta." };
  }
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "API key no configurada" }, { status: 500 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data: caller } = await supabase.from("app_users").select("rol").eq("id", user.id).maybeSingle();
  const rol = caller?.rol as Rol | undefined;
  if (!rol || !STAFF_ROLES.includes(rol)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const limite = pacoLimitFor(rol);
  const hoy = new Date().toISOString().split("T")[0];

  if (limite !== null) {
    const { data: usage } = await admin
      .from("paco_usage")
      .select("mensajes_count")
      .eq("user_id", user.id)
      .eq("fecha", hoy)
      .maybeSingle();
    const consumo = usage?.mensajes_count ?? 0;
    if (consumo >= limite) {
      return Response.json(
        { error: LIMITE_ALCANZADO_MSG, usage: { count: consumo, limit: limite } },
        { status: 429 }
      );
    }
  }

  let body: { messages?: ChatMessage[]; studentContext?: string; planningContext?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "Se requiere al menos un mensaje" }, { status: 400 });
  }
  const history = messages.slice(-MAX_HISTORY);
  const systemPrompt = buildSystemPrompt(body.studentContext, body.planningContext);

  const client = new Anthropic({ apiKey });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      try {
        let model = PRIMARY_MODEL;
        const conversation: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
        let text = "";
        let usedWebSearch = false;
        let continuations = 0;
        let toolIterations = 0;

        while (true) {
          let response: Anthropic.Message;
          try {
            response = await client.messages.create({ model, max_tokens: 2048, system: systemPrompt, tools: TOOLS, messages: conversation });
          } catch (err) {
            if (model === PRIMARY_MODEL && err instanceof Anthropic.NotFoundError) {
              model = FALLBACK_MODEL;
              continue;
            }
            throw err;
          }

          for (const block of response.content) {
            if (block.type === "text") text += block.text;
            else if (block.type === "server_tool_use") {
              usedWebSearch = true;
              send({ type: "tool_status", tool: block.name });
            } else if (block.type === "web_search_tool_result") {
              usedWebSearch = true;
            }
          }

          if (response.stop_reason === "tool_use") {
            toolIterations++;
            if (toolIterations > MAX_TOOL_ITERATIONS) {
              text += "\n\n(Se alcanzó el máximo de consultas a la base de datos para esta respuesta.)";
              break;
            }
            const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
            for (const t of toolUseBlocks) send({ type: "tool_status", tool: t.name });

            const toolResults = await Promise.all(
              toolUseBlocks.map(async (t) => {
                const result = await ejecutarTool(admin, t.name, t.input as Record<string, unknown>);
                return { type: "tool_result" as const, tool_use_id: t.id, content: JSON.stringify(result) };
              })
            );

            conversation.push({ role: "assistant", content: response.content });
            conversation.push({ role: "user", content: toolResults });
            continue;
          }

          if (response.stop_reason === "pause_turn" && continuations < MAX_CONTINUATIONS) {
            conversation.push({ role: "assistant", content: response.content });
            continuations++;
            continue;
          }

          break;
        }

        let usage: { count: number; limit: number | null } | undefined;
        if (limite === null) {
          usage = { count: 0, limit: null };
        } else {
          const { data: nuevoConteo } = await admin.rpc("increment_paco_usage", { p_user_id: user.id, p_fecha: hoy });
          usage = { count: typeof nuevoConteo === "number" ? nuevoConteo : limite, limit: limite };
        }

        send({ type: "done", text: text.trim(), usedWebSearch, usage });
      } catch (error) {
        console.error("Error asesor-golf:", error);
        send({ type: "error", message: "No pude conectarme. Intenta de nuevo." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
