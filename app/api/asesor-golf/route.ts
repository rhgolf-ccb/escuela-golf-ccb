import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { STAFF_ROLES, pacoLimitFor, type Rol } from "@/lib/roles";
import { PACO_PLANNING_KNOWLEDGE, PACO_ADVANCED_PLANNING } from "@/lib/paco-planning-knowledge";
import { ANTHROPIC_MODEL } from "@/lib/anthropic-model";

// La planeación semanal (thinking + tool loop + max_tokens 8000) puede tardar
// 40-65s medido en la práctica, y hasta ~65s en el peor caso — 60s se quedaba
// corto y la función moría a mitad de generación (Vercel Runtime Timeout).
// Con Fluid Compute activado en este proyecto, Hobby ya permite hasta 300s
// (ver defaultResourceConfig.functionDefaultTimeout en la API de Vercel) —
// no hace falta plan Pro para este margen.
export const maxDuration = 300;

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

function buildGroupIntro(contextoGrupo: string): string {
  return `Eres Paco, asesor experto de la Escuela de Golf CCB. Estás analizando un grupo completo con el siguiente contexto (resultados individuales, promedios grupales y asistencia): ${contextoGrupo}

Cuando te pidan el análisis inicial del grupo (o cualquier análisis de patrones grupales), estructura tu respuesta con estas secciones, en este orden:
1. Top 3 patrones técnicos más frecuentes en el grupo — las posiciones (P1-P10) con más calificaciones bajas o en progreso, con el promedio grupal de cada una
2. Top 3 restricciones físicas más frecuentes — los screens con más resultados bajos o en progreso
3. Alumnos que necesitan atención prioritaria, cada uno con la razón específica (no genérica)
4. Alumnos con mejor progreso reciente
5. Recomendación de enfoque para la próxima semana basada en los patrones detectados
6. Una tabla markdown resumen con todos los alumnos del grupo y su dato más relevante (ej. prioridad detectada o tema clave)

Si un alumno no tiene tests registrados, indícalo explícitamente en una lista aparte de "alumnos sin tests completados" — nunca inventes un resultado para ellos. Nunca asignes un alumno a Competencia automáticamente. Habla de tú al profesor, sé directo y práctico.`;
}

function buildIndividualPlanIntro(contexto: string): string {
  return `Eres Paco, asesor experto de golf de la Escuela de Golf CCB. Vas a generar un plan de trabajo individual para un alumno de Competencia, para los días en que NO tiene sesión programada en la escuela esa semana. Contexto disponible: ${contexto}

Genera el plan EXACTAMENTE con este formato, sin agregar secciones adicionales ni preguntar nada antes:

{Nombre del alumno} — Plan de trabajo semana {fecha}

Objetivo de la semana: {una línea con el foco principal, basado en los errores técnicos y restricciones físicas más recientes}

Para cada uno de los días libres de sesión en la escuela esa semana, en este formato exacto:
Día {nombre}: {duración recomendada — máximo 30 minutos en total}
- Drill 1: {nombre} — {descripción en lenguaje directo para el alumno, sin jerga técnica de golf o TPI} — {repeticiones}
- Drill 2: {nombre} — {descripción} — {repeticiones}
- Ejercicio físico: {nombre} — {descripción} — {series y repeticiones}

Al final, siempre:
Recordatorio: {mensaje motivacional breve y personalizado, dirigido directamente al alumno}

Usa drills de la librería disponible cuando haya opciones relevantes para los errores detectados; si no hay un drill específico, describe un ejercicio genérico apropiado. Nunca inventes resultados de tests — si algo no está disponible en el contexto, trabaja con lo que sí hay y dilo si es relevante.`;
}

