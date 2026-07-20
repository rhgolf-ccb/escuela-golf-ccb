import type { TipoPlan, DiaSemana } from "@/components/ProgramacionModule";

// Duración de una sesión en minutos a partir de horarios_defecto — acepta
// "HH:MM" o "HH:MM:SS" (formato que devuelve Postgres para columnas time).
export function computeSessionDuration(horaInicio: string, horaFin: string): number {
  const [h1, m1] = horaInicio.slice(0, 5).split(":").map(Number);
  const [h2, m2] = horaFin.slice(0, 5).split(":").map(Number);
  return h2 * 60 + m2 - (h1 * 60 + m1);
}

// Minutos por estación una vez descontado el calentamiento — nunca negativo,
// para que la UI pueda mostrar "X min por estación" aunque el horario sea corto.
export function allocateStationMinutes(totalMin: number, warmupMin: number, nEstaciones: number): number {
  if (nEstaciones <= 0) return 0;
  const restante = Math.max(totalMin - warmupMin, 0);
  return Math.floor(restante / nEstaciones);
}

// Los 3 grupos parten de 3 estaciones por defecto — el profe la ajusta
// libremente (1-4) por día. Se deja como función (no constante) para que la
// UI tenga un solo punto de verdad si algún grupo cambia de default a futuro.
export function defaultStationCount(_tipoPlan: TipoPlan): number {
  return 3;
}

export type EstacionCategoria = "juego_largo" | "juego_corto" | "putt" | "campo" | "trabajo_fisico" | "campo_infantil";

// Estructura por día — sugerida, siempre editable. Devuelve las categorías en
// orden (primera = énfasis del día), longitud = defaultStationCount.
export function defaultCategoriasForDia(tipoPlan: TipoPlan, dia: DiaSemana): EstacionCategoria[] {
  if (tipoPlan === "juvenil" || tipoPlan === "damas") {
    // Juvenil: mismas 3 categorías todos los días. Damas: 3 rotativas, el
    // énfasis en ritmo/giro se refleja en el foco por defecto, no aquí.
    return ["juego_largo", "juego_corto", "putt"];
  }
  // Competencia — estructura día por día: martes énfasis juego largo,
  // miércoles putt/campo, jueves juego corto, sábado repaso integral.
  switch (dia) {
    case "martes":    return ["juego_largo", "juego_corto", "putt"];
    case "miercoles": return ["putt", "campo", "juego_corto"];
    case "jueves":    return ["juego_corto", "juego_largo", "putt"];
    case "sabado":    return ["juego_largo", "juego_corto", "putt"]; // repaso integral
    default:          return ["juego_largo", "juego_corto", "putt"];
  }
}

// Lugar sugerido por categoría de estación — nunca "driving range".
// Reutiliza la misma lógica que ya existía repetida en cada modal (putt →
// putting green, campo → Pacos y Fabios, todo lo demás → campo de práctica,
// incluida trabajo_fisico que no tiene lugar propio).
export function suggestLugar(categoria: EstacionCategoria): string {
  if (categoria === "putt") return "putting_green";
  if (categoria === "campo_infantil") return "campo_infantil";
  if (categoria === "campo") return "campo_pacos_fabios";
  return "campo_practica";
}

// Evita repetir el mismo drill/ejercicio en la semana — dedupe por id (no por
// título, que es frágil ante variaciones de texto).
export function filterAvoidingRepeats<T extends { id: string }>(candidatos: T[], idsUsadosSemana: Set<string>): T[] {
  return candidatos.filter((c) => !idsUsadosSemana.has(c.id));
}
