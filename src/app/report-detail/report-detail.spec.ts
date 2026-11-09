import { signal, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
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
  it('validates required and whitespace-only descriptions and the full length', () => {
    component['report'].set({ status: 'asignada', assigneeId: 2 } as ApiReport);
    component['requestImpediment']();
    component['confirmImpediment']();
    expect(component['impedimentForm'].invalid).toBeTrue();
    component['impedimentForm'].setValue({ reason: 'Otro', description: '   ' });
    component['confirmImpediment']();
    expect(component['impedimentForm'].invalid).toBeTrue();
    component['impedimentForm'].setValue({ reason: 'Otro', description: 'a'.repeat(1000) });
    component['confirmImpediment']();
    expect(api.changeStatus).not.toHaveBeenCalled();
  });

  it('opens only for the assignee or responsible in the allowed states', () => {
    component['requestImpediment']();
    expect(component['impedimentOpen']()).toBeFalse();
    component['report'].set({ status: 'en_progreso', assigneeId: 4 } as ApiReport);
    component['requestImpediment']();
    expect(component['impedimentOpen']()).toBeFalse();
    role.set('responsable');
    component['requestImpediment']();
    expect(component['impedimentOpen']()).toBeTrue();
  });

  it('saves from both source states, prevents duplicate sends and closing while saving', () => {
    spyOn<any>(component, 'loadHistory');
    spyOn<any>(component, 'loadUnifiedHistory');
    for (const status of ['asignada', 'en_progreso'] as const) {
      const response = new Subject<ApiReport>();
      api.changeStatus.and.returnValue(response);
      component['report'].set({ status, assigneeId: 2 } as ApiReport);
      component['requestImpediment']();
      component['impedimentForm'].setValue({ reason: 'Falta de refacción', description: '  Se requiere lámpara.  ' });
      const before = api.changeStatus.calls.count();
      component['confirmImpediment']();
      component['confirmImpediment']();
      component['cancelImpediment']();
      expect(component['impedimentOpen']()).toBeTrue();
      expect(api.changeStatus.calls.count()).toBe(before + 1);
      expect(api.changeStatus.calls.mostRecent().args[1]).toEqual({ status: 'bloqueada', comment: 'Motivo: Falta de refacción\nDescripción: Se requiere lámpara.' });
      response.next({ status: 'bloqueada', assigneeId: 2 } as ApiReport);
      response.complete();
      expect(component['impedimentOpen']()).toBeFalse();
      expect(component['report']()?.status).toBe('bloqueada');
    }
    expect(component['loadHistory']).toHaveBeenCalledTimes(2);
  });

  it('retains input on failure and clears it on a fresh opening after cancel', () => {
    component['report'].set({ status: 'asignada', assigneeId: 2 } as ApiReport);
    component['requestImpediment']();
    component['impedimentForm'].setValue({ reason: 'Otro', description: 'Esperando autorización' });
    api.changeStatus.and.returnValue(throwError(() => ({ error: { detail: 'Sin conexión' } })));
    component['confirmImpediment']();
    expect(component['impedimentError']()).toBe('Sin conexión');
    expect(component['impedimentOpen']()).toBeTrue();
    expect(component['impedimentForm'].controls.description.value).toBe('Esperando autorización');
    component['cancelImpediment']();
    component['requestImpediment']();
    expect(component['impedimentForm'].controls.description.value).toBe('');
    expect(component['impedimentError']()).toBe('');
  });

  it('displays legacy comments unchanged only while blocked', () => {
    component['events'].set([{ ...event(9, 'asignada'), comment: 'Esperando acceso' }]);
    expect(component['activeImpediment']()?.comment).toBe('Esperando acceso');
    component['report'].set({ status: 'asignada', assigneeId: 2 } as ApiReport);
    expect(component['activeImpediment']()).toBeNull();
  });

  it('accepts exactly 1000 serialized characters and rejects one more', () => {
    component['report'].set({ status: 'asignada', assigneeId: 2 } as ApiReport);
    component['requestImpediment']();
    const prefix = 'Motivo: Otro\nDescripción: ';
    component['impedimentForm'].setValue({ reason: 'Otro', description: 'a'.repeat(1001 - prefix.length) });
    component['confirmImpediment']();
    expect(api.changeStatus).not.toHaveBeenCalled();
    component['impedimentForm'].controls.description.setValue('a'.repeat(1000 - prefix.length));
    api.changeStatus.and.returnValue(new Subject<ApiReport>());
    component['confirmImpediment']();
    expect(api.changeStatus.calls.mostRecent().args[1].comment?.length).toBe(1000);
  });

});
