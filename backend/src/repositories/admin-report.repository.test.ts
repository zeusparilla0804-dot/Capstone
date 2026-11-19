import assert from 'node:assert/strict';
import test from 'node:test';
import type sql from 'mssql';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';

const { createAdminReportRepository } = await import('./admin-report.repository.js');

class Recorder {
  readonly calls: { command: string; params: Record<string, unknown> }[] = [];
  private readonly params: Record<string, unknown> = {};
  constructor(private readonly recordsets: Record<string, unknown>[][]) {}
  replaceInput(name: string, _type: unknown, value: unknown) { this.params[name] = value; return this; }
  async query(command: string) {
    this.calls.push({ command, params: { ...this.params } });
    return { recordsets: this.recordsets, recordset: this.recordsets[0] };
  }
}

test('reservation report binds filters and separates future approved or confirmed items', async () => {
  const request = new Recorder([[{ reservationCount: 2, totalGuests: 180 }], [{ reference: 'LC-1', guestCount: 80 }], [{ reference: 'LC-2', guestCount: 100 }]]);
  const repository = createAdminReportRepository({ readRequest: async () => request as unknown as sql.Request });
  const report = await repository.reservations({ dateFrom: '2026-10-01', dateTo: '2026-10-31', status: 'CONFIRMED', eventType: 'Wedding' });
  const call = request.calls[0]!;
  assert.deepEqual(call.params, { dateFrom: '2026-10-01', dateTo: '2026-10-31', status: 'CONFIRMED', eventType: 'Wedding' });
  assert.match(call.command, /r\.event_date\s*>=\s*CONVERT\(date,@dateFrom\)/i);
  assert.match(call.command, /r\.event_date\s*<=\s*CONVERT\(date,@dateTo\)/i);
  assert.match(call.command, /r\.status\s+IN\s*\('APPROVED','CONFIRMED'\)/i);
  assert.match(call.command, /r\.event_date\s*>\s*CONVERT\(date,SYSUTCDATETIME\(\)\)/i);
  assert.equal(report.summary.totalGuests, 180);
  assert.equal(report.upcomingItems.length, 1);
});

test('payment report filters by invoice issue date and cannot multiply billing rows by transactions', async () => {
  const request = new Recorder([[{ totalBilled: '2000.00', verifiedPayments: '750.00', outstandingBalance: '1250.00' }], [{ invoiceNumber: 'INV-1', amountDue: '2000.00', amountPaid: '750.00', outstandingBalance: '1250.00' }]]);
  const repository = createAdminReportRepository({ readRequest: async () => request as unknown as sql.Request });
  const report = await repository.payments({ dateFrom: '2026-10-01', dateTo: '2026-10-31', status: 'PARTIALLY_PAID', method: 'CASH' });
  const call = request.calls[0]!;
  assert.deepEqual(call.params, { dateFrom: '2026-10-01', dateTo: '2026-10-31', status: 'PARTIALLY_PAID', method: 'CASH' });
  assert.match(call.command, /i\.issued_at\s*>=\s*CONVERT\(date,@dateFrom\)/i);
  assert.match(call.command, /CONVERT\(date,i\.issued_at\)\s*<=\s*CONVERT\(date,@dateTo\)/i);
  assert.match(call.command, /OUTER\s+APPLY\s*\(\s*SELECT\s+TOP\s*\(1\)/i);
  assert.doesNotMatch(call.command, /JOIN\s+dbo\.PAYMENT_TRANSACTION\s+pt/i);
  assert.equal(report.summary.totalBilled, 2000);
  assert.equal(report.items[0]!.amountPaid, 750);
});

test('invoice report keeps cancelled payments in history and excludes them from active receivables', async () => {
  const request = new Recorder([[{ totalBilled: 1000, verifiedPayments: 400, outstandingBalance: 0 }], [
    { invoiceNumber: 'INV-1', amountDue: 1000, amountPaid: 400, outstandingBalance: 0, status: 'CANCELLED' },
  ]]);
  const repository = createAdminReportRepository({ readRequest: async () => request as unknown as sql.Request });
  const report = await repository.payments({ dateFrom: '2026-10-01', dateTo: '2026-10-31', status: 'CANCELLED', method: '' });

  assert.match(request.calls[0]!.command, /r\.status='CANCELLED'\s+OR\s+i\.status='CANCELLED'/i);
  assert.match(request.calls[0]!.command, /CASE\s+WHEN\s+.*?THEN 0\s+WHEN i\.total_amount>pay\.amount_paid/i);
  assert.deepEqual(report.summary, { totalBilled: 1000, verifiedPayments: 400, outstandingBalance: 0 });
  assert.equal(report.items[0]!.status, 'CANCELLED');
});

test('collections bind payment-date and method filters and preserve distinct installments', async () => {
  const request = new Recorder([[
    { id: 'T-41', invoiceNumber: 'INV-1', bookingReference: 'LC-1', customer: 'Ana', paymentDate: '2026-10-05', method: 'BANK_TRANSFER', amount: '400.25', source: 'transaction', totalCollected: '1000.75' },
    { id: 'T-47', invoiceNumber: 'INV-1', bookingReference: 'LC-1', customer: 'Ana', paymentDate: '2026-10-15', method: 'CASH', amount: '600.50', source: 'transaction', totalCollected: '1000.75' },
  ]]);
  const repository = createAdminReportRepository({ readRequest: async () => request as unknown as sql.Request });
  const filters = { dateFrom: '2026-10-01', dateTo: '2026-10-31', method: '' } as const;
  const report = await repository.collections(filters);
  const call = request.calls[0]!;

  assert.deepEqual(call.params, filters);
  assert.match(call.command, /FROM dbo\.PAYMENT_TRANSACTION pt/i);
  assert.match(call.command, /credit\.paymentDate\s*>=\s*CONVERT\(date,@dateFrom\)/i);
  assert.match(call.command, /CONVERT\(date,credit\.paymentDate\)\s*<=\s*CONVERT\(date,@dateTo\)/i);
  assert.match(call.command, /credit\.method=@method/i);
  assert.match(call.command, /NOT EXISTS\s*\(SELECT 1 FROM dbo\.PAYMENT_TRANSACTION\s+\w+\s+WHERE\s+\w+\.payment_id=pay\.payment_id\)/i);
  assert.deepEqual(report.summary, { totalCollected: 1000.75, paymentCount: 2 });
  assert.deepEqual(report.items.map(({ paymentDate, method, amount }) => [paymentDate, method, amount]), [
    ['2026-10-05', 'BANK_TRANSFER', 400.25], ['2026-10-15', 'CASH', 600.50],
  ]);
});
