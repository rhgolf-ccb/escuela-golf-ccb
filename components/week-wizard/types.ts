import type { TipoPlan } from "@/components/ProgramacionModule";
import type { EstacionLibraryPick } from "@/components/EstacionLibraryPicker";
import type { SubgrupoJuvenil } from "@/lib/estacion-library-constants";
import type { EstacionCategoria } from "@/lib/planning-defaults";

export interface FocoOption {
  value: string;
  label: string;
}

export interface CategoriaOption {
  value: string; // valor exacto que se guarda en el campo categoria del grupo
  emoji: string;
  label: string;
  // null = la estación usa ejercicios_fisicos (trabajo físico/fisico), no drills
  drillsCategoria: string | null;
  // mapea al vocabulario canónico de lib/planning-defaults para sugerir lugar
  canonical: EstacionCategoria;
  // focos específicos de este tema (ej. Competencia). Si falta, el editor usa
  // el vocabulario genérico FOCOS.
  focos?: FocoOption[];
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

// Bloque de una secuencia de transferencia (tiro largo): un ejercicio de
// preparación (banda, balón medicinal, SuperSpeed, etc.) seguido de pegar bolas.
export interface TransferBlock {
  id: string;
  prep: string;
  bolas: number;
}

export interface EstacionWizardState {
  categoria: string;
  foco: string | null;
  responsable?: string; // profesor a cargo de la estación
  material: string[];
  items: EstacionLibraryPick[];
  // Solo tiro largo (Competencia): secuencia ordenada de prep → bolas.
  transferencia?: TransferBlock[];
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
  especialJuegos?: string[]; // juegos elegidos en salida al campo
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

// Lo que SÍ bloquea guardar el día — solo el esqueleto de la sesión (qué tipo de
// día es y que haya estaciones). Los drills y el reto de cierre son sugerencias:
// el director decide semana a semana si los usa, así que salen por
// diaAdvertencias() y nunca deshabilitan un botón.
export function diaFaltantes(dia: DiaWizardState): string[] {
  if (dia.tipo === "especial") return dia.especial ? [] : ["Elige un tipo de día especial"];
  if (dia.estaciones.length === 0) return ["Agrega al menos una estación"];
  return [];
}

// Avisos informativos — el día se puede guardar igual. Se muestran en ámbar
// debajo del bloque de bloqueantes.
export function diaAdvertencias(dia: DiaWizardState): string[] {
  if (dia.tipo === "especial") return [];
  const avisos: string[] = [];
  dia.estaciones.forEach((e, i) => {
    const tieneContenido = e.items.length > 0 || (e.transferencia?.length ?? 0) > 0;
    if (!tieneContenido) avisos.push(`Estación ${i + 1} (${e.categoria.replace(/_/g, " ")}): sin ejercicio asignado`);
    if (!e.desafio.trim()) avisos.push(`Estación ${i + 1}: sin reto de cierre`);
  });
  return avisos;
}
