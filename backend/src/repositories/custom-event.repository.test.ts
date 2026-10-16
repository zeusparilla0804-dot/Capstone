import assert from 'node:assert/strict';
import test from 'node:test';
import sql from 'mssql';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const [{ submitCustomEventRequest, findOwnedCustomEventRequest, createAndSendCustomQuote }, { closeDatabase }] = await Promise.all([
  import('./custom-event.repository.js'),
  import('../config/database.js'),
]);

const input = {
  eventType: 'Wedding', eventDate: '2098-10-20', eventTime: '18:00', venue: 'Panorama Ville',
  guestCount: 120, sourcePackageId: 4, targetBudget: 150_000, menuPreferences: 'Filipino buffet',
  dietaryNotes: undefined, setupPreferences: undefined, requestedServices: ['Coffee bar'], specialRequest: undefined,
};

test('submits a capacity-consuming custom request atomically without payment or invoice writes', async t => {
  let active = false;
  const statements: string[] = [];
  const pool = { connected: true, close: async () => {} };
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => pool);
  t.mock.method(sql.Transaction.prototype, 'begin', async function () { active = true; return this; });
  t.mock.method(sql.Transaction.prototype, 'commit', async () => { active = false; });
  t.mock.method(sql.Transaction.prototype, 'rollback', async () => { active = false; });
  t.mock.method(sql.Request.prototype, 'query', async function (command: string) {
    assert.ok(active);
    statements.push(command);
    const result = (recordset: unknown[] = []) => ({ recordset, rowsAffected: [1] });
    if (/FROM dbo\.PACKAGE/.test(command)) return result([{ package_id: 4 }]);
    if (/COUNT_BIG\s*\(\s*\*\s*\).*FROM dbo\.RESERVATION/is.test(command)) return result([{ activeBookingCount: 0, largestGuestCount: 0, hasMediumEvent: 0 }]);
    if (/SELECT event_id/.test(command)) return result([{ event_id: 2 }]);
    if (/INSERT dbo\.RESERVATION/.test(command)) return result([{ reservation_id: 31 }]);
    if (/INSERT dbo\.CUSTOM_EVENT_REQUEST/.test(command)) return result([{ request_id: 12 }]);
    if (/email outbox context/.test(command)) return result([{ customerEmail: 'customer@example.test', customerName: 'Customer', bookingReference: 'CQ-2026-ABCDEF12', eventDate: '2098-10-20' }]);
    if (/SELECT email FROM dbo\.ADMIN/.test(command)) return result([{ email: 'admin@example.test' }]);
    if (/INSERT dbo\.EMAIL_OUTBOX/.test(command)) return result([{ id: '91' }]);
    throw new Error(`Unexpected query: ${command}`);
  });

  try {
    const result = await submitCustomEventRequest(7, input);
    assert.deepEqual(result, { id: 12, reservationId: 31, reference: result.reference, status: 'AWAITING_QUOTE' });
    assert.match(result.reference, /^CQ-\d{4}-[A-F0-9]{8}$/);
    assert.ok(statements.some(statement => /FROM dbo\.PACKAGE[\s\S]*is_active\s*=\s*1/i.test(statement)));
    assert.equal(statements.some(statement => /FROM dbo\.PACKAGE[\s\S]*\bstatus\s*=\s*1/i.test(statement)), false);
    assert.ok(statements.some(statement => /UPDLOCK,HOLDLOCK/.test(statement)));
    assert.equal(statements.some(statement => /INSERT dbo\.(?:PAYMENT|INVOICE)\b/.test(statement)), false);
  } finally { await closeDatabase(); }
});

