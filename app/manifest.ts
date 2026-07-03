import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CCB Escuela de Golf",
    short_name: "CCB Golf",
    theme_color: "#1a3a2a",
    background_color: "#1a3a2a",
    display: "standalone",
    icons: [
      { src: "/icon.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