function buildPlanningIntro(contextoPlanificacion: string): string {
  return `Eres Paco, asesor experto de la Escuela de Golf CCB. Estás guiando la planificación de la SEMANA COMPLETA del grupo indicado en el contexto de abajo. El profesor ya vio tu primer mensaje con las preguntas iniciales específicas de ese grupo — continúa la conversación desde ahí. Nunca repreguntes algo que ya te respondió ni hagas una pregunta genérica como "¿qué quieres planificar?": el grupo y la semana ya se saben.

En cuanto tengas la información que falta (estaciones/enfoque físico esta semana, aspecto técnico prioritario, y para Competencia si hay torneo próximo, o para Damas si es día de campo y si incluye bunker), genera la programación completa de la semana llamando a la herramienta proponer_programacion_semana — esto la muestra automáticamente en el panel de vista previa del profesor, editable antes de publicar. Respeta siempre la estructura fija de cada grupo: Juvenil (martes si el lunes no es festivo, miércoles y jueves 4:30-5:30pm, sábado y domingo dos horarios cada uno) con estaciones y drills conectados a los protocolos P1–P10; Competencia sigue su estructura día por día (martes tiro largo, miércoles putt y campo, jueves juego corto, sábado siempre campo de práctica); Damas es viernes con 3 estaciones rotativas, o día de campo si el profesor lo indica. Nunca uses el término driving range — siempre campo de práctica. Usa los drills de la librería disponible cuando haya opciones relevantes.

Las horas (hora_inicio/hora_fin) de cada sesión de Competencia o Damas NO las definas tú: se completan automáticamente desde horarios_defecto al publicar (Competencia martes/miércoles/jueves 16:00-17:30 y sábado 08:30-09:30; Damas viernes 10:30-12:00) — omite esos campos en tu llamada a proponer_programacion_semana. La única excepción es un día de campo de Damas si el profesor pidió explícitamente una hora distinta a la clase normal (ej. una salida más temprano) — ahí sí incluye la hora que él te dio, nunca una inventada por ti.

Cuando planifiques una semana completa para Juvenil genera planes diferentes para cada día de la semana — martes, miércoles y jueves deben tener drills distintos por estación. El sábado tiene dos horarios (9:15 AM y 10:00 AM) que comparten el mismo plan. El domingo igual. Por cada estación sugiere 2 a 3 drills de la biblioteca rotando para evitar repetición. Incluye siempre un desafío competitivo al final de cada estación apropiado para la edad del grupo. Para Juvenil, un día puede ser de tipo "estaciones" (las 3 de siempre), "solo_putt" o "solo_juego_corto" (un solo tema con más drills), o un día especial: "campo" (salida a jugar), "test_tecnico" o "test_fisico" — en los tipos especiales usa el campo notas para describir la actividad en vez de estaciones.

Cuando el profesor pida modificar la programación que ya está en la vista previa (cambiar un día, una estación, un drill, un desafío, etc.), SIEMPRE vuelve a llamar la herramienta proponer_programacion_semana con la estructura COMPLETA — nunca respondas el cambio solo en texto sin llamar la herramienta, o la vista previa del profesor se queda desactualizada. Si el contexto de abajo incluye "Programación actual en la vista previa", cópiala tal cual para todo lo que el profesor no pidió cambiar, y modifica solo lo solicitado. Para Juvenil, incluye siempre el campo dias_modificados con la lista exacta de los días que realmente cambiaron en esta respuesta — los demás días igual van completos en el array pero se ignorarán si no aparecen en esa lista, así que cópialos sin alterarlos.

Junto con la llamada a la herramienta, responde también en texto con un resumen breve de la semana y cierra con la sección "Materiales necesarios". No le digas al profesor que ya la publicaste ni le preguntes si quiere publicarla por chat — la programación queda en el panel de vista previa para que la revise, edite y publique él mismo con el botón de esa pantalla.

Si la respuesta del profesor es incompleta o ambigua, no asumas — haz una pregunta de seguimiento concreta. Por ejemplo si dice "enfócate en el putt": "¿Quieres que todos los días tengan énfasis en putt o solo algunos días? ¿Y cuántos drills de putt por estación — 1 o 2?"

IMPORTANTE — no llames obtener_drills ni obtener_sesiones_semana en este flujo: la librería completa de drills aprobados y la programación existente de esta semana ya vienen abajo en "Contexto de planificación disponible". Volver a consultarlas por herramienta solo agrega llamadas y tiempo sin aportar nada nuevo — esta pantalla tiene un límite de tiempo de respuesta ajustado, así que ve directo a generar el plan con lo que ya tienes en el contexto. Si necesitas ejercicios físicos para una estación de Física, ahí sí usa obtener_ejercicios_fisicos (esos no vienen precargados).

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
- Biblioteca de ejercicios físicos

Cuando el usuario pregunte sobre un alumno específico, búscalo primero con buscar_alumno y luego consulta sus datos con el id que obtengas.

Cuando el usuario pida análisis de un grupo, usa obtener_grupo para ver todos los alumnos y luego analiza patrones.

Cuando el usuario pida planificación semanal, consulta las sesiones con obtener_sesiones_semana y los drills disponibles con obtener_drills, luego propone un plan concreto.

Cuando planifiques una estación física consulta la biblioteca de ejercicios físicos disponible con obtener_ejercicios_fisicos. Filtra por el grupo que se está trabajando y por los screens TPI con resultados bajos si están disponibles. Sugiere 2-3 ejercicios por estación física con sus series, repeticiones y materiales necesarios.

Si una consulta a la base de datos no devuelve resultados, dilo claramente en vez de inventar datos.

PROGRAMAR LA ESCUELA (Juvenil, Competencia, Damas) vs. CALENDARIO DE EVENTOS — son dos cosas distintas, no las mezcles:
"Programar la escuela" (el horario semanal de clases) SIEMPRE significa crear sesiones reales en sesiones_semana, con horas tomadas de horarios_defecto — nunca inventadas. La grilla de Programación solo dibuja una sesión si tiene hora_inicio y hora_fin, así que si te piden armar/programar la escuela de una semana, la única forma correcta es a través del asistente de planificación semanal ("Planificar con Paco" dentro del módulo Programación, para el grupo correspondiente) — NUNCA con crear_evento_calendario. Si te piden programar la escuela desde este chat general (fuera de esa planificación semanal), no lo hagas aquí: dile al profesor que abra "Planificar con Paco" en Programación para el grupo que quiere programar.

CALENDARIO — EVENTOS Y DÍAS SIN ESCUELA:
Cuando el profesor mencione un evento, fecha de torneo, festival u otro evento institucional puntual (no una clase regular de la escuela), ofrece agregarlo al calendario con nombre, fecha y descripción. Al confirmar publícalo directamente en la tabla de eventos del calendario usando crear_evento_calendario.

Cuando el profesor indique un rango de fechas sin escuela (ej. "del 20 al 25 de julio no hay escuela", vacaciones, festivo, receso), confirma el rango y el motivo, y al confirmar regístralo con marcar_dias_sin_escuela.

Nunca uses crear_evento_calendario ni marcar_dias_sin_escuela sin que el profesor haya confirmado explícitamente — primero propone, y solo ejecutas la herramienta en el turno donde el profesor confirma.

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
5. IDIOMA: siempre en español, respetando la terminología CCB y los nombres de grupos ya indicados arriba.

${PACO_PLANNING_KNOWLEDGE}

${PACO_ADVANCED_PLANNING}`;

const SYSTEM_PROMPT = `${PACO_GENERAL_INTRO}\n\n${PACO_SHARED_SECTIONS}`;

function buildSystemPrompt(studentContext?: string, planningContext?: string, groupContext?: string, individualPlanContext?: string, knowledgeContext?: string): string {
  let base: string;
  if (planningContext) base = `${buildPlanningIntro(planningContext)}\n\n${PACO_SHARED_SECTIONS}`;
  else if (groupContext) base = `${buildGroupIntro(groupContext)}\n\n${PACO_SHARED_SECTIONS}`;
  else if (individualPlanContext) base = `${buildIndividualPlanIntro(individualPlanContext)}\n\n${PACO_SHARED_SECTIONS}`;
  else if (studentContext) base = `${buildContextualIntro(studentContext)}\n\n${PACO_SHARED_SECTIONS}`;
  else base = SYSTEM_PROMPT;
  return knowledgeContext ? `${base}\n\nBase de conocimiento CCB:\n${knowledgeContext}` : base;
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
  {
    name: "obtener_ejercicios_fisicos",
    description:
      "Busca ejercicios físicos en la biblioteca (movilidad, fuerza y estabilidad, potencia, calentamiento) para planificar una estación de Trabajo físico. Filtra por grupo y/o screen TPI vinculado.",
    input_schema: {
      type: "object",
      properties: {
        categoria: { type: "string", description: "Movilidad | Fuerza y estabilidad | Potencia | Calentamiento" },
        grupo: { type: "string", description: "Grupo al que aplica: Birdies, Águilas, Albatros, Competencia o Damas" },
        screen_vinculado: { type: "string", description: "Screen TPI relacionado (ej. S5, S16, PB2) para priorizar ejercicios correctivos de una restricción específica" },
        busqueda: { type: "string", description: "Texto libre para buscar en el nombre" },
      },
    },
  },
  {
    name: "crear_evento_calendario",
    description: "Crea un evento en el calendario general de la escuela (torneo, festival, día institucional, etc.). NUNCA la uses para programar clases regulares de Juvenil, Competencia o Damas — eso es sesiones_semana, no un evento de calendario, y se hace exclusivamente en 'Planificar con Paco' dentro de Programación. Úsala solo después de que el profesor confirme explícitamente que quiere agregar un evento puntual.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre del evento" },
        fecha_inicio: { type: "string", description: "Fecha en formato YYYY-MM-DD" },
        fecha_fin: { type: "string", description: "Fecha final si es un rango (opcional, formato YYYY-MM-DD)" },
        descripcion: { type: "string", description: "Descripción opcional del evento" },
        tipo: { type: "string", description: "'especial' (actividad puntual de la escuela) o 'institucional' (evento del club/torneo/festival). Default institucional." },
      },
      required: ["nombre", "fecha_inicio"],
    },
  },
  {
    name: "marcar_dias_sin_escuela",
    description: "Marca un rango de fechas como días sin escuela (vacaciones, festivo, receso). Úsala solo después de que el profesor confirme explícitamente.",
    input_schema: {
      type: "object",
      properties: {
        fecha_inicio: { type: "string", description: "Fecha de inicio en formato YYYY-MM-DD" },
        fecha_fin: { type: "string", description: "Fecha final en formato YYYY-MM-DD (igual a fecha_inicio si es un solo día)" },
        motivo: { type: "string", description: "Motivo opcional (ej: vacaciones de mitad de año, festivo nacional)" },
      },
      required: ["fecha_inicio", "fecha_fin"],
    },
  },
];

