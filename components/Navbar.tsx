"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isRouteAllowed, type Rol } from "@/lib/roles";

const navItems = [
  { label: "Alumnos", href: "/alumnos" },
  { label: "Programación", href: "/programacion" },
  { label: "Reservas", href: "/reservas" },
  { label: "Reportes", href: "/reportes" },
  { label: "Protocolos", href: "/protocolos" },
  { label: "Staff", href: "/staff" },
  { label: "Accesos", href: "/accesos" },
  { label: "Drills", href: "/drills" },
];

export default function Navbar({ role }: { role: Rol | null }) {
  const pathname = usePathname();
  const router = useRouter();

  const visibleItems = role ? navItems.filter((item) => isRouteAllowed(role, item.href)) : [];

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
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <Image
              src="/Paco_transparente.png"
              alt="Paco"
              height={50}
              width={50}
              className="object-contain"
            />
            <div className="flex flex-col leading-tight">
              <span className="text-ccb-gold font-bold text-lg tracking-wide">
                CCB
              </span>
              <span className="text-white text-xs tracking-widest uppercase opacity-80">
                Escuela de Golf
              </span>
            </div>
            <div className="w-px h-8 bg-ccb-gold opacity-40 mx-2" />
            <nav className="flex gap-1">
              {visibleItems.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
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
          </div>
          <div className="flex items-center gap-4">
            <p className="text-white text-xs opacity-60 hidden sm:block">Country Club de Bogotá</p>
            <button
              onClick={handleLogout}
              className="text-white text-xs opacity-70 hover:opacity-100 flex items-center gap-1"
              title="Cerrar sesión"
            >
              <i className="ti ti-logout" style={{ fontSize: 14 }} />
              Salir
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
