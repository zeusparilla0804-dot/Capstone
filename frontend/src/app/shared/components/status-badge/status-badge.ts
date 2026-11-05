import { Component, computed, input, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-status-badge',
  templateUrl: './status-badge.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './status-badge.scss',
})
export class StatusBadgeComponent {
  readonly status = input.required<string>();

  protected readonly label = computed(() => {
    const statusLabels: Record<string, string> = {
      confirmed: 'Confirmed',
      awaiting_payment: 'Awaiting Payment',
      expired: 'Expired',
      cancelled: 'Cancelled',
      completed: 'Completed',
      down_payment_verified: '50% Down Payment Verified',
      fully_paid: 'Fully Paid',
      pending_payment_verification: 'Pending Payment Verification',
    };

    return statusLabels[this.status().toLowerCase()] ?? this.status().replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
  });
}
