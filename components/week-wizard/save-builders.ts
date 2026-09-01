import type { DiaSemana, DiaSinEscuela } from "@/components/ProgramacionModule";
import { fechaEnRango } from "@/components/ProgramacionModule";
import type { DiaWizardState, GroupConfig } from "./types";
import { LUGAR_LABEL } from "@/lib/estacion-library-constants";

interface RowBase {
  plan_id: string;
  dia_semana: DiaSemana;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
}

// Última barrera antes del upsert: aunque el wizard ya excluye los días sin
// escuela al armar la lista de días, alguien pudo marcar el festivo con el
// wizard abierto. Ninguna fila puede quedar guardada en una fecha sin escuela.
export function descartarFilasSinEscuela(
  filas: Record<string, unknown>[],
  diasSinEscuela: DiaSinEscuela[],
): { filas: Record<string, unknown>[]; descartadas: { fecha: string; dia: string; info: DiaSinEscuela }[] } {
  const validas: Record<string, unknown>[] = [];
  const descartadas: { fecha: string; dia: string; info: DiaSinEscuela }[] = [];
  for (const fila of filas) {
    const fecha = String(fila.fecha ?? "");
    const info = diasSinEscuela.find((d) => fechaEnRango(fecha, d.fecha_inicio, d.fecha_fin));
    if (!info) { validas.push(fila); continue; }
    // Una fila por horario: el aviso habla de días, no de filas.
    if (!descartadas.some((d) => d.fecha === fecha)) {
      descartadas.push({ fecha, dia: String(fila.dia_semana ?? ""), info });
    }
  }
  return { filas: validas, descartadas };
}

function buildCalentamiento(dia: DiaWizardState) {
  if (!dia.calentamiento || dia.calentamiento.ejercicios.length === 0) return null;
  return {
    ejercicios: dia.calentamiento.ejercicios.map((e) => ({
      id: e.id, nombre: e.titulo, series_repeticiones: e.series_repeticiones ?? null,
    })),
    duracion_min: dia.calentamiento.duracionMin,
  };
}

function especialDe(config: GroupConfig, dia: DiaWizardState) {
  return config.especiales.find((e) => e.value === dia.especial) ?? config.especiales[0];
}

// Mismo shape que ya escribía JuvenileClassModal.tsx — sesion_juvenil como
// única fuente de verdad, tipo_sesion/lugar de fila son valores fijos/placeholder.
export function buildJuvenilRow(base: RowBase, dia: DiaWizardState, config: GroupConfig): Record<string, unknown> {
  const calentamiento = buildCalentamiento(dia);
  if (dia.tipo === "especial") {
    const esp = especialDe(config, dia);
    return {
      ...base,
      tipo_sesion: esp.tipoSesion, lugar: esp.lugar, objetivo: esp.objetivo,
      drills: [], juego_competitivo: null, estaciones_damas: null, notas: dia.especialNotas || null,
      sesion_juvenil: { tipo: "especial", tipo_especial: esp.value },
      calentamiento,
    };
  }
  const estaciones = dia.estaciones.map((s) => ({
    categoria: s.categoria, foco: s.foco ?? null, responsable: s.responsable ?? null, drills: s.items, desafio: s.desafio, lugar: s.lugar,
  }));
  return {
    ...base,
    // El lugar de la fila alimenta los chips del calendario y el encabezado del
    // PDF de familias. Escribirlo fijo en "campo_practica" hacía que un día
    // programado en el campo infantil se anunciara en el campo de práctica; se
    // guarda el de la primera estación, igual que Competencia.
    tipo_sesion: "juvenil_estaciones", lugar: estaciones[0]?.lugar ?? "campo_practica",
    objetivo: `Sesión ${estaciones.length} estaciones: ${estaciones.map((e) => e.categoria).join(" · ")}`,
    drills: [], juego_competitivo: null, estaciones_damas: null, notas: null,
    sesion_juvenil: { tipo: "estaciones", estaciones },
    calentamiento,
  };
}

