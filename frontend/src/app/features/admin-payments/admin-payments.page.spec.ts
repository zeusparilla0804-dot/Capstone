import { Component, Input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { AdminService } from '../../core/services/admin.service';
import { AdminShellComponent } from '../../shared/components/admin-shell/admin-shell';
import { AdminPaymentsPage } from './admin-payments.page';

@Component({ selector: 'app-admin-shell', template: '<ng-content />' })
class ShellStub {
  @Input() title = '';
  @Input() description = '';
}

describe('AdminPaymentsPage payment-proof queue', () => {
  it('requires a cash receipt reference and prevents duplicate recording while saving', async () => {
    const pending = new Subject<unknown>();
    const recordPayment = vi.fn((_value: unknown) => pending);
    await TestBed.configureTestingModule({ imports: [AdminPaymentsPage], providers: [provideRouter([]), {
      provide: AdminService, useValue: {
        payments: () => of({ data: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 } }),
        paymentProofs: () => of({ data: { items: [], total: 0, page: 1, pageSize: 8, totalPages: 1 } }), recordPayment,
      },
    }] }).overrideComponent(AdminPaymentsPage, { remove: { imports: [AdminShellComponent] }, add: { imports: [ShellStub] } }).compileComponents();
    const fixture = TestBed.createComponent(AdminPaymentsPage);
    const component = fixture.componentInstance as any;
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button[admin-actions]').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button[admin-actions]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.admin-form button[type="submit"]')).not.toBeNull();
    component.form.setValue({ reservationId: 42, amount: 5000, method: 'CASH', reference: '', paymentDate: '2026-10-31' });
    component.save();
    expect(recordPayment).not.toHaveBeenCalled();
    for (const method of ['BANK_TRANSFER', 'E-WALLET']) {
      component.form.controls.method.setValue(method);
      component.save();
      expect(recordPayment).not.toHaveBeenCalled();
    }
    component.form.controls.method.setValue('CASH');
    component.form.controls.reference.setValue('CASH-RECEIPT-001');
    component.save();
    component.save();
    fixture.detectChanges();
    expect(recordPayment).toHaveBeenCalledTimes(1);
    expect(recordPayment.mock.calls[0]![0]).toMatchObject({ paymentDate: '2026-10-31', reference: 'CASH-RECEIPT-001', amount: 5000 });
    expect(fixture.nativeElement.querySelector('.admin-form button[type="submit"]').disabled).toBe(true);
    pending.next({ success: true }); pending.complete();
    fixture.detectChanges();
    expect(component.showForm()).toBe(false);
    expect(component.form.controls.reference.value).toBe('');
    expect(component.message()).toBe('Cash received and recorded.');
    expect(component.error()).toBe('');
    expect(fixture.nativeElement.querySelector('button[admin-actions]')).not.toBeNull();
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
  });
});
