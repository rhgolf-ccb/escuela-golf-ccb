import type { TipoPlan } from "@/components/ProgramacionModule";
import type { CategoriaOption, FocoOption, GroupConfig } from "./types";
import { SUBGRUPO_A_GRUPO_FISICO, type SubgrupoJuvenil } from "@/lib/estacion-library-constants";
import type { EstacionCategoria } from "@/lib/planning-defaults";

// Focos específicos por tema para Competencia — más precisos que el vocabulario
// genérico FOCOS. Se muestran en el selector de "Foco" según la categoría de la
// estación. "tempo" es transversal a tiro largo, juego corto y putt.
const FOCOS_TIRO_LARGO: FocoOption[] = [
  { value: "posiciones", label: "Posiciones (general)" },
  { value: "transicion", label: "Transición" },
  { value: "secuencia", label: "Secuencia" },
  { value: "potencia", label: "Potencia" },
  { value: "alineacion", label: "Alineación" },
  { value: "manejo_bola", label: "Manejo de la bola (efectos y trayectorias)" },
  { value: "tiros_especiales", label: "Tiros especiales" },
  { value: "tempo", label: "Tempo" },
];
const FOCOS_JUEGO_CORTO: FocoOption[] = [
  { value: "control_distancia", label: "Control de distancia" },
  { value: "trayectorias", label: "Trayectorias" },
  { value: "bunker", label: "Bunker" },
  { value: "chipping", label: "Chipping" },
  { value: "tiros_especiales", label: "Tiros especiales" },
  { value: "tempo", label: "Tempo" },
];
const FOCOS_PUTT: FocoOption[] = [
  { value: "control_distancia", label: "Control de distancia" },
  { value: "mecanica_stroke", label: "Mecánica del stroke" },
  { value: "lectura_caidas", label: "Lectura y trabajo de caídas" },
  { value: "tempo", label: "Tempo" },
  { value: "start_line", label: "Línea de arranque" },
];

// Focos de Juvenil (Birdies / Águilas / Albatros entrenan juntos, mismos focos)
// — fundamentos apropiados a la edad, no el vocabulario avanzado de Competencia.
const FOCOS_JUV_LARGO: FocoOption[] = [
  { value: "postura_agarre", label: "Postura y agarre" },
  { value: "equilibrio", label: "Equilibrio" },
  { value: "giro", label: "Giro" },
  { value: "contacto", label: "Contacto" },
  { value: "direccion", label: "Dirección al objetivo" },
  { value: "distancia", label: "Distancia" },
  { value: "ritmo", label: "Ritmo" },
];
const FOCOS_JUV_CORTO: FocoOption[] = [
  { value: "contacto_limpio", label: "Contacto limpio" },
  { value: "distancia_corta", label: "Control de distancia corta" },
  { value: "punteria", label: "Puntería" },
  { value: "chip_basico", label: "Chip básico" },
  { value: "bunker", label: "Bunker" },
];
const FOCOS_JUV_PUTT: FocoOption[] = [
  { value: "linea", label: "Puntería / línea" },
  { value: "fuerza", label: "Fuerza (distancia)" },
  { value: "rutina", label: "Rutina" },
  { value: "embocar", label: "Embocar corto" },
];
const FOCOS_JUV_CAMPO: FocoOption[] = [
  { value: "motricidad", label: "Coordinación y motricidad" },
  { value: "juego_diversion", label: "Juego y diversión" },
  { value: "reglas_etiqueta", label: "Reglas y etiqueta" },
  { value: "primeros_golpes", label: "Primeros golpes en campo" },
];

