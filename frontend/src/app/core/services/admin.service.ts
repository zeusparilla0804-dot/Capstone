import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminAddOn, AdminAuditLogItem, AdminBooking, AdminBookingDetail, AdminCustomer, AdminCustomerBooking, AdminCustomerPayment, AdminCustomerProfile, AdminCustomerStatus, AdminCustomerUpdateInput, AdminDashboard, AdminEmailOutboxItem, AdminEmailPreview, AdminPackage, AdminPackageInput, AdminPayment, AdminPaymentProof, AdminPaymentProofDetail, AdminPaymentReport, AdminPaymentReportFilter, AdminReservationReport, AdminReservationReportFilter, ApiResponse, EventTypeOption, Invoice, PageResult } from '../models';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/admin`;
  private readonly options = { withCredentials: true };

  dashboard(period?: string) { return this.http.get<ApiResponse<AdminDashboard>>(`${this.base}/dashboard`, { ...this.options, params: period ? new HttpParams().set('period', period) : undefined }); }
  bookings(filters: Record<string, string | number>) { return this.http.get<ApiResponse<PageResult<AdminBooking>>>(`${this.base}/bookings`, { ...this.options, params: this.params(filters) }); }
  booking(id: number) { return this.http.get<ApiResponse<AdminBookingDetail>>(`${this.base}/bookings/${id}`, this.options); }
  updateBookingStatus(id: number, status: string, reason?: string, capacityConfirmed?: boolean) {
    const body = {
      status,
      ...(reason === undefined ? {} : { reason }),
      ...(capacityConfirmed === undefined ? {} : { capacityConfirmed }),
    };
    return this.http.patch<ApiResponse<never>>(`${this.base}/bookings/${id}/status`, body, this.options);
  }
  issueInvoice(id: number) { return this.http.post<ApiResponse<Invoice>>(`${this.base}/bookings/${id}/invoice`, {}, this.options); }
  customers(filters: Record<string, string | number>) { return this.http.get<ApiResponse<PageResult<AdminCustomer>>>(`${this.base}/customers`, { ...this.options, params: this.params(filters) }); }
  customer(id: number) { return this.http.get<ApiResponse<AdminCustomerProfile>>(`${this.base}/customers/${id}`, this.options); }
  updateCustomer(id: number, value: AdminCustomerUpdateInput) { return this.http.patch<ApiResponse<AdminCustomerProfile>>(`${this.base}/customers/${id}`, value, this.options); }
  updateCustomerStatus(id: number, status: AdminCustomerStatus) { return this.http.patch<ApiResponse<AdminCustomerProfile>>(`${this.base}/customers/${id}/status`, { status }, this.options); }
  customerBookings(id: number, page = 1, pageSize = 10) { return this.http.get<ApiResponse<PageResult<AdminCustomerBooking>>>(`${this.base}/customers/${id}/bookings`, { ...this.options, params: this.params({ page, pageSize }) }); }
  customerPayments(id: number, page = 1, pageSize = 10) { return this.http.get<ApiResponse<PageResult<AdminCustomerPayment>>>(`${this.base}/customers/${id}/payments`, { ...this.options, params: this.params({ page, pageSize }) }); }
  packages() { return this.http.get<ApiResponse<readonly AdminPackage[]>>(`${this.base}/packages`, this.options); }
  eventTypes() { return this.http.get<ApiResponse<readonly EventTypeOption[]>>(`${this.base}/event-types`, this.options); }
  savePackage(value: AdminPackageInput, id?: number) { return id ? this.http.put(`${this.base}/packages/${id}`, value, this.options) : this.http.post(`${this.base}/packages`, value, this.options); }
  addOns() { return this.http.get<ApiResponse<readonly AdminAddOn[]>>(`${this.base}/add-ons`, this.options); }
  saveAddOn(value: Omit<AdminAddOn, 'id'>, id?: number) { return id ? this.http.put(`${this.base}/add-ons/${id}`, value, this.options) : this.http.post(`${this.base}/add-ons`, value, this.options); }
  payments(filters: Record<string, string | number>) { return this.http.get<ApiResponse<PageResult<AdminPayment>>>(`${this.base}/payments`, { ...this.options, params: this.params(filters) }); }
  reservationReport(filters: AdminReservationReportFilter) { return this.http.get<ApiResponse<AdminReservationReport>>(`${this.base}/reports/reservations`, { ...this.options, params: this.params(filters) }); }
  paymentReport(filters: AdminPaymentReportFilter) { return this.http.get<ApiResponse<AdminPaymentReport>>(`${this.base}/reports/payments`, { ...this.options, params: this.params(filters) }); }
  exportReservationReport(filters: AdminReservationReportFilter) { return this.http.get(`${this.base}/reports/reservations/export`, { ...this.options, params: this.params(filters), responseType: 'blob' }); }
  exportPaymentReport(filters: AdminPaymentReportFilter) { return this.http.get(`${this.base}/reports/payments/export`, { ...this.options, params: this.params(filters), responseType: 'blob' }); }
  paymentProofs(filters: Record<string, string | number>) { return this.http.get<ApiResponse<PageResult<AdminPaymentProof>>>(`${this.base}/payment-proofs`, { ...this.options, params: this.params(filters) }); }
  paymentProof(id: string) { return this.http.get<ApiResponse<AdminPaymentProofDetail>>(`${this.base}/payment-proofs/${id}`, this.options).pipe(map(response => ({ ...response, data: { ...response.data, proof: { ...response.data.proof, fileUrl: this.proofFileUrl(response.data.proof.fileUrl) } } }))); }
  verifyPaymentProof(id: string, verifiedAmount: number, reason?: string) { return this.http.post<ApiResponse<AdminPaymentProof>>(`${this.base}/payment-proofs/${id}/verify`, reason ? { verifiedAmount, reason } : { verifiedAmount }, this.options); }
  rejectPaymentProof(id: string, reason: string) { return this.http.post<ApiResponse<AdminPaymentProof>>(`${this.base}/payment-proofs/${id}/reject`, { reason }, this.options); }
  emailOutbox(filters: Record<string, string | number>) { return this.http.get<ApiResponse<PageResult<AdminEmailOutboxItem>>>(`${this.base}/email-outbox`, { ...this.options, params: this.params(filters) }); }
  retryEmail(id: string) { return this.http.post<ApiResponse<never>>(`${this.base}/email-outbox/${id}/retry`, {}, this.options); }
  emailPreview(id: string) { return this.http.get<ApiResponse<AdminEmailPreview>>(`${this.base}/email-outbox/${id}/preview`, this.options); }
  auditLog(filters: Record<string, string | number>) { return this.http.get<ApiResponse<PageResult<AdminAuditLogItem>>>(`${this.base}/audit-log`, { ...this.options, params: this.params(filters) }); }
  recordPayment(value: object) { return this.http.post(`${this.base}/payments`, value, this.options); }
  private proofFileUrl(value: string) { if (/^https?:\/\//i.test(value)) return value; if (/^https?:\/\//i.test(environment.apiBaseUrl)) return `${new URL(environment.apiBaseUrl).origin}${value.startsWith('/') ? '' : '/'}${value}`; return value; }
  private params(values: object) { let params = new HttpParams(); Object.entries(values).forEach(([key, value]) => { if (value !== '' && value !== undefined) params = params.set(key, String(value)); }); return params; }
}
