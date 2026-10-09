import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BookingStatus } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { BookingCalculationService } from '../../core/services/booking-calculation.service';
import { BookingService } from '../../core/services/booking.service';
import { DashboardNavItem, DashboardSidebarComponent } from '../../shared/components/dashboard-sidebar/dashboard-sidebar';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge';
import { CUSTOMER_NAV_ITEMS } from '../../shared/navigation/customer-navigation';

interface BillingRecord {
  readonly id: string;
  readonly invoiceId?: number;
  readonly reference: string;
  readonly eventName: string;
  readonly eventDate: string;
  readonly status: BookingStatus;
  readonly total: number;
  readonly paid: number;
  readonly balance: number;
  readonly acceptsPayment: boolean;
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
  private readonly calculationService = inject(BookingCalculationService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly navItems = CUSTOMER_NAV_ITEMS;

  protected readonly records = computed<readonly BillingRecord[]>(() => this.bookingService.bookings().map((booking) => {
    const total = this.calculationService.calculateTotals(booking).total;
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
      total,
      paid: booking.amountPaid,
      balance,
      acceptsPayment: booking.status === 'awaiting_payment' || booking.status === 'payment_submitted',
    };
  }));
  protected readonly totalBilled = computed(() => this.records().reduce((sum, item) => sum + item.total, 0));
  protected readonly totalPaid = computed(() => this.records().reduce((sum, item) => sum + item.paid, 0));
  protected readonly outstandingBalance = computed(() => this.records().reduce((sum, item) => sum + item.balance, 0));

  constructor() {
    this.bookingService.loadMine();
  }

  protected formatCurrency(value: number): string {
    return `PHP ${value.toLocaleString('en-PH')}`;
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
