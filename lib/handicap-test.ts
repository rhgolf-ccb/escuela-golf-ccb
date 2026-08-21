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
  // Este semáforo lo comparten el perfil del alumno (staff, tema oscuro) y
  // "Mi perfil" (padres, que sigue claro), así que no puede tomar partido: se
  // usa var() con respaldo. Donde .tema-oscuro está activo gana el token; donde
  // no, el hex claro de siempre.
  if (h === null) return { label: "—", text: "var(--ui-text-3, #9CA3AF)", bg: "var(--ui-card-alt, #F9FAFB)" };
  if (h <= 9) return { label: "Élite físico", text: "var(--ui-info, #1D4ED8)", bg: "var(--ui-info-bg, #EFF6FF)" };
  if (h <= 18) return { label: "Sólido", text: "var(--ui-ok, #1B4D2E)", bg: "var(--ui-ok-bg, #F0FDF4)" };
  if (h <= 27) return { label: "En desarrollo", text: "var(--ui-warn, #92400E)", bg: "var(--ui-warn-bg, #FFFBEB)" };
  return { label: "A trabajar", text: "var(--ui-bad, #991B1B)", bg: "var(--ui-bad-bg, #FEF2F2)" };
}

// Etiqueta compacta para badges: "HCP 8" / "HCP —"
export function formatHandicapTest(h: number | null): string {
  return h === null ? "HCP —" : `HCP ${h}`;
}
