import { Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { AnalyticsApiService, AttentionEvaluation, AttentionTimes } from '../data/analytics-api.service';
import { AuthService } from '../auth/auth.service';
import { ApiReport } from '../data/reports-api.service';

@Component({
  selector: 'app-attention',
  imports: [DatePipe, DecimalPipe, FormsModule],
  templateUrl: './attention.html',
  styleUrl: './attention.css',
})
export class Attention {
  readonly report = input.required<ApiReport>();
  private readonly api = inject(AnalyticsApiService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly times = signal<AttentionTimes | null>(null);
  protected readonly evaluation = signal<AttentionEvaluation | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly saveError = signal('');
  protected readonly allowed = computed(() => {
    const user = this.auth.currentUser();
    const report = this.report();
    return !!user && (Number(report.authorId) === user.id || Number(report.assigneeId) === user.id ||
      user.roles.some(role => ['administrador', 'coordinador', 'responsable_area'].includes(role)));
  });
  protected readonly canEvaluate = computed(() =>
    Number(this.report().authorId) === this.auth.currentUser()?.id && this.report().status === 'cerrada');
  protected rating = '';
  protected comment = '';

  constructor() {
    effect(onCleanup => {
      const report = this.report();
      if (!this.allowed()) { this.loading.set(false); return; }
      this.loading.set(true); this.error.set('');
      const request = forkJoin({ times: this.api.times(report.folio), evaluation: this.api.evaluation(report.folio) })
        .subscribe({
          next: data => { this.times.set(data.times); this.evaluation.set(data.evaluation); this.loading.set(false); },
          error: () => { this.loading.set(false); this.error.set('No se pudieron cargar los tiempos y la evaluación.'); },
        });
      onCleanup(() => request.unsubscribe());
    });
  }

  protected submit() {
    const rating = Number(this.rating);
    if (!this.canEvaluate() || this.evaluation() || !Number.isInteger(rating) || rating < 1 || rating > 5 || this.saving()) return;
    this.saving.set(true); this.saveError.set('');
    this.api.evaluate(this.report().folio, rating, this.comment).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => { this.evaluation.set(data); this.saving.set(false); },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.saveError.set(typeof err.error?.detail === 'string' ? err.error.detail : 'No se pudo guardar la evaluación. Vuelve a intentarlo.');
      },
    });
  }
}
