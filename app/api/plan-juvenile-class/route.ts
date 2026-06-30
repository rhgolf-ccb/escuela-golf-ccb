import type { NextRequest } from "next/server";

function parseJSON(raw: string): unknown {
  try { return JSON.parse(raw); } catch { /* */ }
  const cleaned = raw.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
  try { return JSON.parse(cleaned); } catch { /* */ }
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* */ } }
  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { fecha, dia_semana, tema, tipo_sesion, lugar, hora_inicio, hora_fin } = body;

  const system = `Eres experto en pedagogía de golf junior TPI y LTAD. Diseña una clase para el grupo Juvenil CCB que van juntos:
- Birdies (4-5 años): lúdico, muy simple, máximo 10 min de atención
- Águilas (6-8 años): con referencia visual, movimientos guiados
- Albatros (9-12 años): técnica completa, autocorrección

TEMA DE LA CLASE: ${tema}
LUGAR: ${lugar}
HORA: ${hora_inicio ?? "16:30"}–${hora_fin ?? "17:30"} (60 minutos)

ESTRUCTURA DE LA CLASE (60 min):
- Calentamiento: 10 min
- Drill principal 1: 15 min
- Drill principal 2: 15 min
- Drill complementario: 10 min
- Juego competitivo final: 10 min

REGLAS PEDAGÓGICAS:
- Cada drill tiene UNA descripción general más variantes por subgrupo
- Birdies: versión muy simple y lúdica (con historia, colores, juego)
- Águilas: versión con referencia visual (palos en el piso, targets, puntos de referencia)
- Albatros: versión técnica completa con autocorrección
- El juego competitivo debe ser emocionante para TODOS los grupos a la vez (diferentes distancias o retos según edad)
- Máximo 3 drills por clase
- Los Birdies nunca hacen más de 10 repeticiones seguidas — necesitan cambiar actividad
- Las descripciones deben ser claras y ejecutables sin conocimiento técnico previo
- El tono para Birdies: "como un juego", para Águilas: "con una imagen clara", para Albatros: "con técnica precisa"

INSTALACIONES CCB:
- Campo de práctica (tiro largo Y corto, con estaciones)
- Putting green Fundadores
- Campo Pacos y Fabios
- Campo infantil (ideal para Birdies — distancias muy cortas)

Devuelve SOLO JSON válido, sin texto adicional ni backticks:
{
  "objetivo_clase": "qué van a lograr al finalizar la clase (1 oración)",
  "lugar": "${lugar}",
  "hora_inicio": "${hora_inicio ?? "16:30"}",
  "hora_fin": "${hora_fin ?? "17:30"}",
  "calentamiento": {
    "descripcion": "actividad de calentamiento que aplica para todos los grupos",
    "duracion_min": 10
  },
  "drills": [
    {
      "titulo": "nombre del drill",
      "duracion_min": 15,
      "descripcion_general": "descripción clara de la actividad en lenguaje simple para padres",
      "variante_birdies": "versión lúdica y simple para 4-5 años",
      "variante_aguilas": "versión con referencia visual para 6-8 años",
      "variante_albatros": "versión técnica completa para 9-12 años",
      "material_necesario": "materiales específicos para este drill"
    }
  ],
  "juego_competitivo": {
    "titulo": "nombre del juego",
    "descripcion": "descripción del juego en lenguaje para padres",
    "reglas_birdies": "cómo juegan los Birdies (distancias y reglas adaptadas)",
    "reglas_aguilas": "cómo juegan las Águilas",
    "reglas_albatros": "cómo juegan los Albatros",
    "como_se_gana": "criterio de victoria o logro",
    "duracion_min": 10
  },
  "objetivo_por_grupo": {
    "birdies": "qué logran los Birdies hoy (1 oración corta)",
    "aguilas": "qué logran las Águilas hoy",
    "albatros": "qué logran los Albatros hoy"
  },
  "materiales_totales": ["lista", "de", "materiales", "para", "toda", "la", "clase"]
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system,
      messages: [{
        role: "user",
        content: `Diseña la clase para ${dia_semana} ${fecha}. Tipo de sesión: ${tipo_sesion}. Tema: ${tema}.`,
      }],
    }),
  });

  const aiData = await res.json();
  if (!res.ok) {
    return Response.json({
      error: aiData.error?.message ?? "Error IA",
      stop_reason: aiData.stop_reason,
      output_tokens: aiData.usage?.output_tokens,
    }, { status: 500 });
  }

  const raw: string = aiData.content?.[0]?.text ?? "";
  const parsed = parseJSON(raw);
  if (!parsed) return Response.json({ error: "JSON inválido", raw }, { status: 500 });
  return Response.json(parsed);
}
