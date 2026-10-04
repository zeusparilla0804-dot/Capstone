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

function installDatabase(t: test.TestContext, initialStatus: string) {
  let status = initialStatus;
  const queries: string[] = [];
  const events: string[] = [];
  const pool = { connected: true, close: async () => {} };
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => pool);
  t.mock.method(sql.Transaction.prototype, 'begin', async () => { events.push('begin'); });
  t.mock.method(sql.Transaction.prototype, 'commit', async () => { events.push('commit'); });
  t.mock.method(sql.Transaction.prototype, 'rollback', async () => { events.push('rollback'); });
  t.mock.method(sql.Request.prototype, 'query', async function (command: string) {
    queries.push(command);
    const values = Object.fromEntries(Object.entries(this.parameters).map(([key, value]) => [key, value.value]));
    const result = (recordset: Record<string, unknown>[] = [], rows = 1) => ({ recordset, rowsAffected: [rows] });
    if (/SELECT status,customer_id customerId FROM dbo\.RESERVATION/i.test(command)) return result([{ status, customerId: 7 }]);
    if (/SELECT payment_id,amount_due,amount_paid FROM dbo\.PAYMENT/i.test(command)) return result([{ payment_id: 3, amount_due: 100, amount_paid: 10 }]);
    if (/UPDATE dbo\.RESERVATION SET status=@nextStatus/i.test(command)) { status = String(values['nextStatus']); return result(); }
    if (/email outbox context.*customerEmail.*FROM dbo\.RESERVATION/is.test(command)) return result([{
      customerEmail: 'customer@example.test', customerName: 'Customer', bookingReference: 'BK-5', eventDate: '2026-12-01'
    }]);
    if (/INSERT dbo\.EMAIL_OUTBOX/i.test(command)) return result([{ id: '1' }]);
    if (/INSERT dbo\.(PAYMENT_TRANSACTION|BOOKING_STATUS_HISTORY|ADMIN_AUDIT_LOG)/i.test(command) ||
        /UPDATE dbo\.(PAYMENT|PAYMENT_PROOF)/i.test(command) || /UPDATE i SET status/i.test(command)) return result();
    throw new Error(`Unexpected manual payment SQL: ${command}`);
  });
  return { queries, events, status: () => status };
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

test('manual payment rejects terminal bookings before writing a credit', async t => {
  const db = installDatabase(t, 'CANCELLED');
  try {
    await assert.rejects(recordPayment(2, { reservationId: 5, amount: 90, method: 'CASH', paymentDate: '2026-10-02' }), /PAYMENT_BOOKING_STATUS/);
    assert.deepEqual(db.events, ['begin', 'rollback']);
    assert.equal(db.queries.some(query => /INSERT dbo\.PAYMENT_TRANSACTION/i.test(query)), false);
  } finally { await closeDatabase(); }
});