// Tool "de vista previa": no escribe nada en la base de datos, solo le entrega al
// frontend la programación estructurada de la semana para el panel editable de
// PacoPlanningModal. Solo se ofrece cuando la conversación trae planningContext
// (ver POST) — ahí es donde tiene sentido que Paco la use.
const PROPONER_PROGRAMACION_TOOL: Anthropic.Tool = {
  name: "proponer_programacion_semana",
  description:
    "Genera la programación completa de la semana para mostrarla en el panel de vista previa del profesor, editable antes de publicar. No publica nada — solo llena la vista previa. Úsala en cuanto tengas la información necesaria del profesor para el grupo que se está planificando.",
  input_schema: {
    type: "object",
    properties: {
      descripcion_tema: { type: "string", description: "Resumen de 1-2 líneas del enfoque de la semana" },
      sesion_juvenil: {
        type: "array",
        description: "Solo si el grupo es Juvenil — una entrada por día: martes, miercoles, jueves, sabado, domingo. Sábado y domingo son UNA SOLA entrada cada uno (su contenido aplica a los 2 horarios de ese día). Martes, miércoles y jueves deben tener drills distintos entre sí en cada estación.",
        items: {
          type: "object",
          properties: {
            dia_semana: { type: "string", enum: ["martes", "miercoles", "jueves", "sabado", "domingo"] },
            tipo: {
              type: "string",
              enum: ["estaciones", "solo_putt", "solo_juego_corto", "campo", "test_tecnico", "test_fisico"],
              description: "estaciones (normal, usa el campo estaciones) | solo_putt / solo_juego_corto (un solo tema, usa estaciones con 1 sola entrada de esa categoría) | campo / test_tecnico / test_fisico (día especial, usa el campo notas en vez de estaciones)",
            },
            estaciones: {
              type: "array",
              description: "Requerido cuando tipo es estaciones (SIEMPRE exactamente 3, una de cada categoría sin repetir: juego_largo, juego_corto y putt — esto no cambia aunque el profesor pida enfocarse en una sola categoría, ese enfoque se refleja en los DRILLS, no en repetir o eliminar estaciones) o solo_putt/solo_juego_corto (1 sola entrada de esa categoría). Omitir o dejar vacío si tipo es campo/test_tecnico/test_fisico.",
              items: {
                type: "object",
                properties: {
                  categoria: { type: "string", enum: ["juego_largo", "juego_corto", "putt"] },
                  drills: {
                    type: "array",
                    description: "2 a 3 drills de la librería, conectados a los protocolos P1-P10",
                    items: {
                      type: "object",
                      properties: { titulo: { type: "string" }, descripcion: { type: "string" } },
                      required: ["titulo", "descripcion"],
                    },
                  },
                  desafio: { type: "string", description: "Reto o juego competitivo de cierre de la estación, apropiado para la edad del grupo" },
                },
                required: ["categoria", "drills", "desafio"],
              },
            },
            notas: { type: "string", description: "Solo cuando tipo es campo, test_tecnico o test_fisico — descripción libre de la actividad de ese día" },
          },
          required: ["dia_semana", "tipo"],
        },
      },
      dias_modificados: {
        type: "array",
        description: "Solo cuando esta llamada MODIFICA una programación Juvenil ya existente en la vista previa (no en la primera generación de la semana): lista de dia_semana que realmente cambiaron en esta respuesta (martes/miercoles/jueves/sabado/domingo). Los demás días del array sesion_juvenil se ignoran si no aparecen aquí, así que cópialos igual pero no hace falta que sean perfectos.",
        items: { type: "string", enum: ["martes", "miercoles", "jueves", "sabado", "domingo"] },
      },
      sesiones: {
        type: "array",
        description: "Solo si el grupo es Competencia o Damas — una entrada por sesión de la semana. No incluyas hora_inicio/hora_fin salvo excepción explícita del profesor: el horario real siempre se resuelve automáticamente desde horarios_defecto al publicar.",
        items: {
          type: "object",
          properties: {
            dia_semana: { type: "string", description: "martes | miercoles | jueves | viernes | sabado | domingo" },
            tipo_sesion: { type: "string", description: "tiro_largo | juego_corto | putt | campo | test_tecnico | test_fisico | trabajo_fisico | competencia | damas_estaciones. trabajo_fisico es una estación de ejercicios físicos (potencia, movilidad, etc.) — distinta de test_fisico, que es la evaluación de protocolos TPI." },
            lugar: { type: "string", description: "campo_practica | putting_green | campo_infantil | campo_pacos_fabios | campo_completo" },
            hora_inicio: { type: "string", description: "HH:MM — OMÍTELO: el horario real de Competencia y Damas sale siempre de horarios_defecto al publicar. Solo inclúyelo si el profesor pidió explícitamente una hora distinta a la fija (ej. un día de campo de Damas que arranca más temprano que la clase normal)." },
            hora_fin: { type: "string", description: "HH:MM — mismo criterio que hora_inicio: OMÍTELO salvo que el profesor haya pedido una hora distinta a la fija de horarios_defecto." },
            objetivo: { type: "string" },
            drills: {
              type: "array",
              items: { type: "object", properties: { titulo: { type: "string" }, descripcion: { type: "string" } }, required: ["titulo", "descripcion"] },
            },
            juego_competitivo: { type: "string", description: "Descripción del juego o ejercicio competitivo, si aplica" },
            estaciones_damas: {
              type: "array",
              description: "Solo para Damas — exactamente 3 estaciones (Juego Largo, Juego Corto, Putt)",
              items: {
                type: "object",
                properties: {
                  nombre: { type: "string" },
                  lugar: { type: "string" },
                  duracion_min: { type: "number" },
                  descripcion: { type: "string" },
                },
                required: ["nombre", "lugar", "duracion_min", "descripcion"],
              },
            },
            notas: { type: "string" },
          },
          required: ["dia_semana", "tipo_sesion", "lugar", "objetivo"],
        },
      },
    },
    required: ["descripcion_tema"],
  },
};

