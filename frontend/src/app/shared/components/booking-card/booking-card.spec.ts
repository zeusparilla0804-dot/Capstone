import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Booking } from '../../../core/models';
import { BookingCardComponent } from './booking-card';

const booking: Booking = {
  id: '27', reference: 'BK-EDIT', customerId: '', eventName: 'Wedding Event', eventType: 'wedding',
  eventDate: '2027-01-12', eventTime: '15:00', venue: 'Venue', guestCount: 75,
  package: { packageId: '10', packageName: 'Wedding Package', pricingType: 'PER_HEAD',
    pricePerGuest: 720, basePrice: null, includedGuests: null, excessGuestPrice: null, packageTotal: 54_000 },
  addOns: [], discount: 0, status: 'pending', amountPaid: 0,
  createdAt: '2026-10-10T00:00:00Z', thumbnailUrl: 'test.png',
};

describe('BookingCardComponent pending actions', () => {
  it('offers an edit link only while the booking is pending', () => {
    TestBed.configureTestingModule({ imports: [BookingCardComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(BookingCardComponent);
    fixture.componentRef.setInput('booking', booking);
    fixture.detectChanges();

    const edit = fixture.nativeElement.querySelector('[data-testid="edit-booking"]') as HTMLAnchorElement;
    expect(edit?.getAttribute('href')).toBe('/book-event?booking=27');

    fixture.componentRef.setInput('booking', { ...booking, status: 'approved' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="edit-booking"]')).toBeNull();
  });
});
