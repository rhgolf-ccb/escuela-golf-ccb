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
    theme_color: "#1a3a2a",
    background_color: "#1a3a2a",
    lang: "es",
    icons: [
      { src: "/icon.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
