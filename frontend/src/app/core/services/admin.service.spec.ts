import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AdminService } from './admin.service';

describe('AdminService booking status', () => {
  let service: AdminService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('includes an optional cancellation reason in the status request', () => {
    Reflect.apply(service.updateBookingStatus, service, [5, 'CANCELLED', 'Plans changed']).subscribe();
    const request = http.expectOne(`${environment.apiBaseUrl}/admin/bookings/5/status`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ status: 'CANCELLED', reason: 'Plans changed' });
    request.flush({ success: true });
  });

  it('sends ordinary status changes without a reason', () => {
    service.updateBookingStatus(5, 'APPROVED').subscribe();
    const request = http.expectOne(`${environment.apiBaseUrl}/admin/bookings/5/status`);
    expect(request.request.body).toEqual({ status: 'APPROVED' });
    request.flush({ success: true });
  });

  it('sends an explicit capacity confirmation only for a medium approval', () => {
    service.updateBookingStatus(5, 'APPROVED', undefined, true).subscribe();
    const request = http.expectOne(`${environment.apiBaseUrl}/admin/bookings/5/status`);
    expect(request.request.body).toEqual({ status: 'APPROVED', capacityConfirmed: true });
    request.flush({ success: true });
  });

  it('sends quotation line items to the custom event endpoint', () => {
    const value = {
      items: [{ description: 'Catering', quantity: 120, unitPrice: 950 }],
      requiredDownPayment: 34200, validUntil: '2026-12-31', terms: 'Balance due before the event.',
    } as const;
    service.sendCustomQuote(18, value).subscribe();
    const request = http.expectOne(`${environment.apiBaseUrl}/admin/custom-events/18/quotes`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(value);
    request.flush({ success: true, data: {} });
  });

  it('uses separate clarification and rejection actions', () => {
    service.requestCustomClarification(18, 'Please confirm the venue').subscribe();
    const clarification = http.expectOne(`${environment.apiBaseUrl}/admin/custom-events/18/request-clarification`);
    expect(clarification.request.body).toEqual({ reason: 'Please confirm the venue' });
    clarification.flush({ success: true });

    service.rejectCustomEvent(18, 'Outside the service area').subscribe();
    const rejection = http.expectOne(`${environment.apiBaseUrl}/admin/custom-events/18/reject`);
    expect(rejection.request.body).toEqual({ reason: 'Outside the service area' });
    rejection.flush({ success: true });
  });

  it('updates an administrator-managed customer profile with credentials', () => {
    const value = { firstName: 'Klint', lastName: 'Charles', email: 'klint@example.test', phone: '09171234567' };
    service.updateCustomer(7, value).subscribe();

    const request = http.expectOne(`${environment.apiBaseUrl}/admin/customers/7`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual(value);
    request.flush({ success: true, data: { id: 7, ...value, status: 'ACTIVE', createdAt: '2026-01-01' } });
  });

  it('updates customer account status through its dedicated endpoint', () => {
    service.updateCustomerStatus(7, 'INACTIVE').subscribe();

    const request = http.expectOne(`${environment.apiBaseUrl}/admin/customers/7/status`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual({ status: 'INACTIVE' });
    request.flush({ success: true, data: { id: 7, status: 'INACTIVE' } });
  });

  it('requests reservation reports with typed filters and credentials', () => {
    service.reservationReport({
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
      status: 'APPROVED',
      eventType: 'Wedding',
    }).subscribe();

    const request = http.expectOne(req => req.url === `${environment.apiBaseUrl}/admin/reports/reservations`);
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.params.get('dateFrom')).toBe('2026-10-01');
    expect(request.request.params.get('dateTo')).toBe('2026-10-31');
    expect(request.request.params.get('status')).toBe('APPROVED');
    expect(request.request.params.get('eventType')).toBe('Wedding');
    request.flush({ success: true, data: { filters: {}, summary: {}, items: [], upcomingItems: [] } });
  });

  it('requests payment reports and exports them as blobs', () => {
    const filters = {
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
      status: 'PAID' as const,
      method: 'BANK_TRANSFER' as const,
    };

    service.paymentReport(filters).subscribe();
    const report = http.expectOne(req => req.url === `${environment.apiBaseUrl}/admin/reports/payments`);
    expect(report.request.withCredentials).toBe(true);
    expect(report.request.params.get('method')).toBe('BANK_TRANSFER');
    report.flush({ success: true, data: { filters, summary: {}, items: [] } });

    service.exportPaymentReport(filters).subscribe();
    const exportRequest = http.expectOne(req => req.url === `${environment.apiBaseUrl}/admin/reports/payments/export`);
    expect(exportRequest.request.method).toBe('GET');
    expect(exportRequest.request.withCredentials).toBe(true);
    expect(exportRequest.request.responseType).toBe('blob');
    expect(exportRequest.request.params.get('status')).toBe('PAID');
    exportRequest.flush(new Blob(['report']));
  });

  it('exports reservation reports without putting filters in the path', () => {
    service.exportReservationReport({
      dateFrom: '2026-10-01', dateTo: '2026-10-31', status: '', eventType: '',
    }).subscribe();

    const request = http.expectOne(req => req.url === `${environment.apiBaseUrl}/admin/reports/reservations/export`);
    expect(request.request.responseType).toBe('blob');
    expect(request.request.url).not.toContain('2026-10-01');
    expect(request.request.params.get('dateFrom')).toBe('2026-10-01');
    request.flush(new Blob(['report']));
  });
});
