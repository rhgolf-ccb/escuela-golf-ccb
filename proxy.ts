import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isRouteAllowed, type Rol } from "@/lib/roles";

const PUBLIC_PATHS = [
  "/login",
  "/auth/callback",
  "/auth/confirm",
  "/api/check-access",
  // Se pide desde /login, es decir sin sesión: es el "olvidé mi contraseña" y
  // el camino de quien nunca la creó. Sin esto respondía 401 y la familia que
  // perdiera su clave quedaba sin ninguna salida. La ruta se protege sola —
  // valida el correo contra app_users con la llave de servicio y responde
  // ok:true incluso para correos desconocidos, para no delatar quién existe.
  "/api/send-login-link",
  "/manifest.webmanifest",
  "/manifest.json",
  "/sw.js",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Headers de confianza que proxy entrega ya validados a layouts/API routes
// (ver lib/current-user.ts) para que no repitan su propia consulta a
// auth.getUser()/app_users — proxy ya es el único punto que la hace por
// request. Se limpian primero en TODA request (incluso rutas públicas) para
// que un cliente no pueda inyectar un valor propio y hacerse pasar por otro rol.
const TRUSTED_HEADERS = ["x-ccb-uid", "x-ccb-rol", "x-ccb-nombre", "x-ccb-email"];

function stripTrustedHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  for (const h of TRUSTED_HEADERS) headers.delete(h);
  return headers;
}

// Proxy corre en CADA navegación — sin timeout, un blip de red hacia la API
// de auth de Supabase (fetch failed / ECONNRESET) deja la petición colgada
// indefinidamente ("Cargando..." fijo) en vez de fallar rápido.
const AUTH_FETCH_TIMEOUT_MS = 6000;
function fetchWithTimeout(input: string | URL | Request, init?: RequestInit) {
  return fetch(input, { ...init, signal: AbortSignal.timeout(AUTH_FETCH_TIMEOUT_MS) });
}

// Un solo intento adicional para no forzar un logout por un blip de red
// transitorio — si el segundo intento también falla, sí se trata como no
// autenticado (fail-closed, el comportamiento seguro por defecto).
async function getUserResilient(supabase: ReturnType<typeof createServerClient>) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data } = await supabase.auth.getUser();
      return data.user;
    } catch {
      if (attempt === 1) return null;
    }
  }
  return null;
}

// ── Caché de sesión firmada ───────────────────────────────────────────────────
// La base está en sa-east-1 (São Paulo): cada request hacía 2 viajes de red a
// esa región (auth.getUser() + app_users). Para navegaciones seguidas se cachea
// el resultado ya validado en una cookie propia firmada con HMAC-SHA256 (secreto
// de servidor), atada a la sesión de Supabase y con vida corta. Si la cookie
// falta, expiró, no coincide con la sesión o la firma no valida, se cae al
// camino completo de siempre — nunca se abre acceso por una cookie inválida.
const SESSION_CACHE_COOKIE = "ccb-ses";
const SESSION_CACHE_TTL_MS = 60_000; // 60s: staleness máx. tras desactivar a un usuario

type SessionPayload = {
  u: string;        // user id
  r: string;        // rol
  n: string | null; // nombre (crudo)
  e: string | null; // email (crudo)
  p: boolean;       // password_set
  f: string;        // fingerprint de la sesión de Supabase
  x: number;        // expiración (epoch ms)
};

const enc = new TextEncoder();