const TOOLS: Anthropic.ToolUnion[] = [{ type: "web_search_20250305", name: "web_search" }, ...CCB_TOOLS];

// El modelo a veces repite una categoría de estación dentro del mismo día en vez
// de generar las 3 distintas — se deduplica por categoría (se queda con la
// primera aparición) antes de mostrarlo en la vista previa del profesor.
function dedupeSesionJuvenil(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const obj = input as { sesion_juvenil?: { dia_semana: string; estaciones?: { categoria: string }[] }[] };
  if (!Array.isArray(obj.sesion_juvenil)) return input;
  const sesionJuvenil = obj.sesion_juvenil.map((dia) => {
    if (!Array.isArray(dia.estaciones)) return dia;
    const vistas = new Set<string>();
    const estaciones = dia.estaciones.filter((e) => {
      if (vistas.has(e.categoria)) return false;
      vistas.add(e.categoria);
      return true;
    });
    return { ...dia, estaciones };
  });
  return { ...obj, sesion_juvenil: sesionJuvenil };
}

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

async function obtenerEjerciciosFisicos(admin: SupabaseClient, categoria?: string, grupo?: string, screenVinculado?: string, busqueda?: string) {
  let query = admin
    .from("ejercicios_fisicos")
    .select("nombre, categoria, grupo_muscular, grupos, materiales, instrucciones, series_repeticiones, progresion, screen_vinculado, duracion_minutos");
  if (categoria) query = query.ilike("categoria", `%${categoria}%`);
  if (grupo) query = query.contains("grupos", [grupo]);
  if (screenVinculado) query = query.ilike("screen_vinculado", `%${screenVinculado}%`);
  if (busqueda) query = query.ilike("nombre", `%${busqueda}%`);
  const { data, error } = await query.order("nombre").limit(10);
  if (error) return { error: error.message };
  if (!data.length) return { ejercicios: [], mensaje: "No se encontraron ejercicios físicos con esos criterios." };
  return { ejercicios: data };
}

