import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, input, output, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Booking } from '../../../core/models';
import { customerPaymentStatus, hasCashPaymentAction, hasOnlinePaymentAction } from '../../../core/utils/customer-payment-status';
import { StatusBadgeComponent } from '../status-badge/status-badge';

@Component({
  selector: 'app-booking-card',
  imports: [DatePipe, DecimalPipe, RouterLink, StatusBadgeComponent],
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
  readonly cancelRequested = output<{ booking: Booking; trigger: HTMLButtonElement }>();

  protected requestCancellation(event: MouseEvent): void {
    this.cancelRequested.emit({ booking: this.booking(), trigger: event.currentTarget as HTMLButtonElement });
  }
}