function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlFromStr(s: string): string {
  return b64urlFromBytes(enc.encode(s));
}
function strFromB64url(s: string): string {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(norm);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

let hmacKeyPromise: Promise<CryptoKey> | null = null;
function getHmacKey(): Promise<CryptoKey> {
  if (!hmacKeyPromise) {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    hmacKeyPromise = crypto.subtle.importKey(
      "raw",
      enc.encode("ccb-ses-v1:" + secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  }
  return hmacKeyPromise;
}
async function hmacSign(data: string): Promise<string> {
  const key = await getHmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64urlFromBytes(new Uint8Array(sig));
}
async function sha256Short(data: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(data));
  return b64urlFromBytes(new Uint8Array(digest)).slice(0, 22);
}

// Huella de la sesión de Supabase (cookies sb-*-auth-token, incluidos sus
// chunks). Cambia al iniciar sesión, cerrarla o refrescar el token, invalidando
// la caché automáticamente. Vacío = no hay sesión → no se usa caché.
function authCookieRaw(request: NextRequest): string {
  return request.cookies
    .getAll()
    .filter((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"))
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .map((c) => `${c.name}=${c.value}`)
    .join("|");
}

async function readSessionCache(request: NextRequest, fingerprint: string): Promise<SessionPayload | null> {
  const raw = request.cookies.get(SESSION_CACHE_COOKIE)?.value;
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  let expected: string;
  try {
    expected = await hmacSign(body);
  } catch {
    return null;
  }
  if (sig !== expected) return null;
  let payload: SessionPayload;
  try {
    payload = JSON.parse(strFromB64url(body)) as SessionPayload;
  } catch {
    return null;
  }
  if (!payload || typeof payload.x !== "number" || payload.x < Date.now()) return null;
  if (payload.f !== fingerprint) return null;
  return payload;
}

async function buildSessionCookie(payload: SessionPayload): Promise<string> {
  const body = b64urlFromStr(JSON.stringify(payload));
  const sig = await hmacSign(body);
  return `${body}.${sig}`;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  const cleanHeaders = stripTrustedHeaders(request);

  if (isPublicPath(pathname)) {
    return NextResponse.next({ request: { headers: cleanHeaders } });
  }

  // Camino rápido: si hay una sesión de Supabase presente y una caché firmada
  // válida para ella, aplicamos las mismas comprobaciones de ruta/estado sin
  // tocar la red y entregamos los headers de confianza.
  const authRaw = authCookieRaw(request);
  let fingerprint = "";
  try {
    if (authRaw) fingerprint = await sha256Short(authRaw);
  } catch {
    fingerprint = ""; // si el cifrado no está disponible, sin caché → validación normal
  }
  if (fingerprint) {
    const cached = await readSessionCache(request, fingerprint);
    if (cached) {
      if (!cached.p && !isApi && pathname !== "/set-password") {
        return NextResponse.redirect(new URL("/set-password", request.url));
      }
      if (!isRouteAllowed(cached.r as Rol, pathname)) {
        if (isApi) return NextResponse.json({ error: "forbidden" }, { status: 403 });
        return NextResponse.redirect(new URL("/mi-perfil", request.url));
      }
      cleanHeaders.set("x-ccb-uid", cached.u);
      cleanHeaders.set("x-ccb-rol", cached.r);
      if (cached.n) cleanHeaders.set("x-ccb-nombre", encodeURIComponent(cached.n));
      if (cached.e) cleanHeaders.set("x-ccb-email", encodeURIComponent(cached.e));
      return NextResponse.next({ request: { headers: cleanHeaders } });
    }
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
      global: { fetch: fetchWithTimeout },
    }
  );

  const fail = (status: number, redirectQuery?: string) => {
    if (isApi) return NextResponse.json({ error: "unauthorized" }, { status });
    const url = new URL("/login", request.url);
    if (redirectQuery) url.searchParams.set(redirectQuery, "1");
    return NextResponse.redirect(url);
  };

  const user = await getUserResilient(supabase);
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

  // Deja lista la caché firmada para las próximas navegaciones (60s), atada a la
  // huella de la sesión actual. Si el token se refrescó recién, la huella
  // cambiará en la siguiente request y simplemente se revalida por completo.
  if (fingerprint) {
    try {
      const token = await buildSessionCookie({
        u: user.id,
        r: appUser.rol,
        n: appUser.nombre ?? null,
        e: appUser.email ?? null,
        p: !!appUser.password_set,
        f: fingerprint,
        x: Date.now() + SESSION_CACHE_TTL_MS,
      });
      finalResponse.cookies.set(SESSION_CACHE_COOKIE, token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_CACHE_TTL_MS / 1000,
      });
    } catch {
      // Si la firma falla por alguna razón, seguimos sin caché — nunca bloquea.
    }
  }

  return finalResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
