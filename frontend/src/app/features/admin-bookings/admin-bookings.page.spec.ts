import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminService } from '../../core/services/admin.service';
import { ActionFeedbackService } from '../../core/services/action-feedback.service';
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
    expect(fixture.nativeElement.querySelector('a[aria-label="Review booking LC-5"]')?.getAttribute('href')).toBe('/admin/bookings/5');
    expect(fixture.nativeElement.querySelector('.booking-row-actions__links a')).toBeNull();
    expect(fixture.nativeElement.querySelector('.booking-row-actions__links select')).not.toBeNull();
  });

  it('keeps invoice and available status actions in one stack without an empty-status label', async () => {
    const fixture = TestBed.createComponent(AdminBookingsPage);
    await fixture.whenStable();
    const component = fixture.componentInstance as any;
    component.data.set({ items: [
      { ...booking, id: 5, invoiceId: 8 },
      { ...booking, id: 6, reference: 'LC-6', invoiceId: 9, status: 'COMPLETED' },
      { ...booking, id: 7, reference: 'LC-7' },
    ], page: 1, pageSize: 20, totalItems: 3, totalPages: 1 });
    fixture.detectChanges();

    const stacks = fixture.nativeElement.querySelectorAll('td[data-label="Actions"] .booking-row-actions__links');
    expect(stacks).toHaveLength(3);
    expect(stacks[0].querySelector('a[href="/admin/bookings/5"]')).toBeNull();
    expect(stacks[0].querySelector('a[href="/admin/invoices/8"]')).not.toBeNull();
    expect(stacks[0].querySelector('select.admin-status-select')).not.toBeNull();
    expect(stacks[1].querySelector('a[href="/admin/invoices/9"]')).not.toBeNull();
    expect(stacks[1].querySelector('select.admin-status-select')).toBeNull();
    expect(stacks[2].textContent).not.toContain('Issue invoice');
    expect(stacks[2].querySelector('a[href^="/admin/invoices/"]')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('No status actions');
  });

  it('labels a verified deposit without changing the booking status or confirmation action', async () => {
    const fixture = TestBed.createComponent(AdminBookingsPage);
    await fixture.whenStable();
    const component = fixture.componentInstance as any;
    component.data.set({ items: [{ ...booking, status: 'PAYMENT_VERIFIED', amountPaid: 5000 }], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 });
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('td[data-label="Status"] .status-badge') as HTMLElement;
    expect(badge.textContent?.trim()).toBe('Down Payment Paid');
    expect(badge.classList).toContain('status-badge--down_payment_verified');
    expect(component.data().items[0].status).toBe('PAYMENT_VERIFIED');
    const select = fixture.nativeElement.querySelector('select[aria-label="Update LC-5 status"]') as HTMLSelectElement;
    expect(Array.from(select.options, option => option.value)).toEqual(['', 'CONFIRMED']);
  });

  it('uses recorded amounts and the latest proof decision for reservation badges', async () => {
    const fixture = TestBed.createComponent(AdminBookingsPage);
    await fixture.whenStable();
    const component = fixture.componentInstance as any;
    component.data.set({ items: [
      { ...booking, id: 1, status: 'AWAITING_PAYMENT', amountPaid: 0 },
      { ...booking, id: 2, status: 'PAYMENT_SUBMITTED', amountPaid: 0, latestProofStatus: 'SUBMITTED' },
      { ...booking, id: 3, status: 'PAYMENT_VERIFIED', amountPaid: 5000, latestProofStatus: 'VERIFIED' },
      { ...booking, id: 4, status: 'CONFIRMED', amountPaid: 10000, latestProofStatus: 'VERIFIED' },
      { ...booking, id: 5, status: 'AWAITING_PAYMENT', amountPaid: 0, latestProofStatus: 'REJECTED' },
      { ...booking, id: 6, status: 'COMPLETED', amountPaid: 10000, latestProofStatus: 'VERIFIED' },
      { ...booking, id: 7, status: 'COMPLETED', amountPaid: 5000, latestProofStatus: 'VERIFIED' },
    ], page: 1, pageSize: 20, totalItems: 7, totalPages: 1 });
    fixture.detectChanges();
    const badges = [...fixture.nativeElement.querySelectorAll('td[data-label="Status"] .status-badge')]
      .map((element: Element) => element.textContent?.trim());
    expect(badges).toEqual(['Awaiting Payment', 'Pending Verification', 'Down Payment Paid', 'Fully Paid', 'Payment Rejected', 'Fully Paid', 'Completed', 'Down Payment Paid', 'Completed']);
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
    expect(updateBookingStatus).not.toHaveBeenCalled();
    TestBed.inject(ActionFeedbackService).decide(true);
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
    TestBed.inject(ActionFeedbackService).decide(true);
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
