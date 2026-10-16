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
    package: { packageId: '1', packageName: 'Package', pricingType: 'PER_HEAD', pricePerGuest: 200,
      basePrice: null, includedGuests: null, excessGuestPrice: null, packageTotal: 10000 }, addOns: [],
    discount: 0, status: 'pending', amountPaid: 0, createdAt: '2026-10-01', thumbnailUrl: 'test.png'
  };
  const rejectedBooking: Booking = { ...booking, id: '6', reference: 'LC-6', status: 'rejected' };
  const calls: { id: string; reason?: string }[] = [];

  beforeEach(() => {
    calls.length = 0;
    TestBed.configureTestingModule({
      imports: [MyBookingsPageComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user: signal({ fullName: 'Customer' }), logout: async () => {} } },
        { provide: BookingService, useValue: {
          bookings: signal([booking, rejectedBooking]), loading: signal(false), error: signal(''), loadMine: () => {},
          getBookingsByTab: (tab: string) => tab === 'upcoming' ? [booking] : tab === 'rejected' ? [rejectedBooking] : [],
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

  it('shows rejected bookings under a distinct labeled tab with their own count', async () => {
    const fixture = TestBed.createComponent(MyBookingsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const tabs = Array.from(fixture.nativeElement.querySelectorAll('.booking-tabs button')) as HTMLButtonElement[];
    const rejected = tabs.find(tab => tab.textContent?.trim() === 'Rejected');
    expect(rejected).toBeTruthy();
    rejected?.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.booking-count').textContent?.trim()).toBe('1 reservation');
    expect(fixture.nativeElement.querySelector('.booking-card .status-badge').textContent?.trim()).toBe('Rejected');
    tabs.find(tab => tab.textContent?.trim() === 'Cancelled')?.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.booking-count').textContent?.trim()).toBe('0 reservations');
  });

  it('keeps only the selected tab in the Tab order and focuses click selections', async () => {
    const fixture = TestBed.createComponent(MyBookingsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs.map(tab => tab.tabIndex)).toEqual([0, -1, -1, -1]);
    expect(tabs.map(tab => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false']);

    tabs[0]!.focus();
    tabs[3]!.click();
    fixture.detectChanges();
    expect(tabs.map(tab => tab.tabIndex)).toEqual([-1, -1, -1, 0]);
    expect(tabs.map(tab => tab.getAttribute('aria-selected'))).toEqual(['false', 'false', 'false', 'true']);
    expect(document.activeElement).toBe(tabs[3]);
    expect(root.querySelector('.booking-card .status-badge')?.textContent?.trim()).toBe('Rejected');
  });

  for (const { key, start, target, label } of [
    { key: 'ArrowRight', start: 0, target: 1, label: 'Past' },
    { key: 'ArrowLeft', start: 2, target: 1, label: 'Past' },
    { key: 'ArrowRight', start: 3, target: 0, label: 'Upcoming' },
    { key: 'ArrowLeft', start: 0, target: 3, label: 'Rejected' },
    { key: 'Home', start: 2, target: 0, label: 'Upcoming' },
    { key: 'End', start: 1, target: 3, label: 'Rejected' },
  ]) {
    it(`selects and focuses ${label} with ${key} from tab ${start}`, async () => {
      const fixture = TestBed.createComponent(MyBookingsPageComponent);
      await fixture.whenStable();
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
      tabs[start]!.click();
      fixture.detectChanges();
      tabs[start]!.focus();
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      tabs[start]!.dispatchEvent(event);
      fixture.detectChanges();

      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(tabs[target]);
      expect(tabs[target]!.textContent?.trim()).toBe(label);
      expect(tabs.map(tab => tab.tabIndex)).toEqual(tabs.map((_, index) => index === target ? 0 : -1));
      expect(tabs.map(tab => tab.getAttribute('aria-selected'))).toEqual(tabs.map((_, index) => index === target ? 'true' : 'false'));
      if (label === 'Upcoming') {
        expect(root.querySelector('.booking-card__cancel')).toBeTruthy();
      } else if (label === 'Rejected') {
        expect(root.querySelector('.booking-card .status-badge')?.textContent?.trim()).toBe('Rejected');
      } else {
        expect(root.querySelector('.booking-empty h2')?.textContent?.trim()).toBe('No past reservations');
      }
    });
  }

  it('links every stable tab ID to the panel and labels its populated and empty states', async () => {
    const fixture = TestBed.createComponent(MyBookingsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const ids = tabs.map(tab => tab.id);
    expect(ids.every(id => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(4);
    const panel = root.querySelector<HTMLElement>('[role="tabpanel"]');
    expect(panel).toBeTruthy();
    expect(panel!.id.length).toBeGreaterThan(0);

    for (const tab of tabs) {
      tab.click();
      fixture.detectChanges();
      expect(root.querySelectorAll('[role="tabpanel"]').length).toBe(1);
      expect(root.querySelector('[role="tabpanel"]')).toBe(panel);
      expect(tabs.map(button => button.id)).toEqual(ids);
      expect(tabs.map(button => button.getAttribute('aria-controls'))).toEqual([panel!.id, panel!.id, panel!.id, panel!.id]);
      expect(panel!.getAttribute('aria-labelledby')).toBe(tab.id);
      expect(panel!.contains(root.querySelector('.booking-count'))).toBe(true);
      expect(panel!.querySelector('.booking-list, .booking-empty')).toBeTruthy();
      expect(panel!.tabIndex).toBe(0);
    }
  });

  it('leaves Tab and vertical arrow keys to the browser without changing selection', async () => {
    const fixture = TestBed.createComponent(MyBookingsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const tabs = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    tabs[0]!.focus();
    for (const key of ['Tab', 'ArrowUp', 'ArrowDown']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      tabs[0]!.dispatchEvent(event);
      fixture.detectChanges();
      expect(event.defaultPrevented).toBe(false);
      expect(tabs.map(tab => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false']);
      expect(document.activeElement).toBe(tabs[0]);
    }
  });
});
