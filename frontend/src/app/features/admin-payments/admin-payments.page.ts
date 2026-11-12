import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { afterNextRender, Component, ElementRef, inject, Injector, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AdminPayment, AdminPaymentProof, PageResult } from '../../core/models';
import { AdminService } from '../../core/services/admin.service';
import { ActionFeedbackService } from '../../core/services/action-feedback.service';
import { AdminShellComponent } from '../../shared/components/admin-shell/admin-shell';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge';
import { PaymentMethodLabelPipe, paymentMethodLabel } from '../../shared/pipes/payment-method-label.pipe';
import { adminPaymentDisplayStatus } from '../../core/utils/payment-display-status';

@Component({
  selector: 'app-admin-payments',
  imports: [PaymentMethodLabelPipe, AdminShellComponent, StatusBadgeComponent, FormsModule, ReactiveFormsModule, CurrencyPipe, DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './admin-payments.page.html',
  styleUrl: './admin-payments.page.scss',
})
export class AdminPaymentsPage {
  protected readonly paymentBadgeStatus = (item: AdminPayment): string => adminPaymentDisplayStatus({
    total: item.amountDue, amountPaid: item.amountPaid, status: item.status,
    latestProofStatus: item.latestProofStatus,
  }) ?? item.status;
  private readonly api = inject(AdminService);
  private readonly feedback = inject(ActionFeedbackService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private loadSequence = 0;
  private readonly cashRequests = new Map<number, string>();
  private cashRequestId = '';
  protected readonly data = signal<PageResult<AdminPayment> | null>(null);
  protected readonly proofs = signal<PageResult<AdminPaymentProof> | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly recordedCashReference = signal('');
  protected readonly showForm = signal(false);
  protected readonly selectedCashBooking = signal<AdminPayment | null>(null);
  protected readonly transactionReference = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(150), Validators.pattern(/\S/)] });
  protected search = '';
  protected status = '';
  protected paymentMethod = '';
  protected page = 1;
  protected readonly form = new FormGroup({
    reservationId: new FormControl(0, { nonNullable: true, validators: Validators.min(1) }),
    amount: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(.01)] }),
    method: new FormControl('CASH', { nonNullable: true, validators: Validators.required }),
    paymentDate: new FormControl(new Date().toISOString().slice(0, 10), { nonNullable: true, validators: Validators.required }),
  });

  constructor() {
    this.load();
    this.loadProofs();
  }

  protected load(page = this.page): void {
    const sequence = ++this.loadSequence;
    this.page = page;
    this.loading.set(true);
    this.api.payments({ page, pageSize: 20, search: this.search, status: this.status, paymentMethod: this.paymentMethod }).subscribe({
      next: r => { if (sequence !== this.loadSequence) return; this.data.set(r.data); this.loading.set(false); this.error.set(''); },
      error: () => { if (sequence !== this.loadSequence) return; this.error.set('Unable to load payments.'); this.loading.set(false); },
    });
  }

  protected showCashBookings(): void {
    if (this.saving()) return;
    this.cancelCashPayment();
    this.paymentMethod = 'CASH';
    this.search = '';
    this.status = '';
    this.load(1);
    afterNextRender(() => this.element.nativeElement.querySelector<HTMLSelectElement>('select[name="paymentMethod"]')?.focus(), { injector: this.injector });
  }

  protected canRecordCash(item: AdminPayment): boolean {
    return item.paymentMethod === 'CASH' && this.canRecordPayment(item);
  }

  protected canRecordPayment(item: AdminPayment): boolean {
    return ['CASH', 'BANK_TRANSFER', 'E-WALLET'].includes(item.paymentMethod ?? '') && Number.isSafeInteger(item.reservationId) && item.reservationId > 0
      && item.amountDue > item.amountPaid
      && ['AWAITING_PAYMENT', 'PAYMENT_SUBMITTED', 'PAYMENT_VERIFIED', 'CONFIRMED', 'COMPLETED'].includes(item.bookingStatus);
  }

  protected recordCash(item: AdminPayment): void {
    if (this.saving() || !this.canRecordPayment(item)) return;
    this.selectedCashBooking.set(item);
    this.cashRequestId = this.cashRequestFor(item);
    this.form.controls.amount.setValidators([Validators.required, Validators.min(.01), Validators.max(Math.round((item.amountDue - item.amountPaid) * 100) / 100)]);
    this.form.reset({ reservationId: item.reservationId, amount: 0, method: item.paymentMethod === 'E-WALLET' ? '' : item.paymentMethod!, paymentDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) });
    this.transactionReference.reset('');
    this.error.set('');
    this.message.set('');
    this.recordedCashReference.set('');
    this.showForm.set(true);
    afterNextRender(() => this.element.nativeElement.querySelector<HTMLInputElement>('input[formControlName="amount"]')?.focus(), { injector: this.injector });
  }

  protected cancelCashPayment(): void {
    if (this.saving()) return;
    this.showForm.set(false);
    this.selectedCashBooking.set(null);
    this.cashRequestId = '';
  }

  protected loadProofs(): void {
    this.api.paymentProofs({ page: 1, pageSize: 8, status: 'SUBMITTED', order: 'oldest' }).subscribe({
      next: r => this.proofs.set(r.data),
      error: () => this.error.set('Unable to load the payment-proof queue.'),
    });
  }

  protected requestSave(): void {
    const booking = this.selectedCashBooking();
    if (this.saving() || !booking || !this.canRecordPayment(booking)) return;
    this.form.markAllAsTouched();
    this.transactionReference.markAsTouched();
    if (this.form.invalid || !['CASH', 'BANK_TRANSFER'].includes(this.form.controls.method.value) || (this.form.controls.method.value !== 'CASH' && this.transactionReference.invalid)) {
      this.feedback.show({ tone: 'error', title: 'Review the payment details', message: 'Enter an amount within the outstanding balance, a payment date, and the actual transaction reference for bank or online payments.' });
      return;
    }
    const amount = this.form.controls.amount.value;
    const date = this.form.controls.paymentDate.value;
    const reference = this.transactionReference.value.trim();
    const method = this.form.controls.method.value;
    const cash = method === 'CASH';
    const formattedAmount = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
    this.feedback.confirm({ title: cash ? 'Record cash payment?' : 'Record verified bank payment?', confirmLabel: cash ? 'Confirm cash received' : 'Confirm payment received',
      message: `${booking.customerName} · ${booking.bookingReference}\nAmount received: ${formattedAmount}\nPayment method: ${paymentMethodLabel(method)}\nPayment date: ${date}\n${cash ? '' : `Account: ${booking.paymentMethod === 'BANK_TRANSFER' && booking.paymentDestinationLabel ? booking.paymentDestinationLabel : 'Bank transfer (verified by staff)'}\nTransaction reference: ${reference}\n`}\n${cash ? 'Confirm only cash actually received at the LA Chef office. A receipt reference will be generated after recording.' : 'Confirm only after checking that the money reached the LA Chef account. This records an additional payment and updates the receipt; it does not mark the event completed.'}`,
    }, () => {
      if (this.selectedCashBooking() !== booking || this.form.controls.method.value !== method || this.form.controls.amount.value !== amount || this.form.controls.paymentDate.value !== date || (!cash && this.transactionReference.value.trim() !== reference)) return;
      this.save();
    });
  }

  protected save(): void {
    if (this.saving()) return;
    const selected = this.selectedCashBooking();
    if (!selected || !this.canRecordPayment(selected)) return;
    this.form.markAllAsTouched();
    if (this.form.invalid || !['CASH', 'BANK_TRANSFER'].includes(this.form.controls.method.value) || (this.form.controls.method.value !== 'CASH' && this.transactionReference.invalid)) return;
    const value = { ...this.form.getRawValue(), requestId: this.cashRequestId,
      ...(this.form.controls.method.value !== 'CASH' ? { reference: this.transactionReference.value.trim() } : {}) };
    if (value.reservationId !== selected.reservationId || (value.method !== selected.paymentMethod && selected.paymentMethod !== 'E-WALLET' && selected.amountPaid <= 0)) return;
    this.saving.set(true);
    this.error.set('');
    this.message.set('');
    this.form.disable({ emitEvent: false });
    this.api.recordPayment(value).pipe(finalize(() => {
      this.form.enable({ emitEvent: false });
      this.saving.set(false);
    })).subscribe({
      next: response => {
        this.clearCashRequest(selected.reservationId);
        this.showForm.set(false);
        this.selectedCashBooking.set(null);
        this.form.reset({ reservationId: 0, amount: 0, method: 'CASH', paymentDate: new Date().toISOString().slice(0, 10) });
        this.load();
        this.loadProofs();
        this.message.set(value.method === 'CASH' ? 'Cash received and recorded.' : 'Payment recorded.');
        this.recordedCashReference.set(response.data?.reference ?? '');
      },
      error: error => this.error.set(error instanceof HttpErrorResponse && typeof error.error?.message === 'string'
        ? error.error.message : 'Unable to confirm payment recording. Retry with the same amount and date, or refresh the payment list to check whether it was recorded.'),
    });
  }

  private cashRequestFor(item: AdminPayment): string {
    const key = `lachef.admin.cash-request.${item.reservationId}`;
    let requestId = this.cashRequests.get(item.reservationId);
    try { requestId ??= sessionStorage.getItem(key) ?? undefined; } catch { /* Keep retry protection in memory if storage is unavailable. */ }
    if (requestId && item.reference === `CASH-${requestId.replace(/-/g, '').toUpperCase()}`) {
      this.clearCashRequest(item.reservationId);
      requestId = undefined;
    }
    if (!requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) requestId = crypto.randomUUID();
    this.cashRequests.set(item.reservationId, requestId);
    try { sessionStorage.setItem(key, requestId); } catch { /* The in-memory key still protects retries in this form. */ }
    return requestId;
  }

  private clearCashRequest(reservationId: number): void {
    this.cashRequests.delete(reservationId);
    try { sessionStorage.removeItem(`lachef.admin.cash-request.${reservationId}`); } catch { /* Storage may be disabled. */ }
  }
}
