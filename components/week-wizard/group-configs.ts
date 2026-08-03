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
  { value: "secuencia_tl", label: "Secuencia" },
  { value: "potencia", label: "Potencia" },
  { value: "velocidad", label: "Velocidad" },
  { value: "rotacion", label: "Rotación / giro" },
  { value: "contacto_compresion", label: "Contacto y compresión" },
  { value: "plano_swing", label: "Plano de swing" },
  { value: "liberacion", label: "Liberación (release)" },
  { value: "equilibrio", label: "Equilibrio" },
  { value: "alineacion", label: "Alineación" },
  { value: "manejo_bola", label: "Manejo de la bola (efectos y trayectorias)" },
  { value: "tiros_especiales", label: "Tiros especiales" },
  { value: "tempo", label: "Tempo" },
];
const FOCOS_JUEGO_CORTO: FocoOption[] = [
  { value: "control_distancia", label: "Control de distancia" },
  { value: "reloj_distancias", label: "Distancias parciales (reloj)" },
  { value: "trayectorias", label: "Trayectorias" },
  { value: "alto_bajo", label: "Golpe alto / bajo" },
  { value: "spin", label: "Spin / efecto" },
  { value: "bunker", label: "Bunker" },
  { value: "chipping", label: "Chipping" },
  { value: "lie_dificil", label: "Lie difícil" },
  { value: "tiros_especiales", label: "Tiros especiales" },
  { value: "tempo", label: "Tempo" },
];
const FOCOS_PUTT: FocoOption[] = [
  { value: "control_distancia", label: "Control de distancia" },
  { value: "corto_largo", label: "Putt corto vs largo" },
  { value: "mecanica_stroke", label: "Mecánica del stroke" },
  { value: "lectura_caidas", label: "Lectura y trabajo de caídas" },
  { value: "green_reading", label: "Lectura de green" },
  { value: "aim", label: "Alineación del putter" },
  { value: "start_line", label: "Línea de arranque" },
  { value: "estabilidad", label: "Estabilidad de cabeza / cuerpo" },
  { value: "presion_rutina", label: "Presión / rutina" },
  { value: "tempo", label: "Tempo" },
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
// Físico de Juvenil — apropiado a la edad y orientado a que se transfiera al
// swing (rotación, velocidad/potencia, equilibrio), no físico genérico.
const FOCOS_JUV_FISICO: FocoOption[] = [
  { value: "coordinacion", label: "Coordinación" },
  { value: "equilibrio", label: "Equilibrio y estabilidad" },
  { value: "movilidad", label: "Movilidad (giro)" },
  { value: "rotacion", label: "Rotación / giro del swing" },
  { value: "fuerza", label: "Fuerza (piernas y core)" },
  { value: "velocidad", label: "Velocidad y potencia" },
  { value: "agilidad", label: "Agilidad" },
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
      { value: "fisico", emoji: "💪", label: "Físico", drillsCategoria: null, canonical: "trabajo_fisico", focos: FOCOS_JUV_FISICO },
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

// Retos Trackman al aire libre (medibles) — se ofrecen junto a los demás retos
// de cierre en Competencia.
const RETOS_TRACKMAN: string[] = [
  "Trackman · Escalera de distancias (Combine): supera tu score.",
  "Trackman · Longest carry dentro del corredor de dispersión.",
  "Trackman · PR de velocidad de bola con smash ≥ 1.45.",
  "Trackman · Dispersión: X de Y dentro del radio objetivo.",
  "Trackman · Ventana de carry: 5 tiros dentro de ±3 m.",
];

const RETOS_JUVENIL: Record<string, string[]> = {
  juego_largo: ["¿Quién le pega más lejos manteniendo el equilibrio?", "Puntería: dale al cono/aro objetivo, 3 de 5.", "5 bolas al aire: cuenta cuántas pasan la línea."],
  juego_corto: ["Chip a la diana: gana quien quede más cerca.", "3 chips seguidos que caigan en la alfombra.", "Mete el chip en el balde."],
  putt: ["Escalera de putts: 1, 2 y 3 metros sin fallar.", "El túnel: mete 3 putts por la puerta.", "¿Quién emboca más de 1 metro seguidos?"],
  campo_infantil: ["Circuito de habilidades contra el reloj.", "Relevos con golpes cortos por equipos.", "Completa la estación sin fallar."],
  fisico: ["Equilibrio: aguanta 20 seg en una pierna.", "Circuito rápido sin perder la técnica.", "¿Quién salta y gira más controlado?"],
};

const RETOS_DAMAS: Record<string, string[]> = {
  juego_largo: ["5 de 8 bolas dentro del objetivo.", "Mismo tempo en 10 golpes seguidos.", "Draw o fade a pedido: 4 de 6."],
  juego_corto: ["Escalera de distancias: gana la proximidad media más baja.", "Up-and-down desde 3 lies distintos.", "Bunker: 3 de 5 cerca de la bandera."],
  putt: ["Escalera de presión: 5 putts de 1,5 m seguidos.", "9 putts a 3 objetivos, supera tu marca.", "Lag: 3 bolas dentro del círculo desde 12 m."],
  fisico: ["Circuito controlado sin perder la técnica.", "Reto de equilibrio y estabilidad."],
};

export function retosSugeridos(tipoPlan: TipoPlan, categoria: string, foco: string | null): string[] {
  if (tipoPlan === "competencia") {
    const porFoco = foco ? RETOS_POR_FOCO[foco] ?? [] : [];
    const porCategoria = RETOS_POR_CATEGORIA[categoria] ?? [];
    return [...porFoco, ...porCategoria, ...RETOS_TRACKMAN];
  }
  if (tipoPlan === "juvenil") return RETOS_JUVENIL[categoria] ?? [];
  if (tipoPlan === "damas") return RETOS_DAMAS[categoria] ?? [];
  return [];
}

// Juegos de campo para las salidas — desafiantes, para toda la clase.
export const CAMPO_GAMES: string[] = [
  "Solo palos impares",
  "Tres palos (elige y juega)",
  "9 hoyos scramble",
  "Peor bola",
  "Suma de puntos (par o mejor)",
  "Up-and-down en cada hoyo",
  "Vuelta sin driver",
  "Match play por parejas",
];

// Presets de bloques de transferencia (físico → técnico) para tiro largo — los
// drills de potencia base que se pueden agregar de un toque y luego ajustar.
export const TRANSFER_PRESETS: { prep: string; bolas: number }[] = [
  // Con equipo
  { prep: "Bandas + backswing (3 series)", bolas: 10 },
  { prep: "Balón medicinal rotacional (8 lanz.)", bolas: 10 },
  { prep: "SuperSpeed (protocolo)", bolas: 8 },
  { prep: "Step-drill / fuerza de piso", bolas: 10 },
  { prep: "Escalera velocidad / control", bolas: 10 },
  // Sin equipo (peso corporal / sensación)
  { prep: "Ojos cerrados (sentir el movimiento)", bolas: 8 },
  { prep: "Pausa arriba del backswing (2 seg)", bolas: 10 },
  { prep: "Cámara lenta → velocidad real", bolas: 8 },
  { prep: "Pies juntos (equilibrio)", bolas: 10 },
  { prep: "Un solo pie / pie atrás (transferencia)", bolas: 8 },
  { prep: "Swing con paso (walk-through)", bolas: 10 },
  { prep: "Salto y giro antes de pegar", bolas: 8 },
  { prep: "Happy Gilmore (carrera y golpe)", bolas: 6 },
];
