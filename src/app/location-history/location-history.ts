import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { LocationHistoryResponse } from '../models/history.model';
import { HistoryService } from '../services/history.service';
import { Spinner } from '../ui/spinner/spinner';

const CATEGORY_LABELS: Record<string, string> = {
  infraestructura: 'Infraestructura',
  electricidad: 'Electricidad',
  agua: 'Agua',
  ti: 'TI',
  mobiliario: 'Mobiliario',
  limpieza: 'Limpieza',
  seguridad: 'Seguridad',
  climatizacion: 'Climatización',
  otro: 'Otro',
};

const STATUS_LABELS: Record<string, string> = {
  reportada: 'Reportada',
  validada: 'Validada',
  asignada: 'Asignada',
  en_progreso: 'En progreso',
  en_validacion: 'En validación',
  resuelta: 'Resuelta',
  cerrada: 'Cerrada',
  bloqueada: 'Bloqueada',
  reabierta: 'Reabierta',
};

/**
 * HU-26 — Consultar historial de un espacio físico.
 *
 * Muestra el acumulado de fallas del espacio seleccionado, la distribución
 * por categorías y la línea de tiempo de sus incidencias.
 */
@Component({
  selector: 'app-location-history',
  imports: [DatePipe, RouterLink, Spinner],
  templateUrl: './location-history.html',
  styleUrl: './location-history.css',
})
export class LocationHistory implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly historyService = inject(HistoryService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly history = signal<LocationHistoryResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly locationId = signal<number | null>(null);

  protected readonly categoryTotal = computed(() =>
    (this.history()?.categoriesSummary ?? []).reduce(
      (total, item) => total + item.count,
      0,
    ),
  );

  ngOnInit(): void {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const rawId = params.get('locationId');
        const parsedId = Number(rawId);

        if (!rawId || !Number.isInteger(parsedId) || parsedId <= 0) {
          this.history.set(null);
          this.loading.set(false);
          this.error.set('No se indicó un espacio físico válido.');
          return;
        }

        this.locationId.set(parsedId);
        this.load(parsedId);
      });
  }

  protected load(id: number | null = this.locationId()): void {
    if (id == null) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.historyService.getLocationHistory(id).subscribe({
      next: (response) => {
        this.history.set(response);
        this.loading.set(false);
      },
      error: (response: HttpErrorResponse) => {
        const detail =
          typeof response.error?.detail === 'string'
            ? response.error.detail
            : null;
        this.history.set(null);
        this.error.set(
          detail ?? 'No se pudo cargar el historial del espacio físico.',
        );
        this.loading.set(false);
      },
    });
  }

  protected categoryLabel(category: string): string {
    return CATEGORY_LABELS[category] ?? category;
  }

  protected statusLabel(status: string): string {
    return STATUS_LABELS[status] ?? status;
  }

  protected share(count: number): number {
    const total = this.categoryTotal();
    if (total === 0) {
      return 0;
    }
    return Math.round((count / total) * 100);
  }
}
