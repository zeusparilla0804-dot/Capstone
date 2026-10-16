import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse, HttpEventType, HttpResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { MAX_PAYMENT_PROOF_BYTES, PaymentProof, PaymentProofMethod, PaymentProofSubmission } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { BookingService } from '../../core/services/booking.service';
import { PaymentProofService } from '../../core/services/payment-proof.service';
import { PortalBadgeStateService } from '../../core/services/portal-badge-state.service';
import { DashboardNavItem, DashboardSidebarComponent } from '../../shared/components/dashboard-sidebar/dashboard-sidebar';
import { customerNavItems } from '../../shared/navigation/customer-navigation';

@Component({
  selector: 'app-payment-proof-page',
  imports: [CurrencyPipe, DatePipe, DashboardSidebarComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './payment-proof.page.html',
  styleUrl: './payment-proof.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentProofPageComponent {
  @ViewChild('proofInput') private proofInput?: ElementRef<HTMLInputElement>;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly bookingService = inject(BookingService);
  private readonly proofService = inject(PaymentProofService);
  private readonly badgeState = inject(PortalBadgeStateService);
  protected readonly bookingId = this.route.snapshot.paramMap.get('id') ?? '';
  protected readonly booking = computed(() => this.bookingService.bookings().find(item => item.id === this.bookingId));
  protected readonly eligible = computed(() => ['awaiting_payment', 'payment_submitted'].includes(this.booking()?.status ?? ''));
  protected readonly estimatedTotal = computed(() => {
    const item = this.booking();
    return item ? item.package.packageTotal + item.addOns.reduce((sum, addOn) => sum + addOn.price, 0) - item.discount : 0;
  });
  protected readonly outstandingBalance = computed(() => Math.max(this.estimatedTotal() - (this.booking()?.amountPaid ?? 0), 0));
  protected readonly proofs = signal<readonly PaymentProof[]>([]);
  protected readonly historyLoading = signal(true);
  protected readonly historyError = signal('');
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly fileError = signal('');
  protected readonly submitError = signal('');
  protected readonly successMessage = signal('');
  protected readonly submitting = signal(false);
  protected readonly uploadProgress = signal(0);
  protected readonly form = new FormGroup({
    method: new FormControl<PaymentProofMethod>('E_WALLET', { nonNullable: true, validators: Validators.required }),
    claimedAmount: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(0.01)] }),
    transactionReference: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(150)] }),
    paymentDate: new FormControl(new Date().toISOString().slice(0, 10), { nonNullable: true, validators: Validators.required }),
  });
  protected readonly navItems = computed(() => customerNavItems(this.badgeState.customerBookingCount()));

  constructor() {
    effect(() => this.badgeState.setCustomerBookings(this.bookingService.bookings()));
    if (!this.booking()) this.bookingService.loadMine();
    this.loadProofs();
    if (this.booking()) this.form.controls.claimedAmount.setValue(this.outstandingBalance() || null);
    this.form.controls.method.valueChanges.subscribe(method => this.configureReference(method));
  }

  protected loadProofs(): void {
    this.historyLoading.set(true);
    this.historyError.set('');
    this.proofService.listProofs(this.bookingId).pipe(finalize(() => this.historyLoading.set(false))).subscribe({
      next: proofs => this.proofs.set(proofs),
      error: () => this.historyError.set('Unable to load payment proof history.'),
    });
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.fileError.set('');
    this.selectedFile.set(null);
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.fileError.set('Choose a JPEG, PNG, or WebP image.');
      input.value = '';
      return;
    }
    if (file.size > MAX_PAYMENT_PROOF_BYTES) {
      this.fileError.set('Choose an image that is 5 MB or smaller.');
      input.value = '';
      return;
    }
    this.selectedFile.set(file);
  }

  protected removeFile(): void {
    this.selectedFile.set(null);
    this.fileError.set('');
    if (this.proofInput) this.proofInput.nativeElement.value = '';
  }

  protected submit(): void {
    if (this.submitting() || !this.eligible()) return;
    this.configureReference(this.form.controls.method.value);
    this.form.markAllAsTouched();
    const file = this.selectedFile();
    if (!file) this.fileError.set('Choose a payment proof image.');
    if (this.form.invalid || !file) return;
    const value = this.form.getRawValue();
    const input: PaymentProofSubmission = {
      method: value.method,
      claimedAmount: value.claimedAmount!,
      paymentDate: value.paymentDate,
      ...(value.method === 'CASH' ? {} : { transactionReference: value.transactionReference.trim() }),
    };
    this.submitting.set(true);
    this.uploadProgress.set(0);
    this.submitError.set('');
    this.successMessage.set('');
    this.proofService.submitProof(this.bookingId, input, file).pipe(finalize(() => this.submitting.set(false))).subscribe({
      next: event => {
        if (event.type === HttpEventType.UploadProgress) {
          this.uploadProgress.set(event.total ? Math.round(event.loaded * 100 / event.total) : 0);
        } else if (event instanceof HttpResponse && event.body?.data) {
          const proof = event.body.data;
          this.proofs.update(items => [proof, ...items.filter(item => item.id !== proof.id)]);
          this.successMessage.set('Payment proof submitted for verification.');
          this.uploadProgress.set(100);
          this.removeFile();
          this.bookingService.loadMine();
        }
      },
      error: error => this.submitError.set(this.submissionMessage(error)),
    });
  }

  protected statusLabel(proof: PaymentProof): string {
    return ({ submitted: 'For verification', verified: 'Verified', rejected: 'Needs attention', superseded: 'Replaced' } as const)[proof.status];
  }

  protected fileSize(bytes: number): string {
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  protected async handleNavAction(item: DashboardNavItem): Promise<void> {
    if (item.label === 'Logout') { await this.auth.logout(); await this.router.navigate([item.route]); }
  }

  private configureReference(method: PaymentProofMethod): void {
    const control = this.form.controls.transactionReference;
    control.setValidators(method === 'CASH' ? [Validators.maxLength(150)] : [Validators.required, Validators.maxLength(150)]);
    control.updateValueAndValidity({ emitEvent: false });
  }

  private submissionMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return 'Unable to submit the payment proof. Try again.';
    const message = typeof error.error?.message === 'string' ? error.error.message : '';
    if (error.status === 409 && message.includes('reference')) return 'This transaction reference has already been submitted.';
    if (error.status === 409 && message.includes('exceeds')) return 'The amount entered is higher than the outstanding balance.';
    if (error.status === 409 && message.includes('not awaiting')) return 'This booking is no longer accepting payment proofs. Refresh your bookings.';
    if (error.status === 413) return 'Choose an image that is 5 MB or smaller.';
    return message || 'Unable to submit the payment proof. Try again.';
  }
}
