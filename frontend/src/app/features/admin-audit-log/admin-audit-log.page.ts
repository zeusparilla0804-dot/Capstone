import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import type { AdminAuditLogItem, PageResult } from '../../core/models';
import { AdminService } from '../../core/services/admin.service';
import { AdminShellComponent } from '../../shared/components/admin-shell/admin-shell';
import { formatEventTime } from '../../shared/pipes/event-time.pipe';

const actions: Record<string, string> = {
  BOOKING_STATUS_CHANGED: 'Reservation status updated', BOOKING_TIME_UPDATED: 'Event time updated',
  PAYMENT_RECORDED: 'Payment recorded', PAYMENT_PROOF_VERIFIED: 'Payment proof verified',
  PAYMENT_PROOF_REJECTED: 'Payment proof rejected', CUSTOMER_UPDATED: 'Customer details updated',
  CUSTOMER_ACTIVATED: 'Customer account activated', CUSTOMER_DEACTIVATED: 'Customer account deactivated',
  PACKAGE_CREATED: 'Package created', PACKAGE_UPDATED: 'Package updated', ADD_ON_CREATED: 'Add-on created',
  ADD_ON_UPDATED: 'Add-on updated', INVOICE_ISSUED: 'Invoice issued', EMAIL_OUTBOX_RETRIED: 'Email queued for retry',
};
const entities: Record<string, string> = {
  BOOKING: 'Reservation', CUSTOMER: 'Customer', PAYMENT: 'Payment', PACKAGE: 'Package', ADD_ON: 'Add-on',
  INVOICE: 'Invoice', EMAIL_OUTBOX: 'Email notification', PAYMENT_DESTINATION: 'Receiving bank account',
};
const fieldLabels: Record<string, string> = {
  amountPaid: 'Amount paid', amountDue: 'Amount due', amount: 'Payment amount', method: 'Payment method',
  paymentMethod: 'Payment method', eventTime: 'Event time', expectedTime: 'Previous event time',
  isActive: 'Active', capacityConfirmed: 'Capacity confirmed', firstName: 'First name', lastName: 'Last name',
  phone: 'Phone number', bookingId: 'Reservation ID', eventId: 'Event type ID', pricePerGuest: 'Price per guest',
  basePrice: 'Base price', includedGuests: 'Included guests', excessGuestPrice: 'Excess guest price',
  minGuests: 'Minimum guests', maxGuests: 'Maximum guests', pricingType: 'Pricing model',
};
const moneyFields = new Set(['amountPaid', 'amountDue', 'amount', 'price', 'pricePerGuest', 'basePrice', 'excessGuestPrice', 'unitPrice', 'subtotal', 'total', 'totalAmount', 'discountAmount']);
const enumFields = new Set(['status', 'method', 'paymentMethod', 'pricingType', 'packagePricingType']);

@Component({
  selector: 'app-admin-audit-log', imports: [AdminShellComponent, DatePipe, FormsModule],
  templateUrl: './admin-audit-log.page.html', styleUrl: './admin-audit-log.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAuditLogPage {
  private readonly api = inject(AdminService);
  protected readonly data = signal<PageResult<AdminAuditLogItem> | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly actionOptions = Object.entries(actions);
  protected readonly entityOptions = Object.entries(entities);
  protected adminId = ''; protected action = ''; protected entityType = ''; protected entityId = '';
  protected dateFrom = ''; protected dateTo = ''; protected page = 1;

  constructor() { this.load(); }

  protected actionLabel(value: string): string { return actions[value] ?? this.words(value); }
  protected entityLabel(value: string): string { return entities[value] ?? this.words(value); }

  protected changes(item: Pick<AdminAuditLogItem, 'oldValues' | 'newValues'>): { label: string; before: string; after: string }[] {
    const before = item.oldValues ?? {}, after = item.newValues ?? {};
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].map(key => ({
      label: fieldLabels[key] ?? this.words(key), before: this.value(key, before[key]), after: this.value(key, after[key]),
    }));
  }

  private words(value: string): string {
    const text = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replaceAll('_', ' ').toLowerCase();
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  private value(key: string, value: unknown): string {
    if (value === undefined || value === null) return 'Not recorded';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return moneyFields.has(key)
      ? `PHP ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : String(value);
    if (Array.isArray(value)) return value.length ? value.map(item => this.value('', item)).join('; ') : 'None';
    if (typeof value === 'object') return Object.entries(value).map(([field, entry]) => `${fieldLabels[field] ?? this.words(field)}: ${this.value(field, entry)}`).join('; ') || 'None';
    if (typeof value === 'string') {
      if (!value.length) return 'None';
      if (['eventTime', 'expectedTime'].includes(key)) return formatEventTime(value);
      if (enumFields.has(key)) return this.words(value);
    }
    return String(value);
  }

  protected load(page = this.page): void {
    this.page = page; this.loading.set(true); this.error.set('');
    const filters: Record<string, string | number> = { page, pageSize: 20, action: this.action, entityType: this.entityType, dateFrom: this.dateFrom, dateTo: this.dateTo };
    if (this.adminId) filters['adminId'] = Number(this.adminId);
    if (this.entityId) filters['entityId'] = Number(this.entityId);
    this.api.auditLog(filters).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: result => this.data.set(result.data),
      error: error => this.error.set(error?.error?.message || 'Unable to load the audit log.'),
    });
  }
}
