import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import type { AdminBookingDetail, AdminBookingHistory, AdminBookingStatus, AdminPaymentProof, PageResult } from '../../core/models';
import { AdminService } from '../../core/services/admin.service';
import { ActionFeedbackService } from '../../core/services/action-feedback.service';
import { AdminShellComponent } from '../../shared/components/admin-shell/admin-shell';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge';
import { cashDepositDeadline } from '../../core/utils/cash-payment-policy';
import { paymentMethodLabel } from '../../shared/pipes/payment-method-label.pipe';
import { SuccessDialogComponent } from '../../shared/components/success-dialog/success-dialog';
import { adminPaymentDisplayStatus } from '../../core/utils/payment-display-status';
import { EventCompletionComponent } from './event-completion';

interface BookingAction {
  readonly status: AdminBookingStatus;
  readonly label: string;
  readonly tone: 'primary' | 'secondary' | 'danger';
  readonly reasonRequired?: boolean;
  readonly capacityConfirmation?: boolean;
}

const actions: Record<AdminBookingStatus, readonly BookingAction[]> = {
  PENDING: [
    { status: 'APPROVED', label: 'Approve reservation', tone: 'primary' },
    { status: 'REJECTED', label: 'Reject reservation', tone: 'danger', reasonRequired: true },
    { status: 'CANCELLED', label: 'Cancel reservation', tone: 'secondary', reasonRequired: true },
  ],
  APPROVED: [
    { status: 'AWAITING_PAYMENT', label: 'Request payment', tone: 'primary' },
    { status: 'CANCELLED', label: 'Cancel reservation', tone: 'secondary', reasonRequired: true },
  ],
  AWAITING_PAYMENT: [{ status: 'CANCELLED', label: 'Cancel reservation', tone: 'secondary', reasonRequired: true }],
  PAYMENT_SUBMITTED: [],
  PAYMENT_VERIFIED: [{ status: 'CONFIRMED', label: 'Confirm reservation', tone: 'primary' }],
  CONFIRMED: [
    { status: 'COMPLETED', label: 'Mark completed', tone: 'primary' },
    { status: 'CANCELLED', label: 'Cancel reservation', tone: 'secondary', reasonRequired: true },
  ],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
};

