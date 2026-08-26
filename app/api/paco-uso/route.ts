import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { DIRECTOR_COORD_ROLES, type Rol } from "@/lib/roles";

// Quién usa a Paco. `paco_usage` existe para el cupo diario —una fila por
// usuario y día— y de paso deja el rastro de quién lo abre; aquí solo se lee.
//
// Va por API y no desde el navegador porque la policy de `paco_usage` deja a
// cada quien ver sus propias filas: el chat consulta su cupo sin filtrar por
// user_id y confía en RLS para eso. Leer el uso de los demás necesita la llave
// de servicio, y con ella la comprobación de rol tiene que hacerse aquí.
//
// Mismo alcance que la base de conocimiento de Paco: director y coordinador. Un
// profesor no tiene por qué ver cuánto lo usan sus compañeros.

async function requireDirectorCoord() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };
  const { data: caller } = await supabase.from("app_users").select("rol").eq("id", user.id).maybeSingle();
  const rol = caller?.rol as Rol | undefined;
  if (!rol || !DIRECTOR_COORD_ROLES.includes(rol)) {
    return { error: Response.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { userId: user.id };
}

function fechaBogota(desplazamientoDias = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + desplazamientoDias);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

type FilaUso = { user_id: string; fecha: string; mensajes_count: number | null };

export async function GET() {
  const auth = await requireDirectorCoord();
  if (auth.error) return auth.error;

  const admin = createSupabaseAdminClient();

  // Una fila por usuario y día: crece lento, pero se pagina igual porque
  // PostgREST corta en 1000 sin avisar y el corte sería invisible en pantalla.
  const PAGINA = 1000;
  const filas: FilaUso[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await admin
      .from("paco_usage")
      .select("user_id, fecha, mensajes_count")
      .order("fecha", { ascending: true })
      .order("user_id", { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const pagina = (data ?? []) as FilaUso[];
    filas.push(...pagina);
    if (pagina.length < PAGINA) break;
  }

  const { data: cuentas, error: errCuentas } = await admin
    .from("app_users")
    .select("id, nombre, email, rol, activo, last_sign_in")
    .order("nombre", { ascending: true });
  if (errCuentas) return Response.json({ error: errCuentas.message }, { status: 500 });

  const hace30 = fechaBogota(-30);

  const agregado = new Map<string, { mensajes: number; mensajes30: number; dias: Set<string>; primera: string; ultima: string }>();
  for (const f of filas) {
    const n = f.mensajes_count ?? 0;
    const a = agregado.get(f.user_id) ?? { mensajes: 0, mensajes30: 0, dias: new Set<string>(), primera: f.fecha, ultima: f.fecha };
    a.mensajes += n;
    if (f.fecha >= hace30) a.mensajes30 += n;
    a.dias.add(f.fecha);
    if (f.fecha < a.primera) a.primera = f.fecha;
    if (f.fecha > a.ultima) a.ultima = f.fecha;
    agregado.set(f.user_id, a);
  }

  const usuarios = ((cuentas ?? []) as {
    id: string; nombre: string | null; email: string; rol: string; activo: boolean; last_sign_in: string | null;
  }[]).map((u) => {
    const a = agregado.get(u.id);
    return {
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      rol: u.rol,
      activo: u.activo,
      last_sign_in: u.last_sign_in,
      mensajes: a?.mensajes ?? 0,
      mensajes30: a?.mensajes30 ?? 0,
      dias: a?.dias.size ?? 0,
      primera: a?.primera ?? null,
      ultima: a?.ultima ?? null,
    };
  });

  return Response.json({ usuarios });
}
