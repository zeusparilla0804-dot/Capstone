import { HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import type { Booking, PaymentProof } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { BookingService } from '../../core/services/booking.service';
import { PaymentProofService } from '../../core/services/payment-proof.service';
import { PaymentDestinationService } from '../../core/services/payment-destination.service';
import { PaymentProofPageComponent } from './payment-proof.page';

const booking: Booking = {
  id: '42', reference: 'LC-0042', customerId: '7', eventName: 'Wedding reception', eventType: 'wedding',
  eventDate: '2026-12-10', eventTime: '18:00', venue: 'Santa Rosa, Laguna', guestCount: 100,
  package: { packageId: '3', packageName: 'Premium', pricingType: 'PER_HEAD', pricePerGuest: 850,
    basePrice: null, includedGuests: null, excessGuestPrice: null, packageTotal: 85000 }, addOns: [], discount: 0,
  status: 'awaiting_payment', paymentMethod: 'bank-transfer', amountPaid: 10000, createdAt: '2026-10-01', thumbnailUrl: 'assets/test.webp'
};

const submittedProof: PaymentProof = {
  id: '9007199254740993', reservationId: 42, customerId: 7, method: 'BANK_TRANSFER', claimedAmount: 5000,
  transactionReference: 'BANK-42', paymentDate: '2026-10-02', originalFilename: 'proof.png', mimeType: 'image/png',
  byteSize: 100, status: 'submitted', createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z'
};

describe('PaymentProofPageComponent', () => {
  it('offers an explicit bank choice without waiting for an administrator assignment', () => {
    const api = TestBed.inject(PaymentDestinationService) as any;
    api.options = vi.fn(() => of([
      { id: 1, method: 'BANK_TRANSFER', label: 'Bank A', accountName: 'LA Chef', accountHint: '1111', version: 'a'.repeat(64) },
      { id: 2, method: 'BANK_TRANSFER', label: 'Bank B', accountName: 'LA Chef', accountHint: '2222', version: 'b'.repeat(64) },
    ]));
    api.optionImage = vi.fn(() => of(new Blob(['qr'], { type: 'image/png' })));
    (fixture.componentInstance as any).loadDestination(); fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('#bank-account') as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.value).toBe('');
    select.value = '2'; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(api.optionImage).toHaveBeenCalledWith('42', expect.objectContaining({ id: 2 }));
    expect(fixture.nativeElement.querySelector('.destination-panel')?.textContent).toContain('Bank B');
    expect(fixture.nativeElement.textContent).not.toContain('LA Chef will assign');
  });
  it('shows review-only instructions for a pending proof until the customer explicitly chooses replacement', () => {
    bookingState.set([{ ...booking, total: 154000, amountPaid: 70000, status: 'payment_submitted', latestProofStatus: 'SUBMITTED' }]);
    (fixture.componentInstance as any).proofs.set([{ ...submittedProof, claimedAmount: 7000 }]); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.payment-amount-picker')).toBeNull();
    expect(fixture.nativeElement.querySelector('.destination-panel')).toBeNull();
    expect(fixture.nativeElement.querySelector('#proof-file')).toBeNull();
    const replace = [...fixture.nativeElement.querySelectorAll('button')].find((button: any) => button.textContent.includes('Replace submitted proof')) as HTMLButtonElement;
    expect(replace).toBeDefined(); replace.click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#proof-file')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.destination-panel')).toBeNull();
    expect((fixture.componentInstance as any).form.controls.claimedAmount.value).toBe(7000);
    expect((fixture.nativeElement.querySelector('#payment-date') as HTMLInputElement | null)?.value).toBe(submittedProof.paymentDate);
  });

  it('keeps Bank B selected when an older Bank A image finishes last and releases its image', () => {
    const component = fixture.componentInstance as any;
    const api = TestBed.inject(PaymentDestinationService) as any;
    const bankA = { id: 1, method: 'BANK_TRANSFER', label: 'Bank A', accountName: 'LA Chef', accountHint: '1111', version: 'a'.repeat(64) };
    const bankB = { ...bankA, id: 2, label: 'Bank B', version: 'b'.repeat(64) };
    const first = new Subject<Blob>(); const second = new Subject<Blob>();
    api.options = vi.fn(() => of([bankA, bankB]));
    api.optionImage = vi.fn((_id, bank) => bank.id === 1 ? first : second);
    component.loadDestination(); fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('#bank-account') as HTMLSelectElement;
    select.value = '1'; select.dispatchEvent(new Event('change'));
    select.value = '2'; select.dispatchEvent(new Event('change'));
    const b = new Blob(['Bank B']); second.next(b); first.next(new Blob(['Bank A']));
    fixture.detectChanges();
    expect(component.destination().id).toBe(2);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledWith(b);
    expect(fixture.nativeElement.querySelector('.destination-panel img')?.getAttribute('src')).toBe(component.destinationImage());
    fixture.destroy(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:assigned-qr');
  });

  it('preserves an already transferred payment when the selected bank changed', () => {
    const component = fixture.componentInstance as any;
    component.destination.set({ id: 1, version: 'a'.repeat(64) }); component.destinationImage.set('blob:test');
    const file = new File(['proof'], 'proof.png', { type: 'image/png' });
    component.selectedFile.set(file);
    component.form.setValue({ method: 'BANK_TRANSFER', claimedAmount: 5000, transactionReference: 'SENT-42', paymentDate: '2026-10-02' });
    component.submit();
    submitEvents.error(new HttpErrorResponse({ status: 409, error: { message: 'This bank account changed. If you already transferred money, contact LA Chef; do not pay again.' } }));
    fixture.detectChanges();
    expect(component.selectedFile()).toBe(file);
    expect(component.form.getRawValue()).toMatchObject({ claimedAmount: 5000, transactionReference: 'SENT-42' });
    expect(fixture.nativeElement.textContent).toContain('do not pay again');
    expect(bookingState()[0]!.amountPaid).toBe(10000);
  });

  it('keeps corrected proof history readable after full payment without offering a new payment', () => {
    bookingState.set([{ ...booking, invoiceId: 8, total: 154000, amountPaid: 154000, status: 'confirmed' }]);
    (fixture.componentInstance as any).proofs.set([{ ...submittedProof, status: 'verified', verifiedAmount: 70000, correctionReason: 'Only 70000 received.' }]); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.history-list')?.textContent).toContain('Only 70000 received.');
    expect(fixture.nativeElement.querySelector('a[href="/invoice/8"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#proof-file')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Payment proof is not available');
  });
  it('explains a corrected partial deposit and defaults the next proof to only the shortfall', () => {
    bookingState.set([{ ...booking, total: 154000, amountPaid: 70000, status: 'awaiting_payment', latestProofStatus: 'VERIFIED' }]);
    const component = fixture.componentInstance as any;
    component.proofs.set([{ ...submittedProof, status: 'verified', claimedAmount: 77000, verifiedAmount: 70000,
      correctionReason: 'Bank statement confirms only 70000.', reviewedAt: '2026-11-12T10:00:00Z' }]); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="deposit-shortfall"]')?.textContent).toContain('7,000.00');
    expect(fixture.nativeElement.textContent).toContain('Bank statement confirms only 70000.');
    expect(fixture.nativeElement.querySelector('.history-list')?.textContent).toContain('Verified amount');
    expect(component.form.controls.claimedAmount.value).toBe(7000);
  });
  it('lets the customer enter the actual receipt date and omits a separate submission date', () => {
    const root = fixture.nativeElement as HTMLElement;
    const date = root.querySelector<HTMLInputElement>('input#payment-date');
    expect(date).not.toBeNull();
    date!.value = '2026-10-02'; date!.dispatchEvent(new Event('input'));
    expect((fixture.componentInstance as any).form.controls.paymentDate.value).toBe('2026-10-02');
    expect(root.querySelector('[data-testid="submission-date"]')).toBeNull();
    expect(root.textContent).not.toContain('Submission date');
  });

  it('corrects the receiving bank on an existing proof without asking for another transfer', () => {
    const component = fixture.componentInstance as any;
    bookingState.set([{ ...booking, status: 'payment_submitted', latestProofStatus: 'SUBMITTED' }]);
    component.proofs.set([{ ...submittedProof, destinationId: 2, destinationVersion: 'b'.repeat(64), destinationLabel: 'Bank B original' }]);
    fixture.detectChanges(); component.beginProofReplacement(); fixture.detectChanges();
    const bank = fixture.nativeElement.querySelector('#replacement-bank') as HTMLSelectElement;
    expect(bank).not.toBeNull(); expect(bank.value).toBe('original');
    bank.value = '1'; bank.dispatchEvent(new Event('change')); fixture.detectChanges();
    component.selectedFile.set(new File(['proof'], 'receipt.png', { type: 'image/png' }));
    component.submit();
    expect(proofApi.submitProof).toHaveBeenCalledWith('42', expect.objectContaining({ destinationId: 1,
      destinationVersion: 'a'.repeat(64), paymentDate: submittedProof.paymentDate, replacesProofId: submittedProof.id }), expect.any(File));
    expect(fixture.nativeElement.querySelector('.destination-panel')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No additional transfer');
  });
  it('keeps legacy GCash amounts visible without a QR or new receipt upload', async () => {
    bookingState.set([{ ...booking, paymentMethod: 'gcash' }]); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('GCash is no longer accepted');
    expect(fixture.nativeElement.textContent).toContain('10,000');
    expect(fixture.nativeElement.querySelector('#proof-file')).toBeNull();
    await (fixture.componentInstance as any).choosePayment('gcash');
    expect(TestBed.inject(BookingService).choosePaymentMethod).not.toHaveBeenCalled();
    expect(proofApi.submitProof).not.toHaveBeenCalled();
  });
  it('waits for the admin payment request before allowing a payment choice', async () => {
    bookingState.set([{ ...booking, status: 'approved', amountPaid: 0, paymentMethod: undefined }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Waiting for payment request');
    expect(fixture.nativeElement.querySelector('#proof-file')).toBeNull();
    const component = fixture.componentInstance as any;
    await component.choosePayment('bank-transfer');
    expect(TestBed.inject(BookingService).choosePaymentMethod).not.toHaveBeenCalled();
    bookingState.set([{ ...booking, status: 'awaiting_payment', amountPaid: 0, paymentMethod: undefined }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Choose payment method');
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/book-event'], {
      queryParams: { paymentBooking: '42', step: 4 }, replaceUrl: true,
    });
    await component.choosePayment('bank-transfer');
    expect(TestBed.inject(BookingService).choosePaymentMethod).toHaveBeenCalledWith('42', 'bank-transfer');
  });

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
    bookingState.set([{ ...booking, guestCount: 501, paymentMethod: 'cash' }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('December 5, 2026');
    expect(fixture.nativeElement.textContent).toContain('The deposit deadline has passed');
    expect(bookingState()[0]!.status).toBe('awaiting_payment');
    bookingState.set([{ ...booking, guestCount: 501, paymentMethod: 'cash', status: 'payment_verified', amountPaid: 212500 }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('The deposit deadline has passed');
    vi.useRealTimers();
  });

  it('initializes bank-transfer bookings with their selected online payment method', () => {
    bookingState.set([{ ...booking, paymentMethod: 'bank-transfer' }]);
    fixture.detectChanges();
    expect((fixture.componentInstance as any).form.controls.method.value).toBe('BANK_TRANSFER');
    expect(fixture.nativeElement.querySelector('[data-testid="selected-payment-method"]')?.textContent).toContain('Bank transfer');
    expect(fixture.nativeElement.querySelector('#payment-method')).toBeNull();
    expect(fixture.nativeElement.querySelector('#bank-account')).not.toBeNull();
  });

  it('displays the saved payment method without asking the customer to select it again', () => {
    bookingState.set([{ ...booking, amountPaid: 0 }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#payment-method')).toBeNull();
    expect(fixture.nativeElement.querySelector('#bank-account')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="selected-payment-method"]')?.textContent).toContain('Bank transfer');
    expect(TestBed.inject(BookingService).choosePaymentMethod).not.toHaveBeenCalled();
    bookingState.set([{ ...booking, paymentMethod: 'cash', amountPaid: 0 }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Pay at the LA Chef office');
    expect(fixture.nativeElement.querySelector('#proof-file')).toBeNull();
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    (fixture.componentInstance as any).proofs.set([submittedProof]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
  });

  let fixture: ComponentFixture<PaymentProofPageComponent>;
  let bookingState: ReturnType<typeof signal<readonly Booking[]>>;
  let submitEvents: Subject<unknown>;
  let proofApi: { listProofs: ReturnType<typeof vi.fn>; submitProof: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    URL.createObjectURL = vi.fn(() => 'blob:assigned-qr');
    URL.revokeObjectURL = vi.fn();
    bookingState = signal<readonly Booking[]>([booking]);
    submitEvents = new Subject();
    proofApi = { listProofs: vi.fn(() => of([])), submitProof: vi.fn(() => submitEvents.asObservable()) };
    await TestBed.configureTestingModule({
      imports: [PaymentProofPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '42' }) } } },
        { provide: BookingService, useValue: { bookings: bookingState.asReadonly(), loading: signal(false), error: signal(''), loadMine: vi.fn(),
          choosePaymentMethod: vi.fn(async (_id: string, method: string) => {
            bookingState.set([{ ...bookingState()[0]!, status: 'awaiting_payment', paymentMethod: method === 'bank-transfer' ? 'bank-transfer' : method as any }]);
          }) } },
        { provide: PaymentProofService, useValue: proofApi },
        { provide: PaymentDestinationService, useValue: {
          options: vi.fn(() => of([{ id: 1, label: 'Bank transfer', method: 'BANK_TRANSFER', accountName: 'LA Chef', accountHint: 'Ending 1234', version: 'a'.repeat(64) }])),
          optionImage: vi.fn(() => of(new Blob(['qr'], { type: 'image/png' }))),
          assigned: vi.fn(() => of({ id: 1, label: 'Bank transfer', method: 'BANK_TRANSFER', accountName: 'LA Chef', accountHint: 'Ending 1234' })),
          image: vi.fn(() => of(new Blob(['qr'], { type: 'image/png' }))),
        } },
        { provide: AuthService, useValue: { user: signal({ id: '7', fullName: 'Klint Charles' }), logout: vi.fn() } }
      ]
    }).compileComponents();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
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
      destination: { set(value: unknown): void };
      destinationImage: { set(value: string): void };
      submit(): void;
    };
    component.destination.set({ id: 1, label: 'Bank transfer', method: 'BANK_TRANSFER', accountName: 'LA Chef', accountHint: 'Ending 1234', version: 'a'.repeat(64) });
    component.destinationImage.set('blob:test');
    component.form.setValue({ method: 'BANK_TRANSFER', claimedAmount: 5000, transactionReference: 'BANK-42', paymentDate: '2026-10-02' });
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
      destination: { set(value: unknown): void };
      destinationImage: { set(value: string): void };
      submit(): void;
    };
    component.destination.set({ id: 1, label: 'Bank transfer', method: 'BANK_TRANSFER', accountName: 'LA Chef', accountHint: 'Ending 1234', version: 'a'.repeat(64) });
    component.destinationImage.set('blob:test');
    component.form.setValue({ method: 'BANK_TRANSFER', claimedAmount: 5000, transactionReference: 'USED-REFERENCE', paymentDate: '2026-10-02' });
    component.selectedFile.set(new File(['proof'], 'proof.png', { type: 'image/png' }));
    component.submit();
    submitEvents.error(new HttpErrorResponse({ status: 409, error: { message: 'Transaction reference has already been used.' } }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('already been submitted');
    expect(component.form.value.transactionReference).toBe('USED-REFERENCE');
  });
});
