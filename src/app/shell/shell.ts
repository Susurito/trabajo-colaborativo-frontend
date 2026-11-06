import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreadcrumbService } from '../session/breadcrumb.service';
import { RoleSessionService } from '../session/role-session.service';
import { AuthService } from '../auth/auth.service';
import { RoleSlug } from '../data/models';
import { HomeSearchService } from '../session/home-search.service';
import {
  LucideChevronDown,
  LucideClipboardCheck,
  LucideClipboardList,
  LucideFileText,
  LucideHouse,
  LucideLogOut,
  LucideMapPin,
  LucideNetwork,
  LucidePanelLeft,
  LucideSettings,
  LucideShieldCheck,
  LucideUsers,
  LucideWrench,
} from '@lucide/angular';
import { Confirm } from '../ui/confirm/confirm';
import { Toast } from '../ui/toast/toast';

const MOBILE_QUERY = '(max-width: 860px)';
const SEARCH_MOBILE_QUERY = '(max-width: 700px)';

/** Colores por rol — solo para presentación, no toca models.ts */
const ROLE_COLORS: Record<RoleSlug, string> = {
  reportante:    '#10B981',
  tecnico:       '#3B82F6',
  responsable:   '#F59E0B',
  coordinador:   '#8B5CF6',
  validador:     '#06B6D4',
  administrador: '#EF4444',
};

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    LucideHouse,
    LucideUsers,
    LucideLogOut,
    LucideMapPin,
    LucidePanelLeft,
    LucideClipboardList,
    LucideChevronDown,
    LucideFileText,
    LucideWrench,
    LucideClipboardCheck,
    LucideNetwork,
    LucideShieldCheck,
    LucideSettings,
    Toast,
    Confirm,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class Shell {
  private readonly router = inject(Router);
  private readonly roles = inject(RoleSessionService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly crumbs = inject(BreadcrumbService);
  protected readonly authService = inject(AuthService);
  protected readonly homeSearch = inject(HomeSearchService);
  private readonly elementRef = inject(ElementRef);

  protected readonly collapsed = signal(false);
  protected readonly mobileOpen = signal(false);
  protected readonly isMobile = signal(false);
  protected readonly isSearchMobile = signal(false);
  protected readonly roleMenuOpen = signal(false);
  protected readonly currentRole = this.roles.currentRole;
  protected readonly availableRoles = this.roles.availableRoles;
  protected readonly hasSpacesAccess = this.roles.hasSpacesAccess;
  protected readonly canViewWorkload = computed(() =>
    ['coordinador', 'responsable'].includes(this.currentRole().slug),
  );
  protected readonly currentUser = this.authService.currentUser;
  protected readonly searchQuery = this.homeSearch.query;

  /** Color hex del rol activo, para pasarlo como CSS var al template */
  protected readonly activeRoleColor = computed(
    () => ROLE_COLORS[this.currentRole().slug] ?? '#3B82F6',
  );

  /** Color hex de cualquier rol por slug (para el menú) */
  protected roleColor(slug: RoleSlug): string {
    return ROLE_COLORS[slug] ?? '#3B82F6';
  }

  protected readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly showTopbarSearch = computed(() => {
    const url = this.currentUrl();
    return this.isSearchMobile() && (url === '/inicio' || url.startsWith('/inicio/comunidad'));
  });

  protected readonly showSidebarLabels = computed(() => this.isMobile() || !this.collapsed());

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        this.roleMenuOpen.set(false);
        this.mobileOpen.set(false);
        const url = (event as NavigationEnd).urlAfterRedirects;
        if (!url.startsWith('/inicio')) {
          this.homeSearch.clear();
        }
      });

    if (typeof window !== 'undefined') {
      this.isMobile.set(window.matchMedia(MOBILE_QUERY).matches);
      this.isSearchMobile.set(window.matchMedia(SEARCH_MOBILE_QUERY).matches);
    }

    afterNextRender(() => {
      const mobileQuery = window.matchMedia(MOBILE_QUERY);
      const searchMobileQuery = window.matchMedia(SEARCH_MOBILE_QUERY);

      const syncMobile = (event?: MediaQueryListEvent) => {
        const mobile = event?.matches ?? mobileQuery.matches;
        this.isMobile.set(mobile);
        if (event && mobile) {
          this.mobileOpen.set(false);
        }
      };

      const syncSearchMobile = (event?: MediaQueryListEvent) => {
        this.isSearchMobile.set(event?.matches ?? searchMobileQuery.matches);
      };

      syncMobile();
      syncSearchMobile();
      mobileQuery.addEventListener('change', syncMobile);
      searchMobileQuery.addEventListener('change', syncSearchMobile);
      this.destroyRef.onDestroy(() => {
        mobileQuery.removeEventListener('change', syncMobile);
        searchMobileQuery.removeEventListener('change', syncSearchMobile);
      });
    });
  }

  protected toggleMenu(): void {
    this.roleMenuOpen.set(false);
    if (this.isMobile()) {
      this.mobileOpen.update((value) => !value);
    } else {
      this.collapsed.update((value) => !value);
    }
  }

  protected closeMobile(): void {
    this.mobileOpen.set(false);
    this.roleMenuOpen.set(false);
  }

  protected toggleRoleMenu(): void {
    if (this.availableRoles().length <= 1) {
      return;
    }
    this.roleMenuOpen.update((value) => !value);
  }

  protected selectRole(slug: RoleSlug): void {
    this.roles.setRole(slug);
    this.roleMenuOpen.set(false);
    this.router.navigate(['/inicio']);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.roleMenuOpen()) return;
    const target = event.target as HTMLElement | null;
    const brandWrap = (this.elementRef.nativeElement as HTMLElement).querySelector('.brand-wrap');
    if (brandWrap && !brandWrap.contains(target)) {
      this.roleMenuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.roleMenuOpen()) {
      this.roleMenuOpen.set(false);
    }
  }

  protected logout(): void {
    this.authService.logout();
  }

  protected onTopbarSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.homeSearch.setQuery(value);
  }

  protected initials(name: string | undefined | null): string {
    if (!name) return '';
    return name
      .split(' ')
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }
}
