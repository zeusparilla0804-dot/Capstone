import { HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import type { Booking, PaymentProof } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { BookingService } from '../../core/services/booking.service';
import { PaymentProofService } from '../../core/services/payment-proof.service';
import { PaymentProofPageComponent } from './payment-proof.page';

const booking: Booking = {
  id: '42', reference: 'LC-0042', customerId: '7', eventName: 'Wedding reception', eventType: 'wedding',
  eventDate: '2026-12-10', eventTime: '18:00', venue: 'Santa Rosa, Laguna', guestCount: 100,
  package: { packageId: '3', packageName: 'Premium', pricingType: 'PER_HEAD', pricePerGuest: 850,
    basePrice: null, includedGuests: null, excessGuestPrice: null, packageTotal: 85000 }, addOns: [], discount: 0,
  status: 'awaiting_payment', amountPaid: 10000, createdAt: '2026-10-01', thumbnailUrl: 'assets/test.webp'
};

const submittedProof: PaymentProof = {
  id: '9007199254740993', reservationId: 42, customerId: 7, method: 'E_WALLET', claimedAmount: 5000,
  transactionReference: 'GCASH-42', paymentDate: '2026-10-02', originalFilename: 'proof.png', mimeType: 'image/png',
  byteSize: 100, status: 'submitted', createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z'
};

describe('PaymentProofPageComponent', () => {

  it('shows office-only cash instructions instead of an online proof form', () => {
    bookingState.set([{ ...booking, paymentMethod: 'cash' }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Cash payment instructions');
    expect(fixture.nativeElement.textContent).toContain('LA Chef office');
    expect(fixture.nativeElement.textContent).toContain('December 7, 2026');
    expect(fixture.nativeElement.textContent).toContain('8:00 AM');
    expect(fixture.nativeElement.textContent).toContain('6:00 PM');
    expect(fixture.nativeElement.textContent).toContain('No online payment proof is required');
    expect(fixture.nativeElement.querySelector('#proof-file')).toBeNull();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    (fixture.componentInstance as any).submit();
    expect(proofApi.submitProof).not.toHaveBeenCalled();
    expect(bookingState()[0]!.amountPaid).toBe(10000);
  });

  it('keeps cash instructions and the remaining balance available after the deposit is recorded', () => {
    bookingState.set([{ ...booking, paymentMethod: 'cash', status: 'payment_verified', amountPaid: 42500 }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Cash payment instructions');
    expect(fixture.nativeElement.textContent).toContain('Deposit requirement completed');
    expect(fixture.nativeElement.textContent).not.toContain('Payment proof is not available');
    expect(fixture.nativeElement.querySelector('#proof-file')).toBeNull();
  });

  it('uses a five-day cutoff for big cash events and warns without cancelling an overdue deposit', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-05T10:00:01Z'));
    bookingState.set([{ ...booking, guestCount: 500, paymentMethod: 'cash' }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('December 5, 2026');
    expect(fixture.nativeElement.textContent).toContain('The deposit deadline has passed');
    expect(bookingState()[0]!.status).toBe('awaiting_payment');
    bookingState.set([{ ...booking, guestCount: 500, paymentMethod: 'cash', status: 'payment_verified', amountPaid: 212500 }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('The deposit deadline has passed');
    vi.useRealTimers();
  });

  it('initializes bank-transfer bookings with their selected online payment method', () => {
    bookingState.set([{ ...booking, paymentMethod: 'bank-transfer' }]);
    fixture.detectChanges();
    expect((fixture.componentInstance as any).form.controls.method.value).toBe('BANK_TRANSFER');
  });

  let fixture: ComponentFixture<PaymentProofPageComponent>;
  let bookingState: ReturnType<typeof signal<readonly Booking[]>>;
  let submitEvents: Subject<unknown>;
  let proofApi: { listProofs: ReturnType<typeof vi.fn>; submitProof: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    bookingState = signal<readonly Booking[]>([booking]);
    submitEvents = new Subject();
    proofApi = { listProofs: vi.fn(() => of([])), submitProof: vi.fn(() => submitEvents.asObservable()) };
    await TestBed.configureTestingModule({
      imports: [PaymentProofPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '42' }) } } },
        { provide: BookingService, useValue: { bookings: bookingState.asReadonly(), loading: signal(false), error: signal(''), loadMine: vi.fn() } },
        { provide: PaymentProofService, useValue: proofApi },
        { provide: AuthService, useValue: { user: signal({ id: '7', fullName: 'Klint Charles' }), logout: vi.fn() } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(PaymentProofPageComponent);
    fixture.detectChanges();
  });

  it('shows the submission tool only for eligible booking states', () => {
    expect(fixture.nativeElement.querySelector('input[type="file"]')).not.toBeNull();
    bookingState.set([{ ...booking, status: 'cancelled' }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type="file"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Payment proof is not available');
  });

  for (const lifecycle of ['payment_verified', 'confirmed', 'completed'] as const) {
    it('accepts an online outstanding balance proof for ' + lifecycle + ' and hides the form when paid', () => {
      bookingState.set([{ ...booking, status: lifecycle, paymentMethod: 'bank-transfer', amountPaid: 42500 }]);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('input[type="file"]')).not.toBeNull();
      expect((fixture.componentInstance as any).form.controls.claimedAmount.value).toBe(42500);
      bookingState.set([{ ...booking, status: lifecycle, paymentMethod: 'bank-transfer', amountPaid: 85000 }]);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('input[type="file"]')).toBeNull();
    });
  }

  it('defaults to only the remaining amount needed for the 50% reservation deposit', () => {
    const component = fixture.componentInstance as unknown as {
      form: { controls: { claimedAmount: { value: number | null } } };
    };

    expect(component.form.controls.claimedAmount.value).toBe(32_500);
    expect(fixture.nativeElement.textContent).toContain('50% down payment');
    expect(fixture.nativeElement.querySelector('[data-payment-choice="deposit"]')?.textContent).toContain('₱32,500.00');
    expect(fixture.nativeElement.textContent).toContain('Pay full balance');
  });

  it('lets the customer deliberately switch from the deposit to the full balance', () => {
    const component = fixture.componentInstance as unknown as {
      form: { controls: { claimedAmount: { value: number | null } } };
      selectPaymentAmount(choice: 'deposit' | 'full'): void;
    };

    component.selectPaymentAmount('full');
    fixture.detectChanges();

    expect(component.form.controls.claimedAmount.value).toBe(75_000);
  });

  it('rejects unsupported or over-5-MiB files before submission', () => {
    const component = fixture.componentInstance as unknown as { onFileSelected(event: Event): void };
    const large = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' });
    component.onFileSelected({ target: { files: [large], value: '' } } as unknown as Event);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('5 MB or smaller');
    expect(proofApi.submitProof).not.toHaveBeenCalled();
  });

  it('prevents duplicate submissions and presents a dismissible verification success dialog', () => {
    vi.useFakeTimers();
    const component = fixture.componentInstance as unknown as {
      form: { setValue(value: unknown): void };
      selectedFile: { set(file: File): void };
      submit(): void;
    };
    component.form.setValue({ method: 'E_WALLET', claimedAmount: 5000, transactionReference: 'GCASH-42', paymentDate: '2026-10-02' });
    component.selectedFile.set(new File(['proof'], 'proof.png', { type: 'image/png' }));
    component.submit();
    component.submit();
    expect(proofApi.submitProof).toHaveBeenCalledTimes(1);
    submitEvents.next(new HttpResponse({ body: { success: true, data: submittedProof } }));
    submitEvents.complete();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement | null;
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Payment proof submitted');
    expect(dialog?.textContent).toContain('For verification');
    expect(fixture.nativeElement.querySelector('.form-message--success')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Payment successful');

    (dialog?.querySelector('[aria-label="Close success message"]') as HTMLButtonElement).click();
    vi.advanceTimersByTime(160);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    vi.useRealTimers();
  });

  it('keeps form data and shows a specific duplicate-reference conflict', () => {
    const component = fixture.componentInstance as unknown as {
      form: { setValue(value: unknown): void; value: { transactionReference: string } };
      selectedFile: { set(file: File): void };
      submit(): void;
    };
    component.form.setValue({ method: 'E_WALLET', claimedAmount: 5000, transactionReference: 'USED-REFERENCE', paymentDate: '2026-10-02' });
    component.selectedFile.set(new File(['proof'], 'proof.png', { type: 'image/png' }));
    component.submit();
    submitEvents.error(new HttpErrorResponse({ status: 409, error: { message: 'Transaction reference has already been used.' } }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('already been submitted');
    expect(component.form.value.transactionReference).toBe('USED-REFERENCE');
  });
});
