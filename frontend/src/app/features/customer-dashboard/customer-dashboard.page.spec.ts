import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Booking } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { BookingService } from '../../core/services/booking.service';
import { PortalBadgeStateService } from '../../core/services/portal-badge-state.service';
import { CustomerDashboardPageComponent } from './customer-dashboard.page';

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: '10',
    invoiceId: 18,
    reference: 'LC-0010',
    customerId: '5',
    eventName: 'Parilla Family Wedding',
    eventType: 'wedding',
    eventDate: '2026-12-20',
    eventTime: '2:00 PM',
    venue: 'Santa Rosa, Laguna',
    guestCount: 50,
    package: {
      packageId: '4',
      packageName: 'Amethyst Package',
      pricingType: 'PER_HEAD',
      pricePerGuest: 1000,
      basePrice: null,
      includedGuests: null,
      excessGuestPrice: null,
      packageTotal: 50000,
    },
    addOns: [],
    discount: 0,
    status: 'pending',
    amountPaid: 10000,
    createdAt: '2026-10-01T08:00:00Z',
    thumbnailUrl: 'assets/images/packages/premium-package.webp',
    ...overrides,
  };
}

describe('CustomerDashboardPageComponent', () => {
  let fixture: ComponentFixture<CustomerDashboardPageComponent>;
  let bookings: ReturnType<typeof signal<readonly Booking[]>>;
  let loading: ReturnType<typeof signal<boolean>>;
  let error: ReturnType<typeof signal<string>>;
  let loadMine: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    bookings = signal<readonly Booking[]>([
      booking({ id: '20', eventName: 'Later Birthday', eventDate: '2027-02-14' }),
      booking(),
    ]);
    loading = signal(false);
    error = signal('');
    loadMine = vi.fn();
    const bookingService = {
      bookings: bookings.asReadonly(),
      loading,
      error,
      loadMine,
      getBookingsByTab: (tab: string) => tab === 'upcoming'
        ? [...bookings()].filter(item => !['completed', 'cancelled', 'rejected'].includes(item.status)).sort((a, b) => a.eventDate.localeCompare(b.eventDate))
        : [],
    };
    const auth = {
      user: signal({ id: '5', fullName: 'Zeus Parilla', email: 'zeus@example.test', role: 'customer' as const }),
      logout: vi.fn(async () => undefined),
    };

    await TestBed.configureTestingModule({
      imports: [CustomerDashboardPageComponent],
      providers: [
        provideRouter([]),
        { provide: BookingService, useValue: bookingService },
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CustomerDashboardPageComponent);
    fixture.detectChanges();
  });

  it('prioritizes the nearest real event and its Philippine billing values', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Welcome back, Zeus');
    expect(text).toContain('Parilla Family Wedding');
    expect(text).toContain('Santa Rosa, Laguna');
    expect(text).toContain('50 guests');
    expect(text).toContain('PHP 50,000');
    expect(text).toContain('PHP 10,000');
    expect(text).toContain('PHP 40,000');
    expect(text).not.toContain('Malibu');
    expect(text).not.toContain('$');
    expect(text).not.toMatch(/quotation/i);
    expect(text).toContain('Reservation review');
    expect(text).toContain('Reservation total');
  });

  it('derives planning progress and the navigation count from booking status', () => {
    expect(fixture.nativeElement.querySelector('[data-step="review"]')?.getAttribute('aria-current')).toBe('step');
    expect(fixture.nativeElement.querySelector('a[href="/my-bookings"] .dashboard-sidebar__badge')?.textContent.trim()).toBe('2');
    expect(TestBed.inject(PortalBadgeStateService).customerBookingCount()).toBe(2);

    bookings.set([booking({ status: 'payment_submitted' })]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-step="payment"]')?.getAttribute('aria-current')).toBe('step');

    bookings.set([booking({ status: 'confirmed' })]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.planning-step.is-complete')).toHaveLength(3);
  });

  it('shows only the approved customer portal navigation labels', () => {
    const labels = Array.from(fixture.nativeElement.querySelectorAll('.dashboard-sidebar__label'))
      .map((item: unknown) => (item as HTMLElement).textContent?.trim());
    expect(labels).toEqual(['Dashboard', 'My Reservations', 'Billing & Payments', 'Profile', 'Logout']);
  });

  it('keeps loading, error retry, and empty states mutually exclusive', () => {
    loading.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain('Loading');
    expect(fixture.nativeElement.querySelector('.next-event')).toBeNull();

    loading.set(false);
    error.set('Unable to load your bookings.');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Unable to load');
    (fixture.nativeElement.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    expect(loadMine).toHaveBeenCalledTimes(2);

    error.set('');
    bookings.set([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No reservations yet');
    expect(fixture.nativeElement.querySelector('.next-event')).toBeNull();
  });
});
