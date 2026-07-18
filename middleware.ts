import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isRouteAllowed, type Rol } from "@/lib/roles";

const PUBLIC_PATHS = [
  "/login",
  "/auth/callback",
  "/auth/confirm",
  "/api/check-access",
  "/manifest.webmanifest",
  "/manifest.json",
  "/sw.js",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Headers de confianza que middleware entrega ya validados a layouts/API routes
// (ver lib/current-user.ts) para que no repitan su propia consulta a
// auth.getUser()/app_users — middleware ya es el único punto que la hace por
// request. Se limpian primero en TODA request (incluso rutas públicas) para
// que un cliente no pueda inyectar un valor propio y hacerse pasar por otro rol.
const TRUSTED_HEADERS = ["x-ccb-uid", "x-ccb-rol", "x-ccb-nombre", "x-ccb-email"];

function stripTrustedHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  for (const h of TRUSTED_HEADERS) headers.delete(h);
  return headers;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  const cleanHeaders = stripTrustedHeaders(request);

  if (isPublicPath(pathname)) {
    return NextResponse.next({ request: { headers: cleanHeaders } });
  }

  let response = NextResponse.next({ request: { headers: cleanHeaders } });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: cleanHeaders } });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const fail = (status: number, redirectQuery?: string) => {
    if (isApi) return NextResponse.json({ error: "unauthorized" }, { status });
    const url = new URL("/login", request.url);
    if (redirectQuery) url.searchParams.set(redirectQuery, "1");
    return NextResponse.redirect(url);
  };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401);

  const { data: appUser } = await supabase
    .from("app_users")
    .select("rol, nombre, email, activo, session_days, last_sign_in, password_set")
    .eq("id", user.id)
    .maybeSingle();

  if (!appUser || !appUser.activo) {
    await supabase.auth.signOut();
    return fail(401, "blocked");
  }

  if (appUser.session_days && appUser.last_sign_in) {
    const expiresAt = new Date(appUser.last_sign_in).getTime() + appUser.session_days * 86400000;
    if (Date.now() > expiresAt) {
      await supabase.auth.signOut();
      return fail(401, "expired");
    }
  }

  if (!appUser.password_set && !isApi && pathname !== "/set-password") {
    return NextResponse.redirect(new URL("/set-password", request.url));
  }

  if (!isRouteAllowed(appUser.rol as Rol, pathname)) {
    if (isApi) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.redirect(new URL("/mi-perfil", request.url));
  }

  // Ya validamos todo lo necesario — entregamos el resultado a layouts/API
  // routes vía headers para que no repitan auth.getUser()/app_users (ver
  // lib/current-user.ts). Se reconstruye la respuesta con esos headers y se
  // preservan las cookies que Supabase haya refrescado en `response`.
  cleanHeaders.set("x-ccb-uid", user.id);
  cleanHeaders.set("x-ccb-rol", appUser.rol);
  if (appUser.nombre) cleanHeaders.set("x-ccb-nombre", encodeURIComponent(appUser.nombre));
  if (appUser.email) cleanHeaders.set("x-ccb-email", encodeURIComponent(appUser.email));

  const finalResponse = NextResponse.next({ request: { headers: cleanHeaders } });
  response.cookies.getAll().forEach((c) => finalResponse.cookies.set(c));
  return finalResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
