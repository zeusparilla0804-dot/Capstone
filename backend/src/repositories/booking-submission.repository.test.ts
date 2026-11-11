import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import sql from 'mssql';
import type { CreateBookingDto } from '../types/domain.types.js';
import { AppError } from '../utils/app-error.js';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';
const { createBooking } = await import('./booking.repository.js');
const { closeDatabase } = await import('../config/database.js');

const input = {
  eventType: 'Wedding', eventDate: '2098-06-15', eventTime: '12:30', venue: 'Panorama Ville',
  guestCount: 100, packageId: 3, addOnIds: [4, 7], paymentMethod: 'bank-transfer',
  submissionKey: 'd845e41f-9d9f-4a79-b77e-e840e66154cd',
} satisfies CreateBookingDto & { submissionKey: string };

type Submission = { customerId: number; submissionKey: string; requestHash: string; responseJson: string; reservationId: number };
type State = { submissions: Submission[]; reservations: number[]; payments: number[]; policies: Record<string, unknown>[]; outbox: number[]; committed: boolean; release?: () => void };

function mockDatabase(t: TestContext) {
  const committed = { submissions: [] as Submission[], reservations: [] as number[], payments: [] as number[], policies: [] as Record<string, unknown>[], outbox: [] as number[] };
  const transactions = new WeakMap<sql.Transaction, State>();
  const pendingLocks = new Map<string, Promise<void>>();
  const queries: { sql: string; parameters: Record<string, unknown> }[] = [];
  let nextId = 1;
  const faults = { catalogUnavailable: false, capacityFull: false, outbox: false, acknowledgement: false, rollback: false };
  const pool = { connected: true, close: async () => {} };
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => pool);
  t.mock.method(sql.Transaction.prototype, 'begin', async function () {
    transactions.set(this, { submissions: [], reservations: [], payments: [], policies: [], outbox: [], committed: false });
  });
  t.mock.method(sql.Transaction.prototype, 'commit', async function () {
    const state = transactions.get(this)!;
    for (const name of ['submissions', 'reservations', 'payments', 'policies', 'outbox'] as const) (committed[name] as unknown[]).push(...state[name]);
    state.committed = true; state.release?.();
    if (faults.acknowledgement) { faults.acknowledgement = false; throw new Error('commit acknowledgement lost'); }
  });
  t.mock.method(sql.Transaction.prototype, 'rollback', async function () {
    const state = transactions.get(this)!; state.release?.();
    if (faults.rollback) throw new Error('rollback connection closed');
  });
  t.mock.method(sql.Request.prototype, 'query', async function (command: string) {
    const parameters = Object.fromEntries(Object.entries(this.parameters).map(([name, parameter]) => [name, parameter.value]));
    queries.push({ sql: command, parameters });
    const state = transactions.get((this as unknown as { parent: sql.Transaction }).parent);
    assert.ok(state, 'all creation/replay queries must use the creation transaction');
    const result = (recordset: unknown[] = []) => ({ recordset, rowsAffected: [1] });
    if (/UPDATE dbo\.BOOKING_POLICY/.test(command)) { state.policies.push(parameters); return result(); }
    if (/FROM dbo\.BOOKING_SUBMISSION/i.test(command)) {
      assert.match(command, /WITH\(UPDLOCK,HOLDLOCK\)/);
      assert.match(command, /customer_id=@customerId AND submission_key=@submissionKey/);
      const key = `${parameters['customerId']}:${parameters['submissionKey']}`;
      const preceding = pendingLocks.get(key) ?? Promise.resolve();
      let release!: () => void;
      pendingLocks.set(key, new Promise<void>(resolve => { release = resolve; }));
      await preceding; state.release = release;
      return result(committed.submissions.filter(row => row.customerId === parameters['customerId'] && row.submissionKey === parameters['submissionKey'])
        .map(row => ({ requestHash: row.requestHash, responseJson: row.responseJson, reservationId: row.reservationId })));
    }
    if (/INSERT dbo\.BOOKING_SUBMISSION/i.test(command)) {
      state.submissions.push(parameters as unknown as Submission); return result();
    }
    if (/FROM dbo\.PACKAGE p/.test(command)) return result(faults.catalogUnavailable ? [] : [{
      package_id: 3, package_name: 'Standard', description: '', pricing_type: 'PER_HEAD', price_per_head: 480,
      event_type: 'Standard', min_guest: null, max_guest: null,
    }]);
    if (/COUNT_BIG/.test(command)) return result([{ activeBookingCount: faults.capacityFull ? 3 : 0, largestGuestCount: faults.capacityFull ? 500 : 0, hasMediumEvent: 0 }]);
    if (/FROM dbo\.ADD_ON/.test(command)) return result([
      { add_on_id: 4, add_on_name: 'Tiffany Chair', description: '', price: 100 },
      { add_on_id: 7, add_on_name: 'Lechon (35-40 kg Live Weight)', description: '', price: 14000 },
    ]);
    if (/SELECT event_id/.test(command)) return result([{ event_id: 1 }]);
    if (/INSERT dbo\.RESERVATION_ADD_ON/.test(command)) return result();
    if (/INSERT dbo\.RESERVATION\(/.test(command)) {
      const id = nextId++; state.reservations.push(id); return result([{ reservation_id: id, created_at: new Date('2026-11-01T00:00:00Z') }]);
    }
    if (/INSERT dbo\.PAYMENT/.test(command)) { state.payments.push(Number(parameters['reservationId'])); return result(); }
    if (/email outbox context/i.test(command)) return result([{ customerEmail: 'customer@example.test', customerName: 'Customer', bookingReference: 'BK-1', eventDate: input.eventDate }]);
    if (/INSERT dbo\.EMAIL_OUTBOX/.test(command)) {
      if (faults.outbox) throw new Error('outbox failed');
      state.outbox.push(1); return result([{ id: '1' }]);
    }
    throw new Error(`Unexpected mocked query: ${command}`);
  });
  return { committed, queries, faults };
}

