export type Rol =
  | "coordinador"
  | "profesor"
  | "administrativo"
  | "padre_competencia"
  | "padre_otros"
  | "alumno_competencia";

export const STAFF_ROLES: Rol[] = ["coordinador", "profesor", "administrativo"];
export const ADMIN_ROLES: Rol[] = ["coordinador", "administrativo"];

export const ROLE_ALLOW: Record<Rol, "all" | string[]> = {
  coordinador: "all",
  profesor: "all",
  administrativo: "all",
  padre_competencia: ["/mi-perfil", "/reservas", "/staff", "/drills"],
  alumno_competencia: ["/mi-perfil", "/reservas", "/staff", "/drills"],
  padre_otros: ["/mi-perfil", "/staff", "/drills"],
};

// Restricted even for roles with "all" access — coordinador/administrativo only.
const ADMIN_ONLY_PATHS = ["/accesos"];

export function isRouteAllowed(rol: Rol, pathname: string): boolean {
  const isAdminOnly = ADMIN_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isAdminOnly) return ADMIN_ROLES.includes(rol);

  const allow = ROLE_ALLOW[rol];
  if (!allow) return false;
  if (allow === "all") return true;
  return allow.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isStaffRole(rol: Rol): boolean {
  return STAFF_ROLES.includes(rol);
}
