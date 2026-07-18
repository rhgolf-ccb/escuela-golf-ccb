import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const TIPO_PLAN_VALUES = ["juvenil", "competencia", "damas"] as const;
const DIA_VALUES = ["martes", "miercoles", "jueves", "viernes", "sabado", "domingo"] as const;
const TIPO_SESION_VALUES = [
  "tiro_largo", "juego_corto", "putt", "campo", "test_tecnico", "test_fisico", "trabajo_fisico",
  "competencia", "damas_estaciones", "juvenil_estaciones", "especial", "campo_pacos", "campo_infantil",
] as const;
const LUGAR_VALUES = ["campo_practica", "putting_green", "campo_infantil", "campo_pacos_fabios", "campo_completo"] as const;

// hora_inicio/hora_fin del cliente solo se respetan cuando vienen completos y
// válidos (ej. el día de campo de Damas, que sí puede tener una hora distinta
// al horario fijo de horarios_defecto). Si faltan o vienen vacíos — el bug
// típico de Paco al proponer Competencia — se resuelven siempre desde
// horarios_defecto (ver cargarHorariosDefecto/resolverSlots), nunca quedan en
// NULL. "fecha" tampoco se confía del cliente: se calcula desde
// semana_inicio + dia_semana.
type SesionInput = {
  dia_semana: string; tipo_sesion: string; lugar: string;
  hora_inicio?: string | null; hora_fin?: string | null;
  objetivo?: string | null; drills?: unknown; juego_competitivo?: string | null;
  estaciones_damas?: unknown; notas?: string | null;
};

function esHoraValida(v: unknown): v is string {
  return typeof v === "string" && /^\d{2}:\d{2}/.test(v);
}

type EstacionJuvenilInput = {
  categoria: string;
  drills: { titulo: string; descripcion: string }[];
  desafio: string;
};

type TipoDiaJuvenilInput = "estaciones" | "solo_putt" | "solo_juego_corto" | "campo" | "test_tecnico" | "test_fisico";

type SesionJuvenilDiaInput = {
  dia_semana: string;
  tipo?: TipoDiaJuvenilInput;
  estaciones?: EstacionJuvenilInput[];
  notas?: string;
};

const JUVENIL_DIA_VALUES = ["martes", "miercoles", "jueves", "sabado", "domingo"] as const;
const CATEGORIA_ESTACION_LABEL: Record<string, string> = {
  juego_largo: "Juego Largo", juego_corto: "Juego Corto", putt: "Putt",
};

// Mismos valores que ESPECIAL_TIPO_SESION/ESPECIAL_LUGAR/ESPECIAL_OBJETIVO de
// JuvenileClassModal.tsx — replicados aquí porque esta ruta de servidor no
// importa componentes cliente. "campo" (salida al campo) se mapea a
// campo_pacos, el único de los 2 tipos de campo que tiene sentido para un día
// generado desde la vista previa semanal (campo_infantil es solo manual).
const DIA_ESPECIAL_TIPO_SESION: Record<string, string> = {
  campo: "campo", test_tecnico: "test_tecnico", test_fisico: "test_fisico",
};
const DIA_ESPECIAL_LUGAR: Record<string, string> = {
  campo: "campo_pacos_fabios", test_tecnico: "campo_practica", test_fisico: "campo_practica",
};
const DIA_ESPECIAL_OBJETIVO: Record<string, string> = {
  campo: "Juego en Campo Pacos y Fabios", test_tecnico: "Evaluación técnica P1-P10", test_fisico: "Evaluación física TPI",
};
const DIA_ESPECIAL_TIPO_ESPECIAL: Record<string, string> = {
  campo: "campo_pacos", test_tecnico: "test_tecnico", test_fisico: "test_fisico",
};

function getFechaForDia(semanaInicio: string, dia: string): string {
  const offset: Record<string, number> = { martes: 1, miercoles: 2, jueves: 3, viernes: 4, sabado: 5, domingo: 6 };
  const d = new Date(semanaInicio + "T00:00:00");
  d.setDate(d.getDate() + (offset[dia] ?? 0));
  return d.toISOString().split("T")[0];
}

interface HorarioSlot { hora_inicio: string; hora_fin: string }

// Única fuente de verdad para las horas de cada sesión — horarios_defecto.
// Se carga una sola vez por publicación y se agrupa por "tipo_plan:dia_semana"
// porque juvenil sábado/domingo tienen 2 bloques cada uno.
async function cargarHorariosDefecto(admin: SupabaseClient): Promise<Map<string, HorarioSlot[]>> {
  const { data, error } = await admin.from("horarios_defecto").select("tipo_plan, dia_semana, hora_inicio, hora_fin");
  if (error) throw new Error(`No se pudieron cargar los horarios por defecto: ${error.message}`);
  const mapa = new Map<string, HorarioSlot[]>();
  for (const row of data ?? []) {
    const key = `${row.tipo_plan}:${row.dia_semana}`;
    const slots = mapa.get(key) ?? [];
    slots.push({ hora_inicio: row.hora_inicio, hora_fin: row.hora_fin });
    mapa.set(key, slots);
  }
  for (const slots of mapa.values()) slots.sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  return mapa;
}

