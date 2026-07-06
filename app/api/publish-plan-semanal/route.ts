import type { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const TIPO_PLAN_VALUES = ["juvenil", "competencia", "damas"] as const;
const DIA_VALUES = ["martes", "miercoles", "jueves", "viernes", "sabado", "domingo"] as const;
const TIPO_SESION_VALUES = [
  "tiro_largo", "juego_corto", "putt", "campo", "test_tecnico", "test_fisico",
  "competencia", "damas_estaciones", "juvenil_estaciones", "especial", "campo_pacos", "campo_infantil",
] as const;
const LUGAR_VALUES = ["campo_practica", "putting_green", "campo_infantil", "campo_pacos_fabios", "campo_completo"] as const;

type SesionInput = {
  dia_semana: string; fecha: string; tipo_sesion: string; lugar: string;
  hora_inicio?: string | null; hora_fin?: string | null; objetivo?: string | null;
  drills?: unknown; juego_competitivo?: string | null; estaciones_damas?: unknown; notas?: string | null;
};

type SesionJuvenilInput = {
  objetivo_simple?: string;
  actividades?: { nombre: string; como_se_juega: string; adaptacion_birdies?: string; adaptacion_albatros?: string }[];
  actividad_estrella?: string;
};

const JUVENIL_SLOTS: { dia: string; hi: string; hf: string }[] = [
  { dia: "martes", hi: "16:30", hf: "17:30" },
  { dia: "miercoles", hi: "16:30", hf: "17:30" },
  { dia: "jueves", hi: "16:30", hf: "17:30" },
  { dia: "sabado", hi: "09:15", hf: "10:00" },
  { dia: "sabado", hi: "10:00", hf: "11:00" },
  { dia: "domingo", hi: "09:15", hf: "10:00" },
  { dia: "domingo", hi: "10:00", hf: "11:00" },
];

function getFechaForDia(semanaInicio: string, dia: string): string {
  const offset: Record<string, number> = { martes: 1, miercoles: 2, jueves: 3, viernes: 4, sabado: 5, domingo: 6 };
  const d = new Date(semanaInicio + "T00:00:00");
  d.setDate(d.getDate() + (offset[dia] ?? 0));
  return d.toISOString().split("T")[0];
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
    sesiones?: SesionInput[]; sesion_juvenil?: SesionJuvenilInput | null;
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
      if (!s.fecha) {
        return Response.json({ error: `Falta la fecha en la sesión del día ${s.dia_semana}.` }, { status: 400 });
      }
    }
  } else if (!sesion_juvenil) {
    return Response.json({ error: "No hay contenido de la clase juvenil para publicar" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

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

  const { error: deleteErr } = await supabase.from("sesiones_semana").delete().eq("plan_id", newPlan.id);
  if (deleteErr) {
    return Response.json({ error: `Error al limpiar la programación anterior: ${deleteErr.message}` }, { status: 500 });
  }

  if (tipo_plan === "juvenil" && sesion_juvenil) {
    const rows = JUVENIL_SLOTS.map((slot) => ({
      plan_id: newPlan.id,
      dia_semana: slot.dia,
      fecha: getFechaForDia(semana_inicio, slot.dia),
      tipo_sesion: "campo",
      lugar: "campo_practica",
      hora_inicio: slot.hi,
      hora_fin: slot.hf,
      objetivo: sesion_juvenil.objetivo_simple ?? "",
      drills: (sesion_juvenil.actividades ?? []).map((a) => ({
        titulo: a.nombre,
        descripcion: a.como_se_juega,
        dificultad_birdies: a.adaptacion_birdies || null,
        dificultad_aguilas: null,
        dificultad_albatros: a.adaptacion_albatros || null,
        dificultad_mas14: null,
      })),
      juego_competitivo: sesion_juvenil.actividad_estrella || null,
      estaciones_damas: null,
      notas: null,
      sesion_juvenil,
    }));
    const { error: insertErr } = await supabase.from("sesiones_semana").insert(rows);
    if (insertErr) {
      return Response.json({ error: `Error al guardar las sesiones: ${insertErr.message}` }, { status: 500 });
    }
  } else if (sesiones) {
    const rows = sesiones.map((s) => ({
      plan_id: newPlan.id,
      dia_semana: s.dia_semana,
      fecha: s.fecha,
      tipo_sesion: s.tipo_sesion,
      lugar: s.lugar,
      hora_inicio: s.hora_inicio || null,
      hora_fin: s.hora_fin || null,
      objetivo: s.objetivo || "",
      drills: s.drills || [],
      juego_competitivo: s.juego_competitivo || null,
      estaciones_damas: s.estaciones_damas || null,
      notas: s.notas || null,
    }));
    const { error: insertErr } = await supabase.from("sesiones_semana").insert(rows);
    if (insertErr) {
      return Response.json({ error: `Error al guardar las sesiones: ${insertErr.message}` }, { status: 500 });
    }
  }

  return Response.json({ plan_id: newPlan.id });
}
