import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { of, Subject } from 'rxjs';
import { Analytics } from './analytics';
import { AnalyticsApiService, AnalyticsPage, AnalyticsSummary } from '../data/analytics-api.service';
import { CatalogApiService } from '../data/catalog-api.service';
import { ReportsApiService } from '../data/reports-api.service';

class AnalyticsHarness extends Analytics {
  setDates(start: string, end: string) { this.startDate = start; this.endDate = end; }
  generate() { this.apply(); }
  next() { this.paginate(1); }
  get currentSummary() { return this.summary(); }
  get currentError() { return this.error(); }
}

describe('Analytics report queries', () => {
  let component: AnalyticsHarness;
  let api: jasmine.SpyObj<AnalyticsApiService>;
  beforeEach(() => {
    api = jasmine.createSpyObj('AnalyticsApiService', ['summary', 'reports', 'export']);
    api.summary.and.returnValue(of({ total: 1 } as AnalyticsSummary));
    api.reports.and.returnValue(of({ total: 1, items: [] } as unknown as AnalyticsPage));
    TestBed.configureTestingModule({ providers: [
      provideZonelessChangeDetection(),
      { provide: AnalyticsApiService, useValue: api },
      { provide: CatalogApiService, useValue: { listCampuses: () => of([]) } },
      { provide: ReportsApiService, useValue: { listSpecialties: () => of([]) } },
    ] });
    component = TestBed.runInInjectionContext(() => new AnalyticsHarness());
  });
  it('rejects an inverted date range before sending requests', () => {
    component.setDates('2026-02-01', '2026-01-01'); component.generate();
    expect(api.summary).not.toHaveBeenCalled();
    expect(component.currentError).toContain('fecha inicial');
  });
  it('uses applied filters when paginating even if the draft changes', () => {
    component.setDates('2026-01-01', '2026-01-31'); component.generate();
    component.setDates('2026-02-01', '2026-02-28'); component.next();
    expect(api.reports.calls.mostRecent().args[0]['start_date']).toBe('2026-01-01');
    expect(api.reports.calls.mostRecent().args.slice(1)).toEqual([25, 25]);
  });
  it('cancels the old query so a late response cannot replace the latest report', () => {
    const first = new Subject<AnalyticsSummary>();
    api.summary.and.returnValue(first);
    component.generate();
    api.summary.and.returnValue(of({ total: 2 } as AnalyticsSummary));
    component.generate();
    first.next({ total: 99 } as AnalyticsSummary); first.complete();
    expect(component.currentSummary?.total).toBe(2);
  });
});
