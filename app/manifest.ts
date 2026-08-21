import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Escuela de Golf CCB",
    short_name: "Golf CCB",
    description: "Sistema de gestión de la Escuela de Golf del Country Club de Bogotá",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    // Colores de la PWA (barra de estado y pantalla de arranque). Siguen al
    // fondo del tema oscuro, que es el de todas las pantallas de staff.
    theme_color: "#0a1710",
    background_color: "#0a1710",
    lang: "es",
    icons: [
      { src: "/icon.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
