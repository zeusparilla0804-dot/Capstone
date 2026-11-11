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

  it('uses the approved warm ivory customer portal background', () => {
    const page = fixture.nativeElement.querySelector('.dashboard-layout') as HTMLElement;

    expect(getComputedStyle(page).backgroundColor).toBe('rgb(247, 245, 239)');
  });

  it('refreshes payment requests without repeating a banner above the dashboard', () => {
    bookings.set([booking({ status: 'approved', paymentMethod: undefined, amountPaid: 0 })]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.payment-ready-notice')).toBeNull();
    bookings.set([booking({ status: 'awaiting_payment', paymentMethod: undefined, amountPaid: 0 })]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.payment-ready-notice')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Payment requested for booking');
    window.dispatchEvent(new Event('focus'));
    expect(loadMine).toHaveBeenCalledTimes(2);
    bookings.set([booking({ status: 'awaiting_payment', paymentMethod: 'gcash' })]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.payment-ready-notice')).toBeNull();
  });

  it('uses verified amounts for payment badges without confirming the reservation', () => {
    bookings.set([booking({ status: 'payment_verified', amountPaid: 25000 })]);
    fixture.detectChanges();
    expect(loadMine).toHaveBeenCalledOnce();
    const status = () => fixture.nativeElement.querySelector('.booking-table__row .status-badge') as HTMLElement;
    expect(status().textContent!.trim()).toBe('Down Payment Paid');
    expect(fixture.nativeElement.querySelector('[data-step="payment"]').textContent).toContain('Verified');
    bookings.set([booking({ status: 'payment_verified', amountPaid: 50000 })]);
    fixture.detectChanges();
    expect(status().textContent!.trim()).toBe('Fully Paid');
    expect(fixture.nativeElement.querySelector('.billing-summary__balance dd').textContent).toContain('PHP 0');
    expect(bookings()[0]!.status).toBe('payment_verified');
    bookings.set([booking({ status: 'payment_submitted', amountPaid: 0 })]);
    fixture.detectChanges();
    expect(status().textContent!.trim()).toBe('Pending Payment Verification');
  });

  it('prioritizes the nearest real event and its Philippine billing values', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Welcome, Zeus');
    expect(text).toContain('Parilla Family Wedding');
    expect(text).toContain('Santa Rosa, Laguna');
    expect(text).toContain('50 Guests');
    expect(text).toContain('PHP 50,000');
    expect(text).toContain('PHP 10,000');
    expect(text).toContain('PHP 40,000');
    expect(text).not.toContain('Malibu');
    expect(text).not.toContain('$');
    expect(text).not.toMatch(/quotation/i);
    expect(text).toContain('Reservation review');
    expect(text).toContain('Reservation total');
  });

  it('uses the approved image-led event feature and warm ivory billing panel', () => {
    const feature = fixture.nativeElement.querySelector('.next-event__feature') as HTMLElement;
    const detailCard = feature?.querySelector('.next-event__card') as HTMLElement;
    const featureImage = feature?.querySelector(':scope > img') as HTMLImageElement;
    const heading = fixture.nativeElement.querySelector('#next-event-title') as HTMLElement;
    const cardHeader = detailCard.querySelector('.next-event__card-header') as HTMLElement;
    const viewLink = detailCard.querySelector('.next-event__action[href="/my-bookings"]') as HTMLAnchorElement | null;
    const billing = fixture.nativeElement.querySelector('.billing-summary') as HTMLElement;
    const eventTitle = detailCard.querySelector('h3') as HTMLElement;
    const detailList = detailCard.querySelector('dl') as HTMLElement;
    const detailRows = [...detailCard.querySelectorAll('dl > div')] as HTMLElement[];

    expect(heading?.textContent?.trim()).toBe('Your Next Event');
    expect(featureImage).not.toBeNull();
    expect(getComputedStyle(featureImage).objectFit).toBe('cover');
    expect(detailCard?.textContent).toContain('Parilla Family Wedding');
    expect(detailCard?.classList).not.toContain('next-event__card--overlay');
    expect(getComputedStyle(detailCard).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(getComputedStyle(feature).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(getComputedStyle(detailCard).borderLeftStyle).toBe('solid');
    expect(getComputedStyle(eventTitle).color).toBe('rgb(23, 24, 20)');
    expect(getComputedStyle(eventTitle).textAlign).toBe('left');
    expect(getComputedStyle(cardHeader).maxWidth).toBe('360px');
    expect(getComputedStyle(cardHeader).marginInline).toBe('auto');
    expect(['', 'none']).toContain(getComputedStyle(cardHeader).transform);
    expect(fixture.nativeElement.querySelector('.next-event__heading a[href="/my-bookings"]')).toBeNull();
    expect(viewLink).toBeNull();
    expect(detailList.nextElementSibling).toBeNull();
    expect(getComputedStyle(detailList).justifyItems).toBe('stretch');
    expect(getComputedStyle(detailList).maxWidth).toBe('360px');
    expect(getComputedStyle(detailList).marginInline).toBe('auto');
    expect(['', 'none']).toContain(getComputedStyle(detailList).transform);
    for (const row of detailRows) {
      expect(getComputedStyle(row).justifyContent).toBe('start');
      expect(getComputedStyle(row).textAlign).toBe('left');
    }
    expect(getComputedStyle(billing).backgroundColor).toBe('rgb(251, 249, 243)');
    expect(getComputedStyle(billing).color).toBe('rgb(23, 24, 20)');
    expect(getComputedStyle(billing).alignSelf).toBe('center');
  });

  it('keeps the dashboard free of duplicate reservation shortcuts', () => {
    expect(fixture.nativeElement.querySelector('.upcoming .section-heading a[href="/my-bookings"]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('a[href="/my-bookings"]')).toHaveLength(1);
  });

  it('matches the approved editorial dashboard composition', () => {
    const sidebarHost = fixture.nativeElement.querySelector('app-dashboard-sidebar') as HTMLElement;
    const sidebar = fixture.nativeElement.querySelector('.dashboard-sidebar') as HTMLElement;
    const columns = [...fixture.nativeElement.querySelectorAll('.booking-table__head [role="columnheader"]')]
      .map((cell: unknown) => (cell as HTMLElement).textContent?.trim());

    expect(sidebar.classList).toContain('dashboard-sidebar--editorial');
    expect(getComputedStyle(sidebarHost).width).toBe('284px');
    expect(sidebar.querySelector('.dashboard-sidebar__editorial-brand')).not.toBeNull();
    const profile = sidebar.querySelector('a.dashboard-sidebar__profile') as HTMLAnchorElement;
    expect(profile).not.toBeNull();
    expect(profile.getAttribute('href')).toBe('/profile');
    expect(fixture.nativeElement.querySelector('.dashboard-header__ornament')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.event-detail__icon')).toHaveLength(4);
    expect(columns).toEqual(['Date', 'Event', 'Venue', 'Guests', 'Status']);
  });

  it('uses a refined text-only primary event action', () => {
    const action = fixture.nativeElement.querySelector('.dashboard-header__cta[href="/book-event?new=1"]') as HTMLAnchorElement;

    expect(action).not.toBeNull();
    expect(action.textContent?.trim()).toBe('Plan an Event');
    expect(action.querySelectorAll('span')).toHaveLength(1);
    expect(action.querySelector('svg')).toBeNull();
    expect(getComputedStyle(action).borderRadius).toBe('6px');
    expect(getComputedStyle(action).minHeight).toBe('44px');
  });

  it('matches the billing action to the premium text-only event action', () => {
    const action = fixture.nativeElement.querySelector('.billing-summary__action[href="/billing"]') as HTMLAnchorElement;

    expect(action).not.toBeNull();
    expect(action.textContent?.trim()).toBe('View Billing & Payments');
    expect(action.querySelectorAll('span')).toHaveLength(1);
    expect(action.querySelector('svg')).toBeNull();
  });

  it('contains the reservations table within its responsive column', () => {
    const upcoming = fixture.nativeElement.querySelector('.upcoming') as HTMLElement;
    const table = fixture.nativeElement.querySelector('.booking-table') as HTMLElement;

    expect(getComputedStyle(upcoming).minWidth).toBe('0px');
    expect(getComputedStyle(table).overflowX).toBe('auto');
  });

  it('keeps upcoming reservation columns evenly spaced and centered', () => {
    const head = fixture.nativeElement.querySelector('.booking-table__head') as HTMLElement;
    const row = fixture.nativeElement.querySelector('.booking-table__row') as HTMLElement;
    const headers = [...head.children] as HTMLElement[];
    const cells = [...row.children] as HTMLElement[];
    const statusBadge = cells[4].querySelector('app-status-badge') as HTMLElement;

    expect(getComputedStyle(head).gridTemplateColumns).toBe(getComputedStyle(row).gridTemplateColumns);
    expect(getComputedStyle(head).gridTemplateColumns).toBe('repeat(5, minmax(0, 1fr))');

    for (const header of headers) {
      expect(getComputedStyle(header).textAlign).toBe('center');
    }

    for (const cell of cells) {
      expect(getComputedStyle(cell).textAlign).toBe('center');
      expect(getComputedStyle(cell).width).toBe('100%');
    }

    expect(getComputedStyle(statusBadge).display).toBe('block');
    expect(getComputedStyle(statusBadge).marginInline).toBe('auto');
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

  it('keeps every reservation step marker aligned with a dedicated content block', () => {
    const steps = [...fixture.nativeElement.querySelectorAll('.planning-step')] as HTMLElement[];

    expect(steps).toHaveLength(3);
    for (const step of steps) {
      expect(step.querySelector(':scope > .planning-step__marker')).not.toBeNull();
      expect(step.querySelector(':scope > .planning-step__content')).not.toBeNull();
    }
  });

  it('uses a dedicated centered OK label inside completed reservation markers', () => {
    bookings.set([booking({ status: 'confirmed' })]);
    fixture.detectChanges();

    const markers = [...fixture.nativeElement.querySelectorAll('.planning-step.is-complete .planning-step__marker')] as HTMLElement[];
    expect(markers).toHaveLength(3);
    for (const marker of markers) {
      expect(marker.textContent?.trim()).toBe('OK');
      expect(marker.querySelector('.planning-step__status')?.textContent?.trim()).toBe('OK');
      expect(getComputedStyle(marker).display).toBe('grid');
    }
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
    expect(fixture.nativeElement.querySelectorAll('a[href="/book-event?new=1"]')).toHaveLength(1);
  });
});
