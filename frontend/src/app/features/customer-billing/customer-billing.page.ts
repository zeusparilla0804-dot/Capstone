import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BookingStatus } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { bookingTotal, customerPaymentStatus, hasCashPaymentAction, hasOnlinePaymentAction } from '../../core/utils/customer-payment-status';
import { BookingService } from '../../core/services/booking.service';
import { PortalBadgeStateService } from '../../core/services/portal-badge-state.service';
import { DashboardNavItem, DashboardSidebarComponent } from '../../shared/components/dashboard-sidebar/dashboard-sidebar';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge';
import { customerNavItems } from '../../shared/navigation/customer-navigation';

interface BillingRecord {
  readonly id: string;
  readonly invoiceId?: number;
  readonly reference: string;
  readonly eventName: string;
  readonly eventDate: string;
  readonly status: BookingStatus;
  readonly paymentStatus: string;
  readonly total: number;
  readonly paid: number;
  readonly balance: number;
  readonly acceptsPayment: boolean;
  readonly cashPayment: boolean;
}

@Component({
  selector: 'app-customer-billing-page',
  imports: [DashboardSidebarComponent, RouterLink, StatusBadgeComponent],
  templateUrl: './customer-billing.page.html',
  styleUrl: './customer-billing.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerBillingPageComponent {
  protected readonly bookingService = inject(BookingService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly badgeState = inject(PortalBadgeStateService);
  protected readonly navItems = computed(() => customerNavItems(this.badgeState.customerBookingCount()));

  protected readonly records = computed<readonly BillingRecord[]>(() => this.bookingService.bookings().map((booking) => {
    const total = bookingTotal(booking);
    const balance = booking.status === 'cancelled' || booking.status === 'rejected'
      ? 0
      : Math.max(total - booking.amountPaid, 0);
    return {
      id: booking.id,
      invoiceId: booking.invoiceId,
      reference: booking.reference,
      eventName: booking.eventName,
      eventDate: booking.eventDate,
      status: booking.status,
      paymentStatus: customerPaymentStatus(booking),
      total,
      paid: booking.amountPaid,
      balance,
      acceptsPayment: hasCashPaymentAction(booking) || hasOnlinePaymentAction(booking),
      cashPayment: booking.paymentMethod === 'cash',
    };
  }));
  protected readonly totalBilled = computed(() => this.records().reduce((sum, item) => sum + item.total, 0));
  protected readonly totalPaid = computed(() => this.records().reduce((sum, item) => sum + item.paid, 0));
  protected readonly outstandingBalance = computed(() => this.records().reduce((sum, item) => sum + item.balance, 0));

  constructor() {
    effect(() => this.badgeState.setCustomerBookings(this.bookingService.bookings()));
    this.bookingService.loadMine();
  }

  protected formatCurrency(value: number): string {
    return `₱${value.toLocaleString('en-PH')}`;
  }

  protected formatDate(value: string): string {
    return new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${value}T00:00:00Z`));
  }

  protected async handleNavAction(item: DashboardNavItem): Promise<void> {
    if (item.label === 'Logout') {
      await this.auth.logout();
      await this.router.navigate([item.route]);
    }
  }
}
