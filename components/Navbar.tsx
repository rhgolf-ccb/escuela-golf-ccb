"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Alumnos", href: "/alumnos" },
];

export default function Navbar() {
  const pathname = usePathname();

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
              {navItems.map((item) => {
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
          <div className="text-right hidden sm:block">
            <p className="text-white text-xs opacity-60">Country Club de Bogotá</p>
          </div>
        </div>
      </div>
    </header>
  );
}
