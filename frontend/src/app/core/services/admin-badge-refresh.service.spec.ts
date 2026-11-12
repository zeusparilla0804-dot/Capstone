import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AdminAuthService } from './admin-auth.service';
import { PortalBadgeStateService } from './portal-badge-state.service';
import { AdminBadgeRefreshService } from './admin-badge-refresh.service';

describe('AdminBadgeRefreshService', () => {
  it('refreshes badges on any admin page and clears counts on sign-out', async () => {
    const user = signal<any>({ id: '7' });
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AdminAuthService, useValue: { user } }] });
    TestBed.inject(AdminBadgeRefreshService);
    TestBed.tick();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(request => request.url.endsWith('/admin/dashboard')).flush({ data: { priority: {
      pendingBookingReviews: 1, proofsAwaitingVerification: 2, failedEmailNotifications: 0, qrAssignmentsWaiting: 3
    } } });
    const badges = TestBed.inject(PortalBadgeStateService);
    expect(badges.adminBadges().qrAssignments).toBe(3);
    window.dispatchEvent(new Event('focus'));
    http.expectOne(request => request.url.endsWith('/admin/dashboard')).flush({ data: { priority: {
      pendingBookingReviews: 0, proofsAwaitingVerification: 0, failedEmailNotifications: 0, qrAssignmentsWaiting: 0
    } } });
    expect(badges.adminBadges().qrAssignments).toBe(0);
    user.set(null); TestBed.tick();
    expect(badges.adminBadges().bookings).toBe(0);
    http.verify();
  });
});