// Mismo shape que ya escribía CompetenciaClassModal.tsx — estaciones_competencia
// autoritativo + fila plana como fallback legacy para 1 sola categoría.
export function buildCompetenciaRow(base: RowBase, dia: DiaWizardState, config: GroupConfig): Record<string, unknown> {
  const calentamiento = buildCalentamiento(dia);
  if (dia.tipo === "especial") {
    const esp = especialDe(config, dia);
    const juegos = dia.especialJuegos ?? [];
    const juegoDrills = juegos.map((j) => ({ titulo: j, descripcion: "", series_repeticiones: null }));
    return {
      ...base,
      tipo_sesion: esp.tipoSesion, lugar: esp.lugar,
      objetivo: juegos.length ? `${esp.objetivo} — Juegos: ${juegos.join(", ")}` : esp.objetivo,
      drills: juegoDrills, juego_competitivo: null, estaciones_damas: null, sesion_juvenil: null,
      estaciones_competencia: null, notas: dia.especialNotas || null,
      calentamiento,
    };
  }
  const estacionesEdit = dia.estaciones.map((s) => {
    const catLabel = config.categorias.find((c) => c.value === s.categoria)?.label ?? s.categoria;
    const bloques = s.transferencia ?? [];
    const itemDrills = s.items.map((d) => ({ id: d.id, titulo: d.titulo, descripcion: d.descripcion, series_repeticiones: d.series_repeticiones ?? null }));
    // Los bloques de transferencia se guardan también como "drills" (prep → N
    // bolas) para que la grilla, el PDF y el WhatsApp los muestren sin cambios.
    const transferDrills = bloques.map((b) => ({ id: b.id, titulo: `${b.prep} → ${b.bolas} bolas`, descripcion: "", series_repeticiones: null }));
    const drills = [...itemDrills, ...transferDrills];
    return {
      categoria: s.categoria,
      foco: s.foco ?? null,
      responsable: s.responsable ?? null,
      objetivo: `${catLabel}: ${drills.map((d) => d.titulo).join(", ")}`,
      lugar: s.lugar,
      juego_competitivo: s.desafio || null,
      transferencia: bloques.length ? bloques.map((b) => ({ id: b.id, prep: b.prep, bolas: b.bolas })) : null,
      drills,
    };
  });
  const esMultiple = estacionesEdit.length > 1;
  return {
    ...base,
    tipo_sesion: esMultiple ? "competencia" : estacionesEdit[0].categoria,
    lugar: estacionesEdit[0].lugar,
    objetivo: esMultiple
      ? estacionesEdit.map((e) => e.objetivo).join(" | ")
      : estacionesEdit[0].objetivo,
    drills: esMultiple ? [] : estacionesEdit[0].drills,
    juego_competitivo: estacionesEdit.map((e) => e.juego_competitivo).filter(Boolean).join(" · ") || null,
    estaciones_damas: null, sesion_juvenil: null, notas: null,
    estaciones_competencia: estacionesEdit,
    calentamiento,
  };
}

// Mismo shape que ya escribía DamasClassModal.tsx — estaciones_damas con
// nombre/lugar como LABEL legible (no el value crudo) y duracion_min fija.
const DURACION_ESTACION_DAMAS_MIN = 25;

export function buildDamasRow(base: RowBase, dia: DiaWizardState, config: GroupConfig): Record<string, unknown> {
  const calentamiento = buildCalentamiento(dia);
  if (dia.tipo === "especial") {
    const esp = especialDe(config, dia);
    return {
      ...base,
      tipo_sesion: esp.tipoSesion, lugar: esp.lugar, objetivo: esp.objetivo,
      drills: [], juego_competitivo: null, estaciones_damas: null, sesion_juvenil: null,
      notas: dia.especialNotas || null,
      calentamiento,
    };
  }
  const estaciones = dia.estaciones.map((s) => {
    const catLabel = config.categorias.find((c) => c.value === s.categoria)?.label ?? s.categoria;
    return {
      nombre: catLabel,
      lugar: LUGAR_LABEL[s.lugar] ?? "Campo de práctica",
      duracion_min: DURACION_ESTACION_DAMAS_MIN,
      descripcion: s.items.map((d) => d.titulo).join(", "),
      categoria: s.categoria,
      responsable: s.responsable ?? null,
      drills: s.items,
    };
  });
  return {
    ...base,
    tipo_sesion: "damas_estaciones", lugar: "campo_practica",
    objetivo: `Sesión ${estaciones.length} estaciones: ${estaciones.map((e) => e.nombre).join(" · ")}`,
    drills: [], juego_competitivo: null, sesion_juvenil: null, notas: null,
    estaciones_damas: estaciones,
    calentamiento,
  };
}
