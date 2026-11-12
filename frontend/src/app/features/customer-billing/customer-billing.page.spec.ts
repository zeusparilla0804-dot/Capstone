import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Booking } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { BookingService } from '../../core/services/booking.service';
import { CustomerBillingPageComponent } from './customer-billing.page';

const booking: Booking = {
  id: '17', invoiceId: 9, reference: 'LAC-0017', customerId: '42', eventName: 'Birthday Celebration',
  eventType: 'birthday', eventDate: '2027-02-12', eventTime: '14:00', venue: 'Santa Rosa', guestCount: 20,
  package: { packageId: '3', packageName: 'Classic Package', pricingType: 'PER_HEAD', pricePerGuest: 500,
    basePrice: null, includedGuests: null, excessGuestPrice: null, packageTotal: 10000 }, addOns: [], discount: 0,
  status: 'awaiting_payment', paymentMethod: 'cash', amountPaid: 3000, createdAt: '2026-10-04T00:00:00Z',
  thumbnailUrl: 'assets/images/packages/basic-package.webp',
};

describe('CustomerBillingPageComponent', () => {
  it('uses the approved warm ivory customer portal background', async () => {
    const bookingService = {
      bookings: signal<readonly Booking[]>([]), loading: signal(false), error: signal(''),
      loadMine: () => undefined,
    };
    const auth = {
      user: signal({ id: '42', fullName: 'Zeus Parilla', email: 'parilla@gmail.com', role: 'customer' as const }),
      logout: async () => undefined,
    };
    TestBed.configureTestingModule({
      imports: [CustomerBillingPageComponent],
      providers: [provideRouter([]), { provide: BookingService, useValue: bookingService }, { provide: AuthService, useValue: auth }],
    });

    const fixture = TestBed.createComponent(CustomerBillingPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const page = fixture.nativeElement.querySelector('.billing-layout') as HTMLElement;
    const sidebar = fixture.nativeElement.querySelector('.dashboard-sidebar') as HTMLElement;
    expect(getComputedStyle(page).backgroundColor).toBe('rgb(247, 245, 239)');
    expect(sidebar.classList).toContain('dashboard-sidebar--editorial');
    expect(sidebar.querySelector('.dashboard-sidebar__editorial-brand')?.textContent).toContain('Event Catering Services');
    expect(sidebar.querySelector('a.dashboard-sidebar__profile')).not.toBeNull();
  });

  it('shows calculated payment totals and status-specific record actions', async () => {
    const submittedBooking: Booking = {
      ...booking,
      id: '18',
      invoiceId: 10,
      reference: 'LAC-0018',
      status: 'payment_submitted',
      paymentMethod: 'bank-transfer',
    };
    const cancelledBooking: Booking = {
      ...booking,
      id: '19',
      invoiceId: undefined,
      reference: 'LAC-0019',
      status: 'cancelled',
      amountPaid: 0,
    };
    const bookingService = {
      bookings: signal<readonly Booking[]>([booking, submittedBooking, cancelledBooking]), loading: signal(false), error: signal(''),
      loadMine: () => undefined,
    };
    const auth = {
      user: signal({ id: '42', fullName: 'Zeus Parilla', email: 'parilla@gmail.com', role: 'customer' as const }),
      logout: async () => undefined,
    };
    TestBed.configureTestingModule({
      imports: [CustomerBillingPageComponent],
      providers: [provideRouter([]), { provide: BookingService, useValue: bookingService }, { provide: AuthService, useValue: auth }],
    });

    const fixture = TestBed.createComponent(CustomerBillingPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const content = fixture.nativeElement.textContent as string;
    expect(content).toContain('₱10,000');
    expect(content).toContain('₱7,000');
    expect(fixture.nativeElement.querySelector('a[href="/invoice/9"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a[href="/my-bookings/17/payment"]')?.textContent.trim()).toBe('View Cash Instructions');
    expect(fixture.nativeElement.querySelector('a[href="/my-bookings/18/payment"]')?.textContent.trim()).toBe('View Payment');
    const summaryValues = [...fixture.nativeElement.querySelectorAll('.billing-summary dd')]
      .map((element: Element) => element.textContent?.trim());
    expect(summaryValues.at(-1)).toBe('₱14,000');
    expect([...fixture.nativeElement.querySelectorAll('.billing-record .status-badge')]
      .map((element: Element) => element.textContent!.trim()))
      .toEqual(['Down Payment Incomplete', 'Pending Payment Verification', 'Cancelled']);
  });

  it('hides Submit Payment for a completed booking with a verified down payment', async () => {
    const bookingService = {
      bookings: signal<readonly Booking[]>([{
        ...booking, status: 'completed', paymentMethod: 'bank-transfer', amountPaid: 5000,
      }]),
      loading: signal(false), error: signal(''), loadMine: () => undefined,
    };
    const auth = {
      user: signal({ id: '42', fullName: 'Zeus Parilla', email: 'parilla@gmail.com', role: 'customer' as const }),
      logout: async () => undefined,
    };
    TestBed.configureTestingModule({
      imports: [CustomerBillingPageComponent],
      providers: [provideRouter([]), { provide: BookingService, useValue: bookingService }, { provide: AuthService, useValue: auth }],
    });

    const fixture = TestBed.createComponent(CustomerBillingPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const record = fixture.nativeElement.querySelector('.billing-record') as HTMLElement;
    expect(record.textContent).toContain('₱5,000');
    const side = record.querySelector('.billing-record__side') as HTMLElement;
    expect(side.firstElementChild?.tagName).toBe('APP-STATUS-BADGE');
    expect(side.querySelector('a[href="/invoice/9"]')).not.toBeNull();
    expect(record.querySelector('a[href="/my-bookings/17/payment"]')).toBeNull();
  });

  it('shows the most recently created booking first regardless of event date', async () => {
    const newerBooking: Booking = {
      ...booking,
      id: '18', reference: 'LAC-0018', eventDate: '2026-11-10', createdAt: '2026-11-06T10:00:00Z',
    };
    const bookingService = {
      bookings: signal<readonly Booking[]>([booking, newerBooking]),
      loading: signal(false), error: signal(''), loadMine: () => undefined,
    };
    const auth = {
      user: signal({ id: '42', fullName: 'Zeus Parilla', email: 'parilla@gmail.com', role: 'customer' as const }),
      logout: async () => undefined,
    };
    TestBed.configureTestingModule({
      imports: [CustomerBillingPageComponent],
      providers: [provideRouter([]), { provide: BookingService, useValue: bookingService }, { provide: AuthService, useValue: auth }],
    });

    const fixture = TestBed.createComponent(CustomerBillingPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const references = [...fixture.nativeElement.querySelectorAll('.billing-record__event > span')]
      .map((element: Element) => element.textContent?.trim());
    expect(references).toEqual(['LAC-0018', 'LAC-0017']);
  });
});
