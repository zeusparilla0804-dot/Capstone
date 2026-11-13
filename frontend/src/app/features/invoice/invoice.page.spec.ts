import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import type { Invoice } from '../../core/models';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { InvoiceService } from '../../core/services/invoice.service';
import { InvoicePageComponent } from './invoice.page';

const invoice: Invoice = {
  invoiceId: 8,
  issuer: { name: 'Maria Santos' },
  invoiceNumber: 'INV-2026-000008',
  issueDate: '2026-10-18T02:00:00.000Z',
  dueDate: '2026-10-25T02:00:00.000Z',
  status: 'PARTIALLY_PAID',
  customer: {
    id: 7,
    name: 'Ana Reyes',
    email: 'ana@example.test',
    phone: '09171234567',
  },
  booking: {
    id: 42,
    reference: 'LC-0042',
    eventType: 'Wedding',
    eventDate: '2026-12-10',
    eventTime: '18:00',
    venue: 'Santa Rosa, Laguna',
    guestCount: 100,
  },
  items: [{ description: 'Diamond Package', quantity: 1, unitPrice: 100000, amount: 100000 }],
  subtotal: 100000,
  discount: 0,
  totalAmount: 100000,
  amountPaid: 50000,
  remainingBalance: 50000,
  payments: [{
    id: 12,
    date: '2026-10-18T02:00:00.000Z',
    reference: 'GCASH-0042',
    method: 'E_WALLET',
    amount: 50000,
    status: 'RECORDED',
  }],
};

