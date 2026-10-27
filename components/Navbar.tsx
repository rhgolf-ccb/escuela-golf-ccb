"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ADMIN_ROLES, isRouteAllowed, isStaff, roleLabel, type Rol } from "@/lib/roles";
import {
  Users, Calendar, ClipboardList, BookOpen, UserCheck,
  BarChart2, Shield, Dumbbell, Brain, CalendarDays, Trophy,
  LogOut, ChevronDown, Activity, User, Menu, X, KeyRound, ImageIcon
} from "lucide-react";

function initiales(name: string): string {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

// Una foto de celular pesa 5-10 MB y Vercel corta el cuerpo de la petición en
// 4,5 MB. Se reduce en el navegador a 2560 px de ancho (sobra para el fondo
// de Inicio a pantalla completa) y se manda como JPEG.
async function reducirFoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, 2560 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo leer la foto"))), "image/jpeg", 0.85)
  );
}

const navItems = [
  { label: "Inicio",              href: "/dashboard",          icon: Activity },
  { label: "Alumnos",             href: "/alumnos",            icon: Users },
  { label: "Programación",        href: "/programacion",       icon: Calendar },
  { label: "Reservas",            href: "/reservas",           icon: CalendarDays },
  { label: "Reportes",            href: "/reportes",           icon: BarChart2 },
  { label: "Torneos",             href: "/torneos",            icon: Trophy },
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
  const [subiendoPortada, setSubiendoPortada] = useState(false);
  const portadaInputRef = useRef<HTMLInputElement>(null);
  const puedeCambiarPortada = role ? ADMIN_ROLES.includes(role) : false;

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

  async function handlePortada(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSubiendoPortada(true);
    try {
      const fd = new FormData();
      fd.append("foto", await reducirFoto(file), "inicio.jpg");
      const res = await fetch("/api/portada", { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo cambiar la foto");
      }
      setUserMenuOpen(false);
      setMobileOpen(false);
      if (pathname === "/dashboard") router.refresh();
      else router.push("/dashboard");
    } catch (err) {
      console.error("Cambiar foto de Inicio:", err);
      window.alert(err instanceof Error ? err.message : "No se pudo cambiar la foto");
    } finally {
      setSubiendoPortada(false);
    }
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
            {/* La contraseña inicial la entrega el coordinador por WhatsApp;
                sin esta entrada nadie podía cambiar la suya después. */}
            <Link
              href="/set-password"
              onClick={() => setUserMenuOpen(false)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-sidebar-text hover:text-white hover:bg-white/5 transition-colors"
            >
              <KeyRound size={15} />
              Cambiar contraseña
            </Link>
            {puedeCambiarPortada && (
              <button
                onClick={() => portadaInputRef.current?.click()}
                disabled={subiendoPortada}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-sidebar-text hover:text-white hover:bg-white/5 transition-colors disabled:opacity-60"
              >
                <ImageIcon size={15} />
                {subiendoPortada ? "Subiendo foto…" : "Cambiar foto de Inicio"}
              </button>
            )}
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

        {/* Powered by RHGOLF */}
        <div className="mt-4 pt-3 border-t border-white/5 flex flex-col items-center gap-1">
          <Image
            src="/rh-monograma.png"
            alt="RH Golf"
            width={46}
            height={33}
            className="object-contain opacity-90"
          />
          <p className="text-[9px] tracking-[0.22em] text-white/40 font-medium">
            POWERED BY <span className="text-ccb-gold/90 font-semibold">RHGOLF</span>
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Fuera de SidebarContent: ese bloque se monta dos veces (escritorio y
          móvil) y el ref quedaría apuntando a uno solo. */}
      {puedeCambiarPortada && (
        <input ref={portadaInputRef} type="file" accept="image/*" className="hidden" onChange={handlePortada} />
      )}

      {/* SIDEBAR DESKTOP */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 bg-sidebar-bg h-screen sticky top-0">
        <SidebarContent />
      </aside>

      {/* TOPBAR MOBILE */}
      <header className="lg:hidden fixed inset-x-0 top-0 flex items-center justify-between px-4 h-14 bg-sidebar-bg z-40">
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
