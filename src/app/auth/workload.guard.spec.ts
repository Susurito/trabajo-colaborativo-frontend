import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { workloadGuard } from './workload.guard';

describe('workloadGuard', () => {
  for (const roles of [['coordinador'], ['responsable_area'], ['tecnico', 'coordinador']]) {
    it(`allows ${roles.join(', ')}`, () => {
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]),
        { provide: AuthService, useValue: { currentUser: () => ({ roles }) } }] });
      expect(TestBed.runInInjectionContext(() => workloadGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot))).toBeTrue();
    });
  }
  for (const roles of [[], ['administrador'], ['tecnico'], ['validador'], ['reportante']]) {
    it(`redirects ${roles.join(', ') || 'anonymous'}`, () => {
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]),
        { provide: AuthService, useValue: { currentUser: () => ({ roles }) } }] });
      const result = TestBed.runInInjectionContext(() => workloadGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
      expect(result).toEqual(TestBed.inject(Router).createUrlTree(['/inicio']));
    });
  }
});