test('booking replay returns the exact original response before changed catalog or capacity are consulted', async t => {
  const db = mockDatabase(t);
  try {
    const original = await createBooking(7, input);
    assert.equal(db.committed.submissions.length, 1);
    db.faults.catalogUnavailable = true; db.faults.capacityFull = true;
    const queryCount = db.queries.length;
    const replay = await createBooking(7, { ...input, addOnIds: [7, 4], addOnQuantities: { '4': 1, '7': 1 } });
    assert.deepEqual(replay, JSON.parse(JSON.stringify(original)));
    assert.equal(db.queries.length, queryCount + 1);
    assert.deepEqual(db.committed.reservations, [original.id]);
    assert.equal(db.committed.payments.length, 1); assert.equal(db.committed.outbox.length, 1);
    assert.match(db.queries[0]!.sql, /BOOKING_SUBMISSION/);
    assert.equal(db.committed.submissions[0]!.requestHash.length, 64);
  } finally { await closeDatabase(); }
});

test('a lost commit acknowledgement can be retried without another booking, payment, or notification', async t => {
  const db = mockDatabase(t); db.faults.acknowledgement = true; db.faults.rollback = true;
  try {
    await assert.rejects(createBooking(7, input), /commit acknowledgement lost/);
    const replay = await createBooking(7, input);
    assert.equal(replay.id, db.committed.reservations[0]);
    assert.equal(db.committed.reservations.length, 1); assert.equal(db.committed.payments.length, 1); assert.equal(db.committed.outbox.length, 1);
  } finally { await closeDatabase(); }
});

test('reusing an owner-scoped key for changed details is a controlled conflict without writes', async t => {
  const db = mockDatabase(t);
  try {
    await createBooking(7, input);
    await assert.rejects(createBooking(7, { ...input, guestCount: 101 }), (error: unknown) => error instanceof AppError && error.statusCode === 409 && error.code === 'BOOKING_SUBMISSION_CONFLICT');
    assert.equal(db.committed.reservations.length, 1); assert.equal(db.committed.outbox.length, 1);
  } finally { await closeDatabase(); }
});

