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
  it('filters by source type and read status while the unread badge and mark-all include every category', () => {
    const items = [item,
      { ...item, id: 'email:1', type: 'PAYMENT_RECORDED', link: '/my-bookings' },
      { ...item, id: 'email:2', type: 'BOOKING_APPROVED', link: '/my-bookings', isRead: true },
      { ...item, id: 'email:3', type: 'BOOKING_RECEIVED', link: '/my-bookings' },
      { ...item, id: 'email:4', type: 'INVOICE_ISSUED', link: '/my-bookings', isRead: true }];
    service.refresh(); http.expectOne(`${environment.apiBaseUrl}/notifications`).flush({ data: items });
    service.setCategory('payments'); service.setReadStatus('unread');
    expect(service.filteredItems().map((record: any) => record.id)).toEqual(['qr:42:1', 'email:1']);
    expect(service.unreadCount()).toBe(3);
    service.setReadStatus('read'); expect(service.filteredItems().map(record => record.id)).toEqual(['email:4']);
    service.markAllRead(); const read = http.expectOne(`${environment.apiBaseUrl}/notifications/read`);
    expect(read.request.body).toEqual({ ids: ['qr:42:1', 'email:1', 'email:3'] }); read.flush({ success: true });
    expect(service.filteredItems()).toHaveLength(3); expect(service.unreadCount()).toBe(0);
    TestBed.inject(CustomerAccountScopeService).setPrincipal('another-customer');
    expect(service.readStatus()).toBe('all'); expect(service.category()).toBe('all');
  });
  it('cancels an older refresh after a successful read so late unread rows cannot restore the badge', () => {
    service.refresh(); http.expectOne(`${environment.apiBaseUrl}/notifications`).flush({ data: [item] });
    service.refresh(); const stale = http.expectOne(`${environment.apiBaseUrl}/notifications`);
    service.markRead([item.id]); http.expectOne(`${environment.apiBaseUrl}/notifications/read`).flush({ success: true });
    expect(stale.cancelled).toBe(true); expect(service.unreadCount()).toBe(0);
    service.refresh(); http.expectOne(`${environment.apiBaseUrl}/notifications`).flush({ data: [{ ...item, isRead: true }] });
  });
});
