import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminBooking, PageResult } from '../../core/models';
import { AdminService } from '../../core/services/admin.service';
import { ActionFeedbackService } from '../../core/services/action-feedback.service';
import { AdminShellComponent } from '../../shared/components/admin-shell/admin-shell';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge';
import { SuccessDialogComponent } from '../../shared/components/success-dialog/success-dialog';
import { adminPaymentDisplayStatus } from '../../core/utils/payment-display-status';

const genericActions: Record<string, readonly string[]> = {
  PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['AWAITING_PAYMENT', 'CANCELLED'],
  AWAITING_PAYMENT: ['CANCELLED'],
  PAYMENT_VERIFIED: ['CONFIRMED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED']
};

@Component({
  selector: 'app-admin-bookings',
  imports: [AdminShellComponent, StatusBadgeComponent, SuccessDialogComponent, FormsModule, CurrencyPipe, DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './admin-bookings.page.html',
  styleUrl: './admin-bookings.page.scss'
})
export class AdminBookingsPage {
  protected readonly paymentBadgeStatus = (item: AdminBooking): string => adminPaymentDisplayStatus({
    total: item.total, amountPaid: item.amountPaid ?? 0, status: item.status,
    latestProofStatus: item.latestProofStatus,
  }) ?? item.status;
  private readonly api = inject(AdminService);
  private readonly feedbackDialog = inject(ActionFeedbackService);
  protected readonly data = signal<PageResult<AdminBooking> | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly approvedReference = signal('');
  protected readonly actionError = signal('');
  protected readonly actionPending = signal(false);
  protected readonly approving = signal(false);
  protected readonly pendingAction = signal<{
    booking: AdminBooking;
    status: string;
    reasonRequired: boolean;
    capacityConfirmation: boolean;
  } | null>(null);
  protected actionReason = '';
  protected search = '';
  protected status = '';
  protected eventType = '';
  protected date = '';
  protected page = 1;
  readonly statuses = ['PENDING', 'APPROVED', 'AWAITING_PAYMENT', 'PAYMENT_SUBMITTED', 'PAYMENT_VERIFIED', 'CONFIRMED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED'];

  constructor() { this.load(); }

  protected actionsFor(status: string): readonly string[] { return genericActions[status] ?? []; }
  protected actionLabel(item: AdminBooking, status: string): string {
    if (this.requiresCapacityConfirmation(item, status)) return 'Approve and confirm capacity';
    if (status === 'AWAITING_PAYMENT') return 'Request payment';
    return status.replaceAll('_', ' ');
  }

  protected capacityStatusLabel(item: AdminBooking): string {
    const labels = { AVAILABLE: 'Available', LIMITED: 'Final slot', NEEDS_CONFIRMATION: 'Needs confirmation', FULL: 'Full' } as const;
    return labels[item.capacity.status];
  }

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
    const reasonRequired = nextStatus === 'REJECTED' || nextStatus === 'CANCELLED';
    const capacityConfirmation = this.requiresCapacityConfirmation(item, nextStatus);
    if (reasonRequired || capacityConfirmation) {
      this.actionReason = '';
      this.pendingAction.set({ booking: item, status: nextStatus, reasonRequired, capacityConfirmation });
      return;
    }
    this.pendingAction.set(null);
    this.feedbackDialog.confirm({ title: 'Confirm reservation update?',
      message: `${item.reference}\nUpdate this reservation to ${this.actionLabel(item, nextStatus).toLowerCase()}?`,
      confirmLabel: 'Confirm update',
    }, () => this.sendAction(item, nextStatus));
  }

  protected confirmAction() {
    const action = this.pendingAction();
    const reason = this.actionReason.trim();
    if (!action || (action.reasonRequired && !reason) || reason.length > 1000 || this.actionPending()) return;
    this.sendAction(action.booking, action.status, reason || undefined, action.capacityConfirmation);
  }

  protected closeReason() {
    if (this.actionPending()) return;
    this.pendingAction.set(null);
    this.actionReason = '';
    this.actionError.set('');
  }

  private sendAction(item: AdminBooking, status: string, reason?: string, capacityConfirmed = false) {
    this.actionPending.set(true);
    this.approving.set(status === 'APPROVED');
    const request = capacityConfirmed
      ? this.api.updateBookingStatus(item.id, status, reason, true)
      : this.api.updateBookingStatus(item.id, status, reason);
    request.subscribe({
      next: () => {
        this.actionPending.set(false);
        this.approving.set(false);
        this.pendingAction.set(null);
        this.actionReason = '';
        this.actionError.set('');
        this.message.set(status === 'APPROVED' ? '' : 'Reservation status updated.');
        if (status === 'APPROVED') this.approvedReference.set(item.reference);
        this.load();
      },
      error: (error) => {
        this.actionPending.set(false);
        this.approving.set(false);
        if (error?.status === 409 && error?.error?.code === 'CAPACITY_CHANGED') {
          this.pendingAction.set(null);
          this.actionError.set(error?.error?.message || 'Date capacity changed. Review the refreshed availability.');
          this.load();
        } else {
          this.actionError.set(error?.error?.message || 'Unable to update this reservation. Refresh the list and try again.');
        }
      }
    });
  }

  private requiresCapacityConfirmation(item: AdminBooking, status: string): boolean {
    return status === 'APPROVED' && item.capacity.requiresAdminConfirmation;
  }
}
