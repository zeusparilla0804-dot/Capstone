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
  async query(command: string) { this.calls.push({ command, params: { ...this.params } }); return { recordsets: this.recordsets }; }
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
