// Tokens del dashboard, donde la foto del club es el fondo fijo de toda la
// página y cada tarjeta se apoya sobre ella como vidrio translúcido.
// Vive en lib/ (sin "use client" ni imports) para poder compartirse entre el
// Server Component de la página y DashboardAgendaCard, que es cliente.

// Texto oscuro: sobre vidrio blanco el gris claro deja de leerse.
export const GLASS_TITLE = "#12291D";
export const GLASS_SUBTITLE = "#2F4A3A";
export const GLASS_MUTED = "#4A6355";
export const GLASS_ICON = "#1A3A2A";

// Separadores internos: verde muy diluido en vez de gris, para no ensuciar
// el vidrio con una línea fría.
export const GLASS_DIVIDER = "rgba(18,41,29,0.12)";

// Tarjeta de módulo (compacta, dentro del hero).
export const GLASS_CARD =
  "glass-card rounded-xl border border-white/60 bg-white/70 backdrop-blur-xl backdrop-saturate-110 transition-colors duration-150 hover:border-white/80 hover:bg-white/80";

// Panel de contenido (Agenda, Eventos, Asistencia). Va algo más opaco que la
// tarjeta de módulo porque lleva texto pequeño y denso.
export const GLASS_PANEL =
  "glass-panel rounded-xl border border-white/60 bg-white/80 backdrop-blur-xl backdrop-saturate-110";
