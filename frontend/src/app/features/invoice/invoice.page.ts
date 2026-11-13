import { EventTimePipe } from '../../shared/pipes/event-time.pipe';
import { CurrencyPipe, DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { Invoice } from '../../core/models';
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
  imports: [EventTimePipe, AdminShellComponent, PublicHeaderComponent, StatusBadgeComponent, CurrencyPipe, DatePipe, NgTemplateOutlet, PaymentMethodLabelPipe],
  templateUrl: './invoice.page.html',
  styleUrl: './invoice.page.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class InvoicePageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(InvoiceService);
  private readonly title = inject(Title);
  private readonly changeDetector = inject(ChangeDetectorRef);
  protected readonly generatedAt = signal(new Date());
  protected readonly invoice = signal<Invoice | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly admin = this.route.snapshot.data['admin'] === true;

  constructor() { this.load(); }

  protected isReceipt(doc: Invoice): boolean {
    return doc.amountPaid > 0 && doc.payments.length > 0;
  }

  protected paymentStatus(doc: Invoice): string {
    if (!this.isReceipt(doc)) return doc.status;
    if (this.incompleteDeposit(doc)) return 'down_payment_incomplete';
    return adminPaymentDisplayStatus({ total: doc.totalAmount, amountPaid: doc.amountPaid, status: doc.status }) ?? doc.status;
  }

  protected paymentComplete(doc: Invoice): boolean {
    return this.isReceipt(doc) && this.paymentStatus(doc) === 'fully_paid';
  }

  protected deposit(doc: Invoice) { return depositProgress(doc.totalAmount, doc.amountPaid); }
  protected incompleteDeposit(doc: Invoice): boolean {
    return this.isReceipt(doc) && !['CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED'].includes(doc.booking.status?.toUpperCase() ?? '')
      && doc.status.toUpperCase() !== 'CANCELLED' && this.deposit(doc).remainingDeposit > 0;
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

  protected refreshOnReturn(): void { if (!this.loading()) this.load(); }

  protected preparePrint(): void {
    this.generatedAt.set(new Date());
    // Flush the timestamp before the browser captures the printable document.
    this.changeDetector.detectChanges();
  }

  protected print(): void { this.preparePrint(); window.print(); }
}
