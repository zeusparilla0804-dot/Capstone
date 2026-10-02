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
  package: { packageId: '3', packageName: 'Premium', pricePerGuest: 850 }, addOns: [], discount: 0,
  status: 'awaiting_payment', amountPaid: 10000, createdAt: '2026-10-01', thumbnailUrl: 'assets/test.webp'
};

const submittedProof: PaymentProof = {
  id: '9007199254740993', reservationId: 42, customerId: 7, method: 'E_WALLET', claimedAmount: 5000,
  transactionReference: 'GCASH-42', paymentDate: '2026-10-02', originalFilename: 'proof.png', mimeType: 'image/png',
  byteSize: 100, status: 'submitted', createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z'
};

describe('PaymentProofPageComponent', () => {
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
    bookingState.set([{ ...booking, status: 'confirmed' }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type="file"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Payment proof is not available');
  });

  it('rejects unsupported or over-5-MiB files before submission', () => {
    const component = fixture.componentInstance as unknown as { onFileSelected(event: Event): void };
    const large = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' });
    component.onFileSelected({ target: { files: [large], value: '' } } as unknown as Event);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('5 MB or smaller');
    expect(proofApi.submitProof).not.toHaveBeenCalled();
  });

  it('prevents duplicate submissions and renders success as For verification', () => {
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
    expect(fixture.nativeElement.textContent).toContain('For verification');
    expect(fixture.nativeElement.textContent).not.toContain('Payment successful');
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
