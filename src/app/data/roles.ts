import { Role, RoleSlug } from './models';

export const ROLES: Role[] = [
  {
    id: 'rol-reportante',
    slug: 'reportante',
    name: 'Reportante',
    description: 'Reporta fallas y da seguimiento',
  },
  {
    id: 'rol-tecnico',
    slug: 'tecnico',
    name: 'Técnico',
    description: 'Diagnostica, atiende y documenta el trabajo',
  },
  {
    id: 'rol-responsable',
    slug: 'responsable',
    name: 'Responsable de área',
    description: 'Clasifica, prioriza y asigna técnicos',
  },
  {
    id: 'rol-coordinador',
    slug: 'coordinador',
    name: 'Coordinador de mantenimiento',
    description: 'Supervisa la operación global y redistribuye la carga',
  },
  {
    id: 'rol-validador',
    slug: 'validador',
    name: 'Validador',
    description: 'Confirma si la solución resolvió el problema',
  },
  {
    id: 'rol-administrador',
    slug: 'administrador',
    name: 'Administrador',
    description: 'Gestiona usuarios, roles, espacios y parámetros generales',
  },
];

export function roleSlugFromBackend(role: string): RoleSlug {
  if (role === 'responsable_area') {
    return 'responsable';
  }
  return role as RoleSlug;
}

export function roleSlugToBackend(slug: RoleSlug): string {
  if (slug === 'responsable') {
    return 'responsable_area';
  }
  return slug;
}

export function rolesFromBackend(roles: string[]): Role[] {
  const slugs = roles.map((role) => roleSlugFromBackend(role));
  return ROLES.filter((item) => slugs.includes(item.slug));
}

export function roleBySlug(slug: RoleSlug): Role {
  return ROLES.find((item) => item.slug === slug) ?? ROLES[0];
}

/**
 * HU-26 — Lista blanca estricta de roles (slugs del backend) con acceso al
 * catálogo de espacios y a su historial.
 */
export const ALLOWED_ROLES: readonly string[] = [
  'coordinador',
  'responsable_area',
  'administrador',
];

/**
 * Evalúa el rol activo contra la lista blanca de HU-26.
 *
 * El frontend normaliza `responsable_area` como `responsable`, por lo que se
 * traduce al slug del backend antes de comparar. Cualquier otro rol
 * (`reportante`, `tecnico`, `validador`) o la ausencia de rol devuelve `false`.
 */
export function hasSpacesAccess(
  activeSlug: RoleSlug | null | undefined,
): boolean {
  if (!activeSlug) {
    return false;
  }
  return ALLOWED_ROLES.includes(roleSlugToBackend(activeSlug));
}