async function crearEventoCalendario(admin: SupabaseClient, nombre: string, fechaInicio: string, fechaFin?: string, descripcion?: string, tipo?: string) {
  if (!nombre || !fechaInicio) return { error: "Falta nombre o fecha_inicio." };
  const { data, error } = await admin
    .from("eventos_calendario")
    .insert({ nombre, fecha_inicio: fechaInicio, fecha_fin: fechaFin || null, descripcion: descripcion || null, tipo: tipo === "especial" ? "especial" : "institucional" })
    .select()
    .single();
  if (error) return { error: error.message };
  return { ok: true, evento: data };
}

async function marcarDiasSinEscuela(admin: SupabaseClient, fechaInicio: string, fechaFin: string, motivo?: string) {
  if (!fechaInicio || !fechaFin) return { error: "Falta fecha_inicio o fecha_fin." };
  const { data, error } = await admin
    .from("dias_sin_escuela")
    .insert({ fecha_inicio: fechaInicio, fecha_fin: fechaFin, motivo: motivo || null })
    .select()
    .single();
  if (error) return { error: error.message };
  return { ok: true, dia_sin_escuela: data };
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
      case "obtener_ejercicios_fisicos":
        return await obtenerEjerciciosFisicos(admin, input.categoria as string | undefined, input.grupo as string | undefined, input.screen_vinculado as string | undefined, input.busqueda as string | undefined);
      case "crear_evento_calendario":
        return await crearEventoCalendario(admin, String(input.nombre ?? ""), String(input.fecha_inicio ?? ""), input.fecha_fin as string | undefined, input.descripcion as string | undefined, input.tipo as string | undefined);
      case "marcar_dias_sin_escuela":
        return await marcarDiasSinEscuela(admin, String(input.fecha_inicio ?? ""), String(input.fecha_fin ?? ""), input.motivo as string | undefined);
      case "proponer_programacion_semana":
        // No escribe nada — el input ya se le envió al frontend como evento
        // "plan_preview" antes de llegar aquí (ver POST). Solo confirma al modelo.
        return { ok: true, mensaje: "Vista previa actualizada en el panel del profesor." };
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

  // middleware.ts ya validó sesión + rol para esta request y los deja en
  // headers de confianza (ver lib/current-user.ts) — evita repetir aquí la
  // misma consulta a auth.getUser()/app_users. Fallback defensivo por si esta
  // ruta se invoca alguna vez fuera del matcher de middleware.
  let userId = request.headers.get("x-ccb-uid");
  let rol = request.headers.get("x-ccb-rol") as Rol | null;
  if (!userId || !rol) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
    const { data: caller } = await supabase.from("app_users").select("rol").eq("id", user.id).maybeSingle();
    userId = user.id;
    rol = (caller?.rol as Rol | undefined) ?? null;
  }
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
      .eq("user_id", userId)
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

  let body: { messages?: ChatMessage[]; studentContext?: string; planningContext?: string; groupContext?: string; individualPlanContext?: string };
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

  const { data: knowledgeDocs } = await admin.from("paco_knowledge").select("titulo, tema, contenido").eq("activo", true);
  const knowledgeContext = knowledgeDocs?.length
    ? knowledgeDocs.map((d) => `### ${d.titulo}${d.tema ? ` (${d.tema})` : ""}\n${d.contenido}`).join("\n\n")
    : undefined;

  const systemPrompt = buildSystemPrompt(body.studentContext, body.planningContext, body.groupContext, body.individualPlanContext, knowledgeContext);
  const tools: Anthropic.ToolUnion[] = body.planningContext ? [...TOOLS, PROPONER_PROGRAMACION_TOOL] : TOOLS;
  const maxTokens = body.planningContext ? 8000 : 2048;
  // Chat normal: sin extended thinking, respuesta inmediata. Planeación
  // semanal: thinking adaptativo con esfuerzo bajo para armar mejor la
  // semana completa sin perder velocidad de forma notoria. Nunca Opus.
  // Sonnet 5 no soporta thinking.type "enabled" (legado) — solo "adaptive",
  // que se calibra con output_config.effort en vez de budget_tokens.
  const thinking: Anthropic.ThinkingConfigParam = body.planningContext ? { type: "adaptive" } : { type: "disabled" };
  const outputConfig: Anthropic.OutputConfig | undefined = body.planningContext ? { effort: "low" } : undefined;

  const client = new Anthropic({ apiKey });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      // La planeación semanal puede pasar 30-40s esperando la primera
      // respuesta de Anthropic (thinking + tool call) sin enviar ni un byte —
      // una conexión SSE completamente silenciosa así es justo lo que cortan
      // los timeouts de idle-connection de proxies/CDN intermedios (visto
      // fallando ~20s en producción). Un comentario SSE cada 10s mantiene la
      // conexión viva sin afectar el parseo del cliente (líneas que no
      // empiezan con "data:" se ignoran en streamAsesorChat).
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          // stream ya cerrado
        }
      }, 10000);

      try {
        const conversation: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
        let text = "";
        let usedWebSearch = false;
        let continuations = 0;
        let toolIterations = 0;

        while (true) {
          const response = await client.messages.create({
            model: ANTHROPIC_MODEL, max_tokens: maxTokens, system: systemPrompt, tools, thinking, messages: conversation,
            ...(outputConfig ? { output_config: outputConfig } : {}),
          });

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
            for (const t of toolUseBlocks) {
              send({ type: "tool_status", tool: t.name });
              if (t.name === "proponer_programacion_semana") send({ type: "plan_preview", plan: dedupeSesionJuvenil(t.input) });
            }

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
          const { data: nuevoConteo } = await admin.rpc("increment_paco_usage", { p_user_id: userId, p_fecha: hoy });
          usage = { count: typeof nuevoConteo === "number" ? nuevoConteo : limite, limit: limite };
        }

        send({ type: "done", text: text.trim(), usedWebSearch, usage });
      } catch (error) {
        const status = error instanceof Anthropic.APIError ? error.status : undefined;
        const apiError = error instanceof Anthropic.APIError ? error.error : undefined;
        const detail = error instanceof Error ? error.message : String(error);
        console.error(`Error asesor-golf (status=${status ?? "n/a"}):`, detail, apiError ? JSON.stringify(apiError) : "");
        send({
          type: "error",
          message: "No pude conectarme. Intenta de nuevo.",
          ...(process.env.NODE_ENV !== "production" ? { debug: { status, detail, apiError } } : {}),
        });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
