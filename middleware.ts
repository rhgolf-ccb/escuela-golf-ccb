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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
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
    .select("rol, activo, session_days, last_sign_in, password_set")
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

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
