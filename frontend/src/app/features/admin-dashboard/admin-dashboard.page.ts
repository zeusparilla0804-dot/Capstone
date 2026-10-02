import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import type { AdminAttentionItem, AdminDashboard } from '../../core/models';
import { AdminService } from '../../core/services/admin.service';
import { AdminShellComponent } from '../../shared/components/admin-shell/admin-shell';

@Component({
  selector: 'app-admin-dashboard-page',
  imports: [AdminShellComponent, CurrencyPipe, DatePipe, FormsModule, RouterLink],
  templateUrl: './admin-dashboard.page.html',
  styleUrl: './admin-dashboard.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardPageComponent {
  private readonly api = inject(AdminService);
  protected readonly data = signal<AdminDashboard | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected period = new Date().toISOString().slice(0, 7);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.dashboard(this.period).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (response) => this.data.set(response.data),
      error: () => this.error.set('Unable to load the admin dashboard.'),
    });
  }

  protected attentionRoute(item: AdminAttentionItem): string {
    if (item.type === 'PAYMENT_PROOF') return `/admin/payments/proofs/${item.id}`;
    if (item.type === 'EMAIL_OUTBOX') return '/admin/email-outbox';
    return `/admin/bookings/${item.id}`;
  }

  protected queueLabel(key: string): string {
    return ({ pendingBookings: 'Booking reviews', submittedProofs: 'Proof verification', upcomingEvents: 'Upcoming events', failedEmails: 'Failed notifications' } as Record<string, string>)[key] ?? key;
  }

  protected queueRoute(key: string): string {
    return key === 'failedEmails' ? '/admin/email-outbox' : key === 'submittedProofs' ? '/admin/payments' : '/admin/bookings';
  }

  protected queueParams(key: string): Record<string, string> {
    return key === 'failedEmails' ? { status: 'FAILED' } : key === 'submittedProofs' ? { status: 'SUBMITTED' } : key === 'pendingBookings' ? { status: 'PENDING' } : { status: 'CONFIRMED' };
  }
}
