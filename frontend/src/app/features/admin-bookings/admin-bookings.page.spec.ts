import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminService } from '../../core/services/admin.service';
import { AdminBookingsPage } from './admin-bookings.page';

describe('AdminBookingsPage status actions', () => {
  const booking = { id: 5, reference: 'LC-5', customerName: 'Customer', eventType: 'Wedding', eventDate: '2026-10-10', guestCount: 50, total: 10000, status: 'PENDING' };
  const calls: { id: number; status: string; reason?: string }[] = [];

  beforeEach(() => {
    calls.length = 0;
    TestBed.configureTestingModule({
      imports: [AdminBookingsPage],
      providers: [
        provideRouter([]),
        { provide: AdminAuthService, useValue: { user: signal({ fullName: 'Admin' }), logout: async () => {} } },
        { provide: AdminService, useValue: {
          bookings: () => of({ success: true, data: { items: [booking], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }),
          updateBookingStatus: (id: number, status: string, reason?: string) => { calls.push({ id, status, reason }); return of({ success: true }); },
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
});
