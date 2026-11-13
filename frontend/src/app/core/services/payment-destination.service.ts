import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, throwError } from 'rxjs';
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

export interface PaymentBankOption extends PaymentDestination {
  readonly version: string;
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
  private readonly httpOptions = { withCredentials: true };

  availableMethods() {
    return this.http.get<ApiResponse<('E-WALLET' | 'BANK_TRANSFER')[]>>(`${this.base}/methods`, this.httpOptions)
      .pipe(map(response => response.data.filter(method => method === 'BANK_TRANSFER')));
  }

  assigned(bookingId: string) {
    return this.http.get<ApiResponse<PaymentDestination | null>>(`${this.base}/bookings/${bookingId}`, this.httpOptions)
      .pipe(map(response => response.data?.method === 'BANK_TRANSFER' ? response.data : null));
  }
  options(bookingId: string) {
    return this.http.get<ApiResponse<PaymentBankOption[]>>(`${this.base}/bookings/${bookingId}/options`, this.httpOptions)
      .pipe(map(response => response.data.filter(item => item.method === 'BANK_TRANSFER')));
  }
  optionImage(bookingId: string, option: PaymentBankOption) {
    return this.http.get(`${this.base}/bookings/${bookingId}/options/${option.id}/image`, {
      ...this.httpOptions, params: { version: option.version }, responseType: 'blob',
    });
  }
  adminOptions() {
    return this.http.get<ApiResponse<PaymentBankOption[]>>(`${this.adminBase}/options`, this.httpOptions).pipe(map(response => response.data));
  }
  image(id: number) { return this.http.get(`${this.base}/${id}/image`, { ...this.httpOptions, responseType: 'blob' }); }
  list() { return this.http.get<ApiResponse<PaymentDestination[]>>(this.adminBase, this.httpOptions).pipe(map(response => response.data.filter(item => item.method === 'BANK_TRANSFER'))); }
  waitingBookings() { return this.http.get<ApiResponse<PaymentQrWaitingBooking[]>>(`${this.adminBase}/waiting-bookings`, this.httpOptions).pipe(map(response => response.data.filter(item => item.paymentMethod === 'BANK_TRANSFER'))); }
  save(data: { method: string; label: string; accountName: string; accountHint: string; file?: File }, id?: number) {
    if (data.method !== 'BANK_TRANSFER') return throwError(() => new Error('Online payment must use bank transfer.'));
    const body = new FormData();
    body.set('method', data.method); body.set('label', data.label); body.set('accountName', data.accountName); body.set('accountHint', data.accountHint);
    if (data.file) body.set('qr', data.file, data.file.name);
    return id ? this.http.put(`${this.adminBase}/${id}`, body, this.httpOptions) : this.http.post(this.adminBase, body, this.httpOptions);
  }
  availability(id: number, isAvailable: boolean) {
    return this.http.patch(`${this.adminBase}/${id}/availability`, { isAvailable }, this.httpOptions);
  }
  assign(bookingId: number, destinationId: number) {
    return this.http.put(`${this.adminBase}/bookings/${bookingId}/assignment`, { destinationId }, this.httpOptions);
  }
  bookingAssignment(bookingId: number) {
    return this.http.get<ApiResponse<PaymentDestination | null>>(`${this.adminBase}/bookings/${bookingId}/assignment`, this.httpOptions)
      .pipe(map(response => response.data?.method === 'BANK_TRANSFER' ? response.data : null));
  }
}
