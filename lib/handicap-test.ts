// ── Handicap del test físico ──────────────────────────────────────────────────
// Handicap estilo golf: escala 0–36, MENOR = mejor (0 = físico ideal).
// Se deriva del `score_promedio` (0–10) que ya guarda cada evaluación física,
// por lo que NO requiere cambios en la base de datos ni recálculo de históricos.
//
// Fórmula: cada test aporta golpes según su resultado
//   cumple   → 0    (sin limitación)
//   progreso → 18   (limitación parcial)
//   bajo     → 36   (limitación marcada)
// El handicap es el promedio de esos golpes sobre los tests evaluados (no N/A),
// lo que equivale exactamente a  4.5 × (10 − score_promedio).
//
// Es RELATIVO AL GRUPO: cada grupo (Birdies, Águilas, Albatros, +14, Competencia,
// Damas) se evalúa contra sus propios tests y benchmarks de Protocolos, así que
// un HCP 0 significa "físico ideal para su grupo/edad", no un estándar único.

export function scoreToHandicapTest(score: number | null | undefined): number | null {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  const h = 4.5 * (10 - score);
  return Math.max(0, Math.min(36, Math.round(h)));
}

export type HandicapBand = { label: string; text: string; bg: string };

// Bandas alineadas con la escala de score existente:
//   score ≥ 8 → HCP ≤ 9   ·  score ≥ 6 → HCP ≤ 18
//   score ≥ 4 → HCP ≤ 27  ·  resto     → HCP > 27
export function handicapBand(h: number | null): HandicapBand {
  if (h === null) return { label: "—", text: "#9CA3AF", bg: "#F9FAFB" };
  if (h <= 9) return { label: "Élite físico", text: "#1D4ED8", bg: "#EFF6FF" };
  if (h <= 18) return { label: "Sólido", text: "#1B4D2E", bg: "#F0FDF4" };
  if (h <= 27) return { label: "En desarrollo", text: "#92400E", bg: "#FFFBEB" };
  return { label: "A trabajar", text: "#991B1B", bg: "#FEF2F2" };
}

// Etiqueta compacta para badges: "HCP 8" / "HCP —"
export function formatHandicapTest(h: number | null): string {
  return h === null ? "HCP —" : `HCP ${h}`;
}
