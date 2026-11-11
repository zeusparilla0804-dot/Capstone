import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ApiResponse } from '../models';

export interface PaymentDestination {
  id: number;
  method: 'E-WALLET' | 'BANK_TRANSFER';
  label: string;
  accountName: string;
  accountHint: string;
  isAvailable?: boolean;
  assignmentCount?: number;
}

export interface PaymentQrWaitingBooking {
  id: number;
  reference: string;
  customerName: string;
  eventType: string;
  eventDate: string;
  eventTime: string;
  paymentMethod: 'E-WALLET' | 'BANK_TRANSFER';
  amountDue: number;
  amountPaid: number;
  assignedQrLabel?: string | null;
  assignedQrHint?: string | null;
}

@Injectable({ providedIn: 'root' })
export class PaymentDestinationService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/payment-destinations`;
  private readonly adminBase = `${environment.apiBaseUrl}/admin/payment-destinations`;
  private readonly options = { withCredentials: true };

  availableMethods() {
    return this.http.get<ApiResponse<('E-WALLET' | 'BANK_TRANSFER')[]>>(`${this.base}/methods`, this.options)
      .pipe(map(response => response.data));
  }

  assigned(bookingId: string) {
    return this.http.get<ApiResponse<PaymentDestination | null>>(`${this.base}/bookings/${bookingId}`, this.options)
      .pipe(map(response => response.data));
  }
  image(id: number) { return this.http.get(`${this.base}/${id}/image`, { ...this.options, responseType: 'blob' }); }
  list() { return this.http.get<ApiResponse<PaymentDestination[]>>(this.adminBase, this.options).pipe(map(response => response.data)); }
  waitingBookings() { return this.http.get<ApiResponse<PaymentQrWaitingBooking[]>>(`${this.adminBase}/waiting-bookings`, this.options).pipe(map(response => response.data)); }
  save(data: { method: string; label: string; accountName: string; accountHint: string; file?: File }, id?: number) {
    const body = new FormData();
    body.set('method', data.method); body.set('label', data.label); body.set('accountName', data.accountName); body.set('accountHint', data.accountHint);
    if (data.file) body.set('qr', data.file, data.file.name);
    return id ? this.http.put(`${this.adminBase}/${id}`, body, this.options) : this.http.post(this.adminBase, body, this.options);
  }
  availability(id: number, isAvailable: boolean) {
    return this.http.patch(`${this.adminBase}/${id}/availability`, { isAvailable }, this.options);
  }
  assign(bookingId: number, destinationId: number) {
    return this.http.put(`${this.adminBase}/bookings/${bookingId}/assignment`, { destinationId }, this.options);
  }
  bookingAssignment(bookingId: number) {
    return this.http.get<ApiResponse<PaymentDestination | null>>(`${this.adminBase}/bookings/${bookingId}/assignment`, this.options)
      .pipe(map(response => response.data));
  }
}
