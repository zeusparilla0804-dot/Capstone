import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AdminBookingDetail } from '../../core/models';
import { AdminService } from '../../core/services/admin.service';
import { ActionFeedbackService } from '../../core/services/action-feedback.service';
import { paymentMethodLabel } from '../../shared/pipes/payment-method-label.pipe';

@Component({ selector: 'app-event-completion', imports: [FormsModule, CurrencyPipe, DatePipe],
  templateUrl: './event-completion.html', styleUrl: './event-completion.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class EventCompletionComponent {
  constructor() {
    effect(() => { this.method.set(this.booking().paymentMethod ?? ''); });
  }
  readonly booking = input.required<AdminBookingDetail>();
  readonly completed = output<void>();
  private readonly api = inject(AdminService);
  private readonly feedback = inject(ActionFeedbackService);
  private readonly destroyRef = inject(DestroyRef);
  private requestId = '';
  protected readonly balance = computed(() => Math.max(0, Math.round((this.booking().total - this.booking().amountPaid) * 100) / 100));
  protected readonly today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  protected readonly date = signal(this.today);
  protected readonly method = signal('');
  protected readonly reference = signal('');
  protected readonly fundsReceived = signal(false);
  protected readonly eventFinished = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly eventDayReached = computed(() => this.booking().eventDate <= this.today);
  protected readonly canSubmit = computed(() => !this.saving() && this.eventDayReached() && this.eventFinished()
    && ['PAYMENT_VERIFIED', 'CONFIRMED', 'COMPLETED'].includes(this.booking().status)
    && this.date() >= this.booking().eventDate && this.date() <= this.today
    && (this.balance() === 0 || (['CASH', 'BANK_TRANSFER'].includes(this.method()) && this.fundsReceived()
      && (this.method() === 'CASH' || (this.reference().trim().length > 0 && this.reference().trim().length <= 150)))));

  protected submit(): void {
    if (!this.canSubmit()) return;
    const booking = this.booking();
    const value = { amount: this.balance(), method: this.balance() > 0 ? this.method() : 'CASH',
      paymentDate: this.date(), reference: this.method() === 'CASH' ? undefined : this.reference().trim(),
      fundsReceived: this.balance() > 0 && this.fundsReceived(), eventFinished: this.eventFinished() };
    const amount = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value.amount);
    this.feedback.confirm({ title: value.amount > 0 ? 'Record final payment and complete event?' : 'Complete this fully paid event?',
      confirmLabel: value.amount > 0 ? 'Record payment & complete' : 'Confirm event completed',
      message: `${booking.reference} · ${booking.customerName}\n${value.amount > 0 ? `Final payment received: ${amount}\nMethod: ${paymentMethodLabel(value.method)}\nPayment date: ${value.paymentDate}` : 'The full amount is already recorded. No additional payment will be created.'}\n\nConfirm that the event has finished. The receipt will reflect the recorded payments and Completed status.`,
    }, () => {
      if (!this.canSubmit() || this.booking() !== booking || this.balance() !== value.amount || this.date() !== value.paymentDate
        || (value.amount > 0 && (this.method() !== value.method || (this.method() !== 'CASH' && this.reference().trim() !== value.reference)))) return;
      const key = `lachef.event-completion.${booking.id}`;
      if (!this.requestId) {
        try { this.requestId = sessionStorage.getItem(key) ?? ''; } catch { /* Memory still protects a retry in this form. */ }
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(this.requestId)) this.requestId = crypto.randomUUID();
        try { sessionStorage.setItem(key, this.requestId); } catch { /* Storage may be unavailable. */ }
      }
      this.saving.set(true); this.error.set('');
      this.api.completeEvent(booking.id, { ...value, requestId: this.requestId }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.saving.set(false))).subscribe({
        next: () => { try { sessionStorage.removeItem(key); } catch { /* Storage may be unavailable. */ } this.requestId = ''; this.completed.emit(); },
        error: error => this.error.set(error?.error?.message || 'Unable to confirm completion. Refresh the reservation before retrying the same payment.'),
      });
    });
  }
}
