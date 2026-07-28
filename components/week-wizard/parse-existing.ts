import type { SesionSemana, TipoPlan } from "@/components/ProgramacionModule";
import type { EstacionLibraryPick } from "@/components/EstacionLibraryPicker";
import type { CalentamientoState, DiaWizardState, EstacionWizardState, GroupConfig } from "./types";
import { suggestLugar } from "@/lib/planning-defaults";
import { LUGAR_VALUE_FROM_LABEL } from "@/lib/estacion-library-constants";

function parseCalentamiento(sesion: SesionSemana): CalentamientoState | null {
  if (!sesion.calentamiento || sesion.calentamiento.ejercicios.length === 0) return null;
  return {
    duracionMin: sesion.calentamiento.duracion_min,
    ejercicios: sesion.calentamiento.ejercicios.map((e) => ({
      id: e.id, titulo: e.nombre, descripcion: "", series_repeticiones: e.series_repeticiones,
    })),
  };
}

function toPick(d: { id?: string; titulo: string; descripcion: string; series_repeticiones?: string | null }): EstacionLibraryPick {
  return { id: d.id ?? d.titulo, titulo: d.titulo, descripcion: d.descripcion, series_repeticiones: d.series_repeticiones ?? null };
}

// Postgres devuelve time como "HH:MM:SS" — se recorta a "HH:MM" para mostrar.
function hhmm(t: string | null): string {
  return (t ?? "").slice(0, 5);
}

// Reconstruye el estado del wizard a partir de una sesión ya guardada — para
// que tocar un día en la grilla reabra el mismo flujo precargado.
export function parseExistingToDiaState(tipoPlan: TipoPlan, config: GroupConfig, sesion: SesionSemana): DiaWizardState | null {
  const calentamiento = parseCalentamiento(sesion);

  if (tipoPlan === "juvenil") {
    const sj = sesion.sesion_juvenil;
    if (sj && "tipo" in sj) {
      if (sj.tipo === "estaciones" && sj.estaciones.length >= 1) {
        const estaciones: EstacionWizardState[] = sj.estaciones.map((e) => ({
          categoria: e.categoria, foco: null, material: [],
          items: (e.drills ?? []).map(toPick), desafio: e.desafio ?? "",
          lugar: e.lugar ?? suggestLugar(config.categorias.find((c) => c.value === e.categoria)?.canonical ?? "juego_largo"),
        }));
        return { tipo: "normal", calentamiento, estaciones, horaInicio: hhmm(sesion.hora_inicio), horaFin: hhmm(sesion.hora_fin) };
      }
      if (sj.tipo === "especial") {
        const valorValido = config.especiales.some((e) => e.value === sj.tipo_especial);
        return {
          tipo: "especial", especial: valorValido ? sj.tipo_especial : undefined,
          especialNotas: sesion.notas ?? "", calentamiento: null, estaciones: [],
          horaInicio: hhmm(sesion.hora_inicio), horaFin: hhmm(sesion.hora_fin),
        };
      }
    }
    return null; // formato legacy sin sesion_juvenil — se trata como día vacío
  }

  if (tipoPlan === "competencia") {
    if (sesion.estaciones_competencia && sesion.estaciones_competencia.length > 0) {
      const estaciones: EstacionWizardState[] = sesion.estaciones_competencia.map((e) => ({
        categoria: e.categoria, foco: e.foco ?? null, material: [],
        items: e.drills.map(toPick), desafio: e.juego_competitivo ?? "", lugar: e.lugar,
      }));
      return { tipo: "normal", calentamiento, estaciones, horaInicio: hhmm(sesion.hora_inicio), horaFin: hhmm(sesion.hora_fin) };
    }
    const esEspecial = config.especiales.some((e) => e.tipoSesion === sesion.tipo_sesion);
    if (esEspecial) {
      const opt = config.especiales.find((e) => e.tipoSesion === sesion.tipo_sesion)!;
      return {
        tipo: "especial", especial: opt.value, especialNotas: sesion.notas ?? "",
        calentamiento: null, estaciones: [], horaInicio: hhmm(sesion.hora_inicio), horaFin: hhmm(sesion.hora_fin),
      };
    }
    const catValida = config.categorias.some((c) => c.value === sesion.tipo_sesion);
    if (catValida && sesion.drills.length > 0) {
      return {
        tipo: "normal", calentamiento,
        estaciones: [{
          categoria: sesion.tipo_sesion, foco: null, material: [],
          items: sesion.drills.map(toPick), desafio: sesion.juego_competitivo ?? "", lugar: sesion.lugar,
        }],
        horaInicio: hhmm(sesion.hora_inicio), horaFin: hhmm(sesion.hora_fin),
      };
    }
    return null;
  }

  // damas
  if (sesion.estaciones_damas && sesion.estaciones_damas.length > 0 && sesion.estaciones_damas.every((e) => e.categoria)) {
    const estaciones: EstacionWizardState[] = sesion.estaciones_damas.map((e) => ({
      categoria: e.categoria!, foco: null, material: [],
      items: (e.drills ?? []).map(toPick), desafio: "",
      lugar: LUGAR_VALUE_FROM_LABEL[e.lugar]
        ?? suggestLugar(config.categorias.find((c) => c.value === e.categoria)?.canonical ?? "juego_largo"),
    }));
    return { tipo: "normal", calentamiento, estaciones, horaInicio: hhmm(sesion.hora_inicio), horaFin: hhmm(sesion.hora_fin) };
  }
  const esEspecial = config.especiales.some((e) => e.tipoSesion === sesion.tipo_sesion);
  if (esEspecial) {
    const opt = config.especiales.find((e) => e.tipoSesion === sesion.tipo_sesion)!;
    return {
      tipo: "especial", especial: opt.value, especialNotas: sesion.notas ?? "",
      calentamiento: null, estaciones: [], horaInicio: hhmm(sesion.hora_inicio), horaFin: hhmm(sesion.hora_fin),
    };
  }
  return null;
}
