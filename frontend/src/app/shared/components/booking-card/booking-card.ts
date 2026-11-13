import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, input, output, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Booking } from '../../../core/models';
import { bookingTotal, depositProgress, hasIncompleteDownPayment, customerPaymentStatus, hasCashPaymentAction, hasOnlinePaymentAction, customerPaymentActionLabel, needsPaymentMethodChoice } from '../../../core/utils/customer-payment-status';
import { StatusBadgeComponent } from '../status-badge/status-badge';

@Component({
  selector: 'app-booking-card',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, RouterLink, StatusBadgeComponent],
  templateUrl: './booking-card.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './booking-card.scss',
})
export class BookingCardComponent {
  readonly reservationLayout = input(false);
  readonly booking = input.required<Booking>();
  protected readonly paymentStatus = computed(() => customerPaymentStatus(this.booking()));
  protected readonly cashPaymentAction = computed(() => hasCashPaymentAction(this.booking()));
  protected readonly onlinePaymentAction = computed(() => hasOnlinePaymentAction(this.booking()));
  protected readonly paymentActionLabel = computed(() => customerPaymentActionLabel(this.booking()));
  protected readonly needsPaymentChoice = computed(() => needsPaymentMethodChoice(this.booking()));
  protected readonly incompleteDeposit = computed(() => hasIncompleteDownPayment(this.booking()));
  protected readonly remainingDeposit = computed(() => depositProgress(bookingTotal(this.booking()), this.booking().amountPaid).remainingDeposit);
  protected readonly proofPending = computed(() => this.booking().status === 'payment_submitted' || this.booking().latestProofStatus?.toUpperCase() === 'SUBMITTED');
  readonly cancelRequested = output<{ booking: Booking; trigger: HTMLButtonElement }>();

  protected requestCancellation(event: MouseEvent): void {
    this.cancelRequested.emit({ booking: this.booking(), trigger: event.currentTarget as HTMLButtonElement });
  }
}
