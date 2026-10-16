import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Booking, BookingStatus } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { BookingCalculationService } from '../../core/services/booking-calculation.service';
import { BookingService } from '../../core/services/booking.service';
import { PortalBadgeStateService } from '../../core/services/portal-badge-state.service';
import { DashboardNavItem, DashboardSidebarComponent } from '../../shared/components/dashboard-sidebar/dashboard-sidebar';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge';
import { customerNavItems } from '../../shared/navigation/customer-navigation';

interface PlanningProgress {
  readonly currentStep: 1 | 2 | 3 | null;
  readonly completedThrough: 0 | 1 | 2 | 3;
}

@Component({
  selector: 'app-customer-dashboard-page',
  imports: [DashboardSidebarComponent, RouterLink, StatusBadgeComponent],
  templateUrl: './customer-dashboard.page.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './customer-dashboard.page.scss',
})
export class CustomerDashboardPageComponent {
  protected readonly bookingService = inject(BookingService);
  private readonly calculationService = inject(BookingCalculationService);
  protected readonly badgeState = inject(PortalBadgeStateService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  protected readonly bookings = this.bookingService.bookings;
  protected readonly upcomingBookings = computed(() => this.bookingService.getBookingsByTab('upcoming').slice(0, 4));
  protected readonly nextBooking = computed(() => this.upcomingBookings()[0]);
  protected readonly navItems = computed(() => customerNavItems(this.badgeState.customerBookingCount()));
  protected readonly planningProgress = computed<PlanningProgress>(() => this.progressFor(this.nextBooking()?.status));
  protected readonly paymentSummary = computed(() => {
    const booking = this.nextBooking();
    if (!booking) return undefined;
    const totals = this.calculationService.calculateTotals(booking);
    return {
      bookingId: booking.id,
      invoiceId: booking.invoiceId,
      eventName: booking.eventName,
      total: totals.total,
      paid: booking.amountPaid,
      balance: Math.max(totals.total - booking.amountPaid, 0),
    };
  });

  constructor() {
    effect(() => this.badgeState.setCustomerBookings(this.bookings()));
    this.bookingService.loadMine();
  }

  protected isStepComplete(step: 1 | 2 | 3): boolean {
    return this.planningProgress().completedThrough >= step;
  }

  protected isCurrentStep(step: 1 | 2 | 3): boolean {
    return this.planningProgress().currentStep === step;
  }

  protected formatCurrency(value: number): string {
    return `PHP ${value.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }

  protected formatEventDate(value: string): string {
    return new Intl.DateTimeFormat('en-PH', {
      month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    }).format(new Date(`${value}T00:00:00Z`));
  }

  protected firstName(): string {
    return this.auth.user()?.fullName.trim().split(/\s+/)[0] || 'Customer';
  }

  protected async handleNavAction(item: DashboardNavItem): Promise<void> {
    if (item.label === 'Logout') {
      await this.auth.logout();
      await this.router.navigate([item.route]);
    }
  }

  private progressFor(status?: BookingStatus): PlanningProgress {
    if (!status) return { currentStep: null, completedThrough: 0 };
    if (['payment_verified', 'confirmed', 'completed'].includes(status)) {
      return { currentStep: null, completedThrough: 3 };
    }
    if (['approved', 'awaiting_payment', 'payment_submitted'].includes(status)) {
      return { currentStep: 3, completedThrough: 2 };
    }
    if (status === 'pending') return { currentStep: 2, completedThrough: 1 };
    return { currentStep: 1, completedThrough: 0 };
  }
}
