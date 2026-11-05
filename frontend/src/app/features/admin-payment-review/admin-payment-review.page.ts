import { paymentMethodLabel } from '../../shared/pipes/payment-method-label.pipe';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import type { AdminPaymentProofDetail } from '../../core/models';
import { AdminService } from '../../core/services/admin.service';
import { AdminShellComponent } from '../../shared/components/admin-shell/admin-shell';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge';

@Component({
  selector: 'app-admin-payment-review',
  imports: [AdminShellComponent, StatusBadgeComponent, CurrencyPipe, DatePipe, FormsModule, RouterLink],
  templateUrl: './admin-payment-review.page.html',
  styleUrl: './admin-payment-review.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPaymentReviewPage {
  private readonly api = inject(AdminService);
  private readonly route = inject(ActivatedRoute);
  protected readonly proofId = this.route.snapshot.paramMap.get('id') ?? '';
  protected readonly detail = signal<AdminPaymentProofDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly feedback = signal('');
  protected readonly reviewError = signal('');
  protected readonly mutationPending = signal(false);
  protected readonly imageUnavailable = signal(false);
  protected readonly imageZoom = signal(1);
  protected readonly verifiedAmount = signal(0);
  protected correctionReason = '';
  protected rejectionReason = '';
  protected readonly canReview = computed(() => this.detail()?.proof.status === 'SUBMITTED');
  protected readonly returnBookingId = computed(() => {
    const id = this.detail()?.booking.id;
    return id && this.route.snapshot.queryParamMap?.get('booking') === String(id) ? id : null;
  });
  protected readonly amountCorrected = computed(() =>
    Math.round(this.verifiedAmount() * 100) !== Math.round((this.detail()?.proof.claimedAmount ?? 0) * 100),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    if (!/^[1-9]\d*$/.test(this.proofId)) {
      this.loading.set(false);
      this.error.set('Payment proof not found.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.imageUnavailable.set(false);
    this.api.paymentProof(this.proofId).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (response) => {
        this.detail.set(response.data);
        this.verifiedAmount.set(response.data.proof.verifiedAmount ?? response.data.proof.claimedAmount);
      },
      error: () => this.error.set('Unable to load this payment proof.'),
    });
  }

  protected verify(): void {
    if (!this.canReview() || this.mutationPending()) return;
    const amount = Number(this.verifiedAmount());
    if (!Number.isFinite(amount) || amount <= 0) {
      this.reviewError.set('Enter a valid amount to verify.');
      return;
    }
    if (this.amountCorrected() && !this.correctionReason.trim()) {
      this.reviewError.set('Explain the corrected amount before verifying.');
      return;
    }
    this.submitReview(
      this.api.verifyPaymentProof(this.proofId, amount, this.correctionReason.trim() || undefined),
      'Payment verified and recorded.',
    );
  }

  protected reject(): void {
    if (!this.canReview() || this.mutationPending()) return;
    const reason = this.rejectionReason.trim();
    if (!reason) {
      this.reviewError.set('Enter a reason before rejecting this proof.');
      return;
    }
    this.submitReview(
      this.api.rejectPaymentProof(this.proofId, reason),
      'Proof rejected. The customer can submit a replacement.',
    );
  }

  protected fileSize(bytes: number): string {
    return bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  protected methodLabel(method: string): string {
    return paymentMethodLabel(method);
  }

  protected previewUrl(fileUrl: string): string {
    return `${fileUrl}${fileUrl.includes('?') ? '&' : '?'}view=inline`;
  }

  protected zoomIn(): void {
    this.imageZoom.update((value) => Math.min(3, value + 0.25));
  }

  protected zoomOut(): void {
    this.imageZoom.update((value) => Math.max(0.5, value - 0.25));
  }

  protected resetZoom(): void {
    this.imageZoom.set(1);
  }

  private submitReview(
    request: ReturnType<AdminService['verifyPaymentProof']>,
    message: string,
  ): void {
    this.mutationPending.set(true);
    this.reviewError.set('');
    this.feedback.set('');
    request.pipe(finalize(() => this.mutationPending.set(false))).subscribe({
      next: () => {
        this.feedback.set(message);
        this.load();
      },
      error: (error: HttpErrorResponse) => {
        const apiMessage = typeof error.error?.message === 'string' ? error.error.message : '';
        if (error.status === 409 && /already|status|refresh/i.test(apiMessage)) {
          this.reviewError.set('This proof was reviewed in another session. The latest record is shown.');
          this.load();
        } else if (error.status === 409 && /exceed|balance|overpayment/i.test(apiMessage)) {
          this.reviewError.set('The verified amount is higher than the outstanding balance. Review the amount and try again.');
        } else {
          this.reviewError.set(apiMessage || 'Unable to complete this review.');
        }
      },
    });
  }
}
