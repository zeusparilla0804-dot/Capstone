import { PaymentMethodLabelPipe } from '../../shared/pipes/payment-method-label.pipe';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import type { AdminCustomerBooking, AdminCustomerPayment, AdminCustomerProfile, AdminCustomerStatus, PageResult } from '../../core/models';
import { AdminService } from '../../core/services/admin.service';
import { AdminShellComponent } from '../../shared/components/admin-shell/admin-shell';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge';

@Component({
  selector: 'app-admin-customer-detail',
  imports: [PaymentMethodLabelPipe, AdminShellComponent, StatusBadgeComponent, CurrencyPipe, DatePipe, ReactiveFormsModule, RouterLink],
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
  protected readonly profileSaving = signal(false);
  protected readonly statusSaving = signal(false);
  protected readonly statusDialogOpen = signal(false);
  protected readonly profileError = signal('');
  protected readonly profileMessage = signal('');
  protected readonly bookingsError = signal('');
  protected readonly paymentsError = signal('');
  protected readonly pageSize = 10;
  protected readonly profileForm = new FormGroup({
    firstName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    lastName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email, Validators.maxLength(255)] }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(30)] }),
  });
  protected readonly nextStatus = computed<AdminCustomerStatus>(() => this.profile()?.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');

  constructor() {
    if (!Number.isSafeInteger(this.customerId) || this.customerId < 1) {
      this.profileLoading.set(false);
      this.bookingsLoading.set(false);
      this.paymentsLoading.set(false);
      this.profileError.set('Customer not found.');
    } else {
      this.loadProfile();
      this.loadBookings(1);
      this.loadPayments(1);
    }
  }

  protected loadProfile(): void {
    this.profileLoading.set(true);
    this.profileError.set('');
    this.api.customer(this.customerId).pipe(finalize(() => this.profileLoading.set(false))).subscribe({
      next: response => this.setProfile(response.data),
      error: () => this.profileError.set('Unable to load this customer. Please try again.'),
    });
  }

  protected saveProfile(): void {
    if (this.profileSaving()) return;
    const raw = this.profileForm.getRawValue();
    const value = {
      firstName: raw.firstName.trim(),
      lastName: raw.lastName.trim(),
      email: raw.email.trim().toLowerCase(),
      phone: raw.phone.trim(),
    };
    this.profileForm.setValue(value);
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    this.profileSaving.set(true);
    this.profileError.set('');
    this.profileMessage.set('');
    this.api.updateCustomer(this.customerId, value).pipe(finalize(() => this.profileSaving.set(false))).subscribe({
      next: response => {
        this.setProfile(response.data);
        this.profileMessage.set('Customer profile saved.');
      },
      error: error => {
        const duplicateMessage = error?.status === 409 ? error?.error?.message : undefined;
        this.profileError.set(duplicateMessage || 'Unable to save the customer profile. Please try again.');
      },
    });
  }

  protected requestStatusChange(): void {
    if (!this.profile() || this.statusSaving()) return;
    this.profileError.set('');
    this.profileMessage.set('');
    this.statusDialogOpen.set(true);
  }

  protected cancelStatusChange(): void {
    if (!this.statusSaving()) this.statusDialogOpen.set(false);
  }

  protected confirmStatusChange(): void {
    if (!this.profile() || this.statusSaving()) return;
    const status = this.nextStatus();
    this.statusSaving.set(true);
    this.profileError.set('');
    this.api.updateCustomerStatus(this.customerId, status).pipe(finalize(() => this.statusSaving.set(false))).subscribe({
      next: response => {
        this.setProfile(response.data);
        this.statusDialogOpen.set(false);
        this.profileMessage.set(status === 'INACTIVE' ? 'Customer account deactivated.' : 'Customer account activated.');
      },
      error: () => this.profileError.set('Unable to update the customer account. Please try again.'),
    });
  }

  protected loadBookings(page: number): void {
    this.bookingsLoading.set(true);
    this.bookingsError.set('');
    this.api.customerBookings(this.customerId, page, this.pageSize).pipe(finalize(() => this.bookingsLoading.set(false))).subscribe({
      next: response => this.bookings.set(response.data),
      error: () => this.bookingsError.set('Unable to load customer bookings.'),
    });
  }

  protected loadPayments(page: number): void {
    this.paymentsLoading.set(true);
    this.paymentsError.set('');
    this.api.customerPayments(this.customerId, page, this.pageSize).pipe(finalize(() => this.paymentsLoading.set(false))).subscribe({
      next: response => this.payments.set(response.data),
      error: () => this.paymentsError.set('Unable to load customer payments.'),
    });
  }

  private setProfile(customer: AdminCustomerProfile): void {
    this.profile.set(customer);
    this.profileForm.setValue({
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone,
    });
    this.profileForm.markAsPristine();
  }
}
