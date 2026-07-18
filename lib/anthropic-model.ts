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