test('rolls back reservation and request when capacity or a later write fails', async t => {
  let rolledBack = false;
  const pool = { connected: true, close: async () => {} };
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => pool);
  t.mock.method(sql.Transaction.prototype, 'begin', async function () { return this; });
  t.mock.method(sql.Transaction.prototype, 'commit', async () => { throw new Error('commit must not run'); });
  t.mock.method(sql.Transaction.prototype, 'rollback', async () => { rolledBack = true; });
  t.mock.method(sql.Request.prototype, 'query', async function (command: string) {
    if (/FROM dbo\.PACKAGE/.test(command)) return { recordset: [{ package_id: 4 }], rowsAffected: [1] };
    if (/COUNT_BIG\s*\(\s*\*\s*\).*FROM dbo\.RESERVATION/is.test(command)) return { recordset: [{ activeBookingCount: 6, largestGuestCount: 80, hasMediumEvent: 0 }], rowsAffected: [1] };
    throw new Error(`Unexpected query: ${command}`);
  });
  try {
    await assert.rejects(submitCustomEventRequest(7, input), (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 'BOOKING_DATE_FULL');
    assert.equal(rolledBack, true);
  } finally { await closeDatabase(); }
});

test('owner detail query does not reveal another customer request', async t => {
  const pool = { connected: true, close: async () => {} };
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => pool);
  t.mock.method(sql.Request.prototype, 'query', async function (command: string) {
    assert.match(command, /r\.customer_id\s*=\s*@customerId/i);
    return { recordset: [], rowsAffected: [0] };
  });
  try { assert.equal(await findOwnedCustomEventRequest(99, 12), undefined); }
  finally { await closeDatabase(); }
});

test('sending a replacement quote supersedes the current version and commits audit plus notification', async t => {
  let active = false;
  let committed = false;
  const statements: string[] = [];
  const pool = { connected: true, close: async () => {} };
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => pool);
  t.mock.method(sql.Transaction.prototype, 'begin', async function () { active = true; return this; });
  t.mock.method(sql.Transaction.prototype, 'commit', async () => { committed = true; active = false; });
  t.mock.method(sql.Transaction.prototype, 'rollback', async () => { active = false; });
  let itemId = 100;
  t.mock.method(sql.Request.prototype, 'query', async function (command: string) {
    assert.ok(active);
    statements.push(command);
    const result = (recordset: unknown[] = []) => ({ recordset, rowsAffected: [1] });
    if (/COALESCE\(MAX\(cq\.version\)/.test(command)) return result([{ status: 'QUOTE_SENT', reservation_id: 31, current_version: 1 }]);
    if (/SELECT quote_id,status/.test(command)) return result([{ quote_id: 8, status: 'SENT' }]);
    if (/INSERT dbo\.CUSTOM_QUOTE\(/.test(command)) return result([{ quote_id: 9, created_at: new Date('2026-10-12T00:00:00Z'), sent_at: new Date('2026-10-12T00:00:00Z') }]);
    if (/INSERT dbo\.CUSTOM_QUOTE_ITEM/.test(command)) return result([{ quote_item_id: itemId++ }]);
    if (/email outbox context/.test(command)) return result([{ customerEmail: 'customer@example.test', customerName: 'Customer', bookingReference: 'CQ-2026-ABCDEF12', eventDate: '2098-10-20' }]);
    if (/INSERT dbo\.EMAIL_OUTBOX/.test(command)) return result([{ id: '92' }]);
    return result();
  });
  try {
    const result = await createAndSendCustomQuote(3, 12, {
      items: [
        { description: 'Buffet service', quantity: 100, unitPrice: 25, lineTotal: 2500 },
        { description: 'Coffee station', quantity: 2, unitPrice: 50, lineTotal: 100 },
      ],
      subtotal: 2600, total: 2600, requiredDownPayment: 780,
      validUntil: '2098-12-31', terms: null,
    });
    assert.equal(result.version, 2);
    assert.equal(result.items.length, 2);
    assert.equal(committed, true);
    assert.ok(statements.some(statement => /status='SUPERSEDED'/.test(statement)));
    assert.ok(statements.some(statement => /INSERT dbo\.ADMIN_AUDIT_LOG/.test(statement)));
    assert.ok(statements.some(statement => /INSERT dbo\.EMAIL_OUTBOX/.test(statement)));
  } finally { await closeDatabase(); }
});