function resolverSlots(horarios: Map<string, HorarioSlot[]>, tipoPlan: string, diaSemana: string): HorarioSlot[] {
  return horarios.get(`${tipoPlan}:${diaSemana}`) ?? [];
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const {
    tipo_plan, semana_inicio, tema_semanal, descripcion_tema, objetivo_mensual, foco_mes,
    sesiones, sesion_juvenil,
  } = body as {
    tipo_plan: string; semana_inicio: string; tema_semanal: string;
    descripcion_tema?: string; objetivo_mensual?: string | null; foco_mes?: string | null;
    sesiones?: SesionInput[]; sesion_juvenil?: SesionJuvenilDiaInput[] | null;
  };

  if (!tipo_plan || !TIPO_PLAN_VALUES.includes(tipo_plan as typeof TIPO_PLAN_VALUES[number])) {
    return Response.json({ error: `tipo_plan inválido: "${tipo_plan}"` }, { status: 400 });
  }
  if (!semana_inicio || !tema_semanal?.trim()) {
    return Response.json({ error: "semana_inicio y tema_semanal son requeridos" }, { status: 400 });
  }

  // Validación estricta de cada sesión ANTES de tocar la base de datos — si la IA
  // devolvió un valor fuera de los enums reales de la tabla, el insert fallaría
  // silenciosamente por el CHECK constraint y el profesor vería un falso "publicado".
  if (tipo_plan !== "juvenil") {
    if (!sesiones || sesiones.length === 0) {
      return Response.json({ error: "No hay sesiones para publicar" }, { status: 400 });
    }
    for (const s of sesiones) {
      if (!DIA_VALUES.includes(s.dia_semana as typeof DIA_VALUES[number])) {
        return Response.json({ error: `Día inválido "${s.dia_semana}" en una de las sesiones. Corrígelo en la vista previa antes de publicar.` }, { status: 400 });
      }
      if (!TIPO_SESION_VALUES.includes(s.tipo_sesion as typeof TIPO_SESION_VALUES[number])) {
        return Response.json({ error: `Tipo de sesión inválido "${s.tipo_sesion}" el día ${s.dia_semana}. Corrígelo en la vista previa antes de publicar.` }, { status: 400 });
      }
      if (!LUGAR_VALUES.includes(s.lugar as typeof LUGAR_VALUES[number])) {
        return Response.json({ error: `Lugar inválido "${s.lugar}" el día ${s.dia_semana}. Corrígelo en la vista previa antes de publicar.` }, { status: 400 });
      }
    }
  } else {
    if (!sesion_juvenil || !Array.isArray(sesion_juvenil) || sesion_juvenil.length === 0) {
      return Response.json({ error: "No hay contenido de la clase juvenil para publicar" }, { status: 400 });
    }
    for (const entry of sesion_juvenil) {
      if (!JUVENIL_DIA_VALUES.includes(entry.dia_semana as typeof JUVENIL_DIA_VALUES[number])) {
        return Response.json({ error: `Día inválido "${entry.dia_semana}" en la programación juvenil. Corrígelo en la vista previa antes de publicar.` }, { status: 400 });
      }
      const tipo = entry.tipo ?? "estaciones";
      const esEspecial = tipo === "campo" || tipo === "test_tecnico" || tipo === "test_fisico";
      if (!esEspecial && (!entry.estaciones || entry.estaciones.length === 0)) {
        return Response.json({ error: `Falta el contenido de estaciones el día ${entry.dia_semana}.` }, { status: 400 });
      }
    }
  }

  const supabase = createSupabaseAdminClient();

  // Resuelve TODAS las horas desde horarios_defecto antes de escribir nada —
  // así un tipo_plan/día sin horario configurado nunca produce una sesión con
  // hora_inicio/hora_fin en NULL, y el profesor ve el error claro de una vez
  // en vez de un "publicado" que luego no aparece en la grilla.
  let horariosDefecto: Map<string, HorarioSlot[]>;
  try {
    horariosDefecto = await cargarHorariosDefecto(supabase);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Error al cargar horarios por defecto" }, { status: 500 });
  }

  type Row = Record<string, unknown>;
  let rows: Row[] = [];

  if (tipo_plan === "juvenil" && sesion_juvenil) {
    for (const dia of JUVENIL_DIA_VALUES) {
      const slots = resolverSlots(horariosDefecto, "juvenil", dia);
      if (slots.length === 0) {
        return Response.json({ error: `No hay horario por defecto para juvenil el ${dia}; defínelo en horarios_defecto.` }, { status: 400 });
      }
      const entry = sesion_juvenil.find((e) => e.dia_semana === dia);
      const tipo = entry?.tipo ?? "estaciones";
      for (const slot of slots) {
        const base = {
          plan_id: null as unknown, // se completa tras crear/actualizar el plan
          dia_semana: dia,
          fecha: getFechaForDia(semana_inicio, dia),
          hora_inicio: slot.hora_inicio,
          hora_fin: slot.hora_fin,
          drills: [] as unknown[],
          juego_competitivo: null as string | null,
          estaciones_damas: null,
        };
        if (tipo === "campo" || tipo === "test_tecnico" || tipo === "test_fisico") {
          const tipoEspecial = DIA_ESPECIAL_TIPO_ESPECIAL[tipo];
          const notas = entry?.notas?.trim() || null;
          rows.push({
            ...base,
            tipo_sesion: DIA_ESPECIAL_TIPO_SESION[tipo],
            lugar: DIA_ESPECIAL_LUGAR[tipo],
            objetivo: notas || DIA_ESPECIAL_OBJETIVO[tipo],
            notas,
            sesion_juvenil: { tipo: "especial", tipo_especial: tipoEspecial, notas },
          });
        } else {
          const estaciones = entry?.estaciones ?? [];
          rows.push({
            ...base,
            tipo_sesion: "juvenil_estaciones",
            lugar: "campo_practica",
            objetivo: estaciones.map((e) => CATEGORIA_ESTACION_LABEL[e.categoria] ?? e.categoria).join(" · "),
            notas: null,
            sesion_juvenil: { tipo: "estaciones", estaciones },
          });
        }
      }
    }
  } else if (sesiones) {
    for (const s of sesiones) {
      let horaInicio = esHoraValida(s.hora_inicio) ? s.hora_inicio : null;
      let horaFin = esHoraValida(s.hora_fin) ? s.hora_fin : null;
      if (!horaInicio || !horaFin) {
        const slots = resolverSlots(horariosDefecto, tipo_plan, s.dia_semana);
        if (slots.length === 0) {
          return Response.json({ error: `No hay horario por defecto para ${tipo_plan} el ${s.dia_semana}; defínelo en horarios_defecto.` }, { status: 400 });
        }
        horaInicio = horaInicio ?? slots[0].hora_inicio;
        horaFin = horaFin ?? slots[0].hora_fin;
      }
      rows.push({
        plan_id: null,
        dia_semana: s.dia_semana,
        fecha: getFechaForDia(semana_inicio, s.dia_semana),
        tipo_sesion: s.tipo_sesion,
        lugar: s.lugar,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        objetivo: s.objetivo || "",
        drills: s.drills || [],
        juego_competitivo: s.juego_competitivo || null,
        estaciones_damas: tipo_plan === "damas" ? (s.estaciones_damas || null) : null,
        notas: s.notas || null,
      });
    }
  }

  const { data: newPlan, error: planErr } = await supabase
    .from("planes_semanales")
    .upsert(
      {
        semana_inicio,
        tipo_plan,
        tema_semanal: tema_semanal.trim(),
        descripcion_tema: descripcion_tema ?? "",
        objetivo_mensual: objetivo_mensual || null,
        foco_mes: foco_mes || null,
      },
      { onConflict: "semana_inicio,tipo_plan" }
    )
    .select()
    .single();
  if (planErr || !newPlan) {
    return Response.json({ error: `Error al guardar el plan: ${planErr?.message ?? "desconocido"}` }, { status: 500 });
  }

  rows = rows.map((r) => ({ ...r, plan_id: newPlan.id }));

  const { error: deleteErr } = await supabase.from("sesiones_semana").delete().eq("plan_id", newPlan.id);
  if (deleteErr) {
    return Response.json({ error: `Error al limpiar la programación anterior: ${deleteErr.message}` }, { status: 500 });
  }

  if (rows.length > 0) {
    // upsert (no insert) por defensa adicional: si por una carrera quedó algo
    // sin borrar en el paso anterior, (plan_id, fecha, hora_inicio) reemplaza
    // en vez de chocar con el índice único y duplicar la sesión.
    const { error: insertErr } = await supabase.from("sesiones_semana").upsert(rows, { onConflict: "plan_id,fecha,hora_inicio" });
    if (insertErr) {
      return Response.json({ error: `Error al guardar las sesiones: ${insertErr.message}` }, { status: 500 });
    }
  }

  return Response.json({ plan_id: newPlan.id });
}
