import type { NextConfig } from "next";

// El informe de padres (/informes/[id]) pinta la foto del alumno con
// next/image y esa URL vive en Supabase Storage. Sin el host en
// remotePatterns el optimizador contesta 400 ("url" parameter is not allowed)
// y la foto no salía en el link que se comparte. El host se saca del propio
// env para no dejar el proyecto de Supabase escrito a mano en dos sitios.
// Sin restringir search: las fotos guardadas traen cache-buster (?t=...) y con
// search: "" el optimizador las rechaza igual que si el host no estuviera.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

const nextConfig: NextConfig = {
  images: {
    // Next 16 exige la lista blanca de calidades (default [75]); el hero del
    // dashboard se sirve a 85.
    qualities: [75, 85],
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
