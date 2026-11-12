import { hasCashPaymentAction, hasOnlinePaymentAction } from '../../core/utils/customer-payment-status';
import { PaymentMethodLabelPipe } from '../../shared/pipes/payment-method-label.pipe';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse, HttpEventType, HttpResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { MAX_PAYMENT_PROOF_BYTES, PaymentMethod, PaymentProof, PaymentProofMethod, PaymentProofSubmission } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { BookingCalculationService } from '../../core/services/booking-calculation.service';
import { BookingService } from '../../core/services/booking.service';
import { PaymentProofService } from '../../core/services/payment-proof.service';
import { PortalBadgeStateService } from '../../core/services/portal-badge-state.service';
import { DashboardNavItem, DashboardSidebarComponent } from '../../shared/components/dashboard-sidebar/dashboard-sidebar';
import { SuccessDialogComponent } from '../../shared/components/success-dialog/success-dialog';
import { customerNavItems } from '../../shared/navigation/customer-navigation';
import { cashDepositDeadline } from '../../core/utils/cash-payment-policy';
import { PaymentDestination, PaymentDestinationService } from '../../core/services/payment-destination.service';

@Component({
  selector: 'app-payment-proof-page',
  imports: [PaymentMethodLabelPipe, CurrencyPipe, DatePipe, DashboardSidebarComponent, ReactiveFormsModule, RouterLink, SuccessDialogComponent],
  templateUrl: './payment-proof.page.html',
  styleUrl: './payment-proof.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentProofPageComponent implements OnDestroy {
  @ViewChild('proofInput') private proofInput?: ElementRef<HTMLInputElement>;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly bookingService = inject(BookingService);
  private readonly calculationService = inject(BookingCalculationService);
  private readonly proofService = inject(PaymentProofService);
  private readonly destinationService = inject(PaymentDestinationService);
  private readonly badgeState = inject(PortalBadgeStateService);
  protected readonly bookingId = this.route.snapshot.paramMap.get('id') ?? '';
  protected readonly booking = computed(() => this.bookingService.bookings().find(item => item.id === this.bookingId));
  protected readonly cashPayment = computed(() => this.booking()?.paymentMethod === 'cash');
  protected readonly itemStatusApproved = computed(() => this.booking()?.status === 'approved');
  protected readonly paymentChoiceNeeded = computed(() => this.booking()?.status === 'awaiting_payment' && !this.booking()?.paymentMethod);
  protected readonly choosingPayment = signal(false);
  protected readonly paymentChoiceError = signal('');
  protected readonly cashDeadline = computed(() => {
    const item = this.booking();
    return item?.paymentMethod === 'cash' ? cashDepositDeadline(item.eventDate, item.guestCount) : null;
  });
  protected get cashDepositOverdue(): boolean {
    const deadline = this.cashDeadline();
    return !!deadline && this.remainingDeposit() > 0 && Date.now() > new Date(deadline.at).getTime();
  }
  protected readonly cashInstructionsAvailable = computed(() => !!this.booking() && hasCashPaymentAction(this.booking()!));
  protected readonly eligible = computed(() => !!this.booking() && hasOnlinePaymentAction(this.booking()!));
  protected readonly waitingForQr = computed(() => this.eligible() && !this.destinationImage());
  private readonly totals = computed(() => {
    const item = this.booking();
    return item ? this.calculationService.calculateTotals(item) : null;
  });
  protected readonly estimatedTotal = computed(() => this.totals()?.total ?? 0);
  protected readonly requiredDeposit = computed(() => this.totals()?.downPayment ?? 0);
  protected readonly remainingDeposit = computed(() => Math.max(this.requiredDeposit() - (this.booking()?.amountPaid ?? 0), 0));
  protected readonly outstandingBalance = computed(() => Math.max(this.estimatedTotal() - (this.booking()?.amountPaid ?? 0), 0));
  protected readonly paymentAmountChoice = signal<'deposit' | 'full' | 'custom'>('deposit');
  protected readonly proofs = signal<readonly PaymentProof[]>([]);
  protected readonly destination = signal<PaymentDestination | null>(null);
  protected readonly destinationLoading = signal(true);
  protected readonly destinationError = signal('');
  protected readonly destinationImage = signal('');
  protected readonly historyLoading = signal(true);
  protected readonly historyError = signal('');
  protected readonly paymentChoiceAvailable = computed(() => {
    const item = this.booking();
    return !!item && item.status === 'awaiting_payment'
      && item.amountPaid === 0 && this.proofs().length === 0;
  });
  protected readonly canChoosePayment = computed(() => this.paymentChoiceAvailable()
    && !this.historyLoading() && !this.historyError() && !this.submitting() && !this.choosingPayment());
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly fileError = signal('');
  protected readonly submitError = signal('');
  protected readonly successMessage = signal('');
  protected readonly submitting = signal(false);
  protected readonly uploadProgress = signal(0);
  protected readonly submissionDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  protected readonly form = new FormGroup({
    method: new FormControl<PaymentProofMethod>('BANK_TRANSFER', { nonNullable: true, validators: Validators.required }),
    claimedAmount: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(0.01)] }),
    transactionReference: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(150)] }),
    paymentDate: new FormControl(this.submissionDate, { nonNullable: true, validators: Validators.required }),
  });
  protected readonly navItems = computed(() => customerNavItems(this.badgeState.customerBookingCount()));
  private initializedBookingKey: string | null = null;
  private destinationRequest = 0;
  private readonly qrRefreshTimer: ReturnType<typeof setInterval>;

  constructor() {
    effect(() => this.badgeState.setCustomerBookings(this.bookingService.bookings()));
    effect(() => {
      const item = this.booking();
      if (!item) return;
      if (item.status === 'awaiting_payment' && !item.paymentMethod) {
        void this.router.navigate(['/book-event'], { queryParams: { paymentBooking: item.id, step: 4 }, replaceUrl: true });
        return;
      }
      const key = `${item.id}:${item.paymentMethod ?? ''}:${item.amountPaid}`;
      if (this.initializedBookingKey === key) return;
      this.initializedBookingKey = key;
      this.form.controls.method.setValue(item.paymentMethod === 'bank-transfer' ? 'BANK_TRANSFER' : item.paymentMethod === 'cash' ? 'CASH' : 'E_WALLET');
      if (item.paymentMethod) this.form.controls.method.disable({ emitEvent: false });
      this.selectPaymentAmount(this.remainingDeposit() > 0 ? 'deposit' : 'full');
      this.loadDestination();
    });
    if (!this.booking()) this.bookingService.loadMine();
    this.loadProofs();
    this.form.controls.method.valueChanges.subscribe(method => this.configureReference(method));
    this.qrRefreshTimer = setInterval(() => {
      if (this.eligible() && !this.destinationImage() && !this.destinationLoading()) this.loadDestination();
    }, 15_000);
  }

  ngOnDestroy(): void { clearInterval(this.qrRefreshTimer); if (this.destinationImage()) URL.revokeObjectURL(this.destinationImage()); }



  protected loadDestination(): void {
    const request = ++this.destinationRequest;
    this.destinationLoading.set(true); this.destinationError.set(''); this.destination.set(null);
    if (this.destinationImage()) URL.revokeObjectURL(this.destinationImage());
    this.destinationImage.set('');
    if (this.booking()?.paymentMethod !== 'bank-transfer') { this.destinationLoading.set(false); return; }
    this.destinationService.assigned(this.bookingId).subscribe({
      next: item => {
        if (request !== this.destinationRequest) return;
        const supported = item?.method === 'BANK_TRANSFER' ? item : null;
        this.destination.set(supported); this.destinationLoading.set(false);
        if (supported) this.destinationService.image(supported.id).subscribe({
          next: blob => { if (request === this.destinationRequest) this.destinationImage.set(URL.createObjectURL(blob)); },
          error: () => { if (request === this.destinationRequest) this.destinationError.set('Unable to load the assigned QR image.'); },
        });
      },
      error: () => { if (request === this.destinationRequest) { this.destinationLoading.set(false); this.destinationError.set('Unable to check payment instructions.'); } },
    });
  }

  protected async choosePayment(method: PaymentMethod): Promise<void> {
    if (method === 'gcash') return;
    if (!this.canChoosePayment() || this.booking()?.paymentMethod === method) return;
    this.choosingPayment.set(true);
    this.paymentChoiceError.set('');
    try {
      await this.bookingService.choosePaymentMethod(this.bookingId, method);
    } catch (error) {
      this.paymentChoiceError.set(error instanceof HttpErrorResponse && typeof error.error?.message === 'string'
        ? error.error.message : 'Unable to save your payment method. Please try again.');
    } finally {
      this.choosingPayment.set(false);
    }
  }

  protected async onPaymentMethodChange(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const previous = this.booking()?.paymentMethod ?? '';
    const method = select.value;
    if (!['bank-transfer', 'cash'].includes(method)) {
      select.value = previous;
      return;
    }
    await this.choosePayment(method as PaymentMethod);
    this.loadDestination();
    if (this.booking()?.paymentMethod !== method) select.value = previous;
  }

  protected selectPaymentAmount(choice: 'deposit' | 'full'): void {
    this.paymentAmountChoice.set(choice);
    const amount = choice === 'deposit' ? this.remainingDeposit() : this.outstandingBalance();
    this.form.controls.claimedAmount.setValue(amount || null);
  }

  protected useEnteredAmount(): void {
    this.paymentAmountChoice.set('custom');
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
    if (this.submitting() || this.choosingPayment() || !this.eligible() || this.form.controls.method.value === 'CASH' || !this.destination() || !this.destinationImage()) return;
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

  protected dismissSuccess(): void {
    this.successMessage.set('');
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
