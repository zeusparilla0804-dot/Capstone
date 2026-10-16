import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import {
  AdminPaymentReport,
  AdminPaymentReportFilter,
  AdminReservationReport,
  AdminReservationReportFilter,
} from '../../core/models';
import { AdminService } from '../../core/services/admin.service';
import { AdminShellComponent } from '../../shared/components/admin-shell/admin-shell';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge';

type ReportTab = 'reservations' | 'payments';

function currentMonth(now = new Date()): { dateFrom: string; dateTo: string } {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = String(new Date(year, now.getMonth() + 1, 0).getDate()).padStart(2, '0');
  return { dateFrom: `${year}-${month}-01`, dateTo: `${year}-${month}-${lastDay}` };
}

@Component({
  selector: 'app-admin-reports',
  imports: [AdminShellComponent, CurrencyPipe, DatePipe, ReactiveFormsModule, StatusBadgeComponent],
  templateUrl: './admin-reports.page.html',
  styleUrl: './admin-reports.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReportsPage {
  private readonly api = inject(AdminService);
  private readonly initialRange = currentMonth();

  protected readonly activeTab = signal<ReportTab>('reservations');
  protected readonly reservationData = signal<AdminReservationReport | null>(null);
  protected readonly paymentData = signal<AdminPaymentReport | null>(null);
  protected readonly reservationLoading = signal(false);
  protected readonly paymentLoading = signal(false);
  protected readonly reservationError = signal('');
  protected readonly paymentError = signal('');
  protected readonly exporting = signal(false);
  protected readonly generatedAt = signal(new Date());

  protected readonly reservationForm = new FormGroup({
    dateFrom: new FormControl(this.initialRange.dateFrom, { nonNullable: true, validators: Validators.required }),
    dateTo: new FormControl(this.initialRange.dateTo, { nonNullable: true, validators: Validators.required }),
    status: new FormControl<AdminReservationReportFilter['status']>('', { nonNullable: true }),
    eventType: new FormControl('', { nonNullable: true }),
  });

  protected readonly paymentForm = new FormGroup({
    dateFrom: new FormControl(this.initialRange.dateFrom, { nonNullable: true, validators: Validators.required }),
    dateTo: new FormControl(this.initialRange.dateTo, { nonNullable: true, validators: Validators.required }),
    status: new FormControl<AdminPaymentReportFilter['status']>('', { nonNullable: true }),
    method: new FormControl<AdminPaymentReportFilter['method']>('', { nonNullable: true }),
  });

  constructor() {
    this.loadReservations();
    this.loadPayments();
  }

  protected selectTab(tab: ReportTab): void {
    this.activeTab.set(tab);
  }

  protected handleTabKey(event: KeyboardEvent, tab: ReportTab): void {
    const order: readonly ReportTab[] = ['reservations', 'payments'];
    let next: ReportTab | undefined;
    if (event.key === 'Home') next = order[0];
    else if (event.key === 'End') next = order.at(-1);
    else if (event.key === 'ArrowRight') next = order[(order.indexOf(tab) + 1) % order.length];
    else if (event.key === 'ArrowLeft') next = order[(order.indexOf(tab) - 1 + order.length) % order.length];
    if (!next) return;

    event.preventDefault();
    this.activeTab.set(next);
    const tabs = (event.currentTarget as HTMLElement | null)?.parentElement;
    tabs?.querySelector<HTMLButtonElement>(`#${next}-tab`)?.focus();
  }

  protected loadReservations(): void {
    if (this.reservationLoading()) return;
    const filters = this.reservationForm.getRawValue();
    if (!this.validRange(filters.dateFrom, filters.dateTo, this.reservationError)) return;
    this.reservationLoading.set(true);
    this.reservationError.set('');
    this.api.reservationReport(filters).pipe(
      finalize(() => this.reservationLoading.set(false)),
    ).subscribe({
      next: response => {
        this.reservationData.set(response.data);
        this.generatedAt.set(new Date());
      },
      error: error => this.reservationError.set(this.errorMessage(error, 'Unable to load reservation reports. Please try again.')),
    });
  }

  protected loadPayments(): void {
    if (this.paymentLoading()) return;
    const filters = this.paymentForm.getRawValue();
    if (!this.validRange(filters.dateFrom, filters.dateTo, this.paymentError)) return;
    this.paymentLoading.set(true);
    this.paymentError.set('');
    this.api.paymentReport(filters).pipe(
      finalize(() => this.paymentLoading.set(false)),
    ).subscribe({
      next: response => {
        this.paymentData.set(response.data);
        this.generatedAt.set(new Date());
      },
      error: error => this.paymentError.set(this.errorMessage(error, 'Unable to load payment reports. Please try again.')),
    });
  }

  protected exportActive(): void {
    if (this.exporting()) return;
    const tab = this.activeTab();
    const request = tab === 'reservations'
      ? this.api.exportReservationReport(this.reservationForm.getRawValue())
      : this.api.exportPaymentReport(this.paymentForm.getRawValue());
    this.exporting.set(true);
    request.pipe(finalize(() => this.exporting.set(false))).subscribe({
      next: blob => this.download(blob, `la-chef-${tab}-${this.today()}.csv`),
      error: error => {
        const target = tab === 'reservations' ? this.reservationError : this.paymentError;
        target.set(this.errorMessage(error, 'Unable to export this report. Please try again.'));
      },
    });
  }

  protected printReport(): void {
    window.print();
  }

  private validRange(dateFrom: string, dateTo: string, error: { set(value: string): void }): boolean {
    if (!dateFrom || !dateTo) {
      error.set('Choose both a start date and an end date.');
      return false;
    }
    if (dateFrom > dateTo) {
      error.set('The start date must be on or before the end date.');
      return false;
    }
    return true;
  }

  private errorMessage(error: unknown, fallback: string): string {
    const message = (error as { error?: { message?: unknown } })?.error?.message;
    return typeof message === 'string' && message.trim() ? message : fallback;
  }

  private download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    try {
      anchor.href = url;
      anchor.download = filename;
      anchor.hidden = true;
      document.body.append(anchor);
      anchor.click();
    } finally {
      anchor.remove();
      URL.revokeObjectURL(url);
    }
  }

  private today(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
