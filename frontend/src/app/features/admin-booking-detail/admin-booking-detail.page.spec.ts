import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import type { AdminBookingDetail } from '../../core/models';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminService } from '../../core/services/admin.service';
import { AdminBookingDetailPage } from './admin-booking-detail.page';

const detail: AdminBookingDetail = {
  id: 42, reference: 'LC-0042', customerName: 'Klint Charles', email: 'klint@example.test', phone: '09171234567',
  eventType: 'Wedding', eventDate: '2026-12-10', eventTime: '18:00', venue: 'Santa Rosa, Laguna', guestCount: 100,
  packageName: 'Diamond', packageUnitPrice: 850, subtotal: 85000, discount: 0, total: 85000, amountPaid: 10000,
  status: 'PENDING', addOns: [], statusHistory: [{ id: 1, previousStatus: null, nextStatus: 'PENDING', actorType: 'CUSTOMER', actorId: 7, reason: null, createdAt: '2026-10-01T00:00:00.000Z' }]
};

describe('AdminBookingDetailPage', () => {
  let fixture: ComponentFixture<AdminBookingDetailPage>;
  let updateResult: Subject<unknown>;
  let api: { booking: ReturnType<typeof vi.fn>; updateBookingStatus: ReturnType<typeof vi.fn>; issueInvoice: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    updateResult = new Subject();
    api = {
      booking: vi.fn(() => of({ success: true, data: detail })),
      updateBookingStatus: vi.fn(() => updateResult.asObservable()),
      issueInvoice: vi.fn(() => of({ success: true, data: { invoiceId: 8 } }))
    };
    await TestBed.configureTestingModule({
      imports: [AdminBookingDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '42' }) } } },
        { provide: AdminService, useValue: api },
        { provide: AdminAuthService, useValue: { user: signal({ fullName: 'Admin' }), logout: vi.fn() } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(AdminBookingDetailPage);
    fixture.detectChanges();
  });

  it('shows only valid actions for the current booking status and renders history', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Approve booking');
    expect(text).toContain('Reject booking');
    expect(text).toContain('Cancel booking');
    expect(text).not.toContain('Confirm booking');
    expect(text).toContain('Submitted by customer');
  });

  it('maps every booking state to only its approved manual actions', () => {
    const component = fixture.componentInstance as unknown as {
      booking: { set(value: AdminBookingDetail): void };
      availableActions(): readonly { status: string }[];
    };
    const expected: Record<string, readonly string[]> = {
      PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'], APPROVED: ['AWAITING_PAYMENT', 'CANCELLED'],
      AWAITING_PAYMENT: ['CANCELLED'], PAYMENT_SUBMITTED: [], PAYMENT_VERIFIED: ['CONFIRMED'],
      CONFIRMED: ['COMPLETED', 'CANCELLED'], COMPLETED: [], REJECTED: [], CANCELLED: []
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
    api.updateBookingStatus.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'Booking status changed.' } })));
    const component = fixture.componentInstance as unknown as { chooseAction(status: string): void; confirmAction(): void };
    component.chooseAction('APPROVED');
    component.confirmAction();
    fixture.detectChanges();
    expect(api.booking).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.textContent).toContain('changed in another session');
  });
});

