import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ACTION_FEEDBACK } from '../interceptors/action-feedback.interceptor';
import type { ApiResponse, Invoice, RecordedInvoiceRefund, RecordInvoiceRefund } from '../models';

@Injectable({ providedIn: 'root' })
export class InvoiceService {
  private readonly http = inject(HttpClient);

  getInvoiceById(id: number, admin = false) {
    const path = admin ? `/admin/invoices/${id}` : `/invoices/${id}`;
    return this.http.get<ApiResponse<Invoice>>(`${environment.apiBaseUrl}${path}`, { withCredentials: true });
  }

  getInvoiceForBooking(id: number) {
    return this.http.get<ApiResponse<Invoice>>(`${environment.apiBaseUrl}/invoices/booking/${id}`, { withCredentials: true });
  }

  recordRefund(id: number, refund: RecordInvoiceRefund) {
    return this.http.post<ApiResponse<RecordedInvoiceRefund>>(`${environment.apiBaseUrl}/admin/invoices/${id}/refund`, refund, {
      withCredentials: true,
      context: new HttpContext().set(ACTION_FEEDBACK, 'silent'),
    });
  }
}
