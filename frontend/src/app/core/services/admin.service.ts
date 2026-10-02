import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AdminAddOn, AdminBooking, AdminCustomer, AdminDashboard, AdminPackage, AdminPayment, ApiResponse, EventTypeOption, Invoice, PageResult } from '../models';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/admin`;
  private readonly options = { withCredentials: true };

  dashboard() { return this.http.get<ApiResponse<AdminDashboard>>(`${this.base}/dashboard`, this.options); }
  bookings(filters: Record<string, string | number>) { return this.http.get<ApiResponse<PageResult<AdminBooking>>>(`${this.base}/bookings`, { ...this.options, params: this.params(filters) }); }
  updateBookingStatus(id: number, status: string, reason?: string) {
    return this.http.patch<ApiResponse<never>>(`${this.base}/bookings/${id}/status`, reason === undefined ? { status } : { status, reason }, this.options);
  }
  issueInvoice(id: number) { return this.http.post<ApiResponse<Invoice>>(`${this.base}/bookings/${id}/invoice`, {}, this.options); }
  customers(filters: Record<string, string | number>) { return this.http.get<ApiResponse<PageResult<AdminCustomer>>>(`${this.base}/customers`, { ...this.options, params: this.params(filters) }); }
  packages() { return this.http.get<ApiResponse<readonly AdminPackage[]>>(`${this.base}/packages`, this.options); }
  eventTypes() { return this.http.get<ApiResponse<readonly EventTypeOption[]>>(`${this.base}/event-types`, this.options); }
  savePackage(value: Omit<AdminPackage, 'id' | 'eventType'>, id?: number) { return id ? this.http.put(`${this.base}/packages/${id}`, value, this.options) : this.http.post(`${this.base}/packages`, value, this.options); }
  addOns() { return this.http.get<ApiResponse<readonly AdminAddOn[]>>(`${this.base}/add-ons`, this.options); }
  saveAddOn(value: Omit<AdminAddOn, 'id'>, id?: number) { return id ? this.http.put(`${this.base}/add-ons/${id}`, value, this.options) : this.http.post(`${this.base}/add-ons`, value, this.options); }
  payments(filters: Record<string, string | number>) { return this.http.get<ApiResponse<PageResult<AdminPayment>>>(`${this.base}/payments`, { ...this.options, params: this.params(filters) }); }
  recordPayment(value: object) { return this.http.post(`${this.base}/payments`, value, this.options); }
  private params(values: Record<string, string | number>) { let params = new HttpParams(); Object.entries(values).forEach(([key, value]) => { if (value !== '' && value !== undefined) params = params.set(key, String(value)); }); return params; }
}
