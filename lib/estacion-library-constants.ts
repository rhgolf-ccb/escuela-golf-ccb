// Fuente única de foco/material para el picker de biblioteca — antes duplicado
// literalmente en DrillsModule.tsx, JuvenileClassModal.tsx,
// CompetenciaClassModal.tsx y DamasClassModal.tsx.
export const FOCOS = [
  "secuencia", "potencia_velocidad", "transferencia_peso", "rotacion_giro",
  "compresion_contacto", "finish_balance", "ejecucion", "coordinacion_juego", "calentamiento",
] as const;
export type Foco = (typeof FOCOS)[number];

export const FOCO_LABEL: Record<string, string> = {
  secuencia: "Secuencia",
  potencia_velocidad: "Potencia/Velocidad",
  transferencia_peso: "Transferencia de peso",
  rotacion_giro: "Rotación/Giro",
  compresion_contacto: "Compresión/Contacto",
  finish_balance: "Finish/Balance",
  ejecucion: "Ejecución",
  coordinacion_juego: "Coordinación de juego",
  calentamiento: "Calentamiento",
};

export const MATERIALES = ["balon_medicinal", "banda", "palo_velocidad", "conos_escalera", "ninguno"] as const;
export type Material = (typeof MATERIALES)[number];

export const MATERIAL_LABEL: Record<string, string> = {
  balon_medicinal: "Balón medicinal",
  banda: "Banda",
  palo_velocidad: "Palo de velocidad",
  conos_escalera: "Conos/Escalera",
  ninguno: "Ninguno",
};

// ejercicios_fisicos.materiales es texto libre en español (ej. "Balón
// medicinal 1 kg, colchoneta"), a diferencia de drills.material que es
// text[] con vocabulario controlado. No hay overlap exacto posible — se hace
// match por palabra clave (best-effort) contra ese texto libre.
export const MATERIAL_KEYWORDS: Record<Material, string[]> = {
  balon_medicinal: ["balon"],
  banda: ["banda"],
  palo_velocidad: ["palo"],
  conos_escalera: ["cono", "escalera"],
  ninguno: ["ninguno"],
};

const COMBINING_MARKS = new RegExp("[̀-ͯ]", "g");
export function normalizarTexto(s: string): string {
  return s.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();
}

// drills.nivel_recomendado vive en minúscula (birdies, aguilas, ...) mientras
// que ejercicios_fisicos.grupos vive capitalizado (Birdies, Águilas, ...) —
// dos convenciones de casing reales en la BD, no un error. Este mapeo evita
// que el picker de biblioteca tenga que adivinar la conversión en cada lugar
// que filtra por subgrupo.
export type SubgrupoJuvenil = "birdies" | "aguilas" | "albatros" | "+14";

export const SUBGRUPO_A_GRUPO_FISICO: Record<SubgrupoJuvenil, string> = {
  birdies: "Birdies",
  aguilas: "Águilas",
  albatros: "Albatros",
  "+14": "+14",
};

export const SUBGRUPO_LABEL: Record<SubgrupoJuvenil, string> = {
  birdies: "Birdies",
  aguilas: "Águilas",
  albatros: "Albatros",
  "+14": "+14",
};

// Lugares de práctica — mismo vocabulario duplicado antes en cada modal.
// Nunca "driving range" (terminología CCB).
export const LUGARES_ESTACION: { value: string; label: string }[] = [
  { value: "campo_practica", label: "Campo de práctica" },
  { value: "putting_green", label: "Putting Green" },
  { value: "campo_infantil", label: "Campo Infantil" },
  { value: "campo_pacos_fabios", label: "Campo Pacos y Fabios" },
  { value: "campo_completo", label: "Campo Completo" },
];

export const LUGAR_LABEL: Record<string, string> = Object.fromEntries(
  LUGARES_ESTACION.map((l) => [l.value, l.label])
);

// Reverso de LUGAR_LABEL — Damas guarda el label legible (no el value crudo)
// dentro de estaciones_damas, así que al reabrir para editar hay que
// reconstruir el value a partir del texto guardado.
export const LUGAR_VALUE_FROM_LABEL: Record<string, string> = Object.fromEntries(
  LUGARES_ESTACION.map((l) => [l.label, l.value])
);
