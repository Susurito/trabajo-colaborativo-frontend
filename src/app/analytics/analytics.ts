import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, Subscription } from 'rxjs';
import { AnalyticsApiService, AnalyticsFilters, AnalyticsPage, AnalyticsSummary } from '../data/analytics-api.service';
import { CatalogApiService, Campus } from '../data/catalog-api.service';
import { ReportsApiService, ApiSpecialty } from '../data/reports-api.service';
import { ReportStatus } from '../data/models';
import { statusLabel } from '../data/report-status';

@Component({
  selector: 'app-analytics',
  imports: [DatePipe, DecimalPipe, FormsModule, RouterLink],
  templateUrl: './analytics.html',
  styleUrl: './analytics.css',
})
export class Analytics implements OnInit {
  private readonly api = inject(AnalyticsApiService);
  private readonly catalogs = inject(CatalogApiService);
  private readonly reportsApi = inject(ReportsApiService);
  private readonly destroyRef = inject(DestroyRef);
  private request?: Subscription;
  private applied: AnalyticsFilters = {};
  protected readonly summary = signal<AnalyticsSummary | null>(null);
  protected readonly page = signal<AnalyticsPage | null>(null);
  protected readonly loading = signal(false);
  protected readonly exporting = signal(false);
  protected readonly error = signal('');
  protected readonly exportError = signal('');
  protected readonly catalogError = signal('');
  protected readonly campuses = signal<Campus[]>([]);
  protected readonly specialties = signal<ApiSpecialty[]>([]);
  protected readonly statusLabel = statusLabel;
  protected readonly statuses: ReportStatus[] = ['reportada', 'validada', 'asignada', 'en_progreso', 'en_validacion', 'resuelta', 'cerrada', 'bloqueada', 'reabierta'];
  protected startDate = '';
  protected endDate = '';
  protected campusId = '';
  protected specialtyId = '';
  protected status = '';
  protected priority = '';
  protected offset = 0;
  protected readonly limit = 25;

  ngOnInit() {
    forkJoin({ campuses: this.catalogs.listCampuses(), specialties: this.reportsApi.listSpecialties() })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: data => { this.campuses.set(data.campuses); this.specialties.set(data.specialties); },
        error: () => this.catalogError.set('No se pudieron cargar los catálogos. Puedes consultar por fechas y estado o recargar la página.'),
      });
    this.apply();
  }

  protected apply() {
    if (this.startDate && this.endDate && this.startDate > this.endDate) {
      this.error.set('La fecha inicial debe ser anterior o igual a la final.');
      return;
    }
    this.applied = { start_date: this.startDate, end_date: this.endDate,
      campus_id: this.campusId, specialty_id: this.specialtyId, status: this.status, priority: this.priority };
    this.offset = 0;
    this.load();
  }

  protected clear() {
    this.startDate = this.endDate = this.campusId = this.specialtyId = this.status = this.priority = '';
    this.apply();
  }

  protected paginate(direction: number) {
    this.offset = Math.max(0, this.offset + direction * this.limit);
    this.load();
  }

  protected retry() { this.load(); }

  private load() {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.exportError.set('');
    this.request = forkJoin({ summary: this.api.summary(this.applied), page: this.api.reports(this.applied, this.limit, this.offset) })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: result => { this.summary.set(result.summary); this.page.set(result.page); this.loading.set(false); },
        error: (err: HttpErrorResponse) => {
          this.summary.set(null); this.page.set(null); this.loading.set(false);
          this.error.set(err.status === 403 ? 'Tu rol no tiene acceso a los reportes.' : 'No se pudo generar el reporte. Revisa los filtros y vuelve a intentarlo.');
        },
      });
  }

  protected export() {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.exportError.set('');
    this.api.export({ ...this.applied }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = 'reporte-atencion.csv'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.exporting.set(false);
      },
      error: () => { this.exporting.set(false); this.exportError.set('No se pudo exportar el archivo. Vuelve a intentarlo.'); },
    });
  }
}