test('failed creation rolls back its key and a retry can create exactly once', async t => {
  const db = mockDatabase(t); db.faults.outbox = true;
  try {
    await assert.rejects(createBooking(7, input), /outbox failed/);
    assert.equal(db.committed.submissions.length, 0); assert.equal(db.committed.reservations.length, 0); assert.equal(db.committed.policies.length, 0);
    db.faults.outbox = false;
    const created = await createBooking(7, input);
    assert.equal(db.committed.reservations.length, 1); assert.equal(db.committed.submissions[0]!.reservationId, created.id);
  } finally { await closeDatabase(); }
});

test('different customers can independently use the same submission key', async t => {
  const db = mockDatabase(t);
  try {
    const first = await createBooking(7, input); const second = await createBooking(8, input);
    assert.notEqual(first.id, second.id);
    assert.deepEqual(db.committed.submissions.map(row => row.customerId), [7, 8]);
    assert.deepEqual(await createBooking(7, input), JSON.parse(JSON.stringify(first)));
    assert.deepEqual(await createBooking(8, input), JSON.parse(JSON.stringify(second)));
  } finally { await closeDatabase(); }
});

test('simultaneous identical submissions wait on the key before pricing and commit one booking', async t => {
  const db = mockDatabase(t);
  try {
    const [first, second] = await Promise.all([createBooking(7, input), createBooking(7, input)]);
    assert.deepEqual(JSON.parse(JSON.stringify(first)), second);
    assert.equal(db.committed.reservations.length, 1); assert.equal(db.committed.payments.length, 1); assert.equal(db.committed.outbox.length, 1);
    assert.equal(db.queries.filter(query => /FROM dbo\.PACKAGE p/.test(query.sql)).length, 1);
  } finally { await closeDatabase(); }
});

test('a committed response can be replayed after its event date has passed', async t => {
  const db = mockDatabase(t);
  try {
    const original = await createBooking(7, input);
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2098-06-16T00:00:00Z') });
    assert.deepEqual(await createBooking(7, input), JSON.parse(JSON.stringify(original)));
    assert.equal(db.committed.reservations.length, 1);
  } finally { await closeDatabase(); }
});

test('a new keyed request enforces calendar-day and cash windows before pricing', async t => {
  const db = mockDatabase(t);
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2098-06-15T00:00:00Z') });
  try {
    await assert.rejects(createBooking(7, input), /4 days|cash/i);
    await assert.rejects(createBooking(7, { ...input, guestCount: 500, eventDate: '2098-06-19', paymentMethod: 'cash' }), /6 days|cash/i);
    assert.equal(db.committed.submissions.length, 0); assert.equal(db.committed.reservations.length, 0);
    assert.equal(db.queries.some(query => /FROM dbo\.PACKAGE/.test(query.sql)), false);
  } finally { await closeDatabase(); }
});

test('concurrent conflicting payloads sharing a key create one booking and reject the other', async t => {
  const db = mockDatabase(t);
  try {
    const results = await Promise.allSettled([createBooking(7, input), createBooking(7, { ...input, venue: 'Another venue' })]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = results.find(result => result.status === 'rejected');
    assert.ok(rejected?.status === 'rejected' && rejected.reason instanceof AppError && rejected.reason.statusCode === 409);
    assert.equal(db.committed.reservations.length, 1); assert.equal(db.committed.payments.length, 1); assert.equal(db.committed.outbox.length, 1);
  } finally { await closeDatabase(); }
});

test('malformed submission keys fail before database access', async t => {
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => { throw new Error('Malformed key reached SQL'); });
  for (const submissionKey of ['', 'not-a-uuid', 'd845e41f-9d9f-1a79-b77e-e840e66154cd']) {
    await assert.rejects(createBooking(7, { ...input, submissionKey } as typeof input), (error: unknown) => error instanceof AppError && error.statusCode === 400);
  }
});
