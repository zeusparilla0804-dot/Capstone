import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdminBooking, PageResult } from '../../core/models';
import { AdminService } from '../../core/services/admin.service';
import { AdminShellComponent } from '../../shared/components/admin-shell/admin-shell';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge';

const genericActions: Record<string, readonly string[]> = {
  PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['AWAITING_PAYMENT', 'CANCELLED'],
  AWAITING_PAYMENT: ['CANCELLED'],
  PAYMENT_VERIFIED: ['CONFIRMED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED']
};

@Component({
  selector: 'app-admin-bookings',
  imports: [AdminShellComponent, StatusBadgeComponent, FormsModule, CurrencyPipe, DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './admin-bookings.page.html',
  styleUrl: './admin-bookings.page.scss'
})
export class AdminBookingsPage {
  private readonly api = inject(AdminService);
  private readonly router = inject(Router);
  protected readonly data = signal<PageResult<AdminBooking> | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly actionError = signal('');
  protected readonly actionPending = signal(false);
  protected readonly pendingAction = signal<{ booking: AdminBooking; status: string } | null>(null);
  protected actionReason = '';
  protected search = '';
  protected status = '';
  protected eventType = '';
  protected date = '';
  protected page = 1;
  readonly statuses = ['PENDING', 'APPROVED', 'AWAITING_PAYMENT', 'PAYMENT_SUBMITTED', 'PAYMENT_VERIFIED', 'CONFIRMED', 'COMPLETED', 'REJECTED', 'CANCELLED'];

  constructor() { this.load(); }

  protected actionsFor(status: string): readonly string[] { return genericActions[status] ?? []; }

  protected load(page = this.page) {
    this.page = page;
    this.loading.set(true);
    this.error.set('');
    this.api.bookings({ page, pageSize: 20, search: this.search, status: this.status, eventType: this.eventType, date: this.date }).subscribe({
      next: response => { this.data.set(response.data); this.loading.set(false); },
      error: () => { this.error.set('Unable to load bookings.'); this.loading.set(false); }
    });
  }

  protected chooseAction(item: AdminBooking, event: Event) {
    const select = event.target as HTMLSelectElement;
    const nextStatus = select.value;
    select.value = '';
    if (this.actionPending() || !this.actionsFor(item.status).includes(nextStatus)) return;
    this.message.set('');
    this.actionError.set('');
    if (nextStatus === 'REJECTED' || nextStatus === 'CANCELLED') {
      this.actionReason = '';
      this.pendingAction.set({ booking: item, status: nextStatus });
      return;
    }
    this.pendingAction.set(null);
    this.sendAction(item, nextStatus);
  }

  protected confirmAction() {
    const action = this.pendingAction();
    const reason = this.actionReason.trim();
    if (!action || !reason || reason.length > 1000 || this.actionPending()) return;
    this.sendAction(action.booking, action.status, reason);
  }

  protected closeReason() {
    if (this.actionPending()) return;
    this.pendingAction.set(null);
    this.actionReason = '';
    this.actionError.set('');
  }

  private sendAction(item: AdminBooking, status: string, reason?: string) {
    this.actionPending.set(true);
    this.api.updateBookingStatus(item.id, status, reason).subscribe({
      next: () => {
        this.actionPending.set(false);
        this.pendingAction.set(null);
        this.actionReason = '';
        this.actionError.set('');
        this.message.set('Booking status updated.');
        this.load();
      },
      error: () => {
        this.actionPending.set(false);
        this.actionError.set('Unable to update this booking. Refresh the list and try again.');
      }
    });
  }

  protected issue(item: AdminBooking) {
    this.api.issueInvoice(item.id).subscribe({
      next: response => this.router.navigate(['/admin/invoices', response.data.invoiceId]),
      error: () => this.error.set('Invoice can only be issued for an approved booking.')
    });
  }
}
