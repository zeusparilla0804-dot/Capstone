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
      pending: 'Pending',
      cancelled: 'Cancelled',
      completed: 'Completed',
    };

    return statusLabels[this.status().toLowerCase()] ?? this.status().replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
  });
}
