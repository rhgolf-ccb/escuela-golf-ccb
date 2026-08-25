"use client";

import { useState } from "react";

export function iniciales(name: string): string {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

// Avatar del alumno para las pantallas de familia (/mi-perfil, /reservas,
// /calendario). Todas pintaban iniciales aunque la ficha tuviera foto: el
// students.foto_url ni siquiera viajaba en la consulta. Se recuerda la URL que
// falló — no un booleano — para que una foto nueva vuelva a intentarse sola,
// igual que el avatar del padrón y el de reservas del staff.
export default function AvatarAlumno({
  name,
  fotoUrl,
  size = 24,
  fallbackClassName = "",
}: {
  name: string;
  fotoUrl?: string | null;
  size?: number;
  fallbackClassName?: string;
}) {
  const [urlFallida, setUrlFallida] = useState<string | null>(null);

  if (fotoUrl && urlFallida !== fotoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={fotoUrl}
        alt={name}
        onError={() => setUrlFallida(fotoUrl)}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={`rounded-full flex items-center justify-center shrink-0 ${fallbackClassName}`}
      style={{ width: size, height: size }}
    >
      {iniciales(name)}
    </span>
  );
}
