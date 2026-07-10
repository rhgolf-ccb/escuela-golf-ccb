import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { DIRECTOR_COORD_ROLES, type Rol } from "@/lib/roles";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: caller } = await supabase
    .from("app_users")
    .select("rol")
    .eq("id", user.id)
    .maybeSingle();
  if (!caller || !DIRECTOR_COORD_ROLES.includes(caller.rol as Rol)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { studentId } = await request.json();
  if (!studentId) {
    return NextResponse.json({ error: "studentId es requerido" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  // Orden: notas -> tests técnicos y físicos -> reservas -> conversaciones con Paco -> alumno.
  // physical_tests y paco_conversaciones tienen FK sin ON DELETE CASCADE, deben borrarse
  // explícitamente antes del alumno o el DELETE final falla por violación de FK.
  const { error: notasError } = await admin.from("notas_profesor").delete().eq("alumno_id", studentId);
  if (notasError) return NextResponse.json({ error: notasError.message }, { status: 500 });

  const { error: swingError } = await admin.from("swing_evaluations").delete().eq("student_id", studentId);
  if (swingError) return NextResponse.json({ error: swingError.message }, { status: 500 });

  const { error: physEvalError } = await admin.from("physical_evaluations").delete().eq("student_id", studentId);
  if (physEvalError) return NextResponse.json({ error: physEvalError.message }, { status: 500 });

  const { error: physTestsError } = await admin.from("physical_tests").delete().eq("student_id", studentId);
  if (physTestsError) return NextResponse.json({ error: physTestsError.message }, { status: 500 });

  const { error: milestonesError } = await admin.from("progress_milestones").delete().eq("student_id", studentId);
  if (milestonesError) return NextResponse.json({ error: milestonesError.message }, { status: 500 });

  const { error: reservasError } = await admin.from("reservas").delete().eq("estudiante_id", studentId);
  if (reservasError) return NextResponse.json({ error: reservasError.message }, { status: 500 });

  const { error: pacoError } = await admin.from("paco_conversaciones").delete().eq("student_id", studentId);
  if (pacoError) return NextResponse.json({ error: pacoError.message }, { status: 500 });

  const { error: studentError } = await admin.from("students").delete().eq("id", studentId);
  if (studentError) return NextResponse.json({ error: studentError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
