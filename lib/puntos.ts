// Baremo del reconocimiento anual: cuánto vale cada cosa que hace un alumno.
//
// Vive en el código y no en la base a propósito. Es el número que más se va a
// discutir —"tres por venir a una clase extra es poco"— y ajustarlo no puede
// costar una migración. Lo que sí queda escrito en la base es el puntaje del
// día en que se otorgó (`puntos_alumno.puntos`), así que subir un valor aquí
// no reescribe la historia: los puntos viejos siguen valiendo lo que valían.

export type CategoriaPunto =
  | "sesion_extra" | "reto_casa" | "disciplina" | "torneo" | "podio" | "otro";

/** Las tres que se dan desde "Pasar asistencia", con el niño enfrente. */
export const CATEGORIAS_CLASE = [
  { id: "sesion_extra", label: "Sesión extra", puntos: 3, ayuda: "Vino a una clase que no le tocaba" },
  { id: "reto_casa",    label: "Reto de casa", puntos: 2, ayuda: "Cumplió la práctica que le dejaron" },
  { id: "disciplina",   label: "Disciplina",   puntos: 1, ayuda: "Puntualidad, uniforme, cuidado del material, trato" },
] as const;

export type AmbitoTorneo = "interno" | "externo";

/**
 * Torneos. El podio SUMA sobre la participación: quien queda en el podio de un
 * torneo externo se lleva 5 + 8 = 13.
 *
 * Externo pesa más que interno porque salir a competir fuera del club es el
 * paso que cuesta —inscripción, desplazamiento, jugar contra desconocidos— y
 * es exactamente la conducta que el ranking quiere provocar.
 */
export const PUNTOS_TORNEO: Record<AmbitoTorneo, { participar: number; podio: number }> = {
  interno: { participar: 3, podio: 4 },
  externo: { participar: 5, podio: 8 },
};

export const AMBITO_LABEL: Record<AmbitoTorneo, string> = {
  interno: "Interno",
  externo: "Externo",
};

/** Lo que se lleva quien hace podio, contando la participación. */
export function totalPodio(ambito: AmbitoTorneo): number {
  return PUNTOS_TORNEO[ambito].participar + PUNTOS_TORNEO[ambito].podio;
}

export const LABEL_CATEGORIA: Record<string, string> = {
  ...Object.fromEntries(CATEGORIAS_CLASE.map((c) => [c.id, c.label])),
  torneo: "Torneo",
  podio: "Podio",
  otro: "Otro",
};
