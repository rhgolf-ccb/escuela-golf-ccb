import type { TipoPlan } from "@/components/ProgramacionModule";
import type { CategoriaOption, GroupConfig } from "./types";
import { SUBGRUPO_A_GRUPO_FISICO, type SubgrupoJuvenil } from "@/lib/estacion-library-constants";
import type { EstacionCategoria } from "@/lib/planning-defaults";

// Vocabularios reales por grupo — cada uno ya existía en su modal propio
// (JuvenileClassModal/CompetenciaClassModal/DamasClassModal) y otras partes
// del sistema (PDF, WhatsApp, calendario de padres) esperan exactamente estos
// valores en sesiones_semana — no se inventa un vocabulario "unificado".
export const GROUP_CONFIGS: Record<TipoPlan, GroupConfig> = {
  juvenil: {
    tipoPlan: "juvenil",
    color: "#1a3a2a",
    categorias: [
      { value: "juego_largo", emoji: "🏌️", label: "Juego Largo", drillsCategoria: "tecnico", canonical: "juego_largo" },
      { value: "juego_corto", emoji: "⛳", label: "Juego Corto", drillsCategoria: "juego_corto", canonical: "juego_corto" },
      { value: "putt", emoji: "🎯", label: "Putt", drillsCategoria: "putting", canonical: "putt" },
      { value: "campo_infantil", emoji: "👶", label: "Campo Infantil", drillsCategoria: "campo", canonical: "campo_infantil" },
      { value: "fisico", emoji: "💪", label: "Físico", drillsCategoria: null, canonical: "trabajo_fisico" },
    ],
    especiales: [
      { value: "test_tecnico", tipoSesion: "test_tecnico", emoji: "📋", label: "Test técnico", desc: "Evaluación P1-P10", lugar: "campo_practica", objetivo: "Evaluación técnica P1-P10" },
      { value: "test_fisico", tipoSesion: "test_fisico", emoji: "💪", label: "Test físico", desc: "Evaluación TPI", lugar: "campo_practica", objetivo: "Evaluación física TPI" },
      { value: "campo_pacos", tipoSesion: "campo", emoji: "🌿", label: "Salida al campo", desc: "Juego en campo real", lugar: "campo_pacos_fabios", objetivo: "Juego en Campo Pacos y Fabios" },
      { value: "campo_infantil", tipoSesion: "campo", emoji: "👶", label: "Campo Infantil", desc: "Día lúdico", lugar: "campo_infantil", objetivo: "Día lúdico en Campo Infantil" },
    ],
  },
  competencia: {
    tipoPlan: "competencia",
    color: "#7d5a00",
    categorias: [
      { value: "tiro_largo", emoji: "🏌️", label: "Tiro Largo", drillsCategoria: "tecnico", canonical: "juego_largo" },
      { value: "juego_corto", emoji: "⛳", label: "Juego Corto", drillsCategoria: "juego_corto", canonical: "juego_corto" },
      { value: "putt", emoji: "🎯", label: "Putt", drillsCategoria: "putting", canonical: "putt" },
      { value: "trabajo_fisico", emoji: "💪", label: "Trabajo Físico", drillsCategoria: null, canonical: "trabajo_fisico" },
    ],
    especiales: [
      { value: "test_tecnico", tipoSesion: "test_tecnico", emoji: "📋", label: "Test técnico", desc: "Evaluación P1-P10", lugar: "campo_practica", objetivo: "Evaluación técnica P1-P10" },
      { value: "test_fisico", tipoSesion: "test_fisico", emoji: "💪", label: "Test físico", desc: "Evaluación TPI", lugar: "campo_practica", objetivo: "Evaluación física TPI" },
      { value: "campo", tipoSesion: "campo", emoji: "🌿", label: "Salida al campo", desc: "Juego en campo real", lugar: "campo_pacos_fabios", objetivo: "Juego en Campo Pacos y Fabios" },
    ],
  },
  damas: {
    tipoPlan: "damas",
    color: "#4a1070",
    categorias: [
      { value: "juego_largo", emoji: "🏌️", label: "Juego Largo", drillsCategoria: "tecnico", canonical: "juego_largo" },
      { value: "juego_corto", emoji: "⛳", label: "Juego Corto", drillsCategoria: "juego_corto", canonical: "juego_corto" },
      { value: "putt", emoji: "🎯", label: "Putt", drillsCategoria: "putting", canonical: "putt" },
      { value: "fisico", emoji: "💪", label: "Físico", drillsCategoria: null, canonical: "trabajo_fisico" },
    ],
    especiales: [
      { value: "test_tecnico", tipoSesion: "test_tecnico", emoji: "📋", label: "Test técnico", desc: "Evaluación P1-P10", lugar: "campo_practica", objetivo: "Evaluación técnica P1-P10" },
      { value: "test_fisico", tipoSesion: "test_fisico", emoji: "💪", label: "Test físico", desc: "Evaluación TPI", lugar: "campo_practica", objetivo: "Evaluación física TPI" },
      { value: "campo", tipoSesion: "campo", emoji: "🌿", label: "Salida al campo", desc: "Juego en campo real", lugar: "campo_pacos_fabios", objetivo: "Juego en Campo Pacos y Fabios" },
    ],
  },
};

// grupos para el filtro de drills.nivel_recomendado (minúscula) — Juvenil usa
// el subgrupo elegido o ninguno (sirve a varios subgrupos a la vez, igual que
// hoy); Competencia/Damas usan directamente su propio nombre de grupo.
export function gruposParaDrills(tipoPlan: TipoPlan, subgrupo?: SubgrupoJuvenil): string[] {
  if (tipoPlan === "juvenil") return subgrupo ? [subgrupo] : [];
  return [tipoPlan];
}

// grupos para el filtro de ejercicios_fisicos.grupos (capitalizado) — Juvenil
// sin subgrupo elegido cubre las 4 edades a la vez.
export function gruposParaFisico(tipoPlan: TipoPlan, subgrupo?: SubgrupoJuvenil): string[] {
  if (tipoPlan === "juvenil") {
    return subgrupo ? [SUBGRUPO_A_GRUPO_FISICO[subgrupo]] : ["Birdies", "Águilas", "Albatros", "+14"];
  }
  if (tipoPlan === "competencia") return ["Competencia"];
  return ["Damas"];
}

// Traduce el valor canónico de lib/planning-defaults (juego_largo/putt/...)
// al valor real del grupo (ej. Competencia llama "tiro_largo" a juego_largo).
export function categoriaOptionForCanonical(config: GroupConfig, canonical: EstacionCategoria): CategoriaOption {
  return config.categorias.find((c) => c.canonical === canonical) ?? config.categorias[0];
}

export function categoriaFisico(config: GroupConfig): CategoriaOption {
  return config.categorias.find((c) => c.drillsCategoria === null) ?? config.categorias[config.categorias.length - 1];
}
