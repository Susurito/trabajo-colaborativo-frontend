import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import {
  hasSpacesAccess as checkSpacesAccess,
  roleBySlug,
  roleSlugFromBackend,
  rolesFromBackend,
} from '../data/roles';
import { Role, RoleSlug } from '../data/models';

const ACTIVE_ROLE_KEY = 'active_role_slug';

@Injectable({ providedIn: 'root' })
export class RoleSessionService {
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly roleSlug = signal<RoleSlug>('reportante');

  readonly currentSlug = this.roleSlug.asReadonly();

  readonly currentRole = computed<Role>(() => roleBySlug(this.roleSlug()));

  /**
   * HU-26 — Se recalcula automáticamente cuando `setRole()` cambia el rol
   * activo, por lo que la UI reacciona sin recargar la página.
   */
  readonly hasSpacesAccess = computed(() => checkSpacesAccess(this.roleSlug()));

  readonly availableRoles = computed<Role[]>(() => {
    const profile = this.auth.currentUser();
    if (!profile?.roles?.length) {
      return [];
    }
    return rolesFromBackend(profile.roles);
  });

  constructor() {
    // Inicialización síncrona: los guards pueden leer el rol activo en cuanto
    // la sesión está lista, sin esperar al primer ciclo de efectos.
    this.syncFromProfile();

    effect(() => {
      this.auth.currentUser();
      this.syncFromProfile();
    });
  }

  private syncFromProfile(): void {
    const profile = this.auth.currentUser();
    if (!profile?.roles?.length) {
      this.roleSlug.set('reportante');
      return;
    }

    const allowed = profile.roles.map((role) => roleSlugFromBackend(role));
    const stored = this.readStoredSlug();
    const normalizedStored = stored ? roleSlugFromBackend(stored) : null;
    const nextSlug =
      normalizedStored && allowed.includes(normalizedStored)
        ? normalizedStored
        : allowed[0] ?? 'reportante';

    this.roleSlug.set(nextSlug);
    this.persistSlug(nextSlug);
  }

  setRole(slug: RoleSlug): void {
    const allowed = this.availableRoles().map((role) => role.slug);
    if (!allowed.includes(slug)) {
      return;
    }
    this.roleSlug.set(slug);
    this.persistSlug(slug);
  }

  private readStoredSlug(): RoleSlug | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }
    const value = sessionStorage.getItem(ACTIVE_ROLE_KEY);
    return value ? (value as RoleSlug) : null;
  }

  private persistSlug(slug: RoleSlug): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    sessionStorage.setItem(ACTIVE_ROLE_KEY, slug);
  }
}
