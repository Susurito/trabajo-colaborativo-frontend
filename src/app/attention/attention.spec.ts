import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { Attention } from './attention';
import { AnalyticsApiService, AttentionEvaluation } from '../data/analytics-api.service';
import { AuthService } from '../auth/auth.service';
import { ApiReport } from '../data/reports-api.service';

describe('Attention evaluation', () => {
  let api: jasmine.SpyObj<AnalyticsApiService>;
  beforeEach(() => {
    api = jasmine.createSpyObj('AnalyticsApiService', ['times', 'evaluation', 'evaluate']);
    api.times.and.returnValue(of({ response_hours: 2, resolution_hours: 4, closure_hours: 5, open_hours: null }));
    api.evaluation.and.returnValue(of(null));
    TestBed.configureTestingModule({ imports: [Attention], providers: [
      provideZonelessChangeDetection(),
      { provide: AnalyticsApiService, useValue: api },
      { provide: AuthService, useValue: { currentUser: signal({ id: 1, roles: ['reportante'] }) } },
    ] });
  });
  async function render(status = 'cerrada', authorId = 1) {
    const fixture = TestBed.createComponent(Attention);
    fixture.componentRef.setInput('report', { folio: 'test', status, authorId } as unknown as ApiReport);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return fixture;
  }
  it('shows the form only for the author of a closed incident', async () => {
    const fixture = await render('resuelta');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    fixture.componentRef.setInput('report', { folio: 'test', status: 'cerrada', authorId: 1 });
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
  });
  it('keeps unrelated users from requesting private attention data', async () => {
    const fixture = await render('cerrada', 99);
    expect(api.times).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });
  it('blocks repeat submissions and replaces the form after success', async () => {
    const response = new Subject<AttentionEvaluation>();
    api.evaluate.and.returnValue(response);
    const fixture = await render();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    select.value = '5'; select.dispatchEvent(new Event('change'));
    fixture.detectChanges(); await fixture.whenStable();
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(api.evaluate).toHaveBeenCalledOnceWith('test', 5, '');
    response.next({ id: 1, rating: 5, created_at: '2026-01-10T12:00:00' } as AttentionEvaluation);
    response.complete(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('5 / 5');
  });
  it('shows an actionable conflict without discarding the entered rating', async () => {
    api.evaluate.and.returnValue(throwError(() => ({ error: { detail: 'La incidencia ya no está cerrada' } })));
    const fixture = await render();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    select.value = '4'; select.dispatchEvent(new Event('change'));
    fixture.detectChanges(); await fixture.whenStable();
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('ya no está cerrada');
    expect(select.value).toBe('4');
  });
});
