import assert from 'node:assert/strict';
import test from 'node:test';
import sql from 'mssql';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const { recordPayment } = await import('./admin.repository.js');
const { closeDatabase } = await import('../config/database.js');

test('an additional verified bank transfer pays the balance without completing an unfinished event or duplicating retries', async t => {
  const db = installDatabase(t, 'PAYMENT_VERIFIED', { amountDue: 80000, amountPaid: 40000, paymentMethod: 'BANK_TRANSFER' });
  try {
    const input = { reservationId: 5, amount: 40000, method: 'BANK_TRANSFER' as const, reference: 'BANK-FINAL-42', paymentDate: '2026-11-08' };
    assert.equal(await recordPayment(2, input), true);
    assert.equal(db.amountPaid(), 80000);
    assert.equal(db.status(), 'PAYMENT_VERIFIED');
    assert.ok(db.queries.some(query => /UPDATE i SET status/i.test(query)));
    await recordPayment(2, input);
    assert.equal(db.credits.length, 1);
  } finally { await closeDatabase(); }
});

test('verified final bank payment and event completion commit together', async t => {
  const db = installDatabase(t, 'PAYMENT_VERIFIED', { amountDue: 80000, amountPaid: 40000, paymentMethod: 'BANK_TRANSFER', eventDate: '2026-01-01' });
  try {
    await recordPayment(2, { reservationId: 5, amount: 40000, method: 'BANK_TRANSFER', reference: 'BANK-EVENT-42', paymentDate: '2026-11-08' }, { completeEvent: true });
    assert.equal(db.amountPaid(), 80000);
    assert.equal(db.status(), 'COMPLETED');
    assert.equal(db.credits.length, 1);
  } finally { await closeDatabase(); }
});

test('event settlement records only the remaining balance and completes in the same transaction, even for a bank deposit followed by cash', async t => {
  const db = installDatabase(t, 'PAYMENT_VERIFIED', { amountDue: 80000, amountPaid: 40000, paymentMethod: 'BANK_TRANSFER', eventDate: '2026-01-01' });
  try {
    const input = { reservationId: 5, amount: 40000, method: 'CASH' as const, reference: 'CASH-FINAL-1', paymentDate: '2026-11-08' };
    assert.equal(await recordPayment(2, input, { completeEvent: true }), true);
    assert.equal(db.amountPaid(), 80000); assert.equal(db.status(), 'COMPLETED'); assert.equal(db.credits.length, 1);
    assert.ok(db.queries.some(query => /UPDATE i SET status/i.test(query)));
    assert.deepEqual(db.events, ['begin', 'commit']);
    await recordPayment(2, input, { completeEvent: true });
    assert.equal(db.credits.length, 1, 'a retry must not create another payment');
  } finally { await closeDatabase(); }
});

test('completion of an already fully paid event creates no payment transaction', async t => {
  const db = installDatabase(t, 'CONFIRMED', { amountPaid: 100, eventDate: '2026-01-01' });
  try {
    await recordPayment(2, { reservationId: 5, amount: 0, method: 'CASH', paymentDate: '2026-11-08' }, { completeEvent: true });
    assert.equal(db.status(), 'COMPLETED'); assert.equal(db.amountPaid(), 100); assert.equal(db.credits.length, 0);
  } finally { await closeDatabase(); }
});

test('event settlement rejects a stale or partial amount instead of completing an unpaid event', async t => {
  const db = installDatabase(t, 'CONFIRMED', { amountPaid: 50, eventDate: '2026-01-01' });
  try {
    await assert.rejects(recordPayment(2, { reservationId: 5, amount: 40, method: 'CASH', paymentDate: '2026-11-08' }, { completeEvent: true }), /FINAL_BALANCE_CHANGED/);
    assert.equal(db.status(), 'CONFIRMED'); assert.equal(db.credits.length, 0);
  } finally { await closeDatabase(); }
});

test('a future event cannot be completed or credited through the completion command', async t => {
  const db = installDatabase(t, 'CONFIRMED', { amountPaid: 50, eventDate: '2099-12-01' });
  try {
    await assert.rejects(recordPayment(2, { reservationId: 5, amount: 50, method: 'CASH', paymentDate: '2026-11-08' }, { completeEvent: true }), /EVENT_NOT_FINISHED/);
    assert.equal(db.status(), 'CONFIRMED'); assert.equal(db.amountPaid(), 50); assert.equal(db.credits.length, 0);
  } finally { await closeDatabase(); }
});

