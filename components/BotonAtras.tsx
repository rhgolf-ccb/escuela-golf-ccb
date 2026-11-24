"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";

// Pantallas visitadas dentro de la app en esta pestaña. Con esto "Atrás"
// vuelve a la pantalla anterior de verdad (router.back) y no al Inicio, y
// cuando no hay anterior —link directo, recarga— sube al módulo padre en vez
// de sacar al usuario de la app.
// Vive a nivel de módulo porque lo leen dos botones (barra móvil y menú
// lateral de escritorio, ambos en el Navbar) y lo alimenta un solo rastreador.
let pila: string[] = [];
const oyentes = new Set<() => void>();

function registrar(path: string) {
  if (pila[pila.length - 1] === path) return;
  // Si la nueva ruta es la penúltima, el usuario fue hacia atrás (botón del
  // navegador o el nuestro): se desapila en vez de apilar.
  if (pila.length > 1 && pila[pila.length - 2] === path) pila = pila.slice(0, -1);
  else pila = [...pila, path];
  oyentes.forEach((o) => o());
}

function suscribir(o: () => void) {
  oyentes.add(o);
  return () => { oyentes.delete(o); };
}
const largoPila = () => pila.length;
const largoServidor = () => 0;

/** Ruta padre para cuando no hay historial: /programacion/sesion/123 → /programacion. */
function rutaPadre(path: string): string | null {
  const partes = path.split("/").filter(Boolean);
  if (partes.length <= 1) return null;
  return "/" + partes[0];
}

/** Monta una sola vez (en el Navbar, que persiste entre pantallas): lleva la cuenta de por dónde se navegó. */
export function RastreadorNavegacion() {
  const pathname = usePathname();
  useEffect(() => { registrar(pathname); }, [pathname]);
  return null;
}

export function useAtras() {
  const pathname = usePathname();
  const router = useRouter();
  const largo = useSyncExternalStore(suscribir, largoPila, largoServidor);
  const padre = rutaPadre(pathname);
  const hayAnterior = largo > 1;
  return {
    visible: hayAnterior || padre !== null,
    irAtras: () => {
      if (pila.length > 1) router.back();
      else if (padre) router.push(padre);
    },
  };
}