// Vocabularios reales por grupo — cada uno ya existía en su modal propio
// (JuvenileClassModal/CompetenciaClassModal/DamasClassModal) y otras partes
// del sistema (PDF, WhatsApp, calendario de padres) esperan exactamente estos
// valores en sesiones_semana — no se inventa un vocabulario "unificado".
export const GROUP_CONFIGS: Record<TipoPlan, GroupConfig> = {
  juvenil: {
    tipoPlan: "juvenil",
    color: "#1a3a2a",
    categorias: [
      { value: "juego_largo", emoji: "🏌️", label: "Juego Largo", drillsCategoria: "tecnico", canonical: "juego_largo", focos: FOCOS_JUV_LARGO },
      { value: "juego_corto", emoji: "⛳", label: "Juego Corto", drillsCategoria: "juego_corto", canonical: "juego_corto", focos: FOCOS_JUV_CORTO },
      { value: "putt", emoji: "🎯", label: "Putt", drillsCategoria: "putting", canonical: "putt", focos: FOCOS_JUV_PUTT },
      { value: "campo_infantil", emoji: "👶", label: "Campo Infantil", drillsCategoria: "campo", canonical: "campo_infantil", focos: FOCOS_JUV_CAMPO },
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
      { value: "tiro_largo", emoji: "🏌️", label: "Tiro Largo", drillsCategoria: "tecnico", canonical: "juego_largo", focos: FOCOS_TIRO_LARGO },
      { value: "juego_corto", emoji: "⛳", label: "Juego Corto", drillsCategoria: "juego_corto", canonical: "juego_corto", focos: FOCOS_JUEGO_CORTO },
      { value: "putt", emoji: "🎯", label: "Putt", drillsCategoria: "putting", canonical: "putt", focos: FOCOS_PUTT },
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

// Retos de cierre sugeridos para Competencia — el reto siempre se ofrece con una
// sugerencia (el profe puede usarla, pedir otra o saltarla). Se combinan los del
// foco (si aplica) con los generales del tema.
const RETOS_POR_CATEGORIA: Record<string, string[]> = {
  tiro_largo: [
    "Longest carry con puerta: la bola más lejos que caiga dentro del corredor.",
    "5 de 8 bolas dentro del fairway virtual.",
    "Draw y fade a pedido: 4 de 6 con la curva pedida.",
  ],
  juego_corto: [
    "Escalera de distancias 40/50/60 m: gana la proximidad media más baja.",
    "Up-and-down desde 3 lies difíciles en menos de 4 golpes.",
    "Bunker: 3 de 5 dentro de 3 m de la bandera.",
  ],
  putt: [
    "Escalera de presión: 5 putts de 1,5 m seguidos o reinicia.",
    "9 putts a 3 objetivos: supera tu puntaje de la clase pasada.",
    "Lag: 3 bolas dentro del círculo de 60 cm desde 12 m.",
  ],
  trabajo_fisico: [
    "Circuito contra reloj: completa las 3 estaciones sin perder técnica.",
    "Reto de velocidad: supera tu mejor marca del día.",
  ],
};

const RETOS_POR_FOCO: Record<string, string[]> = {
  potencia: ["Supera tu mejor velocidad de bola del día con smash ≥ 1.45."],
  tempo: ["Tour Tempo: 10 repeticiones seguidas sin romper el ritmo, contacto centrado."],
  control_distancia: ["5 tiros dentro de ±3 m del carry objetivo."],
  bunker: ["3 salidas de bunker seguidas dentro de 3 m."],
  lectura_caidas: ["Lee y emboca 3 putts en caída desde 3 m."],
};

export function retosSugeridos(tipoPlan: TipoPlan, categoria: string, foco: string | null): string[] {
  if (tipoPlan !== "competencia") return [];
  const porFoco = foco ? RETOS_POR_FOCO[foco] ?? [] : [];
  const porCategoria = RETOS_POR_CATEGORIA[categoria] ?? [];
  return [...porFoco, ...porCategoria];
}

// Presets de bloques de transferencia (físico → técnico) para tiro largo — los
// drills de potencia base que se pueden agregar de un toque y luego ajustar.
export const TRANSFER_PRESETS: { prep: string; bolas: number }[] = [
  { prep: "Bandas + backswing (3 series)", bolas: 10 },
  { prep: "Balón medicinal rotacional (8 lanz.)", bolas: 10 },
  { prep: "SuperSpeed (protocolo)", bolas: 8 },
  { prep: "Step-drill / fuerza de piso", bolas: 10 },
  { prep: "Escalera velocidad / control", bolas: 10 },
];