@Component({
  selector: 'app-admin-booking-detail',
  imports: [AdminShellComponent, StatusBadgeComponent, SuccessDialogComponent, EventCompletionComponent, CurrencyPipe, DatePipe, FormsModule, RouterLink],
  templateUrl: './admin-booking-detail.page.html',
  styleUrl: './admin-booking-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminBookingDetailPage {
  protected readonly paymentBadgeStatus = (item: AdminBookingDetail): string => adminPaymentDisplayStatus({
    total: item.total, amountPaid: item.amountPaid, status: item.status,
    latestProofStatus: item.latestProofStatus,
  }) ?? item.status;
  private readonly api = inject(AdminService);
  private readonly feedbackDialog = inject(ActionFeedbackService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly bookingId = Number(this.route.snapshot.paramMap.get('id'));
  protected readonly booking = signal<AdminBookingDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly feedback = signal('');
  protected readonly approvedReference = signal('');
  protected readonly actionError = signal('');
  protected readonly mutationPending = signal(false);
  protected readonly pendingAction = signal<BookingAction | null>(null);
  protected readonly proofHistory = signal<PageResult<AdminPaymentProof> | null>(null);
  protected readonly proofHistoryLoading = signal(false);
  protected readonly proofHistoryError = signal('');
  protected readonly proofHistoryExpanded = signal(false);
  protected readonly proofReviewPending = computed(() => this.booking()?.status === 'PAYMENT_SUBMITTED'
    || this.proofHistory()?.items.some(proof => proof.status === 'SUBMITTED') === true);
  protected readonly methodLabel = paymentMethodLabel;
  protected actionReason = '';
  protected readonly availableActions = computed(() => {
    const booking = this.booking();
    if (!booking) return [];
    return (actions[booking.status as AdminBookingStatus] ?? [])
      .filter(action => action.status !== 'CONFIRMED' || booking.amountPaid >= Math.round(booking.total * 100 * .5) / 100)
      .map(action => action.status === 'APPROVED' && booking.capacity.requiresAdminConfirmation
        ? { ...action, label: 'Approve and confirm capacity', capacityConfirmation: true } : action);
  });
  protected readonly reviewActions = computed(() => this.availableActions()
    .filter(action => action.status === 'APPROVED' || action.status === 'REJECTED'));
  protected readonly secondaryActions = computed(() => this.availableActions()
    .filter(action => action.status !== 'APPROVED' && action.status !== 'REJECTED' && action.status !== 'COMPLETED'));
  protected readonly outstandingBalance = computed(() =>
    Math.max(0, (this.booking()?.total ?? 0) - (this.booking()?.amountPaid ?? 0)),
  );
  protected readonly packageAmount = computed(() => {
    const item = this.booking();
    if (!item) return 0;
    return Math.max(0, Math.round((item.subtotal - item.addOns.reduce((sum, addOn) => sum + addOn.price, 0)) * 100) / 100);
  });
  protected readonly perHeadPackage = computed(() => {
    const item = this.booking();
    return !!item && Math.abs(this.packageAmount() - item.packageUnitPrice * item.guestCount) < 0.01;
  });
  protected readonly requiredDeposit = computed(() => Math.round((this.booking()?.total ?? 0) * 50) / 100);
  protected readonly paymentWindowHours = computed(() => (this.booking()?.guestCount ?? 0) >= 500 ? 48 : 24);
  protected readonly suggestedPaymentDeadline = computed(() => {
    const approvedAt = this.booking()?.statusHistory.find(entry => entry.nextStatus === 'APPROVED')?.createdAt;
    if (!approvedAt) return null;
    const timestamp = Date.parse(approvedAt);
    return Number.isFinite(timestamp) ? new Date(timestamp + this.paymentWindowHours() * 60 * 60 * 1000) : null;
  });
  protected readonly cashDeadline = computed(() => {
    const item = this.booking();
    return item?.paymentMethod?.toUpperCase() === 'CASH' ? cashDepositDeadline(item.eventDate, item.guestCount) : null;
  });
  protected get cashDepositOverdue(): boolean {
    const item = this.booking();
    const deadline = this.cashDeadline();
    return !!item && !!deadline && !['CANCELLED', 'REJECTED', 'COMPLETED'].includes(item.status)
      && item.amountPaid < Math.round(item.total * 100 * 0.5) / 100 && Date.now() > new Date(deadline.at).getTime();
  }

  constructor() {
    this.load();
  }

  protected load(): void {
    if (!Number.isSafeInteger(this.bookingId) || this.bookingId < 1) {
      this.loading.set(false);
      this.error.set('Reservation not found.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.api.booking(this.bookingId).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (response) => {
        this.booking.set(response.data);
        this.loadProofHistory();
      },
      error: () => this.error.set('Unable to load this reservation.'),
    });
  }

  protected loadProofHistory(page = 1): void {
    if (!this.booking() || !Number.isSafeInteger(page) || page < 1) return;
    if (this.booking()?.status === 'PAYMENT_SUBMITTED') this.proofHistoryExpanded.set(true);
    this.proofHistoryLoading.set(true);
    this.proofHistoryError.set('');
    this.api.paymentProofs({ reservationId: this.bookingId, status: 'ALL', page, pageSize: 10, order: 'newest' })
      .pipe(finalize(() => this.proofHistoryLoading.set(false)))
      .subscribe({
        next: response => {
          this.proofHistory.set(response.data);
          if (this.proofReviewPending()) this.proofHistoryExpanded.set(true);
        },
        error: () => {
          this.proofHistoryError.set('Unable to load payment proof history.');
          this.proofHistoryExpanded.set(true);
        },
      });
  }

  protected toggleProofHistory(event: Event): void {
    this.proofHistoryExpanded.set((event.target as HTMLDetailsElement).open);
  }

  protected chooseAction(status: string): void {
    if (this.mutationPending()) return;
    const action = this.availableActions().find((item) => item.status === status);
    if (!action) return;
    this.pendingAction.set(action);
    this.actionReason = '';
    this.actionError.set('');
    this.feedback.set('');
  }

  protected confirmAction(): void {
    const action = this.pendingAction();
    if (!action || this.mutationPending()) return;
    const reason = this.actionReason.trim();
    if (action.reasonRequired && !reason) {
      this.actionError.set('Enter a reason before continuing.');
      return;
    }
    this.mutationPending.set(true);
    this.actionError.set('');
    const bookingReference = this.booking()?.reference ?? '';
    const request = action.capacityConfirmation
      ? this.api.updateBookingStatus(this.bookingId, action.status, reason || undefined, true)
      : this.api.updateBookingStatus(this.bookingId, action.status, reason || undefined);
    request
      .pipe(finalize(() => this.mutationPending.set(false)))
      .subscribe({
        next: () => {
          this.feedback.set(action.status === 'APPROVED' ? '' : 'Reservation status updated.');
          if (action.status === 'APPROVED') this.approvedReference.set(bookingReference);
          this.pendingAction.set(null);
          this.actionReason = '';
          this.load();
        },
        error: (error) => {
          if (error?.status === 409) {
            this.actionError.set(error?.error?.message
              || 'This reservation changed in another session. The latest details are shown.');
            this.pendingAction.set(null);
            this.load();
          } else {
            this.actionError.set(error?.error?.message || 'Unable to update this reservation.');
          }
        },
      });
  }

  protected closeAction(): void {
    if (this.mutationPending()) return;
    this.pendingAction.set(null);
    this.actionReason = '';
    this.actionError.set('');
  }

  protected requestInvoice(): void {
    if (this.mutationPending()) return;
    this.feedbackDialog.confirm({ title: 'Issue this invoice?', confirmLabel: 'Confirm and issue invoice',
      message: `Create the invoice for ${this.booking()?.reference}? Review the booking details and total before continuing.`,
    }, () => this.issueInvoice());
  }

  protected issueInvoice(): void {
    if (this.mutationPending()) return;
    this.mutationPending.set(true);
    this.actionError.set('');
    this.api.issueInvoice(this.bookingId).pipe(finalize(() => this.mutationPending.set(false))).subscribe({
      next: (response) => this.router.navigate(['/admin/invoices', response.data.invoiceId]),
      error: (error) => this.actionError.set(error?.error?.message || 'Unable to issue the invoice.'),
    });
  }

  protected historyTitle(item: AdminBookingHistory): string {
    if (item.actorType === 'CUSTOMER') return item.nextStatus === 'PENDING' ? 'Submitted by customer' : 'Updated by customer';
    if (item.actorType === 'ADMIN') return 'Updated by administrator';
    return 'Updated automatically';
  }

  protected capacityStatusLabel(status: AdminBookingDetail['capacity']['status']): string {
    const labels = {
      AVAILABLE: 'Available',
      LIMITED: 'Final slot',
      NEEDS_CONFIRMATION: 'Needs confirmation',
      FULL: 'Full',
    } as const;
    return labels[status];
  }

  protected eventTimeLabel(value?: string): string {
    if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return value || 'Time not provided';
    const hour = Number(value.slice(0, 2));
    return `${hour % 12 || 12}:${value.slice(3)} ${hour < 12 ? 'AM' : 'PM'}`;
  }
}
