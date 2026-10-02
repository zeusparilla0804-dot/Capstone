import { DatePipe } from '@angular/common';
import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Booking } from '../../../core/models';
import { StatusBadgeComponent } from '../status-badge/status-badge';

@Component({
  selector: 'app-booking-card',
  imports: [DatePipe, RouterLink, StatusBadgeComponent],
  templateUrl: './booking-card.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './booking-card.scss',
})
export class BookingCardComponent {
  readonly booking = input.required<Booking>();
  readonly cancelRequested = output<{ booking: Booking; trigger: HTMLButtonElement }>();

  protected requestCancellation(event: MouseEvent): void {
    this.cancelRequested.emit({ booking: this.booking(), trigger: event.currentTarget as HTMLButtonElement });
  }
}
