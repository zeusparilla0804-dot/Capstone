import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BookingService } from '../../core/services/booking.service';
import { BookingCalculationService } from '../../core/services/booking-calculation.service';
import { AuthService } from '../../core/services/auth.service';
import { CustomerActivity, StatCard } from '../../core/models';
import { DashboardNavItem, DashboardSidebarComponent } from '../../shared/components/dashboard-sidebar/dashboard-sidebar';
import { CUSTOMER_NAV_ITEMS } from '../../shared/navigation/customer-navigation';
import { StatCardComponent } from '../../shared/components/stat-card/stat-card';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge';

@Component({
  selector: 'app-customer-dashboard-page',
  imports: [DashboardSidebarComponent, RouterLink, StatCardComponent, StatusBadgeComponent],
  templateUrl: './customer-dashboard.page.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './customer-dashboard.page.scss',
})
export class CustomerDashboardPageComponent {
  protected readonly bookingService = inject(BookingService);
  private readonly calculationService = inject(BookingCalculationService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  protected readonly bookings = this.bookingService.bookings;
  protected readonly upcomingBookings = computed(() => this.bookingService.getBookingsByTab('upcoming').slice(0, 2));
  protected readonly paymentSummary = computed(() => {
    return this.bookings().map((booking) => {
      const totals = this.calculationService.calculateTotals(booking);
      return { bookingId: booking.id, invoiceId: booking.invoiceId, eventName: booking.eventName, total: totals.total, paid: booking.amountPaid, balance: Math.max(totals.total - booking.amountPaid, 0) };
    }).find((payment) => payment.balance > 0);
  });
  protected readonly paymentProgress = computed(() => {
    const payment = this.paymentSummary();
    return payment?.total ? Math.round((payment.paid / payment.total) * 100) : 0;
  });
  protected readonly dashboardStats = computed<readonly StatCard[]>(() => {
    const upcoming = this.upcomingBookings();
    const payment = this.paymentSummary();
    return [
      { label: 'Upcoming Events', value: String(upcoming.length), supportingText: upcoming[0] ? `Next event ${this.shortDate(upcoming[0].eventDate)}` : 'No events scheduled', tone: 'gold' },
      { label: 'Total Bookings', value: String(this.bookings().length), supportingText: 'Across all events', tone: 'dark' },
      { label: 'Outstanding Balance', value: this.formatCurrency(payment?.balance ?? 0), supportingText: payment?.eventName ?? 'No balance due', tone: payment ? 'red' : 'green' },
    ];
  });
  protected readonly recentActivity = computed<readonly CustomerActivity[]>(() => {
    const activities: CustomerActivity[] = this.bookings().map((booking) => ({
      id: `created-${booking.id}`, title: booking.status === 'confirmed' ? 'Booking confirmed' : booking.status === 'cancelled' ? 'Booking cancelled' : 'Booking created',
      description: booking.eventName, dateLabel: this.shortDate(booking.cancelledAt ?? booking.createdAt),
      type: booking.status === 'confirmed' ? 'confirmation' : 'booking',
    }));
    const paidBooking = this.bookings().find((booking) => booking.amountPaid > 0);
    if (paidBooking) activities.push({ id: `payment-${paidBooking.id}`, title: 'Payment recorded', description: `${this.formatCurrency(paidBooking.amountPaid)} down payment`, dateLabel: this.shortDate(paidBooking.createdAt), type: 'payment' });
    return activities.slice(0, 3);
  });
  protected readonly navItems = CUSTOMER_NAV_ITEMS;
  constructor() { this.bookingService.loadMine(); }

  protected formatCurrency(value: number): string {
    return `PHP ${value.toLocaleString('en-PH')}`;
  }

  protected formatEventDate(value: string): string {
    return new Intl.DateTimeFormat('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
  }

  private shortDate(value: string): string {
    return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: value.includes('T') ? undefined : 'numeric', timeZone: 'UTC' }).format(new Date(value.includes('T') ? value : `${value}T00:00:00Z`));
  }

  protected async handleNavAction(item: DashboardNavItem): Promise<void> {
    if (item.label === 'Logout') {
      await this.auth.logout();
      await this.router.navigate([item.route]);
    }
  }
}
