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
  // /api/asesor-golf es el chat de Paco: proxy.ts filtra también las rutas de
  // API con esta misma lista, así que sin la entrada la petición sale 403.
  //
  // /set-password y su /api/confirm-password-set van en los tres roles de
  // familia. Sin ellos, una cuenta invitada por correo (password_set = false)
  // rebotaba entre /set-password y /mi-perfil hasta agotar los redirects, y
  // nadie de fuera del staff podía cambiar su propia contraseña.
  padre_competencia: ["/mi-perfil", "/reservas", "/alumnos", "/staff", "/drills", "/fisico", "/calendario", "/set-password", "/api/asesor-golf", "/api/confirm-password-set"],
  alumno_competencia: ["/mi-perfil", "/reservas", "/alumnos", "/staff", "/drills", "/fisico", "/calendario", "/set-password", "/api/asesor-golf", "/api/confirm-password-set"],
  padre_otros: ["/mi-perfil", "/staff", "/drills", "/calendario", "/set-password", "/api/confirm-password-set"],
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

// Familias de Competencia. Son las únicas cuentas de fuera del staff que
// reservan cupo y que ven el padrón (solo su grupo, ver StudentsModule).
export function isFamiliaCompetencia(rol: Rol): boolean {
  return rol === "padre_competencia" || rol === "alumno_competencia";
}

// Límite DIARIO de consultas al asesor Paco para el staff. null = sin límite
// (director). Las familias no se miden por día: ver pacoLimiteSemanalFor.
export function pacoLimitFor(rol: Rol): number | null {
  if (rol === "director") return null;
  if (rol === "coordinador") return 40;
  if (rol === "profesor" || rol === "administrativo") return 20;
  return 0;
}

// Las familias de Competencia tienen a Paco por semana, no por día: la idea es
// que el niño vuelva a la app varias veces, no que gaste todo en una tarde. La
// semana arranca el lunes, igual que la de reservas.
export const PACO_LIMITE_SEMANAL_FAMILIA = 10;

export function pacoLimiteSemanalFor(rol: Rol): number | null {
  return isFamiliaCompetencia(rol) ? PACO_LIMITE_SEMANAL_FAMILIA : null;
}

// Quién puede abrir el chat de Paco: el staff y las familias de Competencia.
export function puedeUsarPaco(rol: Rol): boolean {
  return isStaff(rol) || isFamiliaCompetencia(rol);
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
