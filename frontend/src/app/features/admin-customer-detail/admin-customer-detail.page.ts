import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import type { AdminCustomerBooking, AdminCustomerPayment, AdminCustomerProfile, PageResult } from '../../core/models';
import { AdminService } from '../../core/services/admin.service';
import { AdminShellComponent } from '../../shared/components/admin-shell/admin-shell';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge';

@Component({
  selector: 'app-admin-customer-detail',
  imports: [AdminShellComponent, StatusBadgeComponent, CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './admin-customer-detail.page.html',
  styleUrl: './admin-customer-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCustomerDetailPage {
  private readonly api = inject(AdminService);
  private readonly route = inject(ActivatedRoute);
  protected readonly customerId = Number(this.route.snapshot.paramMap.get('id'));
  protected readonly profile = signal<AdminCustomerProfile | null>(null);
  protected readonly bookings = signal<PageResult<AdminCustomerBooking> | null>(null);
  protected readonly payments = signal<PageResult<AdminCustomerPayment> | null>(null);
  protected readonly profileLoading = signal(true);
  protected readonly bookingsLoading = signal(true);
  protected readonly paymentsLoading = signal(true);
  protected readonly error = signal('');
  protected readonly pageSize = 10;

  constructor() {
    if (!Number.isSafeInteger(this.customerId) || this.customerId < 1) {
      this.profileLoading.set(false); this.bookingsLoading.set(false); this.paymentsLoading.set(false);
      this.error.set('Customer not found.');
    } else {
      this.loadProfile(); this.loadBookings(1); this.loadPayments(1);
    }
  }

  protected loadProfile(): void {
    this.profileLoading.set(true); this.error.set('');
    this.api.customer(this.customerId).pipe(finalize(() => this.profileLoading.set(false))).subscribe({ next: response => this.profile.set(response.data), error: () => this.error.set('Unable to load this customer.') });
  }

  protected loadBookings(page: number): void {
    this.bookingsLoading.set(true);
    this.api.customerBookings(this.customerId, page, this.pageSize).pipe(finalize(() => this.bookingsLoading.set(false))).subscribe({ next: response => this.bookings.set(response.data), error: () => this.error.set('Unable to load customer bookings.') });
  }

  protected loadPayments(page: number): void {
    this.paymentsLoading.set(true);
    this.api.customerPayments(this.customerId, page, this.pageSize).pipe(finalize(() => this.paymentsLoading.set(false))).subscribe({ next: response => this.payments.set(response.data), error: () => this.error.set('Unable to load customer payments.') });
  }
}
