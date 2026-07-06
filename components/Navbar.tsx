"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isRouteAllowed, isStaff, roleChipColor, roleLabel, type Rol } from "@/lib/roles";

function initiales(name: string): string {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

const navItems = [
  { label: "Mi Perfil", href: "/mi-perfil" },
  { label: "Alumnos", href: "/alumnos" },
  { label: "Programación", href: "/programacion" },
  { label: "Reservas", href: "/reservas" },
  { label: "Reportes", href: "/reportes" },
  { label: "Protocolos", href: "/protocolos" },
  { label: "Staff", href: "/staff" },
  { label: "Accesos", href: "/accesos" },
  { label: "Drills", href: "/drills" },
  { label: "Base de conocimiento", href: "/base-conocimiento" },
];

export default function Navbar({
  role,
  nombre,
  email,
}: {
  role: Rol | null;
  nombre: string | null;
  email: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const displayName = nombre?.trim() || email || "";
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleItems = role
    ? navItems.filter((item) => {
        if (item.href === "/mi-perfil" && isStaff(role)) return false;
        return isRouteAllowed(role, item.href);
      })
    : [];

  async function handleLogout() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("access_logs").insert({ user_id: user.id, accion: "logout" });
    }
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header className="bg-ccb-green shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between w-full h-16">
          {/* IZQUIERDA: logo */}
          <div className="flex items-center gap-2 shrink-0">
            <Image
              src="/Paco_transparente.png"
              alt="Paco"
              height={38}
              width={38}
              className="object-contain shrink-0"
            />
            <div className="flex flex-col leading-tight shrink-0">
              <span className="text-ccb-gold font-bold text-base tracking-wide">
                CCB
              </span>
              <span className="text-white text-[11px] tracking-widest uppercase opacity-80">
                Escuela de Golf
              </span>
              <span className="text-white opacity-50" style={{ fontSize: 10 }}>
                Country Club de Bogotá
              </span>
            </div>
          </div>

          {/* CENTRO: navegación */}
          <nav className="hidden lg:flex items-center gap-0.5 flex-1 justify-center min-w-0 px-2">
            {visibleItems.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-2.5 py-2 rounded-md whitespace-nowrap transition-colors ${
                    active
                      ? "bg-ccb-gold text-ccb-green font-semibold"
                      : "text-white hover:bg-ccb-green-light font-medium"
                  }`}
                  style={{ fontSize: 13 }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* DERECHA: usuario */}
          <div className="flex items-center gap-3 shrink-0">
            {role && (
              <div
                className="hidden sm:flex items-center gap-2"
                style={{
                  background: "var(--surface-2)",
                  border: "0.5px solid var(--border)",
                  borderRadius: 20,
                  padding: "4px 12px 4px 6px",
                }}
              >
                <span
                  className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
                  style={{ width: 24, height: 24, fontSize: 10, background: roleChipColor(role) }}
                >
                  {initiales(displayName)}
                </span>
                <p className="text-gray-900 whitespace-nowrap" style={{ fontSize: 12, fontWeight: 500 }}>
                  {displayName}
                  <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}> · {roleLabel(role)}</span>
                </p>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="text-white opacity-70 hover:opacity-100 flex items-center justify-center shrink-0"
              title="Cerrar sesión"
            >
              <i className="ti ti-logout" style={{ fontSize: 18 }} />
            </button>
            {visibleItems.length > 0 && (
              <button
                onClick={() => setMobileOpen((v) => !v)}
                className="text-white opacity-90 hover:opacity-100 flex items-center justify-center shrink-0 lg:hidden"
                title="Menú"
              >
                <i className={`ti ${mobileOpen ? "ti-x" : "ti-menu-2"}`} style={{ fontSize: 22 }} />
              </button>
            )}
          </div>
        </div>
        {mobileOpen && (
          <nav className="lg:hidden flex flex-col gap-1 pb-3">
            {role && (
              <div className="flex items-center gap-2 px-3 py-2 mb-1">
                <span
                  className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
                  style={{ width: 24, height: 24, fontSize: 10, background: roleChipColor(role) }}
                >
                  {initiales(displayName)}
                </span>
                <p className="text-white" style={{ fontSize: 12, fontWeight: 500 }}>
                  {displayName}
                  <span className="opacity-70"> · {roleLabel(role)}</span>
                </p>
              </div>
            )}
            {visibleItems.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    active
                      ? "bg-ccb-gold text-ccb-green font-semibold"
                      : "text-white hover:bg-ccb-green-light"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    </header>
  );
}
