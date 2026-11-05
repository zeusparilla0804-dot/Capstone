import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import type { AdminBookingDetail } from '../../core/models';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminService } from '../../core/services/admin.service';
import { stubNativeDialogs } from '../../shared/testing/native-dialog';
import { AdminBookingDetailPage } from './admin-booking-detail.page';

const detail: AdminBookingDetail = {
  id: 42, reference: 'LC-0042', customerName: 'Klint Charles', email: 'klint@example.test', phone: '09171234567',
  eventType: 'Wedding', eventDate: '2026-12-10', eventTime: '18:00', venue: 'Santa Rosa, Laguna', guestCount: 100,
  packageName: 'Diamond', packageUnitPrice: 850, subtotal: 85000, discount: 0, total: 85000, amountPaid: 10000,
  status: 'PENDING',
  capacity: {
    date: '2026-12-10', guestCount: 100, status: 'AVAILABLE', activeBookingCount: 2,
    capacityLimit: 6, remainingRequestSlots: 4, requiresAdminConfirmation: false,
    message: 'This date is available for your event.',
  },
  addOns: [], statusHistory: [{ id: 1, previousStatus: null, nextStatus: 'PENDING', actorType: 'CUSTOMER', actorId: 7, reason: null, createdAt: '2026-10-01T00:00:00.000Z' }]
};

