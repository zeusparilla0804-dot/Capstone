import { AfterViewChecked, ChangeDetectionStrategy, Component, computed, ElementRef, HostListener, inject, signal, ViewChild } from '@angular/core';
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
export class MyBookingsPageComponent implements AfterViewChecked {
  @ViewChild('bookingTabs') private bookingTabs?: ElementRef<HTMLElement>;
  @ViewChild('cancelDialog') private cancellationDialog?: ElementRef<HTMLElement>;
  @ViewChild('cancelReason') private cancellationReasonField?: ElementRef<HTMLTextAreaElement>;
  private cancellationTrigger?: HTMLButtonElement;
  private focusReasonOnOpen = false;
  private focusCancelledTabOnCheck = false;
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
    { value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'rejected', label: 'Rejected' },
  ];
  protected readonly navItems: readonly DashboardNavItem[] = [
    { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
    { label: 'My Bookings', route: '/my-bookings', icon: 'calendar' },
    { label: 'Billing & Payments', route: '/my-bookings', icon: 'wallet', showActiveState: false },
    { label: 'Profile', route: '/dashboard', icon: 'profile', showActiveState: false },
    { label: 'Logout', route: '/', icon: 'logout', isAction: true },
  ];
  constructor() { this.bookingService.loadMine(); }

  ngAfterViewChecked(): void {
    if (this.focusReasonOnOpen && this.cancellationReasonField) {
      this.focusReasonOnOpen = false;
      this.cancellationReasonField.nativeElement.focus();
    }
    if (this.focusCancelledTabOnCheck && this.bookingTabs) {
      this.focusCancelledTabOnCheck = false;
      this.bookingTabs.nativeElement.querySelector<HTMLButtonElement>('button[role="tab"][aria-selected="true"]')?.focus();
    }
  }

  protected setFilter(filter: BookingTab): void {
    this.activeFilter.set(filter);
    this.bookingTabs?.nativeElement.querySelector<HTMLButtonElement>(`#booking-tab-${filter}`)?.focus();
  }
  protected onTabKeydown(event: KeyboardEvent, filter: BookingTab): void {
    const index = this.filters.findIndex(item => item.value === filter);
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowLeft': nextIndex = (index - 1 + this.filters.length) % this.filters.length; break;
      case 'ArrowRight': nextIndex = (index + 1) % this.filters.length; break;
      case 'Home': nextIndex = 0; break;
      case 'End': nextIndex = this.filters.length - 1; break;
      default: return;
    }
    event.preventDefault();
    this.setFilter(this.filters[nextIndex]!.value);
  }
  protected requestCancellation(booking: Booking, trigger: HTMLButtonElement): void {
    this.cancellationTrigger = trigger;
    this.focusReasonOnOpen = true;
    this.cancellationReason = '';
    this.cancellationError.set('');
    this.bookingToCancel.set(booking);
  }
  protected closeCancellation(restoreTrigger = true): void {
    if (this.cancellationPending()) return;
    this.bookingToCancel.set(null);
    this.cancellationReason = '';
    this.cancellationError.set('');
    this.focusReasonOnOpen = false;
    if (restoreTrigger && this.cancellationTrigger?.isConnected) this.cancellationTrigger.focus();
    this.cancellationTrigger = undefined;
  }
  protected async confirmCancellation(): Promise<void> {
    const booking = this.bookingToCancel();
    const reason = this.cancellationReason.trim();
    if (!booking || !reason || reason.length > 1000 || this.cancellationPending()) return;
    this.cancellationPending.set(true);
    const cancelled = await this.bookingService.cancelBooking(booking.id, reason);
    this.cancellationPending.set(false);
    if (cancelled) { this.activeFilter.set('cancelled'); this.closeCancellation(false); this.focusCancelledTabOnCheck = true; }
    else this.cancellationError.set('Unable to cancel this booking. Refresh and try again.');
  }
  protected async handleNavAction(item: DashboardNavItem): Promise<void> { if (item.label === 'Logout') { await this.auth.logout(); await this.router.navigate([item.route]); } }

  @HostListener('document:keydown', ['$event'])
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (!this.bookingToCancel()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeCancellation();
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = this.cancellationDialog?.nativeElement;
    if (!dialog) return;
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>('textarea:not(:disabled), button:not(:disabled)'));
    if (!controls.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === controls[0] || !dialog.contains(active))) {
      event.preventDefault();
      controls[controls.length - 1]!.focus();
    } else if (!event.shiftKey && (active === controls[controls.length - 1] || !dialog.contains(active))) {
      event.preventDefault();
      controls[0]!.focus();
    }
  }
}
