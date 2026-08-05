import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Next 16 exige la lista blanca de calidades (default [75]); el hero del
    // dashboard se sirve a 85.
    qualities: [75, 85],
  },
};

export default nextConfig;
