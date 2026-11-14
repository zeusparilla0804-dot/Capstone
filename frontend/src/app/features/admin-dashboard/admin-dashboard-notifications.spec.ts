import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminBadgeRefreshService } from '../../core/services/admin-badge-refresh.service';
import { AdminService } from '../../core/services/admin.service';
import { AdminDashboardPageComponent } from './admin-dashboard.page';

const item = { id: 'email:4', type: 'EMAIL', title: 'Delivery failed', message: 'Review the failed delivery.', reference: 'LC-0042', createdAt: '2026-11-14T02:30:00Z', isRead: false, link: '/admin/email-outbox?status=FAILED' };
describe('Overview notification inbox', () => {
  let fixture: ComponentFixture<AdminDashboardPageComponent>;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;
  const getFeed = () => http.expectOne(request => request.url.endsWith('/admin/notifications'));
  const feed = (items: any[] = [item], page = 1, totalPages = 3) => getFeed().flush({ success: true, data: { items, page, pageSize: 20, totalItems: 41, totalPages, unreadCount: 25 } });
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AdminDashboardPageComponent], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: AdminAuthService, useValue: { user: signal({ id: '7', fullName: 'Admin' }), sessionVersion: 1 } },
      { provide: AdminBadgeRefreshService, useValue: {} },
      { provide: AdminService, useValue: { dashboard: () => of({ success: true, data: {
        period: '2026-11', priority: { pendingBookingReviews: 4, proofsAwaitingVerification: 3, outstandingBalanceTotal: 125000, failedEmailNotifications: 1 },
        ledger: { confirmedRevenue: 285000, submittedProofValue: 45000, overdueOutstanding: 12000 },
        actionQueues: [{ key: 'pendingBookings', count: 4 }, { key: 'submittedProofs', count: 3 }], attention: []
      } }) } }
    ] }).compileComponents();
    http = TestBed.inject(HttpTestingController); navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(AdminDashboardPageComponent); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); http.verify(); });
  it('shows global unopened count on Overview while preserving existing queue counts and never auto-reading', () => {
    feed(); fixture.detectChanges(); const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('a[href="/admin/dashboard"] .dashboard-sidebar__badge')?.textContent?.trim()).toBe('25');
    expect(root.querySelector('a[href="/admin/dashboard"] .dashboard-sidebar__badge')?.getAttribute('aria-label')).toBe('25 unread notifications');
    expect(root.querySelector('a[href="/admin/bookings"] .dashboard-sidebar__badge')?.textContent?.trim()).toBe('4');
    expect(root.querySelector('a[href="/admin/payments"] .dashboard-sidebar__badge')?.textContent?.trim()).toBe('3');
    expect(root.querySelector('.recent-activity')?.textContent).toContain('Delivery failed');
    http.expectNone(request => request.method === 'POST');
  });
  it('keeps an unopened item on a failed read and opens its safe route/query only after retry succeeds', () => {
    feed(); fixture.detectChanges();
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('.recent-activity li a');
    expect(link.getAttribute('href')).toBe('/admin/email-outbox?status=FAILED');
    link.click(); http.expectOne(request => request.url.endsWith('/notifications/read')).flush({}, { status: 500, statusText: 'Error' }); fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled(); expect(fixture.nativeElement.querySelector('.notification-unread')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.recent-activity [role="alert"]')).not.toBeNull();
    link.click(); const request = http.expectOne(request => request.url.endsWith('/notifications/read')); expect(request.request.body).toEqual({ ids: ['email:4'] });
    request.flush({ success: true });
    expect(navigate).toHaveBeenCalledWith(['/admin/email-outbox'], { queryParams: { status: 'FAILED' } });
    feed([{ ...item, isRead: true }]);
  });
  it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }])('preserves native modified-link behavior while acknowledging without navigating the original tab: %j', modifier => {
    feed(); fixture.detectChanges();
    const event = new MouseEvent('click', { cancelable: true, ...modifier });
    (fixture.componentInstance as any).openNotification(event, item);
    expect(event.defaultPrevented).toBe(false);
    const read = http.expectOne(request => request.url.endsWith('/notifications/read'));
    expect(read.request.body).toEqual({ ids: ['email:4'] }); expect(navigate).not.toHaveBeenCalled();
    read.flush({ success: true }); feed([{ ...item, isRead: true }]);
    expect(navigate).not.toHaveBeenCalled();
  });
  it('offers All and Unread filters plus previous/next navigation independent of reporting month', () => {
    feed(); fixture.detectChanges();
    fixture.nativeElement.querySelector('[aria-label="Next notification page"]').click();
    const next = getFeed(); expect(next.request.params.get('page')).toBe('2');
    next.flush({ success: true, data: { items: [item], page: 2, pageSize: 20, totalItems: 41, totalPages: 3, unreadCount: 25 } }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.notification-pagination')?.textContent).toContain('Page 2 of 3');
    fixture.nativeElement.querySelector('[aria-label="Previous notification page"]').click(); feed(); fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-notification-filter="unread"]').click();
    const unread = getFeed(); expect(unread.request.params.get('page')).toBe('1'); expect(unread.request.params.get('unreadOnly')).toBe('true');
    unread.flush({ success: true, data: { items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0, unreadCount: 0 } }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.recent-activity')?.textContent).toContain('No unread notifications');
    fixture.nativeElement.querySelector('[data-notification-filter="all"]').click(); feed(); fixture.detectChanges();
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit')); fixture.detectChanges();
    http.expectNone(request => request.url.endsWith('/admin/notifications'));
  });
  it('shows Philippine AM/PM timestamps and a neutral label for legacy records without dates', () => {
    feed([item, { ...item, id: 'legacy:2', createdAt: null, isRead: true, link: 'https://example.com' }]); fixture.detectChanges();
    const section: HTMLElement = fixture.nativeElement.querySelector('.recent-activity');
    expect(section.querySelector('time')?.textContent).toContain('10:30 AM');
    expect(section.textContent).toContain('Date unavailable');
    expect(section.querySelector('a[href^="https:"]')).toBeNull();
  });
  it('offers retry after a failed feed load and retains records after a failed refresh', () => {
    getFeed().flush({}, { status: 500, statusText: 'Error' }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.recent-activity [role="alert"]')).not.toBeNull();
    fixture.nativeElement.querySelector('.recent-activity [role="alert"] button').click(); feed(); fixture.detectChanges();
    window.dispatchEvent(new Event('focus')); getFeed().flush({}, { status: 500, statusText: 'Error' }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.recent-activity')?.textContent).toContain('Delivery failed');
    expect(fixture.nativeElement.querySelector('.recent-activity [role="alert"]')).not.toBeNull();
  });
});
