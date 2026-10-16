import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import type { AdminCustomEventDetail, AdminCustomQuoteInput, CustomEventStatus, CustomQuoteStatus } from '../../core/models';
import { AdminService } from '../../core/services/admin.service';
import { AdminShellComponent } from '../../shared/components/admin-shell/admin-shell';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge';

interface QuoteLineDraft {
  description: string;
  quantity: number;
  unitPrice: number;
}

type Disposition = 'clarify' | 'reject';

@Component({
  selector: 'app-admin-custom-event-detail',
  imports: [AdminShellComponent, StatusBadgeComponent, CurrencyPipe, DatePipe, FormsModule, RouterLink],
  templateUrl: './admin-custom-event-detail.page.html',
  styleUrl: './admin-custom-event-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class AdminCustomEventDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly requestId = Number(this.route.snapshot.paramMap.get('id'));

  protected readonly request = signal<AdminCustomEventDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly feedback = signal('');
  protected readonly actionError = signal('');
  protected readonly submitting = signal(false);
  protected readonly confirmingQuote = signal(false);
  protected readonly disposition = signal<Disposition | null>(null);
  protected lines: QuoteLineDraft[] = [{ description: '', quantity: 1, unitPrice: 0 }];
  protected requiredDownPayment = 0;
  protected validUntil = '';
  protected terms = '';
  protected reason = '';

  protected readonly canPrepareQuote = computed(() => {
    const status = this.request()?.status;
    return status === 'AWAITING_QUOTE' || status === 'NEEDS_CLARIFICATION' || status === 'QUOTE_SENT';
  });
  protected readonly canRequestClarification = computed(() => {
    const status = this.request()?.status;
    return status === 'AWAITING_QUOTE' || status === 'QUOTE_SENT';
  });
  protected readonly canReject = computed(() => {
    const status = this.request()?.status;
    return status === 'AWAITING_QUOTE' || status === 'NEEDS_CLARIFICATION';
  });
  protected readonly minimumValidityDate = this.dateOffset(1);

  constructor() { this.load(); }

  protected quoteTotal(): number {
    const cents = this.lines.reduce((sum, line) => {
      const raw = Number(line.quantity) * Number(line.unitPrice);
      return sum + (Number.isFinite(raw) ? Math.round((raw + Number.EPSILON) * 100) : 0);
    }, 0);
    return cents / 100;
  }

  protected lineTotal(line: QuoteLineDraft): number {
    const raw = Number(line.quantity) * Number(line.unitPrice);
    return Number.isFinite(raw) ? Math.round((raw + Number.EPSILON) * 100) / 100 : 0;
  }

  protected addLine(): void {
    if (this.lines.length >= 100 || this.submitting()) return;
    this.lines = [...this.lines, { description: '', quantity: 1, unitPrice: 0 }];
  }

  protected removeLine(index: number): void {
    if (this.lines.length === 1 || this.submitting()) return;
    this.lines = this.lines.filter((_, lineIndex) => lineIndex !== index);
  }

  protected trackLine(index: number): number { return index; }

  protected requestSendConfirmation(): void {
    if (this.submitting()) return;
    this.actionError.set('');
    const validation = this.validateQuote();
    if (validation) { this.actionError.set(validation); return; }
    this.confirmingQuote.set(true);
  }

  protected closeSendConfirmation(): void {
    if (!this.submitting()) this.confirmingQuote.set(false);
  }

  protected confirmSendQuote(): void {
    if (this.submitting() || !this.confirmingQuote()) return;
    const validation = this.validateQuote();
    if (validation) { this.actionError.set(validation); this.confirmingQuote.set(false); return; }
    const input: AdminCustomQuoteInput = {
      items: this.lines.map(line => ({
        description: line.description.trim(), quantity: Number(line.quantity), unitPrice: Number(line.unitPrice),
      })),
      requiredDownPayment: Number(this.requiredDownPayment),
      validUntil: this.validUntil,
      ...(this.terms.trim() ? { terms: this.terms.trim() } : {}),
    };
    this.submitting.set(true); this.actionError.set(''); this.feedback.set('');
    this.api.sendCustomQuote(this.requestId, input).pipe(
      finalize(() => this.submitting.set(false)), takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: () => {
        this.confirmingQuote.set(false);
        this.feedback.set('Quotation sent to the customer.');
        this.load(false);
      },
      error: error => this.actionError.set(this.apiError(error, 'Unable to send this quotation. Review the details and try again.')),
    });
  }

  protected openDisposition(mode: Disposition): void {
    if (this.submitting()) return;
    this.reason = ''; this.actionError.set(''); this.disposition.set(mode);
  }

  protected closeDisposition(): void { if (!this.submitting()) this.disposition.set(null); }

  protected submitDisposition(): void {
    const mode = this.disposition();
    if (!mode || this.submitting()) return;
    const reason = this.reason.trim();
    if (!reason) { this.actionError.set('Enter a reason before continuing.'); return; }
    if (reason.length > 1000) { this.actionError.set('Reason must be 1,000 characters or fewer.'); return; }
    const operation = mode === 'clarify'
      ? this.api.requestCustomClarification(this.requestId, reason)
      : this.api.rejectCustomEvent(this.requestId, reason);
    this.submitting.set(true); this.actionError.set(''); this.feedback.set('');
    operation.pipe(finalize(() => this.submitting.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.disposition.set(null);
        this.feedback.set(mode === 'clarify' ? 'Clarification request sent.' : 'Custom event request declined.');
        this.load(false);
      },
      error: error => this.actionError.set(this.apiError(error, 'Unable to update this custom event request.')),
    });
  }

  protected statusLabel(status: CustomEventStatus | CustomQuoteStatus): string {
    return status.replaceAll('_', ' ').toLowerCase().replace(/^./, value => value.toUpperCase());
  }

  private validateQuote(): string {
    if (!this.canPrepareQuote()) return 'This request can no longer receive a quotation.';
    if (!this.lines.length) return 'Add at least one quotation line.';
    for (const line of this.lines) {
      const description = line.description.trim();
      const quantity = Number(line.quantity); const unitPrice = Number(line.unitPrice);
      if (!description || description.length > 250) return 'Each line needs a description of 250 characters or fewer.';
      if (!this.validMoney(quantity, false) || quantity > 10000) return 'Each quantity must be greater than zero and use no more than two decimal places.';
      if (!this.validMoney(unitPrice, true)) return 'Each unit price must be zero or greater and use no more than two decimal places.';
    }
    const total = this.quoteTotal();
    if (total <= 0) return 'Quotation total must be greater than zero.';
    const downPayment = Number(this.requiredDownPayment);
    if (!this.validMoney(downPayment, true)) return 'Enter a valid required down payment.';
    if (downPayment > total) return 'Required down payment cannot exceed the quotation total.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.validUntil) || this.validUntil < this.minimumValidityDate) {
      return 'Choose a quotation validity date after today.';
    }
    if (this.terms.trim().length > 4000) return 'Terms must be 4,000 characters or fewer.';
    return '';
  }

  private validMoney(value: number, allowZero: boolean): boolean {
    return Number.isFinite(value) && (allowZero ? value >= 0 : value > 0)
      && value <= 9_999_999_999.99 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;
  }

  private load(showLoading = true): void {
    if (!Number.isSafeInteger(this.requestId) || this.requestId < 1) {
      this.loading.set(false); this.error.set('Custom event request not found.'); return;
    }
    if (showLoading) this.loading.set(true);
    this.error.set('');
    this.api.customEvent(this.requestId).pipe(
      finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: response => {
        this.request.set(response.data);
        if (!this.validUntil) this.validUntil = this.dateOffset(14);
      },
      error: error => this.error.set(this.apiError(error, 'Unable to load this custom event request.')),
    });
  }

  private dateOffset(days: number): string {
    const value = new Date(); value.setHours(12, 0, 0, 0); value.setDate(value.getDate() + days);
    return value.toISOString().slice(0, 10);
  }

  private apiError(error: unknown, fallback: string): string {
    return typeof error === 'object' && error !== null && 'error' in error
      ? (error as { error?: { message?: string } }).error?.message ?? fallback : fallback;
  }
}
