import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import type { AdminBookingDetail, AdminBookingHistory, AdminBookingStatus } from '../../core/models';
import { AdminService } from '../../core/services/admin.service';
import { AdminShellComponent } from '../../shared/components/admin-shell/admin-shell';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge';

interface BookingAction {
  readonly status: AdminBookingStatus;
  readonly label: string;
  readonly tone: 'primary' | 'secondary' | 'danger';
  readonly reasonRequired?: boolean;
}

const actions: Record<AdminBookingStatus, readonly BookingAction[]> = {
  PENDING: [
    { status: 'APPROVED', label: 'Approve booking', tone: 'primary' },
    { status: 'REJECTED', label: 'Reject booking', tone: 'danger', reasonRequired: true },
    { status: 'CANCELLED', label: 'Cancel booking', tone: 'secondary', reasonRequired: true },
  ],
  APPROVED: [
    { status: 'AWAITING_PAYMENT', label: 'Request payment', tone: 'primary' },
    { status: 'CANCELLED', label: 'Cancel booking', tone: 'secondary', reasonRequired: true },
  ],
  AWAITING_PAYMENT: [{ status: 'CANCELLED', label: 'Cancel booking', tone: 'secondary', reasonRequired: true }],
  PAYMENT_SUBMITTED: [],
  PAYMENT_VERIFIED: [{ status: 'CONFIRMED', label: 'Confirm booking', tone: 'primary' }],
  CONFIRMED: [
    { status: 'COMPLETED', label: 'Mark completed', tone: 'primary' },
    { status: 'CANCELLED', label: 'Cancel booking', tone: 'secondary', reasonRequired: true },
  ],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

@Component({
  selector: 'app-admin-booking-detail',
  imports: [AdminShellComponent, StatusBadgeComponent, CurrencyPipe, DatePipe, FormsModule, RouterLink],
  templateUrl: './admin-booking-detail.page.html',
  styleUrl: './admin-booking-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminBookingDetailPage {
  private readonly api = inject(AdminService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly bookingId = Number(this.route.snapshot.paramMap.get('id'));
  protected readonly booking = signal<AdminBookingDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly feedback = signal('');
  protected readonly actionError = signal('');
  protected readonly mutationPending = signal(false);
  protected readonly pendingAction = signal<BookingAction | null>(null);
  protected actionReason = '';
  protected readonly availableActions = computed(() =>
    this.booking() ? actions[this.booking()!.status as AdminBookingStatus] ?? [] : [],
  );
  protected readonly outstandingBalance = computed(() =>
    Math.max(0, (this.booking()?.total ?? 0) - (this.booking()?.amountPaid ?? 0)),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    if (!Number.isSafeInteger(this.bookingId) || this.bookingId < 1) {
      this.loading.set(false);
      this.error.set('Booking not found.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.api.booking(this.bookingId).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (response) => this.booking.set(response.data),
      error: () => this.error.set('Unable to load this booking.'),
    });
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
    this.api.updateBookingStatus(this.bookingId, action.status, reason || undefined)
      .pipe(finalize(() => this.mutationPending.set(false)))
      .subscribe({
        next: () => {
          this.feedback.set('Booking status updated.');
          this.pendingAction.set(null);
          this.actionReason = '';
          this.load();
        },
        error: (error) => {
          if (error?.status === 409) {
            this.actionError.set('This booking changed in another session. The latest details are shown.');
            this.pendingAction.set(null);
            this.load();
          } else {
            this.actionError.set(error?.error?.message || 'Unable to update this booking.');
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
}
