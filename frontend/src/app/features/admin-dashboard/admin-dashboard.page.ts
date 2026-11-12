import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import type { AdminAttentionItem, AdminDashboard } from '../../core/models';
import { AdminService } from '../../core/services/admin.service';
import { PortalBadgeStateService } from '../../core/services/portal-badge-state.service';
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
  private readonly badgeState = inject(PortalBadgeStateService);
  private readonly destroyRef = inject(DestroyRef);
  private requestPending = false;
  private appliedPeriod = '';
  protected readonly data = signal<AdminDashboard | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly refreshError = signal('');
  protected period = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).format(new Date()).replace('/', '-');

  constructor() {
    this.load();
    const refreshTimer = setInterval(() => this.refresh(), 30_000);
    this.destroyRef.onDestroy(() => clearInterval(refreshTimer));
  }

  @HostListener('window:focus')
  protected refresh(): void { this.load(true); }

  protected load(silent = false): void {
    if (this.requestPending) return;
    this.requestPending = true;
    if (!silent) {
      this.appliedPeriod = this.period;
      this.loading.set(true);
      this.error.set('');
    }
    this.refreshError.set('');
    this.api.dashboard(this.appliedPeriod, silent).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.requestPending = false; this.loading.set(false); }),
    ).subscribe({
      next: (response) => {
        this.error.set('');
        this.data.set(response.data);
        this.badgeState.setAdminDashboard(response.data);
      },
      error: () => {
        if (silent && this.data()) this.refreshError.set('Updates could not be refreshed. The displayed records are from the last successful refresh.');
        else this.error.set('Unable to load the admin dashboard.');
      },
    });
  }

  protected attentionRoute(item: AdminAttentionItem): string {
    if (item.type === 'PAYMENT_PROOF') return `/admin/payments/proofs/${item.id}`;
    if (item.type === 'EMAIL_OUTBOX') return '/admin/email-outbox';
    return `/admin/bookings/${item.id}`;
  }

  protected queueLabel(key: string): string {
    return ({ pendingBookings: 'Booking reviews', submittedProofs: 'Proof verification', upcomingEvents: 'Events in the next 7 days', failedEmails: 'Failed notifications' } as Record<string, string>)[key] ?? key;
  }

  protected queueRoute(key: string): string {
    return key === 'failedEmails' ? '/admin/email-outbox' : key === 'submittedProofs' ? '/admin/payments' : '/admin/bookings';
  }

  protected queueParams(key: string): Record<string, string> {
    return key === 'failedEmails' ? { status: 'FAILED' } : key === 'submittedProofs' ? { status: 'SUBMITTED' } : key === 'pendingBookings' ? { status: 'PENDING' } : { status: 'CONFIRMED' };
  }
}
