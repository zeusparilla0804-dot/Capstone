import { TestBed } from '@angular/core/testing';
import type { AdminDashboard, Booking } from '../models';
import { PortalBadgeStateService } from './portal-badge-state.service';
import { CustomerAccountScopeService } from './customer-account-scope.service';

describe('PortalBadgeStateService', () => {
  let service: PortalBadgeStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PortalBadgeStateService);
    service.reset();
  });

  it('maps existing admin priority counts to navigation badges', () => {
    service.setAdminDashboard({
      priority: {
        pendingBookingReviews: 4,
        proofsAwaitingVerification: 3,
        failedEmailNotifications: 2,
      },
    } as AdminDashboard);

    expect(service.adminBadges()).toEqual({ bookings: 4, payments: 3, emails: 2 });
  });

  it('counts only current customer bookings and ignores finished records', () => {
    const bookings = [
      { status: 'pending' },
      { status: 'awaiting_payment' },
      { status: 'confirmed' },
      { status: 'completed' },
      { status: 'cancelled' },
      { status: 'rejected' },
    ] as Booking[];

    service.setCustomerBookings(bookings);

    expect(service.customerBookingCount()).toBe(3);
  });

  it('clears the previous customer count synchronously when the account changes', () => {
    const scope = TestBed.inject(CustomerAccountScopeService);
    scope.setPrincipal('customer-a');
    service.setCustomerBookings([{ status: 'pending' }] as Booking[]);
    expect(service.customerBookingCount()).toBe(1);
    scope.setPrincipal('customer-b');
    expect(service.customerBookingCount()).toBe(0);
  });

  it('normalizes missing or negative counts and can reset session state', () => {
    service.setAdminDashboard({
      priority: {
        pendingBookingReviews: -3,
        proofsAwaitingVerification: 0,
        failedEmailNotifications: Number.NaN,
      },
    } as AdminDashboard);
    service.setCustomerBookings([{ status: 'pending' }] as Booking[]);

    expect(service.adminBadges()).toEqual({ bookings: 0, payments: 0, emails: 0 });
    service.reset();
    expect(service.adminBadges()).toEqual({ bookings: 0, payments: 0, emails: 0 });
    expect(service.customerBookingCount()).toBe(0);
  });
});
