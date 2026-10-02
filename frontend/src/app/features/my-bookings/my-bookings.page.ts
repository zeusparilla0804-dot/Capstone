import { Component, computed, HostListener, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Booking, BookingTab } from '../../core/models';
import { BookingService } from '../../core/services/booking.service';
import { AuthService } from '../../core/services/auth.service';
import { BookingCardComponent } from '../../shared/components/booking-card/booking-card';
import { DashboardNavItem, DashboardSidebarComponent } from '../../shared/components/dashboard-sidebar/dashboard-sidebar';

@Component({
  selector: 'app-my-bookings-page',
  imports: [BookingCardComponent, DashboardSidebarComponent, RouterLink, FormsModule],
  templateUrl: './my-bookings.page.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './my-bookings.page.scss',
})
export class MyBookingsPageComponent {
  protected readonly bookingService = inject(BookingService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly activeFilter = signal<BookingTab>('upcoming');
  protected readonly bookingToCancel = signal<Booking | null>(null);
  protected readonly cancellationPending = signal(false);
  protected readonly cancellationError = signal('');
  protected cancellationReason = '';
  protected readonly filteredBookings = computed(() => this.bookingService.getBookingsByTab(this.activeFilter()));
  protected readonly filters: readonly { value: BookingTab; label: string }[] = [
    { value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }, { value: 'cancelled', label: 'Cancelled' },
  ];
  protected readonly navItems: readonly DashboardNavItem[] = [
    { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
    { label: 'My Bookings', route: '/my-bookings', icon: 'calendar' },
    { label: 'Billing & Payments', route: '/invoice/booking-001', icon: 'wallet' },
    { label: 'Profile', route: '/dashboard', icon: 'profile', showActiveState: false },
    { label: 'Logout', route: '/', icon: 'logout', isAction: true },
  ];
  constructor() { this.bookingService.loadMine(); }

  protected setFilter(filter: BookingTab): void { this.activeFilter.set(filter); }
  protected requestCancellation(booking: Booking): void { this.cancellationReason = ''; this.cancellationError.set(''); this.bookingToCancel.set(booking); }
  protected closeCancellation(): void { if (this.cancellationPending()) return; this.bookingToCancel.set(null); this.cancellationReason = ''; this.cancellationError.set(''); }
  protected async confirmCancellation(): Promise<void> {
    const booking = this.bookingToCancel();
    const reason = this.cancellationReason.trim();
    if (!booking || !reason || reason.length > 1000 || this.cancellationPending()) return;
    this.cancellationPending.set(true);
    const cancelled = await this.bookingService.cancelBooking(booking.id, reason);
    this.cancellationPending.set(false);
    if (cancelled) { this.activeFilter.set('cancelled'); this.closeCancellation(); }
    else this.cancellationError.set('Unable to cancel this booking. Refresh and try again.');
  }
  protected async handleNavAction(item: DashboardNavItem): Promise<void> { if (item.label === 'Logout') { await this.auth.logout(); await this.router.navigate([item.route]); } }

  @HostListener('document:keydown.escape')
  protected closeOnEscape(): void { this.closeCancellation(); }
}
