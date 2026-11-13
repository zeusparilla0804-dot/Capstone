import { hasCashPaymentAction, hasOnlinePaymentAction, bookingTotal, depositProgress, hasIncompleteDownPayment } from '../../core/utils/customer-payment-status';
import { PaymentMethodLabelPipe } from '../../shared/pipes/payment-method-label.pipe';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse, HttpEventType, HttpResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, HostListener, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { MAX_PAYMENT_PROOF_BYTES, PaymentMethod, PaymentProof, PaymentProofMethod, PaymentProofSubmission } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { BookingService } from '../../core/services/booking.service';
import { PaymentProofService } from '../../core/services/payment-proof.service';
import { PortalBadgeStateService } from '../../core/services/portal-badge-state.service';
import { DashboardNavItem, DashboardSidebarComponent } from '../../shared/components/dashboard-sidebar/dashboard-sidebar';
import { SuccessDialogComponent } from '../../shared/components/success-dialog/success-dialog';
import { customerNavItems } from '../../shared/navigation/customer-navigation';
import { cashDepositDeadline } from '../../core/utils/cash-payment-policy';
import { PaymentBankOption, PaymentDestinationService } from '../../core/services/payment-destination.service';

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
  private readonly proofService = inject(PaymentProofService);
  private readonly destinationService = inject(PaymentDestinationService);
  private readonly destroyRef = inject(DestroyRef);
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
  protected readonly estimatedTotal = computed(() => this.booking() ? bookingTotal(this.booking()!) : 0);
  protected readonly requiredDeposit = computed(() => depositProgress(this.estimatedTotal(), this.booking()?.amountPaid ?? 0).requiredDeposit);
  protected readonly remainingDeposit = computed(() => depositProgress(this.estimatedTotal(), this.booking()?.amountPaid ?? 0).remainingDeposit);
  protected readonly outstandingBalance = computed(() => depositProgress(this.estimatedTotal(), this.booking()?.amountPaid ?? 0).outstandingBalance);
  protected readonly incompleteDeposit = computed(() => !!this.booking() && hasIncompleteDownPayment(this.booking()!));
  protected readonly proofPending = computed(() => this.booking()?.status === 'payment_submitted' || this.booking()?.latestProofStatus?.toUpperCase() === 'SUBMITTED' || this.proofs().some(proof => proof.status === 'submitted'));
  protected readonly replacingProof = signal(false);
  protected readonly replacementBankId = signal('original');
  protected readonly pendingProof = computed(() => this.proofs().find(proof => proof.status === 'submitted'));

  protected beginProofReplacement(): void {
    const proof = this.pendingProof();
    if (!proof || this.submitting() || this.historyLoading() || this.historyError()) return;
    this.form.patchValue({ claimedAmount: proof.claimedAmount, paymentDate: proof.paymentDate, transactionReference: proof.transactionReference ?? '' });
    this.replacingProof.set(true);
    this.replacementBankId.set('original');
  }
  protected readonly paymentAmountChoice = signal<'deposit' | 'full' | 'custom'>('deposit');
  protected readonly proofs = signal<readonly PaymentProof[]>([]);
  protected readonly bankOptions = signal<readonly PaymentBankOption[]>([]);
  protected readonly destination = signal<PaymentBankOption | null>(null);
  protected readonly qrLoading = signal(false);
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
  protected get todayPaymentDate(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  protected get displayedPaymentDate(): string {
    return (this.replacingProof() ? this.pendingProof()?.paymentDate : undefined) ?? this.todayPaymentDate;
  }
  protected readonly form = new FormGroup({
    method: new FormControl<PaymentProofMethod>('BANK_TRANSFER', { nonNullable: true, validators: Validators.required }),
    claimedAmount: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(0.01)] }),
    transactionReference: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(150)] }),
    paymentDate: new FormControl(this.todayPaymentDate, { nonNullable: true, validators: Validators.required }),
  });
  protected readonly navItems = computed(() => customerNavItems(this.badgeState.customerBookingCount(), this.badgeState.customerBillingCount()));
  private initializedBookingKey: string | null = null;
  private destinationRequest = 0;
  private readonly refreshTimer: ReturnType<typeof setInterval>;

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
    this.refreshTimer = setInterval(() => this.refreshPayments(), 30_000);
  }

  ngOnDestroy(): void { clearInterval(this.refreshTimer); this.destinationRequest++; if (this.destinationImage()) URL.revokeObjectURL(this.destinationImage()); }

  @HostListener('window:focus')
  protected refreshPayments(): void {
    if (this.submitting()) return;
    this.bookingService.loadMine();
    if (!this.historyLoading()) this.loadProofs();
  }



  protected loadDestination(): void {
    const request = ++this.destinationRequest;
    this.destinationLoading.set(true); this.destinationError.set(''); this.destination.set(null); this.bankOptions.set([]); this.qrLoading.set(false);
    if (this.destinationImage()) URL.revokeObjectURL(this.destinationImage());
    this.destinationImage.set('');
    if (!this.eligible()) { this.destinationLoading.set(false); return; }
    this.destinationService.options(this.bookingId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: items => {
        if (request !== this.destinationRequest) return;
        this.bankOptions.set(items.filter(item => item.method === 'BANK_TRANSFER')); this.destinationLoading.set(false);
      },
      error: () => { if (request === this.destinationRequest) { this.destinationLoading.set(false); this.destinationError.set('Unable to load bank accounts. Refresh to try again.'); } },
    });
  }

  protected chooseDestination(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    const account = this.bankOptions().find(item => String(item.id) === id) ?? null;
    const request = ++this.destinationRequest;
    this.destination.set(account); this.destinationError.set('');
    if (this.destinationImage()) URL.revokeObjectURL(this.destinationImage());
    this.destinationImage.set(''); this.qrLoading.set(!!account);
    if (!account) return;
    this.destinationService.optionImage(this.bookingId, account).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: blob => {
        if (request !== this.destinationRequest) return;
        this.destinationImage.set(URL.createObjectURL(blob)); this.qrLoading.set(false);
      },
      error: () => {
        if (request !== this.destinationRequest) return;
        this.qrLoading.set(false); this.destinationError.set('Unable to load this bank QR. Refresh the accounts and select a bank again. If you already transferred money, contact LA Chef; do not pay again.');
      },
    });
  }

  protected chooseReplacementBank(event: Event): void {
    this.replacementBankId.set((event.target as HTMLSelectElement).value);
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
    if (this.submitting() || this.choosingPayment() || !this.eligible() || this.form.controls.method.value === 'CASH'
      || (this.proofPending() && !this.replacingProof())) return;
    const originalProof = this.replacingProof() ? this.pendingProof() : undefined;
    if (this.replacingProof() && !originalProof) { this.replacingProof.set(false); return; }
    const correctedBank = this.replacingProof() && this.replacementBankId() !== 'original'
      ? this.bankOptions().find(bank => String(bank.id) === this.replacementBankId()) : undefined;
    if (this.replacingProof() && this.replacementBankId() !== 'original' && !correctedBank) {
      this.submitError.set('Select the bank shown on your receipt, or keep the original receiving account.'); return;
    }
    if (!this.replacingProof() && (!this.destination()?.version || !this.destinationImage())) {
      this.submitError.set('Select a bank account and load its QR before submitting payment proof.'); return;
    }
    this.configureReference(this.form.controls.method.value);
    this.form.controls.paymentDate.setValue(originalProof?.paymentDate ?? this.todayPaymentDate);
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
      ...(originalProof ? { destinationId: correctedBank?.id ?? originalProof.destinationId,
        destinationVersion: correctedBank?.version ?? originalProof.destinationVersion, replacesProofId: originalProof.id }
        : { destinationId: this.destination()!.id, destinationVersion: this.destination()!.version }),
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
          this.replacingProof.set(false);
          this.proofs.update(items => [proof, ...items.filter(item => item.id !== proof.id)
            .map(item => item.status === 'submitted' ? { ...item, status: 'superseded' as const } : item)]);
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
