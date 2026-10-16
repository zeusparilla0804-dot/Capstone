import assert from 'node:assert/strict';
import test from 'node:test';
import sql from 'mssql';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const [{ customEventService }, { closeDatabase }] = await Promise.all([
  import('./custom-event.service.js'),
  import('../config/database.js'),
]);

interface Scenario {
  customerId?: number;
  requestStatus?: string;
  quoteStatus?: string;
  validUntil?: string;
  currentQuoteId?: number;
}

function mockAcceptance(t: Parameters<typeof test>[1] extends (...args: infer A) => unknown ? A[0] : never, scenario: Scenario = {}) {
  let active = false;
  let committed = false;
  const statements: string[] = [];
  const pool = { connected: true, close: async () => {} };
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => pool);
  t.mock.method(sql.Transaction.prototype, 'begin', async function () { active = true; return this; });
  t.mock.method(sql.Transaction.prototype, 'commit', async () => { committed = true; active = false; });
  t.mock.method(sql.Transaction.prototype, 'rollback', async () => { active = false; });
  t.mock.method(sql.Request.prototype, 'query', async function (command: string) {
    assert.ok(active);
    statements.push(command);
    const result = (recordset: unknown[] = [], affected = 1) => ({ recordset, rowsAffected: [affected] });
    if (/custom quote acceptance lock/.test(command)) {
      if (scenario.customerId === 99) return result([]);
      return result([{ request_status: scenario.requestStatus ?? 'QUOTE_SENT', reservation_id: 31,
        reservation_status: 'PENDING', accepted_quote_id: null, event_date: '2098-10-20', guest_count: 120,
        quote_id: 9, quote_status: scenario.quoteStatus ?? 'SENT', version: 2, subtotal: 2600,
        discount_amount: 0, total_amount: 2600, required_down_payment: 780,
        valid_until: scenario.validUntil ?? '2098-12-31', sent_by: 3 }]);
    }
    if (/current sent quote/.test(command)) return result([{ quote_id: scenario.currentQuoteId ?? 9 }]);
    if (/FROM dbo\.CUSTOM_QUOTE_ITEM/.test(command)) return result([
      { description: 'Buffet service', quantity: 100, unit_price: 25, line_total: 2500 },
      { description: 'Coffee station', quantity: 2, unit_price: 50, line_total: 100 },
    ]);
    if (/COUNT_BIG\s*\(\s*\*\s*\).*FROM dbo\.RESERVATION/is.test(command)) return result([{ activeBookingCount: 0, largestGuestCount: 0, hasMediumEvent: 0 }]);
    if (/INSERT dbo\.PAYMENT\(/.test(command)) return result([{ payment_id: 51 }]);
    if (/INSERT dbo\.INVOICE\(/.test(command)) return result([{ invoice_id: 61 }]);
    if (/email outbox context/.test(command)) return result([{ customerEmail: 'customer@example.test', customerName: 'Customer', bookingReference: 'CQ-2026-ABCDEF12', eventDate: '2098-10-20', invoiceNumber: 'INV-2098-000001' }]);
    if (/INSERT dbo\.EMAIL_OUTBOX/.test(command)) return result([{ id: '93' }]);
    return result();
  });
  return { statements, committed: () => committed };
}

test('accepts the current quote once and creates exact invoice lines plus one payment atomically', async t => {
  const state = mockAcceptance(t as never);
  try {
    const result = await customEventService.accept(7, 12, 9);
    assert.deepEqual(result, { requestId: 12, reservationId: 31, quoteId: 9, invoiceId: 61, paymentId: 51, status: 'ACCEPTED' });
    assert.equal(state.committed(), true);
    assert.equal(state.statements.filter(statement => /INSERT dbo\.PAYMENT\(/.test(statement)).length, 1);
    assert.equal(state.statements.filter(statement => /INSERT dbo\.INVOICE_ITEM/.test(statement)).length, 2);
    assert.ok(state.statements.some(statement => /accepted_quote_id=@quoteId/.test(statement)));
    assert.ok(state.statements.some(statement => /status='AWAITING_PAYMENT'/.test(statement)));
    assert.equal(state.statements.some(statement => /INSERT dbo\.RESERVATION_ADD_ON/.test(statement)), false);
  } finally { await closeDatabase(); }
});

test('rejects another owner stale current version expired and already accepted quotes before financial writes', async t => {
  for (const scenario of [
    { customerId: 99 },
    { currentQuoteId: 10 },
    { validUntil: '2020-01-01' },
    { requestStatus: 'ACCEPTED', quoteStatus: 'ACCEPTED' },
  ]) {
    const state = mockAcceptance(t as never, scenario);
    await assert.rejects(customEventService.accept(scenario.customerId ?? 7, 12, 9), error =>
      typeof error === 'object' && error !== null && 'statusCode' in error && [404, 409].includes(Number(error.statusCode)));
    assert.equal(state.statements.some(statement => /INSERT dbo\.(?:PAYMENT|INVOICE)\(/.test(statement)), false);
    await closeDatabase();
  }
});

test('declining the current quote cancels its capacity slot without financial records', async t => {
  const state = mockAcceptance(t as never);
  try {
    await customEventService.decline(7, 12, 9, 'Plans changed');
    assert.equal(state.committed(), true);
    assert.ok(state.statements.some(statement => /status='DECLINED'/.test(statement)));
    assert.ok(state.statements.some(statement => /status='CANCELLED'/.test(statement)));
    assert.equal(state.statements.some(statement => /INSERT dbo\.(?:PAYMENT|INVOICE)\(/.test(statement)), false);
  } finally { await closeDatabase(); }
});
