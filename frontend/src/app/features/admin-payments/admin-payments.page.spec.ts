import { Component, Input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { AdminService } from '../../core/services/admin.service';
import { ActionFeedbackService } from '../../core/services/action-feedback.service';
import { AdminShellComponent } from '../../shared/components/admin-shell/admin-shell';
import { AdminPaymentsPage } from './admin-payments.page';

@Component({ selector: 'app-admin-shell', template: '<ng-content />' })
class ShellStub {
  @Input() title = '';
  @Input() description = '';
}

describe('AdminPaymentsPage payment-proof queue', () => {
  it.each(['CASH', 'BANK_TRANSFER'])('records a new %s payment on a legacy booking while keeping the original row intact', async method => {
    const old = { id: 7, reservationId: 42, bookingReference: 'BK-OLD', customerName: 'Customer', amountDue: 10000, amountPaid: 1000,
      paymentMethod: 'E-WALLET', status: 'PARTIALLY_PAID', bookingStatus: 'AWAITING_PAYMENT' };
    const recordPayment = vi.fn((_input: unknown) => of({ success: true }));
    await TestBed.configureTestingModule({ imports: [AdminPaymentsPage], providers: [provideRouter([]), { provide: AdminService,
      useValue: { payments: () => of({ data: { items: [old], page: 1, totalPages: 1 } }), recordPayment,
        paymentProofs: () => of({ data: { items: [], page: 1, totalPages: 0 } }) } }] })
      .overrideComponent(AdminPaymentsPage, { remove: { imports: [AdminShellComponent] }, add: { imports: [ShellStub] } }).compileComponents();
    const fixture = TestBed.createComponent(AdminPaymentsPage); const component = fixture.componentInstance as any;
    component.recordCash(old); fixture.detectChanges();
    const choices = [...fixture.nativeElement.querySelectorAll('select[formControlName="method"] option')].map((option: any) => option.value);
    expect(choices).toEqual(['', 'CASH', 'BANK_TRANSFER']);
    component.form.controls.amount.setValue(2000);
    component.form.controls.method.setValue('E-WALLET'); component.save();
    expect(recordPayment).not.toHaveBeenCalled();
    component.form.controls.method.setValue(method);
    if (method === 'BANK_TRANSFER') component.transactionReference.setValue('BANK-RECOVERY');
    component.requestSave();
    const feedback = TestBed.inject(ActionFeedbackService);
    expect(feedback.confirmation()?.message).toContain('2,000.00');
    feedback.decide(true);
    expect(recordPayment).toHaveBeenCalledOnce();
    expect(recordPayment.mock.calls[0]?.[0]).toMatchObject({ reservationId: 42, method, amount: 2000 });
    expect(old.paymentMethod).toBe('E-WALLET'); expect(old.amountPaid).toBe(1000);
  });
  it('records an additional bank payment with the detected method and a verified transaction reference', async () => {
    const bank = { id: 8, reservationId: 43, bookingReference: 'BK-BANK-43', customerName: 'Bank Customer', amountDue: 10000, amountPaid: 5000,
      paymentMethod: 'BANK_TRANSFER', paymentDestinationLabel: 'BPI LA Chef', status: 'PARTIALLY_PAID', bookingStatus: 'PAYMENT_VERIFIED' };
    const recordPayment = vi.fn((_input: unknown) => of({ success: true, data: { reference: 'BANK-FINAL-43' } }));
    await TestBed.configureTestingModule({ imports: [AdminPaymentsPage], providers: [provideRouter([]), { provide: AdminService,
      useValue: { payments: () => of({ data: { items: [bank], page: 1, totalPages: 1 } }), recordPayment,
        paymentProofs: () => of({ data: { items: [], page: 1, totalPages: 0 } }) } }] })
      .overrideComponent(AdminPaymentsPage, { remove: { imports: [AdminShellComponent] }, add: { imports: [ShellStub] } }).compileComponents();
    const fixture = TestBed.createComponent(AdminPaymentsPage); fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-record-bank]').click(); fixture.detectChanges();
    const component = fixture.componentInstance as any;
    expect(component.form.controls.method.value).toBe('BANK_TRANSFER');
    expect(fixture.nativeElement.textContent).toContain('BPI LA Chef');
    component.form.controls.amount.setValue(5000);
    component.requestSave();
    expect(recordPayment).not.toHaveBeenCalled();
    component.transactionReference.setValue('BANK-FINAL-43');
    component.requestSave();
    const feedback = TestBed.inject(ActionFeedbackService);
    expect(feedback.confirmation()?.message).toContain('BANK-FINAL-43');
    feedback.decide(true);
    expect(recordPayment).toHaveBeenCalledOnce();
    expect(recordPayment.mock.calls[0]?.[0]).toMatchObject({ reservationId: 43, method: 'BANK_TRANSFER', amount: 5000, reference: 'BANK-FINAL-43' });
  });
  it('confirms the exact cash amount and booking before recording and leaves cancellation unrecorded', async () => {
    const booking = { id: 7, reservationId: 42, bookingReference: 'BK-CASH-42', customerName: 'Cash Customer', amountDue: 10000, amountPaid: 0,
      paymentMethod: 'CASH', status: 'PENDING', bookingStatus: 'AWAITING_PAYMENT' };
    const recordPayment = vi.fn((_input: unknown) => of({ success: true, data: { reference: 'CASH-AUTO' } }));
    await TestBed.configureTestingModule({ imports: [AdminPaymentsPage], providers: [provideRouter([]), { provide: AdminService,
      useValue: { payments: () => of({ data: { items: [booking], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }), recordPayment,
        paymentProofs: () => of({ data: { items: [], page: 1, totalPages: 0 } }) } }] })
      .overrideComponent(AdminPaymentsPage, { remove: { imports: [AdminShellComponent] }, add: { imports: [ShellStub] } }).compileComponents();
    const fixture = TestBed.createComponent(AdminPaymentsPage); fixture.detectChanges();
    const component = fixture.componentInstance as any; const feedback = TestBed.inject(ActionFeedbackService);
    component.recordCash(booking); component.form.controls.amount.setValue(123); fixture.detectChanges();
    fixture.nativeElement.querySelector('form.admin-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(recordPayment).not.toHaveBeenCalled(); expect(feedback.confirmation()?.message).toContain('123.00');
    expect(feedback.confirmation()?.message).toContain('BK-CASH-42'); feedback.decide(false);
    expect(recordPayment).not.toHaveBeenCalled();
    component.requestSave(); feedback.decide(true); feedback.decide(true);
    expect(recordPayment).toHaveBeenCalledOnce(); expect(recordPayment.mock.calls[0]?.[0]).toMatchObject({ amount: 123, reservationId: 42 });
  });
  it('filters cash bookings on the server and records against the selected booking without typing an ID', async () => {
    const cash = { id: 7, reservationId: 42, bookingReference: 'BK-CASH-42', customerName: 'Cash Customer',
      amountDue: 10000, amountPaid: 2000, paymentMethod: 'CASH', status: 'PARTIALLY_PAID', bookingStatus: 'AWAITING_PAYMENT' };
    const rows = [cash, { ...cash, id: 8, reservationId: 43, paymentMethod: 'BANK_TRANSFER' },
      { ...cash, id: 9, reservationId: 44, amountPaid: 10000 },
      { ...cash, id: 10, reservationId: 45, bookingStatus: 'CANCELLED' }];
    const payments = vi.fn(() => of({ data: { items: rows, page: 1, pageSize: 20, totalItems: rows.length, totalPages: 1 } }));
    const recordPayment = vi.fn((_input: unknown) => of({ success: true }));
    await TestBed.configureTestingModule({ imports: [AdminPaymentsPage], providers: [provideRouter([]), {
      provide: AdminService, useValue: { payments, recordPayment,
        paymentProofs: () => of({ data: { items: [], page: 1, pageSize: 8, totalPages: 1 } }) },
    }] }).overrideComponent(AdminPaymentsPage, { remove: { imports: [AdminShellComponent] }, add: { imports: [ShellStub] } }).compileComponents();
    const fixture = TestBed.createComponent(AdminPaymentsPage);
    const component = fixture.componentInstance as any;
    fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
    const filter = fixture.nativeElement.querySelector('select[name="paymentMethod"]') as HTMLSelectElement;
    expect(filter).not.toBeNull();
    filter.value = 'CASH'; filter.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(payments).toHaveBeenLastCalledWith(expect.objectContaining({ paymentMethod: 'CASH', page: 1 }));
    const recordButtons = fixture.nativeElement.querySelectorAll('.payment-records button[data-record-cash]');
    expect(recordButtons.length).toBe(1);
    recordButtons[0].click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cash-booking-summary').textContent).toContain('BK-CASH-42');
    expect(fixture.nativeElement.querySelector('.cash-booking-summary').textContent).toContain('Cash Customer');
    expect(fixture.nativeElement.querySelector('input[formControlName="reservationId"]')).toBeNull();
    expect(component.form.controls.reservationId.value).toBe(42);
    expect(component.form.controls.amount.value).toBe(0);
    expect(fixture.nativeElement.querySelector('input[formControlName="reference"]')).toBeNull();
    component.form.patchValue({ amount: null }); component.save();
    expect(recordPayment).not.toHaveBeenCalled();
    component.form.patchValue({ amount: 8000.01 }); component.save();
    expect(recordPayment).not.toHaveBeenCalled();
    component.form.controls.amount.setValue(5000); component.save();
    expect(recordPayment).toHaveBeenCalledWith(expect.objectContaining({ reservationId: 42, method: 'CASH', amount: 5000, requestId: expect.any(String) }));
    expect(recordPayment.mock.calls[0]?.[0]).not.toHaveProperty('reference');
    expect(component.selectedCashBooking()).toBeNull();
  });

  it('records without a manual receipt reference and prevents duplicate recording while saving', async () => {
    const pending = new Subject<unknown>();
    const recordPayment = vi.fn((_value: unknown) => pending);
    await TestBed.configureTestingModule({ imports: [AdminPaymentsPage], providers: [provideRouter([]), {
      provide: AdminService, useValue: {
        payments: () => of({ data: { items: [{ id: 7, reservationId: 42, bookingReference: 'BK-CASH-42', customerName: 'Cash Customer',
          amountDue: 10000, amountPaid: 0, paymentMethod: 'CASH', status: 'PENDING', bookingStatus: 'AWAITING_PAYMENT' }], total: 1, page: 1, pageSize: 20, totalPages: 1 } }),
        paymentProofs: () => of({ data: { items: [], total: 0, page: 1, pageSize: 8, totalPages: 1 } }), recordPayment,
      },
    }] }).overrideComponent(AdminPaymentsPage, { remove: { imports: [AdminShellComponent] }, add: { imports: [ShellStub] } }).compileComponents();
    const fixture = TestBed.createComponent(AdminPaymentsPage);
    const component = fixture.componentInstance as any;
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button[admin-actions]').click();
    fixture.detectChanges();
    expect(component.paymentMethod).toBe('CASH');
    expect(component.showForm()).toBe(false);
    fixture.nativeElement.querySelector('button[data-record-cash]').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button[admin-actions]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.admin-form button[type="submit"]')).not.toBeNull();
    component.form.setValue({ reservationId: 42, amount: 5000, method: 'CASH', paymentDate: '2026-10-31' });
    for (const method of ['BANK_TRANSFER']) {
      component.form.controls.method.setValue(method);
      component.save();
      expect(recordPayment).not.toHaveBeenCalled();
    }
    component.form.controls.method.setValue('CASH');
    component.save();
    component.save();
    fixture.detectChanges();
    expect(recordPayment).toHaveBeenCalledTimes(1);
    expect(recordPayment.mock.calls[0]![0]).toMatchObject({ paymentDate: '2026-10-31', requestId: expect.any(String), amount: 5000 });
    expect(fixture.nativeElement.querySelector('.admin-form button[type="submit"]').disabled).toBe(true);
    pending.next({ success: true, data: { reference: 'CASH-AUTOMATIC-001' } }); pending.complete();
    fixture.detectChanges();
    expect(component.showForm()).toBe(false);
    expect(component.recordedCashReference()).toBe('CASH-AUTOMATIC-001');
    expect(fixture.nativeElement.textContent).toContain('CASH-AUTOMATIC-001');
    expect(component.message()).toBe('Cash received and recorded.');
    expect(component.error()).toBe('');
    expect(fixture.nativeElement.querySelector('button[admin-actions]')).not.toBeNull();
  });

  it('reuses the same request ID after a lost response so retrying cannot create a second cash receipt', async () => {
    const recordPayment = vi.fn((_input: unknown) => throwError(() => new Error('Response lost')));
    await TestBed.configureTestingModule({ imports: [AdminPaymentsPage], providers: [provideRouter([]), {
      provide: AdminService, useValue: { recordPayment,
        payments: () => of({ data: { items: [], page: 1, totalPages: 0 } }),
        paymentProofs: () => of({ data: { items: [], page: 1, totalPages: 0 } }) },
    }] }).overrideComponent(AdminPaymentsPage, { remove: { imports: [AdminShellComponent] }, add: { imports: [ShellStub] } }).compileComponents();
    const fixture = TestBed.createComponent(AdminPaymentsPage);
    const component = fixture.componentInstance as any;
    const booking = { reservationId: 42, paymentMethod: 'CASH', bookingStatus: 'AWAITING_PAYMENT', amountDue: 10000, amountPaid: 0 };
    component.recordCash(booking); component.form.controls.amount.setValue(5000);
    component.save(); component.save();
    expect(recordPayment).toHaveBeenCalledTimes(2);
    const first = recordPayment.mock.calls[0]![0] as { requestId: string };
    expect(first.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(recordPayment.mock.calls[1]![0]).toEqual(first);
    component.cancelCashPayment(); component.recordCash(booking);
    component.form.controls.amount.setValue(5000); component.save();
    expect(recordPayment.mock.calls[2]![0]).toEqual(first);
    fixture.destroy();
    const reloaded = TestBed.createComponent(AdminPaymentsPage);
    const resumed = reloaded.componentInstance as any;
    resumed.recordCash(booking); resumed.form.controls.amount.setValue(5000); resumed.save();
    expect(recordPayment.mock.calls[3]![0]).toEqual(first);
    resumed.cancelCashPayment();
    resumed.recordCash({ ...booking, amountPaid: 5000, reference: `CASH-${first.requestId.replace(/-/g, '').toUpperCase()}` });
    resumed.form.controls.amount.setValue(2500); resumed.save();
    expect((recordPayment.mock.calls[4]![0] as { requestId: string }).requestId).not.toBe(first.requestId);
  });

  it('cancel clears the selected cash booking and does not record a payment', async () => {
    const recordPayment = vi.fn();
    await TestBed.configureTestingModule({ imports: [AdminPaymentsPage], providers: [provideRouter([]), {
      provide: AdminService, useValue: { recordPayment,
        payments: () => of({ data: { items: [], page: 1, pageSize: 20, totalPages: 0 } }),
        paymentProofs: () => of({ data: { items: [], page: 1, pageSize: 8, totalPages: 0 } }) },
    }] }).overrideComponent(AdminPaymentsPage, { remove: { imports: [AdminShellComponent] }, add: { imports: [ShellStub] } }).compileComponents();
    const fixture = TestBed.createComponent(AdminPaymentsPage);
    const component = fixture.componentInstance as any;
    component.recordCash({ reservationId: 42, bookingReference: 'BK-42', customerName: 'Customer', paymentMethod: 'CASH',
      bookingStatus: 'PAYMENT_VERIFIED', amountDue: 10000, amountPaid: 5000 });
    fixture.detectChanges();
    expect(component.showForm()).toBe(true);
    fixture.nativeElement.querySelector('.cash-form-actions button[type="button"]').click();
    component.save(); fixture.detectChanges();
    expect(component.selectedCashBooking()).toBeNull();
    expect(fixture.nativeElement.querySelector('.admin-form')).toBeNull();
    expect(recordPayment).not.toHaveBeenCalled();
  });

  it('labels GCash proofs and recorded payments without changing methods or amounts', async () => {
    const items = ['E_WALLET', 'BANK_TRANSFER', 'CASH'].map((method, index) => ({
      id: String(index + 1), method, claimedAmount: [100, 12500, 138888][index],
      createdAt: '2026-10-29T04:00:00Z', transactionReference: `REFERENCE-${index}`, status: 'SUBMITTED',
    }));
    const payments = [{ id: 1, reference: 'BK-1', customerName: 'Customer', amountDue: 1000, amountPaid: 100,
      method: 'E-WALLET', paymentMethod: 'E-WALLET', paymentDate: '2026-10-29', status: 'PARTIALLY_PAID' }];
    await TestBed.configureTestingModule({ imports: [AdminPaymentsPage], providers: [provideRouter([]), {
      provide: AdminService, useValue: {
        payments: () => of({ data: { items: payments, total: 1, page: 1, pageSize: 20, totalPages: 1 } }),
        paymentProofs: () => of({ data: { items, total: 3, page: 1, pageSize: 8, totalPages: 1 } }),
      },
    }] }).overrideComponent(AdminPaymentsPage, {
      remove: { imports: [AdminShellComponent] }, add: { imports: [ShellStub] },
    }).compileComponents();
    const fixture = TestBed.createComponent(AdminPaymentsPage);
    fixture.detectChanges();
    const rows = [...fixture.nativeElement.querySelectorAll('.payment-proof-records tbody tr')] as HTMLTableRowElement[];
    expect(rows.map(row => row.cells[1]!.textContent!.trim())).toEqual(['GCash', 'Bank transfer', 'Cash']);
    expect(rows.map(row => row.cells[2]!.textContent!.trim())).toEqual(['₱100.00', '₱12,500.00', '₱138,888.00']);
    expect(fixture.nativeElement.querySelector('.payment-proof-records thead th.is-number')?.textContent).toBe('Claimed amount');
    expect(items.map(item => item.method)).toEqual(['E_WALLET', 'BANK_TRANSFER', 'CASH']);
    expect(fixture.nativeElement.querySelector('.payment-records td[data-label="Method"]').textContent.trim()).toBe('GCash');
    expect(payments[0]!.paymentMethod).toBe('E-WALLET');

    (fixture.componentInstance as any).data.set({ items: [
      { ...payments[0], id: 1, amountPaid: 0, status: 'PENDING', latestProofStatus: 'SUBMITTED' },
      { ...payments[0], id: 2, amountPaid: 500, status: 'PARTIALLY_PAID', latestProofStatus: 'VERIFIED' },
      { ...payments[0], id: 3, amountPaid: 1000, status: 'PAID', latestProofStatus: 'VERIFIED' },
      { ...payments[0], id: 4, amountPaid: 0, status: 'PENDING', latestProofStatus: 'REJECTED' },
    ], totalItems: 4, page: 1, pageSize: 20, totalPages: 1 });
    fixture.detectChanges();
    expect([...fixture.nativeElement.querySelectorAll('.payment-records td[data-label="Status"] .status-badge')]
      .map((badge: Element) => badge.textContent?.trim()))
      .toEqual(['Pending Verification', 'Down Payment Paid', 'Fully Paid', 'Payment Rejected']);
  });
});