describe('AdminBookingDetailPage', () => {
  let fixture: ComponentFixture<AdminBookingDetailPage>;
  let updateResult: Subject<unknown>;
  let restoreDialog: () => void;
  let api: { booking: ReturnType<typeof vi.fn>; updateBookingStatus: ReturnType<typeof vi.fn>; issueInvoice: ReturnType<typeof vi.fn>; paymentProofs: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    restoreDialog = stubNativeDialogs();
    updateResult = new Subject();
    api = {
      booking: vi.fn(() => of({ success: true, data: detail })),
      updateBookingStatus: vi.fn(() => updateResult.asObservable()),
      issueInvoice: vi.fn(() => of({ success: true, data: { invoiceId: 8 } })),
      paymentProofs: vi.fn(() => of({ success: true, data: { items: [], page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } }))
    };
    await TestBed.configureTestingModule({
      imports: [AdminBookingDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '42' }) } } },
        { provide: AdminService, useValue: api },
        { provide: AdminAuthService, useValue: { idleWarning: signal(false), user: signal({ fullName: 'Admin' }), logout: vi.fn() } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(AdminBookingDetailPage);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    restoreDialog();
  });

  it('shows only valid actions for the current booking status and renders history', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Approve reservation');
    expect(text).toContain('Reject reservation');
    expect(text).toContain('Cancel reservation');
    expect(text).not.toContain('Confirm reservation');
    expect(text).toContain('Submitted by customer');
  });

  it('keeps the primary summary compact and starts supplementary history collapsed', () => {
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.financial-strip dl > div')).toHaveLength(3);
    expect(root.querySelector('.booking-lead')?.textContent).toContain('December 10, 2026');
    expect(root.querySelector('.booking-lead')?.textContent).toContain('18:00');
    expect(root.querySelector('.financial-strip')?.textContent).not.toContain('Not issued');
    for (const selector of ['.proof-history-section', '.history-section', '.additional-details']) {
      const section = root.querySelector(selector);
      expect(section?.tagName).toBe('DETAILS');
      expect((section as HTMLDetailsElement).open).toBe(false);
    }
    expect(root.querySelector('[aria-labelledby="booking-actions-title"]')?.textContent).toContain('Approve reservation');
    expect(root.querySelector('[aria-labelledby="customer-details-title"]')?.textContent).toContain('09171234567');
  });

  it('labels capacity with its event date and uses the independently supplied count for another date', () => {
    const component = fixture.componentInstance as any;
    const capacity = () => (fixture.nativeElement as HTMLElement).querySelector('.capacity-strip')!.textContent;
    expect(capacity()).toContain('December 10, 2026');
    expect(capacity()).toContain('2 of 6 reservations');
    expect(capacity()).toContain('4 slots available');
    component.booking.set({ ...detail, eventDate: '2026-12-11', capacity: { ...detail.capacity, date: '2026-12-11', activeBookingCount: 1, remainingRequestSlots: 5 } });
    fixture.detectChanges();
    expect(capacity()).toContain('December 11, 2026');
    expect(capacity()).toContain('1 of 6 reservations');
    expect(capacity()).toContain('5 slots available');
  });

  it('opens submitted proofs for review and preserves the existing review destination', () => {
    const proof = { id: '905', reservationId: 42, method: 'E_WALLET', claimedAmount: 42500,
      transactionReference: 'GCASH-905', createdAt: '2026-11-03T01:00:00Z', status: 'SUBMITTED' };
    api.paymentProofs.mockReturnValueOnce(of({ success: true, data: { items: [proof], page: 1, pageSize: 10, totalItems: 1, totalPages: 1 } }));
    (fixture.componentInstance as any).loadProofHistory(); fixture.detectChanges();
    const section = fixture.nativeElement.querySelector('.proof-history-section') as HTMLDetailsElement;
    expect(section.open).toBe(true);
    expect(section.querySelector('[data-proof-id="905"] a')?.getAttribute('href')).toBe('/admin/payments/proofs/905?booking=42');
    expect(section.textContent).toContain('Review proof');
    expect(api.updateBookingStatus).not.toHaveBeenCalled();
  });

  it('keeps proof history open when paging from a pending submission to older receipts', () => {
    const component = fixture.componentInstance as any;
    const proof = { id: '905', reservationId: 42, method: 'E_WALLET', claimedAmount: 42500, createdAt: '2026-11-03T01:00:00Z', status: 'SUBMITTED' };
    api.paymentProofs.mockReturnValueOnce(of({ success: true, data: { items: [proof], page: 1, pageSize: 10, totalItems: 11, totalPages: 2 } }));
    component.loadProofHistory(); fixture.detectChanges();
    api.paymentProofs.mockReturnValueOnce(of({ success: true, data: { items: [{ ...proof, id: '900', status: 'VERIFIED' }], page: 2, pageSize: 10, totalItems: 11, totalPages: 2 } }));
    component.loadProofHistory(2); fixture.detectChanges();
    const section = fixture.nativeElement.querySelector('.proof-history-section') as HTMLDetailsElement;
    expect(section.open).toBe(true);
    expect(section.textContent).toContain('Page 2 of 2');
    expect(section.querySelector('[data-proof-id="900"] a')?.textContent).toContain('View receipt');
  });

  it('hides an empty proof section for cash but keeps historical receipts accessible', () => {
    const component = fixture.componentInstance as any;
    component.booking.set({ ...detail, paymentMethod: 'CASH' }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.proof-history-section')).toBeNull();
    api.paymentProofs.mockReturnValueOnce(of({ success: true, data: { items: [{ id: '901', reservationId: 42, method: 'E_WALLET', claimedAmount: 42500, status: 'VERIFIED', createdAt: '2026-11-01T01:00:00Z' }], page: 1, pageSize: 10, totalItems: 1, totalPages: 1 } }));
    component.loadProofHistory(); fixture.detectChanges();
    const section = fixture.nativeElement.querySelector('.proof-history-section') as HTMLDetailsElement;
    expect(section.open).toBe(false);
    section.querySelector('summary')!.click(); fixture.detectChanges();
    expect(section.open).toBe(true);
    expect(section.querySelector('[data-proof-id="901"] a')?.getAttribute('href')).toBe('/admin/payments/proofs/901?booking=42');
  });

  it('keeps invoice navigation accessible beside the compact financial summary', () => {
    (fixture.componentInstance as any).booking.set({ ...detail, invoiceId: 88, invoiceNumber: 'INV-88', invoiceStatus: 'ISSUED' });
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('.financial-strip a') as HTMLAnchorElement;
    expect(link.textContent).toContain('View invoice');
    expect(link.getAttribute('href')).toBe('/admin/invoices/88');
    expect(fixture.nativeElement.querySelector('.additional-details').textContent).toContain('INV-88');
  });

  it('loads reservation-scoped proof history and links reviewed receipts without offering a second credit', () => {
    expect(api.paymentProofs).toHaveBeenCalledWith({ reservationId: 42, status: 'ALL', page: 1, pageSize: 10, order: 'newest' });
    const proof = { id: '901', reservationId: 42, method: 'E_WALLET', claimedAmount: 42500, verifiedAmount: 42000,
      transactionReference: 'GCASH-901', createdAt: '2026-11-01T01:00:00Z', reviewedAt: '2026-11-01T02:00:00Z', status: 'VERIFIED' };
    api.paymentProofs.mockReturnValue(of({ success: true, data: { items: [proof, { ...proof, id: '902', status: 'REJECTED', rejectionReason: 'Unreadable receipt' }], page: 1, pageSize: 10, totalItems: 2, totalPages: 1 } }));
    (fixture.componentInstance as any).load();
    fixture.detectChanges();
    const history = fixture.nativeElement.querySelector('[aria-labelledby="proof-history-title"]') as HTMLElement;
    expect(history).not.toBeNull();
    expect(history.textContent).toContain('GCash');
    expect(history.textContent).toContain('GCASH-901');
    expect(history.textContent).toContain('42,000.00');
    expect(history.textContent).toContain('Unreadable receipt');
    const receiptLink = history.querySelector('[data-proof-id="901"] a');
    expect(receiptLink?.getAttribute('href')).toBe('/admin/payments/proofs/901?booking=42');
    expect(receiptLink?.textContent).toContain('View receipt');
    expect(history.textContent).not.toContain('Verify and record payment');
  });

  it('keeps reservation details available when proof history fails and supports retry and pagination', () => {
    api.paymentProofs.mockReturnValueOnce(throwError(() => new Error('offline')));
    (fixture.componentInstance as any).loadProofHistory();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Unable to load payment proof history.');
    expect((fixture.nativeElement.querySelector('.proof-history-section') as HTMLDetailsElement).open).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('LC-0042');
    api.paymentProofs.mockReturnValue(of({ success: true, data: { items: [], page: 2, pageSize: 10, totalItems: 11, totalPages: 2 } }));
    (fixture.componentInstance as any).loadProofHistory(2);
    fixture.detectChanges();
    expect(api.paymentProofs).toHaveBeenLastCalledWith({ reservationId: 42, status: 'ALL', page: 2, pageSize: 10, order: 'newest' });
    expect(fixture.nativeElement.textContent).not.toContain('Unable to load payment proof history.');
  });

  it('shows the cash cutoff and office hours without changing the reservation status', () => {
    (fixture.componentInstance as any).booking.set({ ...detail, guestCount: 500, paymentMethod: 'CASH' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('December 5, 2026');
    expect(fixture.nativeElement.textContent).toContain('8:00 AM-6:00 PM');
    expect((fixture.componentInstance as any).booking().status).toBe('PENDING');
    expect(api.updateBookingStatus).not.toHaveBeenCalled();
  });

  it('flags an overdue unpaid cash deposit for admin review without changing money or booking status', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-12-05T10:00:01Z'));
      (fixture.componentInstance as any).booking.set({ ...detail, guestCount: 500, paymentMethod: 'CASH', status: 'AWAITING_PAYMENT' });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.cash-summary [role="alert"]').textContent).toContain('Deposit overdue. Review availability before approval.');
      expect(api.updateBookingStatus).not.toHaveBeenCalled();
      expect((fixture.componentInstance as any).booking().amountPaid).toBe(10000);
    } finally { vi.useRealTimers(); }
  });

  it.each([
    { guestCount: 100, eventDate: '2026-11-07' },
    { guestCount: 500, eventDate: '2026-11-09' },
  ])('keeps the fixed cash deadline available during admin review through 6 PM for $guestCount guests', ({ guestCount, eventDate }) => {
    vi.useFakeTimers();
    try {
      const component = fixture.componentInstance as any;
      component.booking.set({ ...detail, guestCount, eventDate, paymentMethod: 'CASH' });
      for (const now of ['2026-11-04T01:00:00Z', '2026-11-04T10:00:00Z']) {
        vi.setSystemTime(new Date(now));
        fixture.detectChanges();
        const summary = fixture.nativeElement.querySelector('.cash-summary') as HTMLElement;
        expect(summary.textContent).toContain('November 4, 2026');
        expect(summary.querySelector('[role="alert"]')).toBeNull();
        expect(fixture.nativeElement.textContent).not.toContain('2 office days');
        expect(component.booking().eventDate).toBe(eventDate);
        expect(component.availableActions().some((action: { status: string }) => action.status === 'APPROVED')).toBe(true);
      }
    } finally { vi.useRealTimers(); }
  });

  it('shows the current date capacity as operational context', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Date capacity');
    expect(text).toContain('December 10, 2026');
    expect(text).toContain('2 of 6 reservations');
    expect(text).toContain('4 slots available');
    expect(text).toContain('Available');
  });

  it('requires explicit capacity confirmation for a medium event before ordinary approval', () => {
 const component=fixture.componentInstance as any;
 component.booking.set({...detail,guestCount:250,capacity:{...detail.capacity,guestCount:250,status:'NEEDS_CONFIRMATION',requiresAdminConfirmation:true}});
 fixture.detectChanges();expect(fixture.nativeElement.textContent).toContain('Approve and confirm capacity');
 component.chooseAction('APPROVED');expect(api.updateBookingStatus).not.toHaveBeenCalled();
 component.confirmAction();expect(api.updateBookingStatus).toHaveBeenCalledWith(42,'APPROVED',undefined,true);
});

  it('keeps normal approval for 149 and 500 guest events', () => {
    const component = fixture.componentInstance as any;
    for (const guestCount of [149, 500]) {
      component.booking.set({
        ...detail,
        guestCount,
        capacity: { ...detail.capacity, guestCount, requiresAdminConfirmation: false },
      });
      expect(component.availableActions().find((action: { status: string }) => action.status === 'APPROVED').label)
        .toBe('Approve reservation');
    }
  });

  it('maps every booking state to only its approved manual actions', () => {
    const component = fixture.componentInstance as unknown as {
      booking: { set(value: AdminBookingDetail): void };
      availableActions(): readonly { status: string }[];
    };
    const expected: Record<string, readonly string[]> = {
      PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'], APPROVED: ['AWAITING_PAYMENT', 'CANCELLED'],
      AWAITING_PAYMENT: ['CANCELLED'], PAYMENT_SUBMITTED: [], PAYMENT_VERIFIED: [],
      CONFIRMED: ['COMPLETED', 'CANCELLED'], COMPLETED: [], REJECTED: [], CANCELLED: [], EXPIRED: []
    };
    for (const [status, allowed] of Object.entries(expected)) {
      component.booking.set({ ...detail, status });
      expect(component.availableActions().map(action => action.status)).toEqual(allowed);
    }
  });

  it('requires a reason for rejection and locks mutation actions while submitting', () => {
    const component = fixture.componentInstance as unknown as { chooseAction(status: string): void; confirmAction(): void };
    component.chooseAction('REJECTED');
    fixture.detectChanges();
    component.confirmAction();
    fixture.detectChanges();
    expect(api.updateBookingStatus).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Enter a reason');
  });

  it('refreshes current data after a stale 409 transition conflict', () => {
    api.updateBookingStatus.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409, error: { code: 'CAPACITY_CHANGED', message: 'Date capacity changed. Review refreshed capacity.' } })));
    const component = fixture.componentInstance as any;
    component.booking.set(detail);
    component.chooseAction('APPROVED');
    component.confirmAction();
    fixture.detectChanges();
    expect(api.booking).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.textContent).toContain('Date capacity changed. Review refreshed capacity.');
  });

  it('shows the actual cash approval rejection after confirmation instead of reporting a concurrent edit', () => {
    const message = 'The cash deposit deadline has passed. Contact the customer to arrange a later event date before approval.';
    api.updateBookingStatus.mockReturnValueOnce(throwError(() => new HttpErrorResponse({
      status: 409, error: { code: 'CASH_DEPOSIT_DEADLINE_PASSED', message },
    })));
    const root = fixture.nativeElement as HTMLElement;
    (Array.from(root.querySelectorAll('.action-list button')).find(button => button.textContent?.includes('Approve reservation')) as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(root.querySelector('.action-confirmation')).not.toBeNull();
    expect(api.updateBookingStatus).not.toHaveBeenCalled();
    (root.querySelector('.confirmation-actions .btn-primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(api.updateBookingStatus).toHaveBeenCalledWith(42, 'APPROVED', undefined);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(root.textContent).not.toContain('changed in another session');
    expect(root.querySelector('.admin-feedback')).toBeNull();
    expect((fixture.componentInstance as any).booking().status).toBe('PENDING');
    expect(api.booking).toHaveBeenCalledTimes(2);
  });

  it('animates the initial approval confirmation for every booking, including cash bookings outside the payment window', () => {
    const component = fixture.componentInstance as any;
    const root = fixture.nativeElement as HTMLElement;
    for (const booking of [
      detail,
      { ...detail, paymentMethod: 'CASH', eventDate: '2020-01-10' },
      { ...detail, guestCount: 250, capacity: { ...detail.capacity, requiresAdminConfirmation: true } },
    ]) {
      component.booking.set(booking);
      fixture.detectChanges();
      (root.querySelector('.action-list .btn-primary') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(root.querySelector('.action-confirmation.approval-confirmation')).not.toBeNull();
      expect(root.querySelector('.approval-feedback')).toBeNull();
      expect(api.updateBookingStatus).not.toHaveBeenCalled();
      (root.querySelector('.confirmation-actions .btn-secondary') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(root.querySelector('.action-confirmation')).toBeNull();
    }
  });

  it('opens a dismissible approval popup after acceptance and keeps it visible during refresh without inline success text', () => {
    const component = fixture.componentInstance as any;
    const root = fixture.nativeElement as HTMLElement;
    component.chooseAction('APPROVED');
    fixture.detectChanges();
    const confirm = root.querySelector('.confirmation-actions .btn-primary') as HTMLButtonElement;
    confirm.click();
    fixture.detectChanges();
    expect(confirm.textContent).toContain('Approving...');
    expect(confirm.disabled).toBe(true);
    expect(confirm.getAttribute('aria-busy')).toBe('true');
    expect(confirm.querySelector('.approval-spinner')).not.toBeNull();
    expect(root.querySelector('.approval-feedback')).toBeNull();
    component.confirmAction();
    expect(api.updateBookingStatus).toHaveBeenCalledTimes(1);

    const refresh = new Subject<unknown>();
    api.booking.mockReturnValueOnce(refresh.asObservable());
    updateResult.next({ success: true });
    updateResult.complete();
    fixture.detectChanges();
    expect(root.querySelector('[role="dialog"]')?.textContent).toContain('Reservation approved');
    expect(root.querySelector('[role="dialog"]')?.textContent).toContain('LC-0042');
    refresh.next({ success: true, data: { ...detail, status: 'APPROVED' } });
    refresh.complete();
    fixture.detectChanges();
    const dialog = root.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(root.querySelector('.operations .approval-feedback')).toBeNull();
    expect(root.querySelector('.admin-feedback')).toBeNull();
    expect(root.querySelector('.action-confirmation')).toBeNull();
    expect(component.booking().status).toBe('APPROVED');
    const done = dialog?.querySelector('.success-dialog__actions button') as HTMLButtonElement;
    expect(done.textContent).toContain('Done');
    vi.useFakeTimers();
    try {
      done.click();
      vi.advanceTimersByTime(160);
      fixture.detectChanges();
      expect(root.querySelector('[role="dialog"]')).toBeNull();
      expect(component.booking().status).toBe('APPROVED');
    } finally { vi.useRealTimers(); }
  });

  it('removes approval progress on failure without displaying a success checkmark', () => {
    const component = fixture.componentInstance as any;
    component.chooseAction('APPROVED');
    component.confirmAction();
    fixture.detectChanges();
    updateResult.error(new HttpErrorResponse({ status: 400, error: { message: 'Approval could not be completed.' } }));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.approval-spinner')).toBeNull();
    expect(root.querySelector('.approval-feedback')).toBeNull();
    expect(root.querySelector('[role="dialog"]')).toBeNull();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Approval could not be completed.');
    expect((root.querySelector('.confirmation-actions .btn-primary') as HTMLButtonElement).disabled).toBe(false);
    expect(component.booking().status).toBe('PENDING');
  });

  it('keeps the fallback when a conflict response has no explanatory message', () => {
    api.updateBookingStatus.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409 })));
    const component = fixture.componentInstance as any;
    component.chooseAction('APPROVED');
    component.confirmAction();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('This reservation changed in another session. The latest details are shown.');
  });
});
