// Única fuente de verdad para qué modelo de Claude usa la app — centralizado
// para poder cambiar de modelo (ej. tras un retiro de versión) sin tocar cada
// endpoint uno por uno. No usar Opus salvo decisión explícita.
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