test('a completion failure rolls back the final payment and intermediate confirmation', async t => {
  const db = installDatabase(t, 'PAYMENT_VERIFIED', { amountPaid: 50, eventDate: '2026-01-01', failCompletion: true });
  try {
    await assert.rejects(recordPayment(2, { reservationId: 5, amount: 50, method: 'CASH', paymentDate: '2026-11-08' }, { completeEvent: true }), /completion failed/);
    assert.equal(db.status(), 'PAYMENT_VERIFIED'); assert.equal(db.amountPaid(), 50); assert.equal(db.credits.length, 0);
    assert.deepEqual(db.events, ['begin', 'rollback']);
  } finally { await closeDatabase(); }
});

function installDatabase(
  t: test.TestContext,
  initialStatus: string,
  amounts: { amountDue?: number; amountPaid?: number; paymentMethod?: string; eventDate?: string; failCompletion?: boolean; policy?: Record<string, unknown>; pendingProofs?: number; previous?: { payment_id: number; amount: number; payment_date: string; actual_payment_at?: Date } } = {},
) {
  let status = initialStatus;
  const amountDue = amounts.amountDue ?? 100;
  let amountPaid = amounts.amountPaid ?? 10;
  const credits: Record<string, unknown>[] = [];
  const queries: string[] = [];
  const events: string[] = [];
  const pool = { connected: true, close: async () => {} };
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => pool);
  t.mock.method(sql.Transaction.prototype, 'begin', async () => { events.push('begin'); });
  t.mock.method(sql.Transaction.prototype, 'commit', async () => { events.push('commit'); });
  t.mock.method(sql.Transaction.prototype, 'rollback', async () => { events.push('rollback'); status = initialStatus; amountPaid = amounts.amountPaid ?? 10; credits.length = 0; });
  t.mock.method(sql.Request.prototype, 'query', async function (command: string) {
    queries.push(command);
    const values = Object.fromEntries(Object.entries(this.parameters).map(([key, value]) => [key, value.value]));
    const result = (recordset: Record<string, unknown>[] = [], rows = 1) => ({ recordset, rowsAffected: [rows] });
    if (/FROM dbo\.BOOKING_POLICY\b/i.test(command)) return result(amounts.policy ? [amounts.policy] : []);
    if (/UPDATE dbo\.BOOKING_POLICY/i.test(command)) {
      for (const field of ['Stage', 'HoldStatus', 'ReviewRequired', 'ReviewReason', 'UpdatedAt']) {
        if (`policy${field}` in values) amounts.policy![field[0]!.toLowerCase() + field.slice(1)] = values[`policy${field}`];
      }
      return result();
    }
    if (/SELECT COUNT\(\*\) pendingCount/i.test(command)) return result([{ pendingCount: amounts.pendingProofs ?? 0 }]);
    if (/COUNT_BIG\(\*\) AS activeBookingCount/i.test(command)) return result([{ activeBookingCount: 0, largestGuestCount: 0, hasMediumEvent: 0 }]);
    if (/SELECT status,customer_id customerId[\s\S]*FROM dbo\.RESERVATION/i.test(command)) return result([{
      status, customerId: 7, eventDate: amounts.eventDate ?? '2026-12-01', guestCount: 100
    }]);
    if (/SELECT payment_id,amount_due,amount_paid,payment_method FROM dbo\.PAYMENT/i.test(command)) return result([{
      payment_id: 3, amount_due: amountDue, amount_paid: amountPaid, payment_method: amounts.paymentMethod ?? 'CASH'
    }]);
    if (/SELECT payment_id paymentId,amount_due amountDue,amount_paid amountPaid/i.test(command)) return result([{
      paymentId: 3, amountDue, amountPaid, paymentMethod: amounts.paymentMethod ?? 'CASH'
    }]);
    if (/FROM dbo\.PAYMENT_TRANSACTION WITH\(UPDLOCK,HOLDLOCK\)/i.test(command)) {
      assert.match(command, /WHERE payment_method=@method AND transaction_ref=@reference/);
      return result(amounts.previous ? [amounts.previous] : credits.filter(credit => credit.method === values['method'] && credit.reference === values['reference']));
    }
    if (/INSERT dbo\.PAYMENT_TRANSACTION/i.test(command)) {
      credits.push({ payment_id: values['paymentId'], amount: values['amount'], payment_date: (values['date'] as Date).toISOString().slice(0, 10), actual_payment_at: values['date'], method: values['method'], reference: values['reference'] });
      return result();
    }
    if (/UPDATE dbo\.PAYMENT SET amount_paid/i.test(command)) { amountPaid = (Math.round(amountPaid * 100) + Math.round(Number(values['amount']) * 100)) / 100; return result(); }
    if (/UPDATE dbo\.RESERVATION SET status=@nextStatus/i.test(command)) { if (amounts.failCompletion && values['nextStatus'] === 'COMPLETED') throw new Error('completion failed'); status = String(values['nextStatus']); return result(); }
    if (/UPDATE dbo\.RESERVATION SET status='EXPIRED'/i.test(command)) { status = 'EXPIRED'; return result(); }
    if (/email outbox context.*customerEmail.*FROM dbo\.RESERVATION/is.test(command)) return result([{
      customerEmail: 'customer@example.test', customerName: 'Customer', bookingReference: 'BK-5', eventDate: '2026-12-01'
    }]);
    if (/INSERT dbo\.EMAIL_OUTBOX/i.test(command)) return result([{ id: '1' }]);
    if (/INSERT dbo\.(PAYMENT_TRANSACTION|BOOKING_STATUS_HISTORY|ADMIN_AUDIT_LOG)/i.test(command) ||
        /UPDATE dbo\.(PAYMENT|PAYMENT_PROOF)/i.test(command) || /UPDATE i SET status/i.test(command)) return result();
    throw new Error(`Unexpected manual payment SQL: ${command}`);
  });
  return { queries, events, credits, amountPaid: () => amountPaid, status: () => status };
}

