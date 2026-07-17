"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isRouteAllowed, isStaff, roleLabel, type Rol } from "@/lib/roles";
import {
  Users, Calendar, ClipboardList, BookOpen, UserCheck,
  BarChart2, Shield, Dumbbell, Brain, CalendarDays,
  LogOut, ChevronDown, Activity, User, Menu, X
} from "lucide-react";

function initiales(name: string): string {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

const navItems = [
  { label: "Dashboard",           href: "/dashboard",          icon: Activity },
  { label: "Alumnos",             href: "/alumnos",            icon: Users },
  { label: "Programación",        href: "/programacion",       icon: Calendar },
  { label: "Reservas",            href: "/reservas",           icon: CalendarDays },
  { label: "Reportes",            href: "/reportes",           icon: BarChart2 },
  { label: "Protocolos",          href: "/protocolos",         icon: ClipboardList },
  { label: "Staff",               href: "/staff",              icon: UserCheck },
  { label: "Accesos",             href: "/accesos",            icon: Shield },
  { label: "Drills",              href: "/drills",             icon: BookOpen },
  { label: "Físico",              href: "/fisico",             icon: Dumbbell },
  { label: "Base conocimiento",   href: "/base-conocimiento",  icon: Brain },
  { label: "Calendario",          href: "/calendario",         icon: CalendarDays },
  { label: "Mi Perfil",           href: "/mi-perfil",          icon: User },
];

export default function Navbar({
  role,
  nombre,
  email,
  fotoUrl,
}: {
  role: Rol | null;
  nombre: string | null;
  email: string | null;
  fotoUrl: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const displayName = nombre?.trim() || email || "";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const visibleItems = role
    ? navItems.filter((item) => {
        if (item.href === "/mi-perfil" && isStaff(role)) return false;
        if (item.href === "/calendario" && isStaff(role)) return false;
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

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Image
            src="/Paco_transparente.png"
            alt="Paco"
            height={40}
            width={40}
            className="object-contain shrink-0"
          />
          <div className="flex flex-col leading-tight">
            <span className="text-ccb-gold font-bold text-base tracking-wide">
              COUNTRY CLUB
            </span>
            <span className="text-white text-[10px] tracking-widest uppercase opacity-70">
              ESCUELA DE GOLF
            </span>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group
                ${isActive
                  ? "bg-ccb-green text-white shadow-sm"
                  : "text-sidebar-text hover:bg-sidebar-hover hover:text-white"
                }`}
            >
              <Icon size={18} className={`shrink-0 ${isActive ? "text-ccb-gold" : "group-hover:text-ccb-gold transition-colors"}`} />
              <span>{item.label}</span>
              {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-ccb-gold" />}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="px-3 py-4 border-t border-white/10">
        <button
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-sidebar-hover transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-ccb-green flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden">
            {fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fotoUrl} alt={displayName} className="w-full h-full object-cover" style={{ borderRadius: "50%" }} />
            ) : (
              initiales(displayName)
            )}
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-white text-sm font-medium truncate">{displayName}</p>
            <p className="text-sidebar-text text-xs truncate">
              {role ? roleLabel(role) : ""}
            </p>
          </div>
          <ChevronDown size={14} className={`text-sidebar-text transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
        </button>
        {userMenuOpen && (
          <div className="mt-1 mx-1 rounded-lg bg-sidebar-hover overflow-hidden">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 transition-colors"
            >
              <LogOut size={15} />
              Cerrar sesión
            </button>
          </div>
        )}
        <p className="text-center text-[10px] text-sidebar-text opacity-50 mt-4 px-2 italic">
          Formamos campeones dentro y fuera del campo.
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* SIDEBAR DESKTOP */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 bg-sidebar-bg h-screen sticky top-0">
        <SidebarContent />
      </aside>

      {/* TOPBAR MOBILE */}
      <header className="lg:hidden flex items-center justify-between px-4 h-14 bg-sidebar-bg sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <Image src="/Paco_transparente.png" alt="Paco" height={30} width={30} className="object-contain" />
          <span className="text-ccb-gold font-bold text-sm tracking-wide">CCB Escuela de Golf</span>
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="text-white p-1">
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      {/* DRAWER MOBILE */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-64 bg-sidebar-bg h-full overflow-y-auto">
            <SidebarContent />
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setMobileOpen(false)} />
        </div>
      )}
    </>
  );
}
