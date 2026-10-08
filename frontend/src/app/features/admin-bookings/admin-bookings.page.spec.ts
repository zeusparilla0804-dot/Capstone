import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminService } from '../../core/services/admin.service';
import { AdminBookingsPage } from './admin-bookings.page';

describe('AdminBookingsPage status actions', () => {
  const booking = {
    id: 5, reference: 'LC-5', customerName: 'Customer', eventType: 'Wedding', eventDate: '2026-10-10',
    guestCount: 50, total: 10000, status: 'PENDING',
    capacity: {
      date: '2026-10-10', guestCount: 50, status: 'AVAILABLE', activeBookingCount: 2,
      capacityLimit: 6, remainingRequestSlots: 4, requiresAdminConfirmation: false,
      message: 'This date is available for your event.',
    },
  };
  const calls: { id: number; status: string; reason?: string; capacityConfirmed?: boolean }[] = [];
  let updateBookingStatus: ReturnType<typeof vi.fn>;
  let bookings: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    calls.length = 0;
    bookings = vi.fn(() => of({ success: true, data: { items: [booking], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }));
    updateBookingStatus = vi.fn((id: number, status: string, reason?: string, capacityConfirmed?: boolean) => {
      calls.push({ id, status, ...(reason === undefined ? {} : { reason }), ...(capacityConfirmed === undefined ? {} : { capacityConfirmed }) });
      return of({ success: true });
    });
    TestBed.configureTestingModule({
      imports: [AdminBookingsPage],
      providers: [
        provideRouter([]),
        { provide: AdminAuthService, useValue: { user: signal({ fullName: 'Admin' }), logout: async () => {} } },
        { provide: AdminService, useValue: {
          bookings,
          updateBookingStatus,
          issueInvoice: () => of({ success: true, data: { invoiceId: 1 } })
        } }
      ]
    });
  });

  it('offers only generic next states and requires a labeled reason before rejection', async () => {
    const fixture = TestBed.createComponent(AdminBookingsPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('select[aria-label="Update LC-5 status"]') as HTMLSelectElement;
    expect(Array.from(select.options, option => option.value)).toEqual(['', 'APPROVED', 'REJECTED', 'CANCELLED']);

    select.value = 'REJECTED';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(calls).toEqual([]);
    const reason = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    expect(reason).toBeTruthy();
    expect(fixture.nativeElement.querySelector(`label[for="${reason.id}"]`)).toBeTruthy();
    reason.value = '  Date unavailable  ';
    reason.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const confirm = fixture.nativeElement.querySelector('[data-testid="confirm-status"]') as HTMLButtonElement;
    confirm.click();
    fixture.detectChanges();
    expect(calls).toEqual([{ id: 5, status: 'REJECTED', reason: 'Date unavailable' }]);
  });

  it('shows capacity context in the list', async () => {
    const fixture = TestBed.createComponent(AdminBookingsPage);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('2 / 6 active');
    expect(fixture.nativeElement.textContent).toContain('Available');
  });

  it('confirms medium capacity before sending approval', async () => {
    const fixture = TestBed.createComponent(AdminBookingsPage);
    await fixture.whenStable();
    const component = fixture.componentInstance as any;
    component.data.set({
      items: [{
        ...booking,
        guestCount: 250,
        capacity: {
          ...booking.capacity,
          guestCount: 250,
          status: 'NEEDS_CONFIRMATION',
          requiresAdminConfirmation: true,
        },
      }],
      page: 1, pageSize: 20, totalItems: 1, totalPages: 1,
    });
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('select[aria-label="Update LC-5 status"]') as HTMLSelectElement;
    const approve = Array.from(select.options).find(option => option.value === 'APPROVED');
    expect(approve?.textContent).toContain('Approve and confirm capacity');

    select.value = 'APPROVED';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(calls).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Confirm accommodation for 250 guests');
    (fixture.nativeElement.querySelector('[data-testid="confirm-status"]') as HTMLButtonElement).click();

    expect(calls).toEqual([{ id: 5, status: 'APPROVED', capacityConfirmed: true }]);
  });

  it('shows a coded capacity conflict and refreshes the list', async () => {
    updateBookingStatus.mockReturnValueOnce(throwError(() => ({
      status: 409,
      error: { code: 'CAPACITY_CHANGED', message: 'Date capacity changed. Review refreshed capacity.' },
    })));
    const fixture = TestBed.createComponent(AdminBookingsPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('select[aria-label="Update LC-5 status"]') as HTMLSelectElement;
    select.value = 'APPROVED';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(bookings).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.textContent).toContain('Date capacity changed. Review refreshed capacity.');
  });
});
