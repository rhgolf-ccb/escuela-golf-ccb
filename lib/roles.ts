export type Rol =
  | "coordinador"
  | "director"
  | "profesor"
  | "administrativo"
  | "padre_competencia"
  | "padre_otros"
  | "alumno_competencia";

export const STAFF_ROLES: Rol[] = ["coordinador", "director", "profesor", "administrativo"];
export const ADMIN_ROLES: Rol[] = ["coordinador", "director", "administrativo"];

export const ROLE_ALLOW: Record<Rol, "all" | string[]> = {
  coordinador: "all",
  director: "all",
  profesor: "all",
  administrativo: "all",
  padre_competencia: ["/mi-perfil", "/reservas", "/staff", "/drills"],
  alumno_competencia: ["/mi-perfil", "/reservas", "/staff", "/drills"],
  padre_otros: ["/mi-perfil", "/staff", "/drills"],
};

// Restricted even for roles with "all" access — coordinador/administrativo only.
const ADMIN_ONLY_PATHS = ["/accesos"];

// Restricted to director/coordinador only — administrativo y profesor no entran.
export const DIRECTOR_COORD_ROLES: Rol[] = ["director", "coordinador"];
const DIRECTOR_COORD_ONLY_PATHS = ["/base-conocimiento"];

export function isRouteAllowed(rol: Rol, pathname: string): boolean {
  const isAdminOnly = ADMIN_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isAdminOnly) return ADMIN_ROLES.includes(rol);

  const isDirectorCoordOnly = DIRECTOR_COORD_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isDirectorCoordOnly) return DIRECTOR_COORD_ROLES.includes(rol);

  const allow = ROLE_ALLOW[rol];
  if (!allow) return false;
  if (allow === "all") return true;
  return allow.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isStaff(rol: Rol): boolean {
  return STAFF_ROLES.includes(rol);
}

export function isPadreOrAlumno(rol: Rol): boolean {
  return rol === "padre_competencia" || rol === "padre_otros" || rol === "alumno_competencia";
}

// Límite diario de consultas al asesor Paco. null = sin límite (director).
export function pacoLimitFor(rol: Rol): number | null {
  if (rol === "director") return null;
  if (rol === "coordinador") return 40;
  if (rol === "profesor" || rol === "administrativo") return 20;
  return 0;
}

export function roleLabel(rol: Rol): string {
  switch (rol) {
    case "coordinador":
      return "Coordinador";
    case "director":
      return "Director de Golf";
    case "profesor":
      return "Profesor";
    case "administrativo":
      return "Administrativo";
    case "padre_competencia":
      return "Padre · Competencia";
    case "alumno_competencia":
      return "Alumno · Competencia";
    case "padre_otros":
      return "Padre";
  }
}

export function roleChipColor(rol: Rol): string {
  if (rol === "padre_competencia" || rol === "alumno_competencia") return "#7d5a00";
  return "#1a3a2a";
}
