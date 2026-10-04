import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import type { AdminPaymentProofDetail } from '../../core/models';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminService } from '../../core/services/admin.service';
import { AdminPaymentReviewPage } from './admin-payment-review.page';

const review: AdminPaymentProofDetail = {
  proof: { id: '9007199254740993', reservationId: 42, customerId: 7, paymentId: 5, method: 'E_WALLET', claimedAmount: 5000,
    transactionReference: 'GCASH-42', paymentDate: '2026-10-02', originalFilename: 'receipt.png', mimeType: 'image/png', byteSize: 1200,
    status: 'SUBMITTED', createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z', fileUrl: 'http://localhost:3000/api/payment-proofs/1/file' },
  booking: { id: 42, reference: 'LC-0042', status: 'PAYMENT_SUBMITTED', eventDate: '2026-12-10' },
  customer: { id: 7, name: 'Klint Charles', email: 'klint@example.test' },
  payment: { id: 5, amountDue: 85000, amountPaid: 10000, status: 'PARTIALLY_PAID', outstandingBalance: 75000 },
  invoice: { id: 8, number: 'INV-2026-000008', totalAmount: 85000, status: 'ISSUED' }
};

describe('AdminPaymentReviewPage', () => {
  let fixture: ComponentFixture<AdminPaymentReviewPage>;
  let verifyResult: Subject<unknown>;
  let api: { paymentProof: ReturnType<typeof vi.fn>; verifyPaymentProof: ReturnType<typeof vi.fn>; rejectPaymentProof: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    verifyResult = new Subject();
    api = {
      paymentProof: vi.fn(() => of({ success: true, data: review })),
      verifyPaymentProof: vi.fn(() => verifyResult.asObservable()),
      rejectPaymentProof: vi.fn(() => of({ success: true, data: review.proof }))
    };
    await TestBed.configureTestingModule({
      imports: [AdminPaymentReviewPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '9007199254740993' }) } } },
        { provide: AdminService, useValue: api },
        { provide: AdminAuthService, useValue: { user: signal({ fullName: 'Admin' }), logout: vi.fn() } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(AdminPaymentReviewPage);
    fixture.detectChanges();
  });

  it('renders protected proof metadata, image, and review controls', () => {
    const image = fixture.nativeElement.querySelector('img[alt="Customer payment receipt"]') as HTMLImageElement;
    const original = fixture.nativeElement.querySelector('a.original-link') as HTMLAnchorElement;
    expect(image.src).toContain('/api/payment-proofs/1/file?view=inline');
    expect(original.href).toContain('/api/payment-proofs/1/file');
    expect(original.href).not.toContain('view=inline');
    expect(fixture.nativeElement.textContent).toContain('GCASH-42');
    expect(fixture.nativeElement.textContent).toContain('Verify payment');
    expect(fixture.nativeElement.textContent).toContain('Reject proof');
    expect(fixture.nativeElement.querySelector('[aria-label="Zoom in"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[aria-label="Zoom out"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[aria-label="Reset zoom"]')).toBeTruthy();
  });

  it('provides bounded keyboard-accessible proof zoom controls', () => {
    const image = fixture.nativeElement.querySelector('img[alt="Customer payment receipt"]') as HTMLImageElement;
    (fixture.nativeElement.querySelector('[aria-label="Zoom in"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(image.style.transform).toContain('1.25');
    (fixture.nativeElement.querySelector('[aria-label="Reset zoom"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(image.style.transform).toContain('1');
  });

  it('requires an explanation when the verified amount is corrected', () => {
    const component = fixture.componentInstance as unknown as { verifiedAmount: { set(value: number): void }; verify(): void };
    component.verifiedAmount.set(4500);
    component.verify();
    fixture.detectChanges();
    expect(api.verifyPaymentProof).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Explain the corrected amount');
  });

  it('requires a customer-facing reason before rejecting a proof', () => {
    const component = fixture.componentInstance as unknown as { reject(): void };
    component.reject();
    fixture.detectChanges();
    expect(api.rejectPaymentProof).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Enter a reason');
  });

  it('preserves entered values after an overpayment response', () => {
    api.verifyPaymentProof.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'Verified amount exceeds outstanding balance.' } })));
    const component = fixture.componentInstance as unknown as { verifiedAmount: { set(value: number): void; (): number }; correctionReason: string; verify(): void };
    component.verifiedAmount.set(90000);
    component.correctionReason = 'Receipt amount was confirmed manually.';
    component.verify();
    fixture.detectChanges();
    expect(api.verifyPaymentProof).toHaveBeenCalledTimes(1);
    expect(component.verifiedAmount()).toBe(90000);
    expect(fixture.nativeElement.textContent).toContain('outstanding balance');
  });

  it('prevents duplicate mutations while a review request is pending', () => {
    const component = fixture.componentInstance as unknown as { verify(): void };
    component.verify();
    component.verify();
    fixture.detectChanges();
    expect(api.verifyPaymentProof).toHaveBeenCalledTimes(1);
    expect((fixture.nativeElement.querySelector('[data-testid="verify-proof"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('refreshes the proof after a stale review conflict', () => {
    api.verifyPaymentProof.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'already reviewed' } })));
    const component = fixture.componentInstance as unknown as { verify(): void };
    component.verify();
    fixture.detectChanges();
    expect(api.paymentProof).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.textContent).toContain('reviewed in another session');
  });
});

