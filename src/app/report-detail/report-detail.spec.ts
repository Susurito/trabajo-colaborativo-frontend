import { signal, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ReportDetail } from './report-detail';
import { AuthService } from '../auth/auth.service';
import { ReportsApiService, ApiReport, ApiStatusEvent } from '../data/reports-api.service';
import { UsersApiService } from '../data/users-api.service';
import { BreadcrumbService } from '../session/breadcrumb.service';
import { RoleSessionService } from '../session/role-session.service';
import { ToastService } from '../ui/toast/toast.service';
import { RoleSlug } from '../data/models';

describe('Report unblocking', () => {
  const user = signal<{ id: number } | null>({ id: 2 });
  const role = signal<RoleSlug>('tecnico');
  let component: ReportDetail;
  let api: jasmine.SpyObj<ReportsApiService>;
  const event = (id: number, fromStatus: 'asignada' | 'en_progreso') =>
    ({ id, fromStatus, toStatus: 'bloqueada' } as ApiStatusEvent);

  beforeEach(() => {
    user.set({ id: 2 }); role.set('tecnico');
    api = jasmine.createSpyObj('ReportsApiService', ['listStatusEvents', 'changeStatus']);
    TestBed.configureTestingModule({ providers: [
      provideZonelessChangeDetection(),
      { provide: ActivatedRoute, useValue: {} },
      { provide: AuthService, useValue: { currentUser: user } },
      { provide: RoleSessionService, useValue: { currentSlug: role } },
      { provide: ReportsApiService, useValue: api },
      { provide: UsersApiService, useValue: {} },
      { provide: BreadcrumbService, useValue: {} },
      { provide: ToastService, useValue: { show: jasmine.createSpy() } },
    ] });
    component = TestBed.runInInjectionContext(() => new ReportDetail());
    component['report'].set({ status: 'bloqueada', assigneeId: 2 } as ApiReport);
    component['events'].set([event(1, 'asignada')]);
  });

  it('allows the assigned technician after delayed profile restoration', () => {
    user.set(null);
    expect(component['canUnblock']()).toBeFalse();
    user.set({ id: 2 });
    expect(component['canUnblock']()).toBeTrue();
  });

  it('allows the responsible but rejects an unrelated technician', () => {
    user.set({ id: 3 });
    expect(component['canUnblock']()).toBeFalse();
    role.set('responsable');
    expect(component['canUnblock']()).toBeTrue();
  });

  it('uses the newest block regardless of response order', () => {
    component['events'].set([event(1, 'asignada'), event(5, 'en_progreso')]);
    expect(component['resumeStatus']()).toBe('en_progreso');
  });

  it('exposes history errors and recovers when retried', () => {
    api.listStatusEvents.and.returnValue(throwError(() => new Error('offline')));
    component['loadStatusEvents']();
    expect(component['statusEventsError']()).toBeTruthy();
    expect(component['canUnblock']()).toBeFalse();
    expect(component['showActions']()).toBeTrue();
    api.listStatusEvents.and.returnValue(of([event(1, 'asignada')]));
    component['loadStatusEvents']();
    expect(component['statusEventsError']()).toBe('');
    expect(component['canUnblock']()).toBeTrue();
  });

  it('transfers permission to the newly assigned technician', () => {
    component['report'].set({ status: 'bloqueada', assigneeId: 4 } as ApiReport);
    expect(component['canUnblock']()).toBeFalse();
    user.set({ id: 4 });
    expect(component['canUnblock']()).toBeTrue();
  });
});
