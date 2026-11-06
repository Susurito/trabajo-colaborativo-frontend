import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { LocationHistoryResponse } from '../models/history.model';

@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  getLocationHistory(locationId: number): Observable<LocationHistoryResponse> {
    return this.http.get<LocationHistoryResponse>(
      `${this.apiUrl}/history/locations/${locationId}`,
    );
  }
}
