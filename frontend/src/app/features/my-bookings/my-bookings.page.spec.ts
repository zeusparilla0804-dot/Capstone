import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Booking } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { BookingService } from '../../core/services/booking.service';
import { MyBookingsPageComponent } from './my-bookings.page';

describe('MyBookingsPage cancellation', () => {
  const booking: Booking = {
    id: '5', reference: 'LC-5', customerId: '7', eventName: 'Wedding Event', eventType: 'wedding',
    eventDate: '2026-10-10', eventTime: '12:00', venue: 'Venue', guestCount: 50,
    package: { packageId: '1', packageName: 'Package', pricePerGuest: 200 }, addOns: [],
    discount: 0, status: 'pending', amountPaid: 0, createdAt: '2026-10-01', thumbnailUrl: 'test.png'
  };
  const calls: { id: string; reason?: string }[] = [];

  beforeEach(() => {
    calls.length = 0;
    TestBed.configureTestingModule({
      imports: [MyBookingsPageComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user: signal({ fullName: 'Customer' }), logout: async () => {} } },
        { provide: BookingService, useValue: {
          loading: signal(false), error: signal(''), loadMine: () => {},
          getBookingsByTab: (tab: string) => tab === 'upcoming' ? [booking] : [],
          cancelBooking: async (id: string, reason?: string) => { calls.push({ id, reason }); return true; }
        } }
      ]
    });
  });

  it('collects an accessible cancellation reason and sends it with the action', async () => {
    const fixture = TestBed.createComponent(MyBookingsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.booking-card__cancel') as HTMLButtonElement).click();
    fixture.detectChanges();
    const reason = fixture.nativeElement.querySelector('#cancel-reason') as HTMLTextAreaElement;
    expect(reason).toBeTruthy();
    expect(fixture.nativeElement.querySelector('label[for="cancel-reason"]')).toBeTruthy();
    const confirm = fixture.nativeElement.querySelector('[data-testid="confirm-cancellation"]') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    reason.value = '  Plans changed  ';
    reason.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(confirm.disabled).toBe(false);
    confirm.click();
    await fixture.whenStable();
    expect(calls).toEqual([{ id: '5', reason: 'Plans changed' }]);
  });
});
