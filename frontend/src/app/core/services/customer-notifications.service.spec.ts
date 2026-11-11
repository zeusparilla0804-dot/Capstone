import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { CustomerNotificationsService } from './customer-notifications.service';
import { CustomerAccountScopeService } from './customer-account-scope.service';

const item = { id: 'qr:42:1', title: 'Your payment QR is ready', message: 'View your QR.', reference: 'BK-42', createdAt: '2026-11-08', isRead: false, link: '/my-bookings/42/payment' };
describe('CustomerNotificationsService', () => {
  let service: CustomerNotificationsService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(CustomerNotificationsService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('keeps unread updates until acknowledged and preserves them after a failed read request', () => {
    service.refresh(); http.expectOne(`${environment.apiBaseUrl}/notifications`).flush({ data: [item] });
    expect(service.unreadCount()).toBe(1);
    service.markAllRead(); http.expectOne(`${environment.apiBaseUrl}/notifications/read`).flush({}, { status: 500, statusText: 'Error' });
    expect(service.unreadCount()).toBe(1);
    service.markAllRead();
    const request = http.expectOne(`${environment.apiBaseUrl}/notifications/read`);
    expect(request.request.body).toEqual({ ids: [item.id] }); request.flush({ success: true });
    expect(service.unreadCount()).toBe(0);
  });
  it('clears updates and cancels pending reads when the signed-in account changes', () => {
    service.refresh(); http.expectOne(`${environment.apiBaseUrl}/notifications`).flush({ data: [item] });
    service.refresh(); const pending = http.expectOne(`${environment.apiBaseUrl}/notifications`);
    TestBed.inject(CustomerAccountScopeService).setPrincipal('another-customer');
    expect(service.items()).toEqual([]); expect(service.unreadCount()).toBe(0); expect(pending.cancelled).toBe(true);
  });
});
