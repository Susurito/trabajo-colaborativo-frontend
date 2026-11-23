import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { ReportStatus } from './models';

export interface AttentionTimes {
  response_hours: number | null;
  resolution_hours: number | null;
  closure_hours: number | null;
  open_hours: number | null;
}
export interface AnalyticsRow extends AttentionTimes {
  id: number; folio: string; title: string; status: ReportStatus;
  priority: string | null; campus: string; specialty_id: number | null;
  specialty: string; assignee: string; created_at: string; rating: number | null;
}
export interface AnalyticsPage { items: AnalyticsRow[]; total: number; limit: number; offset: number; }
export interface AreaSummary {
  specialty_id: number | null; name: string; total: number;
  pending: number; resolved: number; closed: number;
}
export interface AnalyticsSummary {
  total: number; pending: number; resolved: number; closed: number;
  by_status: Record<string, number>; by_area: AreaSummary[];
  response_hours_average: number | null; response_sample: number;
  resolution_hours_average: number | null; resolution_sample: number;
  closure_hours_average: number | null; closure_sample: number;
  rating_average: number | null; evaluation_count: number; generated_at: string;
}
export interface AttentionEvaluation {
  id: number; report_id: number; author_id: number; rating: number;
  comment: string | null; created_at: string;
}
export type AnalyticsFilters = Record<string, string | number>;

@Injectable({ providedIn: 'root' })
export class AnalyticsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  summary(filters: AnalyticsFilters) {
    return this.http.get<AnalyticsSummary>(`${this.base}/analytics/summary`, { params: this.params(filters) });
  }
  reports(filters: AnalyticsFilters, limit: number, offset: number) {
    return this.http.get<AnalyticsPage>(`${this.base}/analytics/reports`, {
      params: this.params({ ...filters, limit, offset }),
    });
  }
  export(filters: AnalyticsFilters) {
    return this.http.get(`${this.base}/analytics/export`, { params: this.params(filters), responseType: 'blob' });
  }
  times(folio: string) {
    return this.http.get<AttentionTimes>(`${this.base}/reports/${encodeURIComponent(folio)}/attention-times`);
  }
  evaluation(folio: string) {
    return this.http.get<AttentionEvaluation | null>(`${this.base}/reports/${encodeURIComponent(folio)}/evaluation`);
  }
  evaluate(folio: string, rating: number, comment: string) {
    return this.http.post<AttentionEvaluation>(`${this.base}/reports/${encodeURIComponent(folio)}/evaluation`, {
      rating, comment: comment.trim() || null,
    });
  }
  private params(filters: AnalyticsFilters) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== '') params = params.set(key, value);
    }
    return params;
  }
}
