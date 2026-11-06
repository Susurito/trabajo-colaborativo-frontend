import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs';

import { roleSlugToBackend } from '../data/roles';
import { RoleSessionService } from '../session/role-session.service';
import { AuthService } from './auth.service';

/**
 * RBAC — valida que el rol activo del usuario esté entre los roles declarados
 * en `route.data.roles` (valores tal como los devuelve el backend).
 *
 * Si no hay sesión redirige al login; si el rol activo no está autorizado,
 * redirige a `/inicio`. Al evaluar el rol activo, un usuario con varios roles
 * pierde el acceso en cuanto cambia a uno no permitido.
 */
export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const session = inject(RoleSessionService);
  const router = inject(Router);

  const requiredRoles = (route.data['roles'] as string[] | undefined) ?? [];

  const canActivate = (): boolean | ReturnType<Router['createUrlTree']> => {
    if (!auth.currentUser()) {
      return router.createUrlTree(['/login']);
    }

    if (requiredRoles.length === 0) {
      return true;
    }

    const activeRole = roleSlugToBackend(session.currentSlug());
    return requiredRoles.includes(activeRole)
      ? true
      : router.createUrlTree(['/inicio']);
  };

  if (auth.sessionReady()) {
    return canActivate();
  }

  return toObservable(auth.sessionReady).pipe(
    filter((ready) => ready),
    take(1),
    map(() => canActivate()),
  );
};
