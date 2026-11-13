import { formatEventTime } from '../utils/event-time.js';
import type { AdminPaymentReport, AdminReservationReport, PaymentReportMethod, PaymentReportQuery, PaymentReportStatus, ReservationReportQuery } from '../types/admin-report.types.js';
import type { BookingStatus } from '../types/admin.types.js';
import { adminReportRepository } from '../repositories/admin-report.repository.js';
import { AppError } from '../utils/app-error.js';
import { isoDate } from '../utils/validation.js';

interface Repository {
  reservations(filters: ReservationReportQuery): Promise<AdminReservationReport>;
  payments(filters: PaymentReportQuery): Promise<AdminPaymentReport>;
}

const reservationStatuses: readonly BookingStatus[] = ['PENDING', 'APPROVED', 'AWAITING_PAYMENT', 'PAYMENT_SUBMITTED', 'PAYMENT_VERIFIED', 'CONFIRMED', 'COMPLETED', 'REJECTED', 'CANCELLED'];
const paymentStatuses: readonly PaymentReportStatus[] = ['', 'PENDING', 'PARTIALLY_PAID', 'PAID'];
const paymentMethods: readonly PaymentReportMethod[] = ['', 'CASH', 'BANK_TRANSFER', 'E-WALLET'];

function objectValue(raw: unknown): Record<string, unknown> {
  if (raw === undefined || raw === null) return {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new AppError(400, 'Report filters are invalid.');
  return raw as Record<string, unknown>;
}

function optionalString(value: unknown, name: string, max: number): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw new AppError(400, `${name} is invalid.`);
  const normalized = value.trim();
  if (normalized.length > max) throw new AppError(400, `${name} is invalid.`);
  return normalized;
}

function defaultRange(now: Date): Pick<ReservationReportQuery, 'dateFrom' | 'dateTo'> {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    dateFrom: `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-01`,
    dateTo: new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10),
  };
}

function dateRange(value: Record<string, unknown>, clock: () => Date): Pick<ReservationReportQuery, 'dateFrom' | 'dateTo'> {
  const fromRaw = value['dateFrom'];
  const toRaw = value['dateTo'];
  const hasFrom = fromRaw !== undefined && fromRaw !== null && fromRaw !== '';
  const hasTo = toRaw !== undefined && toRaw !== null && toRaw !== '';
  if (!hasFrom && !hasTo) return defaultRange(clock());
  if (hasFrom !== hasTo) throw new AppError(400, 'Start and end dates are required together.');
  const dateFrom = isoDate(fromRaw, 'Start date');
  const dateTo = isoDate(toRaw, 'End date');
  if (dateFrom > dateTo) throw new AppError(400, 'Report date range is invalid.');
  const days = (Date.parse(`${dateTo}T00:00:00.000Z`) - Date.parse(`${dateFrom}T00:00:00.000Z`)) / 86_400_000;
  if (days > 365) throw new AppError(400, 'Report date range cannot exceed 366 days.');
  return { dateFrom, dateTo };
}

export function parseReservationReportQuery(raw: unknown, clock: () => Date = () => new Date()): ReservationReportQuery {
  const value = objectValue(raw);
  const status = optionalString(value['status'], 'Reservation status', 30).toUpperCase();
  if (status && !reservationStatuses.includes(status as BookingStatus)) throw new AppError(400, 'Reservation status is invalid.');
  return { ...dateRange(value, clock), status: status as BookingStatus | '', eventType: optionalString(value['eventType'], 'Event type', 100) };
}

export function parsePaymentReportQuery(raw: unknown, clock: () => Date = () => new Date()): PaymentReportQuery {
  const value = objectValue(raw);
  const status = optionalString(value['status'], 'Payment status', 30).toUpperCase() as PaymentReportStatus;
  const rawMethod = optionalString(value['method'], 'Payment method', 50).toUpperCase();
  const method = rawMethod === 'E_WALLET' ? 'E-WALLET' : rawMethod as PaymentReportMethod;
  if (!paymentStatuses.includes(status)) throw new AppError(400, 'Payment status is invalid.');
  if (!paymentMethods.includes(method)) throw new AppError(400, 'Payment method is invalid.');
  return { ...dateRange(value, clock), status, method };
}

function csvCell(value: unknown): string {
  let cell = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@]/.test(cell)) cell = `'${cell}`;
  return /[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

function csv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return `\uFEFF${[headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function createAdminReportService(repository: Repository, clock: () => Date = () => new Date()) {
  return {
    reservationReport(raw: unknown) { return repository.reservations(parseReservationReportQuery(raw, clock)); },
    paymentReport(raw: unknown) { return repository.payments(parsePaymentReportQuery(raw, clock)); },
    async reservationCsv(raw: unknown) {
      const report = await repository.reservations(parseReservationReportQuery(raw, clock));
      return csv(['Reference', 'Customer', 'Event date', 'Event time', 'Event type', 'Guests', 'Venue', 'Package', 'Status'], report.items.map(item => [item.reference, item.customer, item.eventDate, formatEventTime(item.eventTime, ''), item.eventType, item.guestCount, item.venue, item.packageName, item.status]));
    },
    async paymentCsv(raw: unknown) {
      const report = await repository.payments(parsePaymentReportQuery(raw, clock));
      return csv(['Invoice', 'Reservation', 'Customer', 'Issued date', 'Latest payment date', 'Method', 'Amount due', 'Amount paid', 'Outstanding balance', 'Status'], report.items.map(item => [item.invoiceNumber, item.bookingReference, item.customer, item.issuedDate, item.latestPaymentDate, item.method, item.amountDue.toFixed(2), item.amountPaid.toFixed(2), item.outstandingBalance.toFixed(2), item.status]));
    },
  };
}

export const adminReportService = createAdminReportService(adminReportRepository);