test('manual payment locks booking before balance and advances awaiting payment atomically', async t => {
  const db = installDatabase(t, 'AWAITING_PAYMENT');
  try {
    assert.equal(await recordPayment(2, { reservationId: 5, amount: 90, method: 'CASH', paymentDate: '2026-10-02' }), true);
    assert.deepEqual(db.events, ['begin', 'commit']);
    assert.equal(db.status(), 'PAYMENT_VERIFIED');
    const bookingLock = db.queries.findIndex(query => /FROM dbo\.RESERVATION.*UPDLOCK,HOLDLOCK/is.test(query));
    const paymentLock = db.queries.findIndex(query => /FROM dbo\.PAYMENT.*UPDLOCK,HOLDLOCK/is.test(query));
    assert.ok(bookingLock >= 0 && paymentLock > bookingLock, 'lock order must be reservation then payment');
    assert.ok(db.queries.some(query => /INSERT dbo\.BOOKING_STATUS_HISTORY/i.test(query)));
    assert.ok(db.queries.some(query => /INSERT dbo\.EMAIL_OUTBOX/i.test(query)));
  } finally { await closeDatabase(); }
});

test('manual payment below half of the reservation total remains awaiting payment', async t => {
  const db = installDatabase(t, 'AWAITING_PAYMENT');
  try {
    assert.equal(await recordPayment(2, {
      reservationId: 5, amount: 39.99, method: 'CASH', paymentDate: '2026-10-02'
    }), true);
    assert.equal(db.status(), 'AWAITING_PAYMENT');
    assert.equal(db.queries.some(query => /UPDATE dbo\.RESERVATION SET status=@nextStatus/i.test(query)), false);
  } finally { await closeDatabase(); }
});

test('manual payment below half supersedes a submitted proof and returns the reservation to awaiting payment', async t => {
  const db = installDatabase(t, 'PAYMENT_SUBMITTED');
  try {
    assert.equal(await recordPayment(2, {
      reservationId: 5, amount: 39.99, method: 'CASH', paymentDate: '2026-10-02'
    }), true);
    assert.equal(db.status(), 'AWAITING_PAYMENT');
    assert.ok(db.queries.some(query => /UPDATE dbo\.PAYMENT_PROOF SET status='SUPERSEDED'/i.test(query)));
  } finally { await closeDatabase(); }
});

test('manual payment uses cumulative paid amount and advances at the exact half-deposit threshold', async t => {
  const db = installDatabase(t, 'AWAITING_PAYMENT', { amountPaid: 30, paymentMethod: 'BANK_TRANSFER' });
  try {
    assert.equal(await recordPayment(2, {
      reservationId: 5, amount: 20, method: 'BANK_TRANSFER', reference: 'BANK-1', paymentDate: '2026-10-02'
    }), true);
    assert.equal(db.status(), 'PAYMENT_VERIFIED');
  } finally { await closeDatabase(); }
});

