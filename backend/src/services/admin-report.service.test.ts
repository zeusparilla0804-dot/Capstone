import assert from 'node:assert/strict';
import test from 'node:test';

import { AppError } from '../utils/app-error.js';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';

const { createAdminReportService, parsePaymentReportQuery, parseReservationReportQuery } = await import('./admin-report.service.js');

const clock = () => new Date('2026-10-16T12:00:00.000Z');

test('report queries default to the current UTC month and normalize allowed filters', () => {
  assert.deepEqual(parseReservationReportQuery({}, clock), {
    dateFrom: '2026-10-01', dateTo: '2026-10-31', status: '', eventType: '',
  });
  assert.deepEqual(parseReservationReportQuery({ dateFrom: '2026-09-01', dateTo: '2026-09-30', status: ' confirmed ', eventType: ' Wedding ' }, clock), {
    dateFrom: '2026-09-01', dateTo: '2026-09-30', status: 'CONFIRMED', eventType: 'Wedding',
  });
  assert.deepEqual(parsePaymentReportQuery({ dateFrom: '2026-10-01', dateTo: '2026-10-31', status: 'paid', method: 'bank_transfer' }, clock), {
    dateFrom: '2026-10-01', dateTo: '2026-10-31', status: 'PAID', method: 'BANK_TRANSFER',
  });
});

test('report queries reject partial invalid reversed excessive and unsupported filters', () => {
  const invalid = [
    { dateFrom: '2026-10-01' },
    { dateFrom: '2026-02-30', dateTo: '2026-03-01' },
    { dateFrom: '2026-10-02', dateTo: '2026-10-01' },
    { dateFrom: '2025-01-01', dateTo: '2026-01-02' },
    { status: 'DELETED' },
  ];
  for (const raw of invalid) assert.throws(() => parseReservationReportQuery(raw, clock), AppError);
  for (const raw of [{ method: 'CARD' }, { status: 'CANCELLED' }]) {
    assert.throws(() => parsePaymentReportQuery(raw, clock), AppError);
  }
});

test('report service preserves zeroed valid empty results', async () => {
  const service = createAdminReportService({
    reservations: async filters => ({ filters, summary: { reservationCount: 0, totalGuests: 0 }, items: [], upcomingItems: [] }),
    payments: async filters => ({ filters, summary: { totalBilled: 0, verifiedPayments: 0, outstandingBalance: 0 }, items: [] }),
  }, clock);
  assert.equal((await service.reservationReport({})).summary.reservationCount, 0);
  assert.deepEqual((await service.paymentReport({})).summary, { totalBilled: 0, verifiedPayments: 0, outstandingBalance: 0 });
});

test('CSV exports use stable safe UTF-8 CRLF output without credential fields', async () => {
  const service = createAdminReportService({
    reservations: async filters => ({
      filters,
      summary: { reservationCount: 1, totalGuests: 20 },
      items: [{ reference: '=1+1', customer: 'Doe, "Jane"', eventDate: '2026-10-20', eventTime: '14:00', eventType: 'Wedding\nReception', guestCount: 20, venue: '+cmd', packageName: '@Package', status: 'CONFIRMED' }],
      upcomingItems: [],
    }),
    payments: async filters => ({
      filters,
      summary: { totalBilled: 1000, verifiedPayments: 400, outstandingBalance: 600 },
      items: [{ invoiceNumber: '-INV', bookingReference: 'LC-1', customer: 'Jane', issuedDate: '2026-10-01', latestPaymentDate: '2026-10-02', method: 'CASH', amountDue: 1000, amountPaid: 400, outstandingBalance: 600, status: 'PARTIALLY_PAID' }],
    }),
  }, clock);

  const reservations = await service.reservationCsv({});
  assert.ok(reservations.startsWith('\uFEFFReference,Customer,Event date,Event time,Event type,Guests,Venue,Package,Status\r\n'));
  assert.match(reservations, /"Doe, ""Jane"""/);
  assert.match(reservations, /"Wedding\nReception"/);
  assert.match(reservations, /'=1\+1/);
  assert.match(reservations, /'\+cmd/);
  assert.match(reservations, /'@Package/);
  assert.doesNotMatch(reservations, /password|token|session/i);

  const payments = await service.paymentCsv({});
  assert.match(payments, /'-INV/);
  assert.doesNotMatch(payments, /password|token|session/i);
});
