// Única fuente de verdad para qué modelo de Claude usa la app — centralizado
// para poder cambiar de modelo (ej. tras un retiro de versión) sin tocar cada
// endpoint uno por uno.
// ANTHROPIC_MODEL: todo lo interactivo/generativo (chat de Paco, planeación,
// drills, reportes) — prioriza velocidad.
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

// ANTHROPIC_MODEL_ANALISIS: solo las evaluaciones (swing, físico/TPI, Trackman
// Vision, análisis integrado) — prioriza precisión sobre velocidad. Opus 4.8
// soporta visión, así que sirve también para el flujo de Trackman.
export const ANTHROPIC_MODEL_ANALISIS = process.env.ANTHROPIC_MODEL_ANALISIS || "claude-opus-4-8";

// Sin timeout, un fetch a la API de Anthropic que se queda colgado (blip de
// red, igual que el que rompía el middleware) deja al profesor viendo
// "Generando sugerencias..." indefinidamente en vez de fallar rápido con un
// botón de reintentar. 25s da margen de sobra para una generación normal.
const ANTHROPIC_TIMEOUT_MS = 25000;

export async function callAnthropicMessages(body: unknown): Promise<Response> {
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    cache: "no-store",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
  });
}
