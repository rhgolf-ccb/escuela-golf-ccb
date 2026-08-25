import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { ADMIN_ROLES, isPadreOrAlumno, isStaff, type Rol } from "@/lib/roles";

const VALID_ROLES: Rol[] = [
  "coordinador",
  "director",
  "profesor",
  "administrativo",
  "padre_competencia",
  "padre_otros",
  "alumno_competencia",
];

// Editar una cuenta que ya existe. El caso que lo pidió: un papá con varios
// hijos al que hay que sumarle otro alumno después de haberle creado el acceso
// —y lo mismo cuando entre la otra escuela—, sin borrar la cuenta y volverla a
// crear (eso le cambiaría la contraseña que ya tiene y perdería su registro).
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: caller } = await supabase
    .from("app_users")
    .select("rol")
    .eq("id", user.id)
    .maybeSingle();
  if (!caller || !ADMIN_ROLES.includes(caller.rol as Rol)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { userId, nombre, rol, estudianteIds } = await request.json();
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId es requerido" }, { status: 400 });
  }
  if (!rol || !VALID_ROLES.includes(rol)) {
    return NextResponse.json({ error: "rol inválido" }, { status: 400 });
  }

  const { data: objetivo } = await supabase
    .from("app_users")
    .select("id, email, rol")
    .eq("id", userId)
    .maybeSingle();
  if (!objetivo) return NextResponse.json({ error: "el usuario no existe" }, { status: 404 });

  // Misma regla que al invitar: una cuenta de alumno o padre sin ficha
  // vinculada entra a la app y no ve nada, porque /mi-perfil, /reservas y Paco
  // parten todos de user_estudiantes. Aquí importa el doble — quitar el último
  // alumno de una cuenta que ya funcionaba la dejaría muerta en silencio.
  const vinculos: string[] = Array.isArray(estudianteIds)
    ? estudianteIds.filter((id) => typeof id === "string")
    : [];
  if (isPadreOrAlumno(rol) && vinculos.length === 0) {
    return NextResponse.json(
      { error: "un usuario de alumno o padre necesita al menos un alumno vinculado" },
      { status: 400 },
    );
  }

  // El rol decide la duración de sesión, así que un cambio de familia a staff
  // (o al revés) tiene que arrastrarla; si no, la cuenta se queda con la
  // caducidad del rol viejo.
  const cambioDeRol = objetivo.rol !== rol;
  let sessionDays: number | null = null;
  if (cambioDeRol && !isStaff(rol)) {
    const { data: config } = await supabase.from("app_config").select("value").eq("key", "session_days").maybeSingle();
    sessionDays = config?.value ? Number(config.value) : 30;
  }

  const { error: updateError } = await supabase
    .from("app_users")
    .update({
      nombre: typeof nombre === "string" && nombre.trim() ? nombre.trim() : null,
      rol,
      ...(cambioDeRol ? { session_days: sessionDays } : {}),
    })
    .eq("id", userId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Los vínculos se reconcilian, no se borran y se vuelven a insertar: así una
  // falla a mitad de camino no deja la cuenta sin ningún alumno.
  const { data: actuales } = await supabase
    .from("user_estudiantes")
    .select("estudiante_id")
    .eq("user_id", userId);
  const previos = (actuales ?? []).map((v) => v.estudiante_id as string);

  const porAgregar = vinculos.filter((id) => !previos.includes(id));
  const porQuitar = previos.filter((id) => !vinculos.includes(id));

  if (porAgregar.length > 0) {
    const { error } = await supabase
      .from("user_estudiantes")
      .insert(porAgregar.map((estudiante_id) => ({ user_id: userId, estudiante_id })));
    if (error) return NextResponse.json({ error: `no se pudo vincular: ${error.message}` }, { status: 500 });
  }
  if (porQuitar.length > 0) {
    const { error } = await supabase
      .from("user_estudiantes")
      .delete()
      .eq("user_id", userId)
      .in("estudiante_id", porQuitar);
    if (error) return NextResponse.json({ error: `no se pudo desvincular: ${error.message}` }, { status: 500 });
  }

  const cambios = [
    cambioDeRol ? `rol ${objetivo.rol} → ${rol}` : null,
    porAgregar.length ? `+${porAgregar.length} alumno(s)` : null,
    porQuitar.length ? `-${porQuitar.length} alumno(s)` : null,
  ].filter(Boolean).join(", ");

  // El error del registro no tumba la edición (que ya está guardada), pero sí
  // se grita en el servidor: si 'usuario_editado' falta en el enum app_accion,
  // los cambios de rol se estarían haciendo sin dejar rastro y en silencio.
  const { error: logError } = await supabase.from("access_logs").insert({
    user_id: userId,
    accion: "usuario_editado",
    detalle: `editado por ${user.email ?? user.id}${cambios ? `: ${cambios}` : " (sin cambios de rol ni de alumnos)"}`,
  });
  if (logError) console.error("access_logs usuario_editado:", logError.message);

  return NextResponse.json({ ok: true, agregados: porAgregar.length, quitados: porQuitar.length });
}
