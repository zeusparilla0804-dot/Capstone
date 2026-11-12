import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import type { AdminPaymentProofDetail } from '../../core/models';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminService } from '../../core/services/admin.service';
import { ActionFeedbackService } from '../../core/services/action-feedback.service';
import { AdminPaymentReviewPage } from './admin-payment-review.page';

const review: AdminPaymentProofDetail = {
  proof: { id: '9007199254740993', reservationId: 42, customerId: 7, paymentId: 5, method: 'BANK_TRANSFER', claimedAmount: 5000,
    transactionReference: 'BANK-42', paymentDate: '2026-10-02', originalFilename: 'receipt.png', mimeType: 'image/png', byteSize: 1200,
    status: 'SUBMITTED', createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z', fileUrl: 'http://localhost:3000/api/payment-proofs/1/file' },
  booking: { id: 42, reference: 'LC-0042', status: 'PAYMENT_SUBMITTED', eventDate: '2026-12-10' },
  customer: { id: 7, name: 'Klint Charles', email: 'klint@example.test' },
  payment: {
    id: 5, amountDue: 85000, amountPaid: 10000, status: 'PARTIALLY_PAID',
    requiredDeposit: 42500, remainingDeposit: 32500, outstandingBalance: 75000
  },
  invoice: { id: 8, number: 'INV-2026-000008', totalAmount: 85000, status: 'ISSUED' }
};

describe('AdminPaymentReviewPage', () => {
  it('keeps a legacy GCash proof readable without allowing a new ledger credit', () => {
    const component = fixture.componentInstance as any;
    component.detail.set({ ...review, proof: { ...review.proof, method: 'E_WALLET' } });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('GCash is no longer accepted');
    expect(fixture.nativeElement.querySelector('[data-testid="verify-proof"]')).toBeNull();
    component.verify(); component.requestReview('verify');
    expect(api.verifyPaymentProof).not.toHaveBeenCalled();
    expect(component.canReview()).toBe(true);
  });
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
        { provide: AdminAuthService, useValue: { idleWarning: signal(false), user: signal({ fullName: 'Admin' }), logout: vi.fn() } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(AdminPaymentReviewPage);
    fixture.detectChanges();
  });

  it('confirms rejection with the reason and does not send a cancelled review', () => {
    const component = fixture.componentInstance as any; const feedback = TestBed.inject(ActionFeedbackService);
    component.rejectionReason = 'Wrong payment account'; component.requestReview('reject');
    expect(api.rejectPaymentProof).not.toHaveBeenCalled();
    expect(feedback.confirmation()?.message).toContain('Wrong payment account');
    feedback.decide(false); expect(api.rejectPaymentProof).not.toHaveBeenCalled();
    component.requestReview('reject'); feedback.decide(true);
    expect(api.rejectPaymentProof).toHaveBeenCalledExactlyOnceWith('9007199254740993', 'Wrong payment account');
  });

  it('confirms the verified amount before sending a payment review', () => {
    const component = fixture.componentInstance as any; const feedback = TestBed.inject(ActionFeedbackService);
    component.requestReview('verify'); expect(api.verifyPaymentProof).not.toHaveBeenCalled();
    expect(feedback.confirmation()?.message).toContain('5,000.00'); feedback.decide(true);
    expect(api.verifyPaymentProof).toHaveBeenCalledOnce();
  });

  it('renders protected proof metadata, image, and review controls', () => {
    const image = fixture.nativeElement.querySelector('img[alt="Customer payment receipt"]') as HTMLImageElement;
    const original = fixture.nativeElement.querySelector('a.original-link') as HTMLAnchorElement;
    expect(image.src).toContain('/api/payment-proofs/1/file?view=inline');
    expect(original.href).toContain('/api/payment-proofs/1/file');
    expect(original.href).not.toContain('view=inline');
    expect(fixture.nativeElement.textContent).toContain('BANK-42');
    expect(fixture.nativeElement.textContent).toContain('Verify payment');
    expect(fixture.nativeElement.textContent).toContain('Reject proof');
    expect(fixture.nativeElement.querySelector('[aria-label="Zoom in"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[aria-label="Zoom out"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[aria-label="Reset zoom"]')).toBeTruthy();
  });

  it('reopens reviewed receipts as read-only and returns to their reservation history', () => {
    (TestBed.inject(ActivatedRoute).snapshot as any).queryParamMap = convertToParamMap({ booking: '42' });
    api.paymentProof.mockReturnValue(of({ success: true, data: { ...review, proof: { ...review.proof, status: 'VERIFIED', verifiedAmount: 5000 } } }));
    (fixture.componentInstance as any).load();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.admin-back-link').getAttribute('href')).toBe('/admin/bookings/42');
    expect(fixture.nativeElement.querySelector('img[alt="Customer payment receipt"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('This proof is verified.');
    expect(fixture.nativeElement.querySelector('[data-testid="verify-proof"]')).toBeNull();
    (fixture.componentInstance as any).verify();
    (fixture.componentInstance as any).reject();
    expect(api.verifyPaymentProof).not.toHaveBeenCalled();
    expect(api.rejectPaymentProof).not.toHaveBeenCalled();
  });

  it('shows the payment state from the refreshed verified balance and proof decision', () => {
    const badge = () => fixture.nativeElement.querySelector('.review-lead .status-badge') as HTMLElement;
    expect(badge().textContent?.trim()).toBe('Pending Verification');
    for (const [amountPaid, proofStatus, expected] of [
      [42500, 'VERIFIED', 'Down Payment Paid'],
      [85000, 'VERIFIED', 'Fully Paid'],
      [0, 'REJECTED', 'Payment Rejected'],
    ] as const) {
      api.paymentProof.mockReturnValue(of({ success: true, data: {
        ...review, booking: { ...review.booking, status: 'CONFIRMED' }, proof: { ...review.proof, status: proofStatus },
        payment: { ...review.payment!, amountPaid },
      } }));
      (fixture.componentInstance as any).load();
      fixture.detectChanges();
      expect(badge().textContent?.trim()).toBe(expected);
    }
  });

  it('distinguishes the required deposit from the full outstanding balance', () => {
    const content = fixture.nativeElement.textContent as string;
    expect(content).toContain('Required deposit');
    expect(content).toContain('Remaining to secure reservation');
    expect(content).toContain('₱42,500.00');
    expect(content).toContain('₱32,500.00');
    expect(content).toContain('Outstanding balance');
    expect(content).toContain('₱75,000.00');
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

