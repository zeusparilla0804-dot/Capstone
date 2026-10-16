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
  it('shows calculated payment totals and status-specific record actions', async () => {
    const submittedBooking: Booking = {
      ...booking,
      id: '18',
      invoiceId: 10,
      reference: 'LAC-0018',
      status: 'payment_submitted',
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
    expect(content).toContain('PHP 10,000');
    expect(content).toContain('PHP 7,000');
    expect(fixture.nativeElement.querySelector('a[href="/invoice/9"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a[href="/my-bookings/17/payment"]')?.textContent.trim()).toBe('Submit Payment');
    expect(fixture.nativeElement.querySelector('a[href="/my-bookings/18/payment"]')?.textContent.trim()).toBe('View Payment');
    const summaryValues = [...fixture.nativeElement.querySelectorAll('.billing-summary dd')]
      .map((element: Element) => element.textContent?.trim());
    expect(summaryValues.at(-1)).toBe('PHP 14,000');
  });
});
