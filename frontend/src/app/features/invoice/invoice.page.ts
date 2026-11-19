import { EventTimePipe } from '../../shared/pipes/event-time.pipe';
import { CurrencyPipe, DatePipe, NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { finalize } from 'rxjs';
import type { Invoice } from '../../core/models';
import { InvoiceService } from '../../core/services/invoice.service';
import { adminPaymentDisplayStatus } from '../../core/utils/payment-display-status';
import { depositProgress } from '../../core/utils/customer-payment-status';
import { AdminShellComponent } from '../../shared/components/admin-shell/admin-shell';
import { PublicHeaderComponent } from '../../shared/components/public-header/public-header';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge';
import { PaymentMethodLabelPipe } from '../../shared/pipes/payment-method-label.pipe';

@Component({
  selector: 'app-invoice-page',
  host: { '(window:focus)': 'refreshOnReturn()', '(window:beforeprint)': 'preparePrint()' },
  imports: [EventTimePipe, AdminShellComponent, PublicHeaderComponent, StatusBadgeComponent, CurrencyPipe, DatePipe, NgTemplateOutlet, PaymentMethodLabelPipe, ReactiveFormsModule],
  templateUrl: './invoice.page.html',
  styleUrl: './invoice.page.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class InvoicePageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(InvoiceService);
  private readonly title = inject(Title);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly refundCalendar = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  protected readonly generatedAt = signal(new Date());
  protected readonly invoice = signal<Invoice | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly admin = this.route.snapshot.data['admin'] === true;
  protected readonly savingRefund = signal(false);
  protected readonly refundError = signal('');
  protected readonly refundForm = new FormGroup({
    amount: new FormControl<number | null>(null),
    refundDate: new FormControl('', { nonNullable: true }),
    reference: new FormControl('', { nonNullable: true }),
    reviewNote: new FormControl('', { nonNullable: true }),
  });

  constructor() { this.load(); }

  protected isReceipt(doc: Invoice): boolean {
    return doc.amountPaid > 0 && doc.payments.length > 0;
  }

  protected isCancelled(doc: Invoice): boolean {
    return doc.booking.status?.toUpperCase() === 'CANCELLED' || doc.status.toUpperCase() === 'CANCELLED';
  }

  protected canRecordRefund(doc: Invoice): boolean {
    return this.admin && this.isCancelled(doc) && doc.amountPaid > 0
      && (doc.refund?.status === 'PENDING_REFUND' || doc.refund?.status === 'ADMIN_REVIEW');
  }

  protected refundDateLimit(): string {
    return this.refundCalendar.format(new Date());
  }

  protected recordRefund(doc: Invoice): void {
    if (this.savingRefund() || this.loading() || this.invoice() !== doc || !this.canRecordRefund(doc)) return;

    const refund = doc.refund;
    const isReview = refund?.status === 'ADMIN_REVIEW';
    const details = this.refundForm.getRawValue();
    const amount = refund?.status === 'PENDING_REFUND' ? refund.amount : details.amount;
    const { refundDate } = details;
    const reference = details.reference.trim();
    const reviewNote = details.reviewNote.trim();

    if (amount == null || !Number.isFinite(amount) || amount < (isReview ? 0 : 0.01)
      || amount > doc.amountPaid || amount !== Number(amount.toFixed(2))) {
      this.refundError.set('Enter a refund amount up to the amount paid, with at most two decimal places.');
      return;
    }
    if (isReview && (!reviewNote || reviewNote.length > 1000)) {
      this.refundError.set('Enter a review note based on the signed agreement, up to 1,000 characters.');
      return;
    }
    if (amount > 0 && (!/^\d{4}-\d{2}-\d{2}$/.test(refundDate) || refundDate > this.refundDateLimit())) {
      this.refundError.set('Enter a refund date on or before today in Philippine time.');
      return;
    }
    if (amount > 0 && (!reference || reference.length > 150)) {
      this.refundError.set('Enter the refund voucher or transaction reference, up to 150 characters.');
      return;
    }

    this.refundError.set('');
    this.savingRefund.set(true);
    this.service.recordRefund(doc.invoiceId, {
      amount,
      ...(amount > 0 && { refundDate, reference }),
      ...(isReview && { reviewNote }),
    }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.savingRefund.set(false))).subscribe({
      next: response => {
        if (!response.success || !response.data) {
          this.refundError.set(response.message || 'Unable to save the refund record.');
          return;
        }
        this.invoice.set({ ...doc, refund: response.data });
        this.refundForm.reset();
      },
      error: (error: HttpErrorResponse) => {
        const message = error.error?.message;
        this.refundError.set(typeof message === 'string' && message
          ? message : 'Could not confirm the refund record. Refresh the invoice to check its status.');
      },
    });
  }

  protected paymentStatus(doc: Invoice): string {
    if (this.isCancelled(doc)) return 'CANCELLED';
    if (!this.isReceipt(doc)) return doc.status;
    if (this.incompleteDeposit(doc)) return 'down_payment_incomplete';
    return adminPaymentDisplayStatus({ total: doc.totalAmount, amountPaid: doc.amountPaid, status: doc.status }) ?? doc.status;
  }

  protected paymentComplete(doc: Invoice): boolean {
    return this.isReceipt(doc) && this.paymentStatus(doc) === 'fully_paid';
  }

  protected deposit(doc: Invoice) { return depositProgress(doc.totalAmount, doc.amountPaid); }
  protected incompleteDeposit(doc: Invoice): boolean {
    return this.isReceipt(doc) && !this.isCancelled(doc) && !['REJECTED', 'EXPIRED', 'COMPLETED'].includes(doc.booking.status?.toUpperCase() ?? '')
      && this.deposit(doc).remainingDeposit > 0;
  }

  protected load(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.loading.set(true);
    this.service.getInvoiceById(id, this.admin).subscribe({
      next: response => {
        this.error.set('');
        this.invoice.set(response.data);
        this.generatedAt.set(new Date());
        this.title.setTitle(`${this.isReceipt(response.data) ? 'Payment Receipt' : 'Invoice'} | LA Chef${this.admin ? ' Admin' : ''}`);
        this.loading.set(false);
      },
      error: error => {
        this.error.set(error.status === 403 ? 'You do not have access to this invoice.' : 'Unable to load invoice.');
        this.loading.set(false);
      },
    });
  }

  protected refreshOnReturn(): void { if (!this.loading() && !this.savingRefund()) this.load(); }

  protected preparePrint(): void {
    this.generatedAt.set(new Date());
    // Flush the timestamp before the browser captures the printable document.
    this.changeDetector.detectChanges();
  }

  protected print(): void { this.preparePrint(); window.print(); }
}
