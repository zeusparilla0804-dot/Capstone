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

  it('moves focus to the reason field when cancellation opens', async () => {
    const fixture = TestBed.createComponent(MyBookingsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector('.booking-card__cancel') as HTMLButtonElement;
    trigger.focus();
    trigger.click();
    fixture.detectChanges();

    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#cancel-reason'));
  });

  it('keeps Tab and Shift+Tab inside the cancellation dialog', async () => {
    const fixture = TestBed.createComponent(MyBookingsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.booking-card__cancel') as HTMLButtonElement).click();
    fixture.detectChanges();
    const reason = fixture.nativeElement.querySelector('#cancel-reason') as HTMLTextAreaElement;
    const keep = fixture.nativeElement.querySelector('.cancel-dialog__actions .btn-secondary') as HTMLButtonElement;
    reason.focus();
    const backwards = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    reason.dispatchEvent(backwards);
    expect(backwards.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(keep);

    reason.value = 'Plans changed';
    reason.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const confirm = fixture.nativeElement.querySelector('[data-testid="confirm-cancellation"]') as HTMLButtonElement;
    confirm.focus();
    const forwards = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    confirm.dispatchEvent(forwards);
    expect(forwards.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(reason);
  });

  it('closes on Escape and returns focus to the exact cancel button', async () => {
    const fixture = TestBed.createComponent(MyBookingsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const unrelated = fixture.nativeElement.querySelector('.bookings-header a') as HTMLAnchorElement;
    const trigger = fixture.nativeElement.querySelector('.booking-card__cancel') as HTMLButtonElement;
    unrelated.focus();
    expect(document.activeElement).toBe(unrelated);
    trigger.click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.cancel-dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('moves focus to the cancelled tab after a successful cancellation removes the trigger', async () => {
    const fixture = TestBed.createComponent(MyBookingsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.booking-card__cancel') as HTMLButtonElement).click();
    fixture.detectChanges();
    const reason = fixture.nativeElement.querySelector('#cancel-reason') as HTMLTextAreaElement;
    reason.value = 'Plans changed';
    reason.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[data-testid="confirm-cancellation"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    const selected = fixture.nativeElement.querySelector('button[role="tab"][aria-selected="true"]') as HTMLButtonElement;
    expect(selected.textContent?.trim()).toBe('Cancelled');
    expect(document.activeElement).toBe(selected);
  });
});
