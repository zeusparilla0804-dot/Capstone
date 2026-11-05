import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminService } from '../../core/services/admin.service';
import { stubNativeDialogs } from '../../shared/testing/native-dialog';
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
  let restoreDialog: () => void;

  beforeEach(() => {
    restoreDialog = stubNativeDialogs();
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
        { provide: AdminAuthService, useValue: { idleWarning: signal(false), user: signal({ fullName: 'Admin' }), logout: async () => {} } },
        { provide: AdminService, useValue: {
          bookings,
          updateBookingStatus,
          issueInvoice: () => of({ success: true, data: { invoiceId: 1 } })
        } }
      ]
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    restoreDialog();
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

  it('requires capacity confirmation in the list before medium-event approval', async () => {
 const fixture=TestBed.createComponent(AdminBookingsPage);await fixture.whenStable();
 const component=fixture.componentInstance as any;
 const medium={...booking,guestCount:250,capacity:{...booking.capacity,guestCount:250,status:'NEEDS_CONFIRMATION',requiresAdminConfirmation:true}};
 component.data.set({items:[medium],page:1,pageSize:20,totalItems:1,totalPages:1});fixture.detectChanges();
 const select=fixture.nativeElement.querySelector('select[aria-label="Update LC-5 status"]') as HTMLSelectElement;
 expect(Array.from(select.options).find(o=>o.value==='APPROVED')?.textContent).toContain('Approve and confirm capacity');
 select.value='APPROVED';select.dispatchEvent(new Event('change'));fixture.detectChanges();expect(calls).toEqual([]);
 component.confirmAction();expect(calls).toEqual([{id:5,status:'APPROVED',capacityConfirmed:true}]);
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
    select.value = 'CANCELLED';
    select.dispatchEvent(new Event('change'));
    const component = fixture.componentInstance as any;
    component.actionReason = 'Customer requested cancellation';
    component.confirmAction();
    fixture.detectChanges();

    expect(bookings).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.textContent).toContain('Date capacity changed. Review refreshed capacity.');
  });

  it('opens an approval popup in the list after acceptance and preserves the reference when the refreshed row is filtered out', async () => {
    const response = new Subject<{ success: boolean }>();
    updateBookingStatus.mockReturnValueOnce(response.asObservable());
    const fixture = TestBed.createComponent(AdminBookingsPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const select = root.querySelector('select[aria-label="Update LC-5 status"]') as HTMLSelectElement;
    select.value = 'APPROVED';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Approving...');
    expect(root.querySelector('.approval-spinner')).not.toBeNull();
    expect(select.disabled).toBe(true);
    expect(root.querySelector('.approval-feedback')).toBeNull();
    const refresh = new Subject<unknown>();
    bookings.mockReturnValueOnce(refresh.asObservable());
    response.next({ success: true });
    response.complete();
    fixture.detectChanges();
    expect(root.querySelector('[role="dialog"]')?.textContent).toContain('Reservation approved');
    refresh.next({ success: true, data: { items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
    refresh.complete();
    fixture.detectChanges();
    const dialog = root.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('LC-5');
    expect(root.querySelector('.approval-feedback')).toBeNull();
    expect(root.querySelector('.admin-feedback')).toBeNull();
    expect(root.querySelector('.approval-spinner')).toBeNull();
    const done = dialog?.querySelector('.success-dialog__actions button') as HTMLButtonElement;
    expect(done.textContent).toContain('Done');
    vi.useFakeTimers();
    try {
      done.click();
      vi.advanceTimersByTime(160);
      fixture.detectChanges();
      expect(root.querySelector('[role="dialog"]')).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('ends list approval progress without showing success when the server rejects it', async () => {
    const response = new Subject<{ success: boolean }>();
    updateBookingStatus.mockReturnValueOnce(response.asObservable());
    const fixture = TestBed.createComponent(AdminBookingsPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const select = root.querySelector('select[aria-label="Update LC-5 status"]') as HTMLSelectElement;
    select.value = 'APPROVED';
    select.dispatchEvent(new Event('change'));
    const message = 'The cash deposit deadline has passed. Contact the customer before proceeding.';
    response.error({ status: 409, error: { code: 'CASH_DEPOSIT_DEADLINE_PASSED', message } });
    fixture.detectChanges();
    expect(root.querySelector('.approval-spinner')).toBeNull();
    expect(root.querySelector('.approval-feedback')).toBeNull();
    expect(root.querySelector('[role="dialog"]')).toBeNull();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(select.disabled).toBe(false);
  });
});
