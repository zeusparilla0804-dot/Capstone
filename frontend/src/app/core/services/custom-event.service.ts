import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ApiResponse, CustomEventDetail, CustomEventRequestInput, CustomEventSubmission } from '../models';

@Injectable({ providedIn: 'root' })
export class CustomEventService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${environment.apiBaseUrl}/custom-events`;

  submit(input: CustomEventRequestInput): Promise<CustomEventSubmission> {
    return firstValueFrom(this.http.post<ApiResponse<CustomEventSubmission>>(this.endpoint, input, { withCredentials: true })
      .pipe(map(response => response.data)));
  }

  detail(id: number) {
    return this.http.get<ApiResponse<CustomEventDetail>>(`${this.endpoint}/${id}`, { withCredentials: true })
      .pipe(map(response => response.data));
  }

  accept(requestId: number, quoteId: number): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.endpoint}/${requestId}/quotes/${quoteId}/accept`, {}, { withCredentials: true }));
  }

  decline(requestId: number, quoteId: number, reason?: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.endpoint}/${requestId}/quotes/${quoteId}/decline`,
      reason ? { reason } : {}, { withCredentials: true }));
  }
}
