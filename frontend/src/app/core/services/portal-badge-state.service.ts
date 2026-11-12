import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { AdminDashboard, Booking } from '../models';
import { CustomerAccountScopeService } from './customer-account-scope.service';

export interface AdminPortalBadges {
  readonly bookings: number;
  readonly payments: number;
  readonly emails: number;
  readonly qrAssignments: number;
}

const emptyAdminBadges: AdminPortalBadges = { bookings: 0, payments: 0, emails: 0, qrAssignments: 0 };
const currentBookingStatuses = new Set<Booking['status']>([
  'pending',
  'approved',
  'awaiting_payment',
  'payment_submitted',
  'payment_verified',
  'confirmed',
]);

@Injectable({ providedIn: 'root' })
export class PortalBadgeStateService {
  private readonly adminBadgeState = signal<AdminPortalBadges>(emptyAdminBadges);
  private readonly customerBookingState = signal(0);
  readonly adminBadges = this.adminBadgeState.asReadonly();
  readonly customerBookingCount = this.customerBookingState.asReadonly();

  constructor() {
    inject(CustomerAccountScopeService).changes.pipe(takeUntilDestroyed()).subscribe(() => this.customerBookingState.set(0));
  }

  setAdminDashboard(summary: AdminDashboard): void {
    this.adminBadgeState.set({
      bookings: this.count(summary.priority.pendingBookingReviews),
      payments: this.count(summary.priority.proofsAwaitingVerification),
      emails: this.count(summary.priority.failedEmailNotifications),
      qrAssignments: this.count(summary.priority.qrAssignmentsWaiting ?? 0),
    });
  }

  setCustomerBookings(bookings: readonly Booking[]): void {
    this.customerBookingState.set(bookings.filter(booking => currentBookingStatuses.has(booking.status)).length);
  }

  reset(): void {
    this.adminBadgeState.set(emptyAdminBadges);
    this.customerBookingState.set(0);
  }

  clearAdmin(): void { this.adminBadgeState.set(emptyAdminBadges); }

  private count(value: number): number {
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }
}