for (const status of ['PAYMENT_VERIFIED', 'CONFIRMED', 'COMPLETED']) {
  test(`manual payment does not regress an already ${status.toLowerCase()} reservation`, async t => {
    const db = installDatabase(t, status, { amountPaid: 60 });
    try {
      assert.equal(await recordPayment(2, {
        reservationId: 5, amount: 10, method: 'CASH', paymentDate: '2026-10-02'
      }), true);
      assert.equal(db.status(), status);
      assert.equal(db.queries.some(query => /UPDATE dbo\.RESERVATION SET status=@nextStatus/i.test(query)), false);
    } finally { await closeDatabase(); }
  });

  test(`manual balance settlement supersedes a pending supplementary proof on ${status} without regressing lifecycle`, async t => {
    const db = installDatabase(t, status, { amountPaid: 50 });
    try {
      await recordPayment(2, { reservationId: 5, amount: 50, method: 'CASH', reference: 'BALANCE-CASH-1', paymentDate: '2026-10-02' });
      const supersede = db.queries.findIndex(query => /UPDATE dbo\.PAYMENT_PROOF SET status='SUPERSEDED'/i.test(query));
      assert.ok(supersede >= 0, 'manual settlement must retire any submitted balance receipt');
      assert.match(db.queries[supersede]!, /WHERE reservation_id=@reservationId AND status='SUBMITTED'/);
      assert.ok(supersede < db.queries.findIndex(query => /INSERT dbo\.PAYMENT_TRANSACTION/i.test(query)));
      assert.equal(db.status(), status);
      assert.equal(db.queries.some(query => /UPDATE dbo\.RESERVATION SET status=@nextStatus/i.test(query)), false);
    } finally { await closeDatabase(); }
  });
}

test('manual payment rejects terminal bookings before writing a credit', async t => {
  const db = installDatabase(t, 'CANCELLED');
  try {
    await assert.rejects(recordPayment(2, { reservationId: 5, amount: 90, method: 'CASH', paymentDate: '2026-10-02' }), /PAYMENT_BOOKING_STATUS/);
    assert.deepEqual(db.events, ['begin', 'rollback']);
    assert.equal(db.queries.some(query => /INSERT dbo\.PAYMENT_TRANSACTION/i.test(query)), false);
  } finally { await closeDatabase(); }
});

test('manual payment accepts exact final settlement using integer cents', async t => {
  const db = installDatabase(t, 'PAYMENT_VERIFIED', { amountDue: 20000.30, amountPaid: 10000.10 });
  try {
    assert.equal(await recordPayment(2, { reservationId: 5, amount: 10000.20, method: 'CASH', reference: 'CASH-FINAL', paymentDate: '2026-10-02' }), true);
    assert.equal(db.status(), 'PAYMENT_VERIFIED');
  } finally { await closeDatabase(); }
});

test('exact committed payment retry succeeds without repeating any side effects even when now fully paid', async t => {
  const db = installDatabase(t, 'COMPLETED', { amountPaid: 100, previous: { payment_id: 3, amount: 25, payment_date: '2026-10-02' } });
  try {
    assert.equal(await recordPayment(2, { reservationId: 5, amount: 25, method: 'BANK_TRANSFER', reference: 'BANK-RETRY', paymentDate: '2026-10-02' }), true);
    assert.equal(db.queries.some(query => /\b(INSERT|UPDATE)\b/i.test(query)), false);
    assert.deepEqual(db.events, ['begin', 'commit']);
    assert.equal(db.status(), 'COMPLETED');
  } finally { await closeDatabase(); }
});

for (const method of ['CASH', 'BANK_TRANSFER', 'E-WALLET'] as const) {
  test(`lost-response ${method} retry records one credit and one set of side effects`, async t => {
    const db = installDatabase(t, 'AWAITING_PAYMENT', { paymentMethod: method });
    const input = { reservationId: 5, amount: 90, method, reference: 'RETRY-1', paymentDate: '2026-10-02' };
    try {
      await recordPayment(2, input);
      const mutations = db.queries.filter(query => /\b(INSERT|UPDATE)\b/i.test(query)).length;
      await recordPayment(3, input);
      assert.equal(db.credits.length, 1); assert.equal(db.amountPaid(), 100);
      assert.equal(db.queries.filter(query => /\b(INSERT|UPDATE)\b/i.test(query)).length, mutations);
      assert.equal(db.status(), 'PAYMENT_VERIFIED');
      assert.deepEqual(db.events, ['begin', 'commit', 'begin', 'commit']);
    } finally { await closeDatabase(); }
  });
}

for (const previous of [
  { payment_id: 8, amount: 25, payment_date: '2026-10-02' },
  { payment_id: 3, amount: 26, payment_date: '2026-10-02' },
  { payment_id: 3, amount: 25, payment_date: '2026-10-03' },
]) {
  test(`conflicting payment reference reuse rejects before side effects: ${JSON.stringify(previous)}`, async t => {
    const db = installDatabase(t, 'AWAITING_PAYMENT', { previous });
    try {
      await assert.rejects(recordPayment(2, { reservationId: 5, amount: 25, method: 'BANK_TRANSFER', reference: 'BANK-RETRY', paymentDate: '2026-10-02' }), /PAYMENT_REFERENCE_CONFLICT/);
      assert.equal(db.queries.some(query => /\b(INSERT|UPDATE)\b/i.test(query)), false);
      assert.deepEqual(db.events, ['begin', 'rollback']);
    } finally { await closeDatabase(); }
  });
}
