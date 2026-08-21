// Tokens del dashboard, donde la foto del club es el fondo fijo de toda la
// página y cada tarjeta se apoya sobre ella como vidrio translúcido.
// Vive en lib/ (sin "use client" ni imports) para poder compartirse entre el
// Server Component de la página y DashboardAgendaCard, que es cliente.
//
// El vidrio era blanco con texto oscuro. Funcionaba solo, pero era la única
// pantalla clara que quedaba entre módulos oscuros: entrar a Inicio y pasar a
// Alumnos era pasar de una app a otra. Ahora el vidrio es oscuro y los colores
// salen de las mismas variables que el resto (--ui-*), así que la foto sigue
// siendo la identidad de la portada sin que las tarjetas se sientan prestadas.
//
// Requisito: el contenedor de la página tiene que llevar la clase .tema-oscuro,
// que es donde se definen estas variables.

export const GLASS_TITLE = "var(--ui-text)";
export const GLASS_SUBTITLE = "var(--ui-text-2)";
export const GLASS_MUTED = "var(--ui-text-3)";
export const GLASS_ICON = "var(--ui-gold)";

// Separadores internos: el borde tenue del tema, no una línea gris fría.
export const GLASS_DIVIDER = "var(--ui-border-soft)";

// El tinte del vidrio es --ui-bg con alfa, escrito literal: necesita canal
// alfa, y además Tailwind busca las clases leyendo el código fuente como texto
// —una clase armada por interpolación nunca se genera—, así que estos strings
// no se pueden componer a partir de constantes.

// Tarjeta de módulo (compacta, dentro del hero).
export const GLASS_CARD =
  "glass-card rounded-xl border border-white/10 bg-[rgba(10,23,16,0.62)] backdrop-blur-xl backdrop-saturate-110 transition-colors duration-150 hover:border-white/20 hover:bg-[rgba(10,23,16,0.74)]";

// Panel de contenido (Agenda, Eventos, Asistencia). Va algo más opaco que la
// tarjeta de módulo porque lleva texto pequeño y denso.
export const GLASS_PANEL =
  "glass-panel rounded-xl border border-white/10 bg-[rgba(10,23,16,0.80)] backdrop-blur-xl backdrop-saturate-110";
