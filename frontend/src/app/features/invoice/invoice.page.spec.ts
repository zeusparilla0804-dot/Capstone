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
  let fixture: ComponentFixture<InvoicePageComponent>;
  let service: { getInvoiceById: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    service = {
      getInvoiceById: vi.fn(() => of({ success: true, data: invoice })),
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

  afterEach(() => vi.restoreAllMocks());

  it('renders the approved reservation agreement and signature lines on the admin invoice', () => {
    expect(service.getInvoiceById).toHaveBeenCalledWith(8, true);
    const agreement = fixture.nativeElement.querySelector('[aria-labelledby="agreement-title"]') as HTMLElement;
    expect(agreement).not.toBeNull();
    expect(agreement.textContent).toContain('50% down payment is required to confirm the reservation');
    expect(agreement.textContent).toContain('remaining balance is due on the event date');
    expect(agreement.textContent).toContain('cancellation by the client will result in forfeiture of 50% of the total reservation amount');

    const signatures = agreement.querySelectorAll('.invoice-signature');
    expect(signatures).toHaveLength(2);
    expect(signatures[0]?.textContent).toContain('Customer signature');
    expect(signatures[1]?.textContent).toContain('Authorized LA Chef representative');
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

  it('keeps payment history on screen but excludes it from the one-page printed agreement', () => {
    const paymentHistory = fixture.nativeElement.querySelector('.payment-history') as HTMLElement;

    expect(paymentHistory).not.toBeNull();
    expect(paymentHistory.textContent).toContain('GCASH-0042');
    expect(paymentHistory.classList.contains('no-print')).toBe(true);
  });
});
