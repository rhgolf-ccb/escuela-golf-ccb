// Fuente única de verdad de "a qué grupo pertenece un alumno" y "qué grupo
// corresponde a cada tipo de plan".
//
// Vivía duplicada en StudentsModule (calcularGrupo por edad) y en media docena
// de `tipoPlanForGrupo` que solo miraban students.grupo_activo. Como Birdies se
// deriva de la edad y casi ningún alumno tiene grupo_activo cargado, mirar solo
// esa columna dejaba fuera a la mayoría del padrón.
//
// Sin "use client" ni imports de Supabase a propósito: los Server Components
// (calendario de padres, dashboard) también lo usan.

export type TipoPlan = "birdies" | "juvenil" | "competencia" | "damas";

export type GrupoAlumno = "Birdies" | "Águilas" | "Albatros" | "+14" | "Damas" | "Competencia";

// Orden por edad — es el orden en que se muestran las pestañas y los filtros.
export const TIPOS_PLAN: TipoPlan[] = ["birdies", "juvenil", "competencia", "damas"];

export const TIPO_PLAN_LABEL: Record<TipoPlan, string> = {
  birdies: "Birdies", juvenil: "Juvenil", competencia: "Competencia", damas: "Damas",
};

// Grupos del padrón que atiende cada plan. Birdies es su propio plan desde
// ago-2026; Águilas/Albatros/+14 siguen entrenando juntos como Juvenil.
export const GRUPOS_POR_TIPO_PLAN: Record<TipoPlan, GrupoAlumno[]> = {
  birdies:     ["Birdies"],
  juvenil:     ["Águilas", "Albatros", "+14"],
  competencia: ["Competencia"],
  damas:       ["Damas"],
};

// ── Color por grupo ────────────────────────────────────────────────────────
// Fuente única del color de un grupo. Antes vivía repetido en cuatro mapas
// (ProgramacionModule tenía TIPO_PLAN_COLOR, GROUP_COLOR_HEX, CAL_COLOR y
// CAL_EVENT, más las copias de DashboardAgendaCard y CalendarioPadresModule), y
// Damas terminó con un morado distinto en cada uno.
//
// Se devuelven variables CSS, no hex: los valores viven en globals.css, en
// :root para superficie clara y redefinidos bajo .tema-oscuro. Así el mismo
// componente se pinta bien en las dos sin saber en cuál está.

export interface ColorGrupo { color: string; background: string }

// El nombre del grupo lleva tilde y símbolos; la variable CSS no.
const SLUG_GRUPO: Record<string, string> = {
  "Birdies": "birdies", "Águilas": "aguilas", "Albatros": "albatros",
  "+14": "mas14", "Damas": "damas", "Competencia": "competencia",
  // Tipos de plan (minúscula) — Juvenil es un plan, no un grupo del padrón.
  "birdies": "birdies", "juvenil": "juvenil", "damas": "damas", "competencia": "competencia",
};

function colorPorSlug(slug: string): ColorGrupo {
  return { color: `var(--g-${slug}-fg)`, background: `var(--g-${slug}-bg)` };
}

// Sin grupo (alumno sin fecha de nacimiento, evento sin plan) tiene su propio
// par neutro en vez de caer en el color de otro grupo.
export function colorGrupo(grupo: string | null | undefined): ColorGrupo {
  return colorPorSlug((grupo && SLUG_GRUPO[grupo]) || "ninguno");
}

export function colorTipoPlan(tipoPlan: TipoPlan): ColorGrupo {
  return colorPorSlug(SLUG_GRUPO[tipoPlan] ?? "ninguno");
}

// Acento: un solo color saturado del grupo, para barras, bordes y texto sobre
// el fondo de la página (no sobre un chip). Es lo que usaban el dashboard y el
// calendario de padres cuando cada uno tenía su propio mapa de hex.
export function acentoGrupo(grupo: string | null | undefined): string {
  return `var(--g-${(grupo && SLUG_GRUPO[grupo]) || "ninguno"}-accent)`;
}

// El texto que va ENCIMA del acento cuando el acento se usa como fondo. No se
// puede dejar fijo en blanco: en el tema oscuro el acento es un color claro y
// el blanco encima desaparece.
export const TEXTO_SOBRE_ACENTO = "var(--g-on-accent)";

// El acento diluido, para el fondo de una etiqueta sobre superficie clara. Se
// calcula con color-mix para no tener que declarar un tercer valor por grupo, y
// funciona igual en el tema oscuro porque parte de la misma variable.
export function acentoGrupoSuave(grupo: string | null | undefined, porcentaje = 12): string {
  return `color-mix(in srgb, ${acentoGrupo(grupo)} ${porcentaje}%, transparent)`;
}

export interface AlumnoParaGrupo {
  birth_date: string | null;
  gender: string | null;
  grupo_activo: string | null;
}

export function edadDe(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const hoy = new Date();
  const nac = new Date(birthDate);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}

// El grupo se deriva de la edad; grupo_activo solo manda para Competencia y
// Damas, que son asignaciones a mano y no dependen de la fecha de nacimiento.
// Devuelve null cuando no hay con qué decidir (sin fecha de nacimiento).
export function calcularGrupo(
  birthDate: string | null,
  gender: string | null,
  grupoActivo: string | null,
): GrupoAlumno | null {
  if (grupoActivo === "Competencia") return "Competencia";
  if (grupoActivo === "Damas") return "Damas";
  const edad = edadDe(birthDate);
  if (edad === null) {
    // students_gender_check solo admite 'masculino' | 'femenino'.
    return gender?.toLowerCase() === "femenino" ? "Damas" : null;
  }
  if (edad <= 5) return "Birdies";
  if (edad <= 8) return "Águilas";
  if (edad <= 12) return "Albatros";
  return "+14";
}

export function tipoPlanDeGrupo(grupo: string | null): TipoPlan | null {
  if (!grupo) return null;
  for (const tipo of TIPOS_PLAN) {
    if ((GRUPOS_POR_TIPO_PLAN[tipo] as string[]).includes(grupo)) return tipo;
  }
  return null;
}

export function tipoPlanDeAlumno(alumno: AlumnoParaGrupo): TipoPlan | null {
  return tipoPlanDeGrupo(calcularGrupo(alumno.birth_date, alumno.gender, alumno.grupo_activo));
}

// Un alumno sin fecha de nacimiento no tiene grupo calculable, pero tiene que
// poder inscribirse igual: se ofrece en los planes por edad (Birdies y Juvenil)
// en vez de desaparecer de los buscadores. Competencia y Damas siguen siendo
// asignación explícita.
export function alumnoElegibleParaPlan(alumno: AlumnoParaGrupo, tipoPlan: TipoPlan): boolean {
  const grupo = calcularGrupo(alumno.birth_date, alumno.gender, alumno.grupo_activo);
  if (grupo) return tipoPlanDeGrupo(grupo) === tipoPlan;
  return tipoPlan === "birdies" || tipoPlan === "juvenil";
}
