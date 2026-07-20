import type { TipoPlan } from "@/components/ProgramacionModule";
import type { EstacionLibraryPick } from "@/components/EstacionLibraryPicker";
import type { SubgrupoJuvenil } from "@/lib/estacion-library-constants";
import type { EstacionCategoria } from "@/lib/planning-defaults";

export interface CategoriaOption {
  value: string; // valor exacto que se guarda en el campo categoria del grupo
  emoji: string;
  label: string;
  // null = la estación usa ejercicios_fisicos (trabajo físico/fisico), no drills
  drillsCategoria: string | null;
  // mapea al vocabulario canónico de lib/planning-defaults para sugerir lugar
  canonical: EstacionCategoria;
}

export interface EspecialOption {
  value: string;
  // Valor que va en la columna tipo_sesion (fila) — en Juvenil dos valores
  // distintos (campo_pacos/campo_infantil) colapsan al mismo tipo_sesion
  // "campo"; el detalle real vive en sesion_juvenil.tipo_especial (= value).
  tipoSesion: string;
  emoji: string;
  label: string;
  desc: string;
  lugar: string;
  objetivo: string;
}

export interface GroupConfig {
  tipoPlan: TipoPlan;
  color: string;
  categorias: CategoriaOption[];
  especiales: EspecialOption[];
}

export interface EstacionWizardState {
  categoria: string;
  foco: string | null;
  material: string[];
  items: EstacionLibraryPick[];
  desafio: string;
  // Lugar vive por estación (no por día) — así ya lo guardan los 3 grupos hoy:
  // cada estación puede pasar por un sitio distinto dentro del mismo día.
  lugar: string;
}

export interface CalentamientoState {
  ejercicios: EstacionLibraryPick[];
  duracionMin: number;
}

export interface DiaWizardState {
  tipo: "normal" | "especial";
  especial?: string;
  especialNotas?: string;
  calentamiento: CalentamientoState | null;
  estaciones: EstacionWizardState[];
  subgrupo?: SubgrupoJuvenil;
  horaInicio: string;
  horaFin: string;
}

export function nuevaEstacion(categoria: string, lugarSugerido: string): EstacionWizardState {
  return { categoria, foco: null, material: [], items: [], desafio: "", lugar: lugarSugerido };
}

export function diaCompleto(dia: DiaWizardState): boolean {
  return diaFaltantes(dia).length === 0;
}

// Lista legible de qué falta para poder avanzar — se muestra junto al botón
// "Siguiente día" porque quedaba deshabilitado sin ninguna pista de qué
// completar.
export function diaFaltantes(dia: DiaWizardState): string[] {
  if (dia.tipo === "especial") return dia.especial ? [] : ["Elige un tipo de día especial"];
  if (dia.estaciones.length === 0) return ["Agrega al menos una estación"];
  const faltantes: string[] = [];
  dia.estaciones.forEach((e, i) => {
    if (e.items.length === 0) faltantes.push(`Estación ${i + 1}: falta elegir un ejercicio de la biblioteca`);
    else if (e.desafio.trim().length === 0) faltantes.push(`Estación ${i + 1}: falta el desafío de cierre`);
  });
  return faltantes;
}
