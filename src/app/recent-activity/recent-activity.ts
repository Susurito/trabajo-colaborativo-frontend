import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  ApiActivityEntry,
  ReportsApiService,
} from '../data/reports-api.service';
import { Spinner } from '../ui/spinner/spinner';

const DISPLAY_LIMIT = 15;

/**
 * HU-21 — Actividad reciente.
 * Feed de cambios (estados, comentarios, asignaciones, evidencias,
 * colaboraciones) para mantener awareness del equipo.
 *
 * Con `folios` se acota el feed a ciertos reportes: un reportante solo ve
 * la actividad de sus reportes y un técnico la de los que tiene asignados;
 * `null` muestra el feed global (roles de supervisión).
 */
@Component({
  selector: 'app-recent-activity',
  imports: [DatePipe, RouterLink, Spinner],
  templateUrl: './recent-activity.html',
  styleUrl: './recent-activity.css',
})
export class RecentActivity implements OnInit {
  private readonly api = inject(ReportsApiService);

  /** Folios visibles para el usuario actual; null = sin filtro (feed global). */
  readonly folios = input<string[] | null>(null);

  protected readonly items = signal<ApiActivityEntry[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly expanded = signal(true);

  protected readonly visibleItems = computed(() => {
    const allowed = this.folios();
    const rows =
      allowed === null
        ? this.items()
        : this.items().filter((item) => allowed.includes(item.reportFolio));
    return rows.slice(0, DISPLAY_LIMIT);
  });

  protected readonly scoped = computed(() => this.folios() !== null);

  protected readonly title = computed(() =>
    this.scoped() ? 'Actividad de tus reportes' : 'Actividad reciente',
  );

  protected readonly emptyText = computed(() =>
    this.scoped()
      ? 'Aún no hay actividad en tus reportes.'
      : 'Aún no hay actividad registrada.',
  );

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set(false);

    // Se piden más entradas de las que se muestran para que el filtrado
    // por folio siga teniendo material suficiente.
    this.api.recentActivity(50).subscribe({
      next: (rows) => {
        this.items.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.loading.set(false);
      },
    });
  }

  protected toggle(): void {
    this.expanded.update((value) => !value);
  }

  protected typeLabel(type: string): string {
    switch (type) {
      case 'creacion':
        return 'Creado';
      case 'estado':
        return 'Cambiado';
      case 'asignacion':
        return 'Asignado';
      case 'comentario':
        return 'Comentado';
      case 'diagnostico':
        return 'Diagnosticado';
      case 'actividad':
        return 'Actividad registrada';
      case 'evidencia':
        return 'Evidencia agregada';
      case 'colaboracion':
        return 'Colaboración agregada';
      default:
        return 'Evento registrado';
    }
  }

  protected formatDate(dateStr: string): string {
    if (!dateStr) return '';
    return dateStr.includes('Z') || dateStr.includes('+') ? dateStr : `${dateStr}Z`;
  }
}