describe('InvoicePageComponent', () => {
  it('prints the event time in AM/PM format on invoices and receipts', () => {
    (fixture.componentInstance as any).invoice.set(invoice); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.invoice-document').textContent).toContain('6:00 PM');
    expect(fixture.nativeElement.querySelector('.invoice-document').textContent).not.toContain('18:00');
  });
  it('keeps the receiving bank on every verified installment and identifies unknown historical banks', () => {
    const component = fixture.componentInstance as any;
    component.invoice.set({ ...invoice, amountPaid: 100000, remainingBalance: 0, status: 'PAID', payments: [
      { ...invoice.payments[0], id: 3, method: 'BANK_TRANSFER', amount: 20000, destinationLabel: 'Bank B', destinationAccountName: 'LA Chef B', destinationAccountHint: '2222' },
      { ...invoice.payments[0], id: 2, method: 'BANK_TRANSFER', amount: 30000, destinationLabel: 'Bank B', destinationAccountName: 'LA Chef B', destinationAccountHint: '2222' },
      { ...invoice.payments[0], id: 1, method: 'BANK_TRANSFER', amount: 50000, destinationLabel: 'Bank A at payment', destinationAccountName: 'LA Chef A', destinationAccountHint: '1111' },
      { ...invoice.payments[0], id: 4, method: 'BANK_TRANSFER', amount: 1 },
      { ...invoice.payments[0], id: 5, method: 'CASH', amount: 1 },
    ] }); fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('.payment-history tbody tr');
    expect(rows.length).toBe(5);
    expect(rows[0].textContent).toContain('Bank B'); expect(rows[0].textContent).toContain('LA Chef B');
    expect(rows[2].textContent).toContain('Bank A at payment'); expect(rows[2].textContent).toContain('1111');
    expect(rows[3].textContent).toContain('Bank not recorded'); expect(rows[4].textContent).not.toContain('Bank not recorded');
  });
  it('shows the incomplete deposit as part of the full balance and clears it after the next verified installment', () => {
    const component = fixture.componentInstance as any;
    component.invoice.set({ ...invoice, totalAmount: 154000, subtotal: 154000, amountPaid: 70000, remainingBalance: 84000,
      payments: [{ ...invoice.payments[0], amount: 70000 }] }); fixture.detectChanges();
    const row = fixture.nativeElement.querySelector('[data-testid="remaining-down-payment"]');
    expect(row?.textContent).toContain('7,000.00');
    expect(fixture.nativeElement.querySelector('.invoice-totals').textContent).toContain('84,000.00');
    expect(fixture.nativeElement.textContent).toContain('included in Balance Due');
    expect(fixture.nativeElement.querySelector('.invoice-heading .status-badge').textContent).toContain('Down Payment Incomplete');
    component.invoice.set({ ...component.invoice(), amountPaid: 77000, remainingBalance: 77000 }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="remaining-down-payment"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.invoice-heading .status-badge').textContent).toContain('Down Payment Paid');
  });
  let fixture: ComponentFixture<InvoicePageComponent>;
  let service: { getInvoiceById: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    service = {
      getInvoiceById: vi.fn(() => of({ success: true, data: { ...invoice, amountPaid: 0, remainingBalance: invoice.totalAmount, payments: [], status: 'ISSUED' } })),
    };
    await TestBed.configureTestingModule({
      imports: [InvoicePageComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: { admin: true },
              paramMap: convertToParamMap({ id: '8' }),
            },
          },
        },
        { provide: InvoiceService, useValue: service },
        {
          provide: AdminAuthService,
          useValue: { idleWarning: signal(false),
            user: signal({ id: '1', fullName: 'LA Chef Admin', email: 'admin@lachef.com', role: 'admin' as const }),
            logout: vi.fn(),
            logoutAll: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InvoicePageComponent);
    fixture.detectChanges();
  });

  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('aligns the receipt generation timestamp at the bottom in Philippine time without changing payment dates', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-12T09:45:38Z'));
    service.getInvoiceById.mockReturnValue(of({ success: true, data: invoice }));
    (fixture.componentInstance as any).load(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const footer = root.querySelector('.invoice-document > footer')!;
    const stamp = footer.querySelector('.receipt-generated') as HTMLElement;
    expect(stamp).not.toBeNull();
    expect(stamp.textContent).not.toMatch(/\bPHT\b|Philippine time/i);
    expect(stamp.textContent).toContain('Generated on: Nov 12, 2026, 5:45 PM');
    expect(stamp.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-12T09:45:38.000Z');
    expect(getComputedStyle(stamp).textAlign).toBe('right');
    expect(footer).toBe(root.querySelector('.invoice-document')?.lastElementChild);
    expect(root.querySelector('.payment-history')?.textContent).toContain('Oct 18, 2026');
    const original = stamp.textContent;
    vi.setSystemTime(new Date('2026-11-12T09:46:00Z')); fixture.detectChanges();
    expect(stamp.textContent).toBe(original);
    window.dispatchEvent(new Event('beforeprint'));
    expect(stamp.textContent).toContain('5:46 PM');
  });

  it('updates the timestamp before opening the receipt print dialog and keeps it off unpaid invoices', () => {
    expect(fixture.nativeElement.querySelector('.receipt-generated')).toBeNull();
    (fixture.componentInstance as any).invoice.set(invoice); fixture.detectChanges();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-12T09:50:00Z'));
    let timestampAtPrint: string | undefined;
    const print = vi.spyOn(window, 'print').mockImplementation(() => { timestampAtPrint = fixture.nativeElement.querySelector('.receipt-generated')?.textContent; });
    fixture.nativeElement.querySelector('[data-action="print-receipt"]').click();
    expect(print).toHaveBeenCalledOnce();
    expect(timestampAtPrint).toContain('5:50 PM');
  });

  it('hides payment history when no payment has been recorded', () => {
    expect(fixture.nativeElement.querySelector('.payment-history')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('No payments recorded yet.');
  });

  it('renders the approved reservation agreement and signature lines on the admin invoice', () => {
    expect(service.getInvoiceById).toHaveBeenCalledWith(8, true);
    const agreement = fixture.nativeElement.querySelector('[aria-labelledby="agreement-title"]') as HTMLElement;
    expect(agreement).not.toBeNull();
    expect(agreement.textContent).toContain('50% down payment is required to confirm the reservation');
    expect(agreement.textContent).toContain('remaining balance is due on the event date');
    expect(agreement.textContent).toContain('cancellation by the client will result in forfeiture of 50% of the total reservation amount');

    const signatures = agreement.querySelectorAll('.invoice-signature');
    expect(signatures).toHaveLength(2);
    expect(signatures[0]?.textContent).toContain('Name and signature');
    expect(signatures[1]?.textContent).toContain('Authorized LA Chef representative');
    expect(signatures[0]?.querySelector('.invoice-signature__line')?.textContent?.trim()).toBe(invoice.customer.name);
    expect(signatures[1]?.querySelector('.invoice-signature__line')?.textContent?.trim()).toBe('Maria Santos');
    expect(fixture.nativeElement.querySelector('.invoice-totals')?.textContent).not.toContain('Discount');
    expect(signatures[0]?.querySelector('small')).toBeNull();
    expect(signatures[1]?.querySelector('small')).toBeNull();
    expect(getComputedStyle(signatures[0]!.querySelector('strong')!).textAlign).toBe('center');
    expect(getComputedStyle(signatures[1]!.querySelector('strong')!).textAlign).toBe('center');
  });

  it('prints the complete billing agreement from a clearly named action', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const button = fixture.nativeElement.querySelector('[data-action="print-billing-agreement"]') as HTMLButtonElement;

    expect(button.textContent).toContain('Print billing agreement');
    button.click();
    expect(print).toHaveBeenCalledOnce();
  });

  it('identifies the invoice due date as the balance deadline and preserves its calendar date', () => {
    (fixture.componentInstance as any).invoice.set({ ...invoice, dueDate: '2026-12-10T00:00:00.000Z' });
    fixture.detectChanges();
    const due = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.invoice-heading dl > div'))
      .find(row => row.querySelector('dt')?.textContent?.trim() === 'Balance due');
    expect(due?.querySelector('dd')?.textContent).toContain('Dec 10, 2026');
  });

  it('keeps invoice printing available without an empty payment-history section', () => {
    expect((fixture.nativeElement as HTMLElement).querySelector('.invoice-heading')?.textContent).toContain('INVOICE & BILLING AGREEMENT');
    expect((fixture.nativeElement as HTMLElement).querySelector('.payment-history')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-action="print-billing-agreement"]')).not.toBeNull();
  });

  it('turns a verified down payment into a printable receipt with the recorded transaction and balance', () => {
    (fixture.componentInstance as any).invoice.set(invoice);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('.invoice-heading')?.textContent).toContain('PAYMENT RECEIPT');
    expect(page.querySelector('.invoice-heading h1')?.textContent).toContain('Receipt');
    expect(page.querySelector('.invoice-heading h1')?.textContent).not.toContain('Invoice');
    expect(page.querySelector('.invoice-heading')?.textContent).toContain('GCASH-0042');
    expect(page.querySelector('[data-action="print-receipt"]')?.textContent).toContain('Print receipt');
    expect(page.querySelector('.payment-history')?.classList.contains('no-print')).toBe(false);
    expect(page.querySelector('.payment-history')?.textContent).toContain('GCASH-0042');
    expect(page.querySelector('.payment-history tbody tr td:nth-child(3)')?.textContent?.trim()).toBe('GCash');
    expect(page.querySelector('.invoice-totals')?.textContent).toContain('50,000.00');
    expect(page.querySelector('.invoice-heading .status-badge')?.textContent?.trim()).toBe('Down Payment Paid');
    expect(page.querySelector('.invoice-heading')?.textContent).toContain('Balance due');
    expect(page.querySelector('.invoice-heading')?.textContent).not.toContain('Payment complete');
    expect(page.querySelector('.invoice-agreement')?.textContent).toContain('Any remaining balance is still due.');
    expect(page.querySelector('.invoice-agreement ol')).toBeNull();
    const signatures = page.querySelectorAll('.invoice-signature');
    expect(signatures[0]?.querySelector('.invoice-signature__line')?.textContent?.trim()).toBe(invoice.customer.name);
    expect(signatures[1]?.querySelector('.invoice-signature__line')?.textContent?.trim()).toBe('Maria Santos');
    expect(signatures[0]?.querySelector('small')).toBeNull();
    expect(signatures[1]?.querySelector('small')).toBeNull();
  });

  it('refreshes a completed receipt with both payments and zero balance on returning to the page', () => {
    service.getInvoiceById.mockReturnValue(of({ success: true, data: {
      ...invoice, booking: { ...invoice.booking, status: 'COMPLETED' }, status: 'PAID',
      amountPaid: 100000, remainingBalance: 0,
      payments: [...invoice.payments, { ...invoice.payments[0], id: 13, method: 'CASH', reference: 'CASH-FINAL-42', amount: 50000 }],
    } }));
    window.dispatchEvent(new Event('focus')); fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelectorAll('.payment-history tbody tr')).toHaveLength(2);
    expect(page.querySelector('.payment-history')?.textContent).toContain('CASH-FINAL-42');
    expect(page.textContent).toContain('Completed');
    expect(page.querySelector('.invoice-totals')?.textContent).toContain('0.00');
    expect((fixture.componentInstance as any).invoice().remainingBalance).toBe(0);
  });

  it('replaces the deadline with Payment complete and the final payment date when verified payments cover the total', () => {
    (fixture.componentInstance as any).invoice.set({
      ...invoice, amountPaid: invoice.totalAmount, remainingBalance: 0, status: 'PAID',
      payments: [{ ...invoice.payments[0], id: 13, date: '2026-11-14T00:00:00.000Z', reference: 'FINAL-42' }, invoice.payments[0]],
    });
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('.invoice-heading .status-badge')?.textContent?.trim()).toBe('Fully Paid');
    const complete = Array.from(page.querySelectorAll('.invoice-heading dl > div'))
      .find(row => row.querySelector('dt')?.textContent?.trim() === 'Payment complete');
    expect(complete?.querySelector('dd')?.textContent).toContain('Nov 14, 2026');
    const latest = Array.from(page.querySelectorAll('.invoice-heading dl > div'))
      .find(row => row.querySelector('dt')?.textContent?.trim() === 'Latest payment');
    expect(latest?.querySelector('dd')?.textContent).toContain('Nov 14, 2026');
    expect(page.querySelector('.payment-history tbody tr td')?.textContent).toContain('Nov 14, 2026');
    expect(page.querySelector('.invoice-heading')?.textContent).not.toContain('Balance due');
    expect(page.querySelector('.invoice-heading')?.textContent).not.toContain('Oct 25, 2026');
    expect(page.querySelector('.invoice-totals .balance')?.textContent).toContain('0.00');
    expect(page.querySelector('.invoice-agreement')?.textContent).toContain('Payment received in full. No outstanding balance.');
    expect(page.querySelector('.invoice-agreement')?.textContent).not.toContain('Any remaining balance is still due.');
  });
});
