import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AdminPayment, AdminPaymentProof, PageResult } from '../../core/models';
import { AdminService } from '../../core/services/admin.service';
import { AdminShellComponent } from '../../shared/components/admin-shell/admin-shell';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge';
import { PaymentMethodLabelPipe } from '../../shared/pipes/payment-method-label.pipe';

@Component({
  selector: 'app-admin-payments',
  imports: [PaymentMethodLabelPipe, AdminShellComponent, StatusBadgeComponent, FormsModule, ReactiveFormsModule, CurrencyPipe, DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './admin-payments.page.html',
  styleUrl: './admin-payments.page.scss',
})
export class AdminPaymentsPage {
  private readonly api = inject(AdminService);
  protected readonly data = signal<PageResult<AdminPayment> | null>(null);
  protected readonly proofs = signal<PageResult<AdminPaymentProof> | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly showForm = signal(false);
  protected search = '';
  protected status = '';
  protected page = 1;
  protected readonly form = new FormGroup({
    reservationId: new FormControl(0, { nonNullable: true, validators: Validators.min(1) }),
    amount: new FormControl(0, { nonNullable: true, validators: Validators.min(.01) }),
    method: new FormControl('CASH', { nonNullable: true }),
    reference: new FormControl('', { nonNullable: true }),
    paymentDate: new FormControl(new Date().toISOString().slice(0, 10), { nonNullable: true, validators: Validators.required }),
  });

  constructor() {
    this.configureReference();
    this.form.controls.method.valueChanges.subscribe(() => this.configureReference());
    this.load();
    this.loadProofs();
  }

  protected load(page = this.page): void {
    this.page = page;
    this.loading.set(true);
    this.api.payments({ page, pageSize: 20, search: this.search, status: this.status }).subscribe({
      next: r => { this.data.set(r.data); this.loading.set(false); this.error.set(''); },
      error: () => { this.error.set('Unable to load payments.'); this.loading.set(false); },
    });
  }

  protected loadProofs(): void {
    this.api.paymentProofs({ page: 1, pageSize: 8, status: 'SUBMITTED', order: 'oldest' }).subscribe({
      next: r => this.proofs.set(r.data),
      error: () => this.error.set('Unable to load the payment-proof queue.'),
    });
  }

  protected save(): void {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.error.set('');
    this.message.set('');
    this.form.disable({ emitEvent: false });
    this.api.recordPayment(value).pipe(finalize(() => {
      this.form.enable({ emitEvent: false });
      this.saving.set(false);
    })).subscribe({
      next: () => {
        this.showForm.set(false);
        this.form.reset({ reservationId: 0, amount: 0, method: 'CASH', reference: '', paymentDate: new Date().toISOString().slice(0, 10) });
        this.load();
        this.loadProofs();
        this.message.set(value.method === 'CASH' ? 'Cash received and recorded.' : 'Payment recorded.');
      },
      error: error => this.error.set(error instanceof HttpErrorResponse && typeof error.error?.message === 'string'
        ? error.error.message : 'Unable to record payment. Check the outstanding balance and receipt/reference.'),
    });
  }

  private configureReference(): void {
    const reference = this.form.controls.reference;
    reference.setValidators([Validators.required, Validators.pattern(/.*\S.*/), Validators.maxLength(150)]);
    reference.updateValueAndValidity({ emitEvent: false });
  }
}
