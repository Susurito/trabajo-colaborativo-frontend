import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { Workload } from './workload';
import { WorkloadApiService, LoadGroup } from '../data/workload-api.service';
import { ApiReport, ReportsApiService } from '../data/reports-api.service';
import { UsersApiService } from '../data/users-api.service';
import { ToastService } from '../ui/toast/toast.service';

describe('Workload assignments', () => {
  let component: Workload;
  let reports: jasmine.SpyObj<ReportsApiService>;
  const target = { assigneeId: 5, assigneeName: 'Técnico' } as LoadGroup;
  const report = (folio: string, status: string, assigneeId: number | null, specialtyId: number | null = 1) =>
    ({ folio, status, assigneeId, specialtyId, category: 'ti' } as ApiReport);
  beforeEach(() => {
    reports = jasmine.createSpyObj('ReportsApiService', ['list', 'assign']);
    reports.list.and.returnValue(of([
      report('new', 'validada', null), report('other', 'asignada', 6),
      report('same', 'asignada', 5), report('closed', 'cerrada', null),
      report('uncategorized', 'validada', null, null), report('draft', 'reportada', null),
    ]));
    TestBed.configureTestingModule({ providers: [
      provideZonelessChangeDetection(),
      { provide: ReportsApiService, useValue: reports },
      { provide: UsersApiService, useValue: { list: () => of([{ id: 5, is_active: true, roles: ['tecnico'] }]) } },
      { provide: ToastService, useValue: { show: jasmine.createSpy() } },
      { provide: WorkloadApiService, useValue: {
        summary: () => of({ summary: {}, byArea: [], byTechnician: [], byAreaAndTechnician: [] }),
        reports: () => of({ total: 0, items: [] }),
      } },
    ] });
    component = TestBed.runInInjectionContext(() => new Workload());
    component.openAssignment(target);
  });
  it('offers only categorized, assignable incidents without a technician', () => {
    expect(component.eligibleReports().map(r => r.folio)).toEqual(['new']);
  });
  it('offers reassignment from another technician and clears selection', () => {
    component.selectedFolio.set('new'); component.changeAssignmentMode('reassign');
    expect(component.selectedFolio()).toBe('');
    expect(component.eligibleReports().map(r => r.folio)).toEqual(['other']);
  });
  it('blocks duplicate submissions and closes after success', () => {
    const response = new Subject<ApiReport>(); reports.assign.and.returnValue(response);
    component.selectedFolio.set('new'); component.confirmAssignment(); component.confirmAssignment();
    expect(reports.assign).toHaveBeenCalledOnceWith('new', 5);
    component.closeAssignment(); expect(component.assignmentTarget()).not.toBeNull();
    response.next(report('new', 'asignada', 5)); response.complete();
    expect(component.assignmentTarget()).toBeNull(); expect(component.assignmentBusy()).toBeFalse();
  });
  it('preserves the dialog and exposes backend conflicts', () => {
    reports.assign.and.returnValue(throwError(() => ({ error: { detail: 'La incidencia cambió de estado' } })));
    component.selectedFolio.set('new'); component.confirmAssignment();
    expect(component.assignmentTarget()).not.toBeNull();
    expect(component.assignmentError()).toBe('La incidencia cambió de estado');
    expect(component.assignmentBusy()).toBeFalse();
  });
  it('never submits an ineligible selection', () => {
    component.selectedFolio.set('closed'); component.confirmAssignment();
    expect(reports.assign).not.toHaveBeenCalled();
  });
});
