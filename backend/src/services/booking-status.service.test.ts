import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import sql from 'mssql';
import { AppError } from '../utils/app-error.js';
import type { BookingStatus } from '../types/admin.types.js';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const { allowedBookingTransitions, transitionBooking } = await import('./booking-status.service.js');
const { withBookingStatusTransaction, bookingStatusHistory } = await import('../repositories/booking-status.repository.js');
const { booking, mapAdminBookingCapacity } = await import('../repositories/admin.repository.js');
const { adminController, parseActiveFlag } = await import('../controllers/admin.controller.js');
const { adminService } = await import('./admin.service.js');
const { bookingService } = await import('./booking.service.js');
const bookingController = await import('../controllers/booking.controller.js');
const { closeDatabase } = await import('../config/database.js');

const transitions: [BookingStatus, readonly BookingStatus[]][] = [
  ['PENDING', ['APPROVED', 'REJECTED', 'CANCELLED']],
  ['APPROVED', ['AWAITING_PAYMENT', 'CANCELLED']],
  ['AWAITING_PAYMENT', ['PAYMENT_SUBMITTED', 'PAYMENT_VERIFIED', 'CANCELLED']],
  ['PAYMENT_SUBMITTED', ['PAYMENT_VERIFIED', 'AWAITING_PAYMENT']],
  ['PAYMENT_VERIFIED', ['CONFIRMED']],
  ['CONFIRMED', ['COMPLETED', 'CANCELLED']],
  ['REJECTED', []],
  ['CANCELLED', []],
  ['COMPLETED', []],
  ['EXPIRED', []]
];

class BookingDb {
  status: BookingStatus = 'PENDING';
  customerId = 7;
  eventDate = '2026-12-01';
  guestCount = 100;
  paymentMethod: string | undefined;
  amountPaid = 0;
  activeBookingCount = 1;
  largestGuestCount = 100;
  hasMediumEvent = false;
  exists = true;
  stale = false;
  failOn: 'history' | 'audit' | 'invoice' | 'invoice-items' | undefined;
  history: Record<string, unknown>[] = [];
  audit: Record<string, unknown>[] = [];
  outbox: Record<string, unknown>[] = [];
  invoiceId?: number;
  invoices: Record<string, unknown>[] = [];
  invoiceItemWrites = 0;
  invoiceSourceMissing = false;
  failQueue = false;
  failPaymentRequest = false;
  proofsSuperseded = false;
  afterPaymentLock?: () => void;
  afterCapacityLock?: () => void;
  queries: string[] = [];
  request = new FakeRequest(this) as unknown as sql.Request;
}

class FakeRequest {
  private params: Record<string, unknown> = {};
  constructor(private readonly db: BookingDb) {}
  input(name: string, _type: unknown, value: unknown) { this.params[name] = value; return this; }
  replaceInput(name: string, _type: unknown, value: unknown) { this.params[name] = value; return this; }
  async query(command: string): Promise<{ recordset: Record<string, unknown>[]; rowsAffected: number[] }> {
    this.db.queries.push(command);
    if (!/COUNT_BIG/.test(command) && /FROM dbo\.BOOKING_POLICY/.test(command)) return { recordset: [], rowsAffected: [0] };
    if (/UPDATE dbo\.PAYMENT_PROOF SET status='SUPERSEDED'/is.test(command)) {
      this.db.proofsSuperseded = true;
      return { recordset: [], rowsAffected: [1] };
    }
    if (/email outbox context.*customerEmail.*FROM dbo\.RESERVATION/is.test(command)) {
      return { recordset: [{ customerEmail: 'customer@example.test', customerName: 'Customer', bookingReference: 'BK-5', eventDate: this.db.eventDate, guestCount: this.db.guestCount, paymentMethod: this.db.paymentMethod,
        invoiceId: this.db.invoiceId, invoiceNumber: this.db.invoiceId ? 'INV-8' : undefined,
        invoiceDueDate: this.db.eventDate, eventTime: '12:00', eventType: 'Wedding', venue: 'Venue', status: this.db.status,
        totalAmount: 10000, amountPaid: this.db.amountPaid }], rowsAffected: [1] };
    }
    if (/INSERT dbo\.EMAIL_OUTBOX/.test(command)) {
      if (this.db.failQueue || (this.db.failPaymentRequest && this.params['templateKey'] === 'PAYMENT_REQUESTED')) throw new Error('outbox insert failed');
      this.db.outbox.push({ ...this.params }); return { recordset: [{ id: '9007199254740993' }], rowsAffected: [1] };
    }
    if (/SELECT r\.reservation_id.*FROM dbo\.RESERVATION r WITH/is.test(command)) {
      return { recordset: this.db.exists && !this.db.invoiceSourceMissing ? [{ reservation_id: 5, status: this.db.status, guest_count: this.db.guestCount,
        event_date: this.db.eventDate, package_name_snapshot: 'Catering package', package_pricing_type: 'PER_HEAD',
        package_unit_price: 100, package_total: 10000, subtotal: 10000, discount_amount: 0, total_amount: 10000 }] : [], rowsAffected: [1] };
    }
    if (/SELECT invoice_id FROM dbo\.INVOICE/.test(command)) {
      return { recordset: this.db.invoiceId ? [{ invoice_id: this.db.invoiceId }] : [], rowsAffected: [1] };
    }
    if (/INSERT dbo\.INVOICE\(/.test(command)) {
      if (this.db.failOn === 'invoice') throw new Error('invoice insert failed');
      this.db.invoiceId = 8;
      this.db.invoices.push({ ...this.params });
      return { recordset: [{ invoice_id: 8 }], rowsAffected: [1] };
    }
    if (/INSERT dbo\.INVOICE_ITEM/.test(command)) {
      if (this.db.failOn === 'invoice-items') throw new Error('invoice items insert failed');
      this.db.invoiceItemWrites++;
      return { recordset: [], rowsAffected: [1] };
    }
    if (!/COUNT_BIG/i.test(command) && /SELECT.*FROM dbo\.RESERVATION.*UPDLOCK/is.test(command)) {
      return { recordset: this.db.exists ? [{ status: this.db.status, customerId: this.db.customerId,
        eventDate: this.db.eventDate, guestCount: this.db.guestCount }] : [], rowsAffected: [this.db.exists ? 1 : 0] };
    }
    if (/SELECT payment_id paymentId.*FROM dbo\.PAYMENT/is.test(command)) {
      this.db.afterPaymentLock?.();
      return { recordset: [{ paymentId: 3, amountDue: 100, amountPaid: this.db.amountPaid, paymentMethod: this.db.paymentMethod }], rowsAffected: [1] };
    }
    if (/^\s*SELECT\s+COUNT_BIG\s*\(\s*\*\s*\).*FROM dbo\.RESERVATION/is.test(command)) {
      this.db.afterCapacityLock?.();
      return { recordset: [{ activeBookingCount: this.db.activeBookingCount,
        largestGuestCount: this.db.largestGuestCount, hasMediumEvent: this.db.hasMediumEvent ? 1 : 0 }], rowsAffected: [1] };
    }
    if (/UPDATE dbo\.RESERVATION/is.test(command)) {
      if (this.db.stale || this.params['previousStatus'] !== this.db.status ||
          (this.params['ownerCustomerId'] != null && this.params['ownerCustomerId'] !== this.db.customerId)) return { recordset: [], rowsAffected: [0] };
      this.db.status = this.params['nextStatus'] as BookingStatus;
      return { recordset: [], rowsAffected: [1] };
    }
    if (/INSERT dbo\.BOOKING_STATUS_HISTORY/is.test(command)) {
      if (this.db.failOn === 'history') throw new Error('history insert failed');
      this.db.history.push({ ...this.params });
      return { recordset: [], rowsAffected: [1] };
    }
    if (/INSERT dbo\.ADMIN_AUDIT_LOG/is.test(command)) {
      if (this.db.failOn === 'audit') throw new Error('audit insert failed');
      this.db.audit.push({ ...this.params });
      return { recordset: [], rowsAffected: [1] };
    }
    if (/FROM dbo\.BOOKING_STATUS_HISTORY/is.test(command)) {
      return { recordset: [{ id: 8, previousStatus: 'PENDING', nextStatus: 'APPROVED', actorType: 'ADMIN', actorId: 3, reason: null, createdAt: new Date('2026-10-02T00:00:00Z') }], rowsAffected: [1] };
    }
    if (/FROM dbo\.RESERVATION/is.test(command)) {
      return { recordset: [{ id: 5, status: this.db.status, eventDate: this.db.eventDate,
        guestCount: this.db.guestCount, activeBookingCount: this.db.activeBookingCount,
        largestGuestCount: this.db.largestGuestCount, hasMediumEvent: this.db.hasMediumEvent ? 1 : 0 }], rowsAffected: [1] };
    }
    if (/FROM dbo\.RESERVATION_ADD_ON/is.test(command)) return { recordset: [], rowsAffected: [0] };
    throw new Error(`Unexpected query: ${command}`);
  }
}

function assertStatus(error: unknown, code: number) {
  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, code);
  return true;
}

function assertCodedStatus(error: unknown, statusCode: number, code: string) {
  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, statusCode);
  assert.equal(error.code, code);
  return true;
}

test('ordinary admin approval and payment request remain available for every method', async () => {
 for (const paymentMethod of ['CASH','BANK_TRANSFER','E-WALLET']) {
  const db=new BookingDb();db.paymentMethod=paymentMethod;db.eventDate='2098-06-15';
  for(const nextStatus of ['APPROVED'] as const) {
   await transitionBooking({reservationId:5,nextStatus,actor:{type:'ADMIN',id:2},mode:'GENERIC_ADMIN',request:db.request});
   assert.equal(db.status,'AWAITING_PAYMENT');
  }
  assert.equal(db.amountPaid,0);assert.equal(db.history.length,2);
  assert.equal(db.queries.some(query=>/BOOKING_POLICY/.test(query)),false);
 }
});

for (const [previousStatus, nextStatus] of [['PENDING', 'APPROVED'], ['APPROVED', 'AWAITING_PAYMENT']] as const) {
  test(`cash ${nextStatus} uses the fixed preparation cutoff through exactly 6 PM`, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-04T09:59:59.999Z') });
    for (const now of ['2026-11-04T09:59:59.999Z', '2026-11-04T10:00:00.000Z']) {
      t.mock.timers.setTime(Date.parse(now));
      for (const [guestCount, eventDate] of [[499, '2026-11-07'], [501, '2026-11-09']] as const) {
        const db = new BookingDb();
        Object.assign(db, { status: previousStatus, paymentMethod: 'CASH', guestCount, eventDate });
        await transitionBooking({ reservationId: 5, nextStatus, actor: { type: 'ADMIN', id: 2 }, capacityConfirmed: true, request: db.request });
        assert.equal(db.status, 'AWAITING_PAYMENT');
        assert.equal(db.history.length, nextStatus === 'APPROVED' ? 2 : 1);
      }
    }
  });

  test(`cash ${nextStatus} rejects unpaid deposits strictly after the fixed cutoff`, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-04T10:00:00.001Z') });
    for (const [guestCount, eventDate] of [[499, '2026-11-07'], [501, '2026-11-09']] as const) {
      const db = new BookingDb();
      Object.assign(db, { status: previousStatus, paymentMethod: 'CASH', amountPaid: 49.99, guestCount, eventDate });
      await assert.rejects(
        transitionBooking({ reservationId: 5, nextStatus, actor: { type: 'ADMIN', id: 2 }, capacityConfirmed: true, request: db.request }),
        error => assertCodedStatus(error, 409, 'CASH_DEPOSIT_DEADLINE_PASSED'),
      );
      assert.equal(db.status, previousStatus);
      assert.equal(db.history.length, 0);
      assert.equal(db.audit.length, 0);
      assert.equal(db.outbox.length, 0);
      assert.equal(db.invoices.length, 0);
      assert.equal(db.queries.some(query => /UPDATE dbo\.RESERVATION/.test(query)), false);
    }
  });

  test(`cash ${nextStatus} preserves an already paid reservation deposit after cutoff`, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-06T04:00:00Z') });
    for (const amountPaid of [50, 100]) {
      const db = new BookingDb();
      Object.assign(db, { status: previousStatus, paymentMethod: 'CASH', amountPaid, eventDate: '2026-11-07' });
      await transitionBooking({ reservationId: 5, nextStatus, actor: { type: 'ADMIN', id: 2 }, request: db.request });
      assert.equal(db.status, 'AWAITING_PAYMENT');
      assert.equal(db.amountPaid, amountPaid);
    }
  });

  test(`cash ${nextStatus} rejects past Manila event dates even when the deposit is paid`, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-04T16:00:00Z') });
    for (const amountPaid of [0, 50]) {
      const db = new BookingDb();
      Object.assign(db, { status: previousStatus, paymentMethod: 'CASH', amountPaid, eventDate: '2026-11-04' });
      await assert.rejects(
        transitionBooking({ reservationId: 5, nextStatus, actor: { type: 'ADMIN', id: 2 }, request: db.request }),
        error => assertCodedStatus(error, 409, 'CASH_EVENT_DATE_PASSED'),
      );
      assert.equal(db.status, previousStatus);
      assert.equal(db.history.length, 0);
      assert.equal(db.audit.length, 0);
      assert.equal(db.outbox.length, 0);
      assert.equal(db.invoices.length, 0);
    }
  });

  test(`noncash ${nextStatus} retains its ordinary transitions after the cash cutoff`, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-04T16:00:00Z') });
    for (const paymentMethod of ['BANK_TRANSFER', 'E-WALLET', undefined]) {
      const db = new BookingDb();
      Object.assign(db, { status: previousStatus, paymentMethod, eventDate: '2026-11-04' });
      await transitionBooking({ reservationId: 5, nextStatus, actor: { type: 'ADMIN', id: 2 }, request: db.request });
      assert.equal(db.status, 'AWAITING_PAYMENT');
    }
  });
}

test('cash approval checks the clock after acquiring capacity locks', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-04T09:59:59.999Z') });
  const db = new BookingDb();
  Object.assign(db, { paymentMethod: 'CASH', eventDate: '2026-11-07' });
  db.afterCapacityLock = () => t.mock.timers.setTime(Date.parse('2026-11-04T10:00:00.001Z'));
  await assert.rejects(
    transitionBooking({ reservationId: 5, nextStatus: 'APPROVED', actor: { type: 'ADMIN', id: 2 }, request: db.request }),
    error => assertCodedStatus(error, 409, 'CASH_DEPOSIT_DEADLINE_PASSED'),
  );
  assert.equal(db.status, 'PENDING');
  assert.equal(db.history.length, 0);
});

test('cash payment request checks the clock after acquiring the payment lock', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-04T09:59:59.999Z') });
  const db = new BookingDb();
  Object.assign(db, { status: 'APPROVED', paymentMethod: 'CASH', eventDate: '2026-11-07' });
  db.afterPaymentLock = () => t.mock.timers.setTime(Date.parse('2026-11-04T10:00:00.001Z'));
  await assert.rejects(
    transitionBooking({ reservationId: 5, nextStatus: 'AWAITING_PAYMENT', actor: { type: 'ADMIN', id: 2 }, request: db.request }),
    error => assertCodedStatus(error, 409, 'CASH_DEPOSIT_DEADLINE_PASSED'),
  );
  assert.equal(db.status, 'APPROVED');
  assert.equal(db.history.length, 0);
});

test('booking status exposes every approved transition and terminal state', () => {
  for (const [status, expected] of transitions) {
    assert.deepEqual(allowedBookingTransitions(status), expected, status);
  }
});

test('catalog active flag accepts only literal JSON booleans', () => {
  assert.equal(parseActiveFlag(true), true);
  assert.equal(parseActiveFlag(false), false);
  for (const value of ['true', 'false', 1, 0, null, undefined]) {
    assert.throws(() => parseActiveFlag(value), error => assertStatus(error, 400));
  }
});

for (const [previous, next] of [['PENDING', 'REJECTED'], ['PENDING', 'CANCELLED'],
  ['PAYMENT_VERIFIED', 'CONFIRMED'], ['CONFIRMED', 'COMPLETED']] as const) {
  test(`email outbox booking ${next} queues once inside the supplied transaction without SMTP`, async () => {
    const db = new BookingDb(); db.status = previous;
    if (next === 'COMPLETED') { db.amountPaid = 100; db.eventDate = '2026-01-01'; }
    await transitionBooking({ reservationId: 5, nextStatus: next, actor: { type: 'ADMIN', id: 3 }, reason: 'Customer request', request: db.request });
    assert.equal(db.outbox.length, 1); assert.equal(db.outbox[0]!['templateKey'], `BOOKING_${next}`);
    assert.equal(db.outbox[0]!['relatedEntityId'], '5'); assert.ok(db.queries.some(query => /customerEmail/.test(query)));
  });
}

test('completion requires the recorded full balance, without changing the booking on partial payment', async () => {
  const db = new BookingDb();
  db.status = 'CONFIRMED';
  db.amountPaid = 50;
  await assert.rejects(
    transitionBooking({ reservationId: 5, nextStatus: 'COMPLETED', actor: { type: 'ADMIN', id: 3 }, request: db.request }),
    (error: unknown) => error instanceof AppError && error.statusCode === 409 && /remaining balance/i.test(error.message),
  );
  assert.equal(db.status, 'CONFIRMED');
  assert.equal(db.history.length, 0);
  assert.equal(db.outbox.length, 0);
  db.amountPaid = 100;
  db.eventDate = '2026-01-01';
  await transitionBooking({ reservationId: 5, nextStatus: 'COMPLETED', actor: { type: 'ADMIN', id: 3 }, request: db.request });
  assert.equal(db.status, 'COMPLETED');
});

test('admin approval issues one invoice and automatically requests payment in the same transaction', async t => {
  const db = new BookingDb();
  t.mock.method(sql.Transaction.prototype, 'begin', async () => assert.fail('approval must not open a nested transaction'));
  await transitionBooking({ reservationId: 5, nextStatus: 'APPROVED', actor: { type: 'ADMIN', id: 3 }, request: db.request });
  assert.equal(db.status, 'AWAITING_PAYMENT');
  assert.equal(db.history.length, 2);
  assert.equal(db.invoices.length, 1);
  assert.equal(db.invoiceItemWrites, 2);
  assert.deepEqual(db.audit.map(item => item['auditAction']), ['BOOKING_STATUS_CHANGED', 'INVOICE_ISSUED', 'BOOKING_STATUS_CHANGED']);
  assert.equal(db.outbox.length, 2);
  assert.equal(db.outbox[0]!['templateKey'], 'INVOICE_ISSUED');
  assert.equal(db.outbox[0]!['relatedEntityType'], 'INVOICE');
  assert.equal(db.outbox[0]!['relatedEntityId'], '8');
  assert.equal(JSON.parse(String(db.outbox[0]!['payload'])).invoiceNumber, 'INV-8');
  assert.ok(db.queries.some(query => /NEXT VALUE FOR dbo\.INVOICE_NUMBER_SEQUENCE/.test(query)));
  await assert.rejects(transitionBooking({ reservationId: 5, nextStatus: 'APPROVED', actor: { type: 'ADMIN', id: 3 }, request: db.request }), error => assertStatus(error, 409));
  assert.equal(db.invoices.length, 1);
  assert.equal(db.outbox.length, 2);

  assert.equal(db.status, 'AWAITING_PAYMENT');
  assert.equal(db.invoices.length, 1);
  assert.equal(db.outbox.length, 2);
  assert.equal(db.outbox[1]!['templateKey'], 'PAYMENT_REQUESTED');
});

for (const failure of ['invoice', 'invoice-items', 'queue', 'payment-request', 'missing-source'] as const) {
  test(`admin approval rolls back all changes when ${failure} persistence fails`, async () => {
    const db = new BookingDb();
    if (failure === 'queue') db.failQueue = true;
    else if (failure === 'payment-request') db.failPaymentRequest = true;
    else if (failure === 'missing-source') db.invoiceSourceMissing = true;
    else db.failOn = failure;
    const transaction = Object.create(sql.Transaction.prototype) as sql.Transaction;
    transaction.begin = async () => transaction;
    transaction.request = () => db.request;
    transaction.commit = async () => assert.fail('partial approval must not commit');
    transaction.rollback = async () => {
      db.status = 'PENDING'; db.history = []; db.audit = []; db.invoices = []; db.invoiceId = undefined;
      db.invoiceItemWrites = 0; db.outbox = [];
    };
    await assert.rejects(withBookingStatusTransaction(transaction, request => transitionBooking({ reservationId: 5,
      nextStatus: 'APPROVED', actor: { type: 'ADMIN', id: 3 }, request })), failure === 'missing-source' ? error => assertStatus(error, 404) : /insert failed/);
    assert.equal(db.status, 'PENDING');
    assert.equal(db.history.length, 0);
    assert.equal(db.audit.length, 0);
    assert.equal(db.invoices.length, 0);
    assert.equal(db.invoiceItemWrites, 0);
    assert.equal(db.outbox.length, 0);
  });
}

test('email outbox failure rolls back booking status history and audit', async () => {
  const db = new BookingDb(); db.failQueue = true;
  const transaction = Object.create(sql.Transaction.prototype) as sql.Transaction;
  transaction.begin = async () => transaction; transaction.request = () => db.request;
  transaction.commit = async () => assert.fail('queue failure must not commit');
  transaction.rollback = async () => {
    db.status = 'PENDING'; db.history = []; db.audit = []; db.outbox = []; db.invoices = [];
    db.invoiceId = undefined; db.invoiceItemWrites = 0;
  };
  await assert.rejects(withBookingStatusTransaction(transaction, request => transitionBooking({ reservationId: 5,
    nextStatus: 'APPROVED', actor: { type: 'ADMIN', id: 3 }, request })), /outbox insert failed/);
  assert.equal(db.status, 'PENDING'); assert.equal(db.history.length, 0); assert.equal(db.audit.length, 0); assert.equal(db.outbox.length, 0);
  assert.equal(db.invoices.length, 0);
  assert.equal(db.invoiceItemWrites, 0);
});

test('booking status accepts every approved transition and records its old and new state', async () => {
  for (const [previous, targets] of transitions) {
    for (const nextStatus of targets) {
      const db = new BookingDb();
      db.status = previous;
      if (nextStatus === 'COMPLETED') { db.amountPaid = 100; db.eventDate = '2026-01-01'; }
      await transitionBooking({ reservationId: 5, nextStatus, actor: { type: 'ADMIN', id: 3 }, reason: nextStatus === 'REJECTED' || nextStatus === 'CANCELLED' ? 'Customer request' : undefined, request: db.request });
      assert.equal(db.status, nextStatus === 'APPROVED' ? 'AWAITING_PAYMENT' : nextStatus, `${previous} -> ${nextStatus}`);
      assert.equal(db.history.length, nextStatus === 'APPROVED' ? 2 : 1);
      assert.equal(db.history[0]?.['previousStatus'], previous);
      assert.equal(db.history[0]?.['nextStatus'], nextStatus);
      assert.equal(db.history[0]?.['actorType'], 'ADMIN');
      assert.equal(db.history[0]?.['actorId'], 3);
      assert.equal(db.history[0]?.['reason'], nextStatus === 'REJECTED' || nextStatus === 'CANCELLED' ? 'Customer request' : null);
      assert.equal(db.audit.length, nextStatus === 'APPROVED' ? 3 : 1);
      assert.equal(db.audit[0]?.['auditAdminId'], 3);
      assert.equal(db.audit[0]?.['auditAction'], 'BOOKING_STATUS_CHANGED');
      assert.deepEqual(JSON.parse(String(db.audit[0]?.['auditOldValues'])), { status: previous });
      assert.deepEqual(JSON.parse(String(db.audit[0]?.['auditNewValues'])), { status: nextStatus, reason: nextStatus === 'REJECTED' || nextStatus === 'CANCELLED' ? 'Customer request' : null });
    }
  }
});

test('booking status rejects invalid and terminal transitions with conflict', async () => {
  for (const [previous, approved] of transitions) {
    for (const [nextStatus] of transitions) {
      if (approved.includes(nextStatus)) continue;
      const db = new BookingDb();
      db.status = previous;
      await assert.rejects(transitionBooking({ reservationId: 5, nextStatus, actor: { type: 'ADMIN', id: 3 }, reason: 'Reason', request: db.request }), error => assertStatus(error, 409));
      assert.equal(db.status, previous);
      assert.equal(db.history.length, 0);
      assert.equal(db.audit.length, 0);
    }
  }
});

test('booking status requires a non-empty rejection or cancellation reason', async () => {
  for (const nextStatus of ['REJECTED', 'CANCELLED'] as BookingStatus[]) {
    for (const reason of [undefined, '', '   ']) {
      const db = new BookingDb();
      await assert.rejects(transitionBooking({ reservationId: 5, nextStatus, actor: { type: 'ADMIN', id: 3 }, reason, request: db.request }), error => assertStatus(error, 400));
      assert.equal(db.status, 'PENDING');
      assert.equal(db.history.length, 0);
    }
  }
});

test('booking status treats a stale conditional update as conflict', async () => {
  const db = new BookingDb();
  db.stale = true;
  await assert.rejects(transitionBooking({ reservationId: 5, nextStatus: 'APPROVED', actor: { type: 'ADMIN', id: 3 }, request: db.request }), error => assertStatus(error, 409));
  assert.equal(db.history.length, 0);
  assert.equal(db.audit.length, 0);
  assert.ok(db.queries.some(query => /UPDLOCK.*HOLDLOCK/is.test(query)));
  assert.ok(db.queries.some(query => /WHERE.*status\s*=\s*@previousStatus/is.test(query)));
});

test('booking status returns 404 for a missing booking', async () => {
  const db = new BookingDb();
  db.exists = false;
  await assert.rejects(transitionBooking({ reservationId: 5, nextStatus: 'APPROVED', actor: { type: 'ADMIN', id: 3 }, request: db.request }), error => assertStatus(error, 404));
});

test('booking status rejects malformed service inputs before querying', async () => {
  for (const nextStatus of ['UNKNOWN', 'toString']) {
    const db = new BookingDb();
    await assert.rejects(transitionBooking({ reservationId: 5, nextStatus: nextStatus as BookingStatus, actor: { type: 'ADMIN', id: 3 }, request: db.request }), error => assertStatus(error, 400));
    assert.equal(db.queries.length, 0);
  }
});

test('booking status records customer and system actors without admin audit', async () => {
  for (const actor of [{ type: 'CUSTOMER', id: 7 }, { type: 'SYSTEM' }] as const) {
    const db = new BookingDb();
    await transitionBooking({ reservationId: 5, nextStatus: 'APPROVED', actor, request: db.request });
    assert.equal(db.history[0]?.['actorType'], actor.type);
    assert.equal(db.history[0]?.['actorId'], actor.type === 'SYSTEM' ? null : 7);
    assert.equal(db.audit.length, 0);
    assert.equal(db.invoices.length, 0);
    assert.equal(db.outbox[0]?.['templateKey'], 'BOOKING_APPROVED');
  }
});

test('booking status uses the supplied request and propagates history or audit failures', async () => {
  for (const failOn of ['history', 'audit'] as const) {
    const db = new BookingDb();
    db.failOn = failOn;
    await assert.rejects(transitionBooking({ reservationId: 5, nextStatus: 'APPROVED', actor: { type: 'ADMIN', id: 3 }, request: db.request }), /insert failed/);
  }
});

test('booking status transaction commits success and rolls back failure', async () => {
  const events: string[] = [];
  const transaction = Object.create(sql.Transaction.prototype) as sql.Transaction;
  transaction.begin = async () => { events.push('begin'); return transaction; };
  transaction.commit = async () => { events.push('commit'); };
  transaction.rollback = async () => { events.push('rollback'); };
  await withBookingStatusTransaction(transaction, async () => { events.push('work'); });
  assert.deepEqual(events, ['begin', 'work', 'commit']);
  events.length = 0;
  await assert.rejects(withBookingStatusTransaction(transaction, async () => { events.push('work'); throw new Error('failed'); }), /failed/);
  assert.deepEqual(events, ['begin', 'work', 'rollback']);
});

test('booking status rolls back the status and history when persistence fails', async () => {
  for (const failOn of ['history', 'audit'] as const) {
    const db = new BookingDb();
    db.failOn = failOn;
    const events: string[] = [];
    const transaction = Object.create(sql.Transaction.prototype) as sql.Transaction;
    transaction.begin = async () => { events.push('begin'); return transaction; };
    transaction.request = () => db.request;
    transaction.commit = async () => { events.push('commit'); };
    transaction.rollback = async () => { db.status = 'PENDING'; db.history = []; db.audit = []; events.push('rollback'); };

    await assert.rejects(withBookingStatusTransaction(transaction, request => transitionBooking({ reservationId: 5, nextStatus: 'APPROVED', actor: { type: 'ADMIN', id: 3 }, request })), /insert failed/);
    assert.deepEqual(events, ['begin', 'rollback']);
    assert.equal(db.status, 'PENDING');
    assert.equal(db.history.length, 0);
    assert.equal(db.audit.length, 0);
  }
});

test('booking status history returns ordered actor and timestamp records', async () => {
  const db = new BookingDb();
  const history = await bookingStatusHistory(5, db.request);
  assert.equal(history.length, 1);
  assert.equal(history[0]?.nextStatus, 'APPROVED');
  assert.equal(history[0]?.actorType, 'ADMIN');
  assert.ok(history[0]?.createdAt instanceof Date);
  assert.ok(db.queries.some(query => /ORDER BY.*created_at DESC/is.test(query)));
});

test('booking status history appears in admin booking detail', async () => {
  const db = new BookingDb();
  db.activeBookingCount = 2;
  db.largestGuestCount = 250;
  db.hasMediumEvent = true;
  const detail = await booking(5, db.request);
  assert.equal(detail?.status, 'PENDING');
  assert.equal(detail?.statusHistory?.[0]?.nextStatus, 'APPROVED');
  assert.deepEqual(detail?.capacity, {
    date: '2026-12-01',
    guestCount: 100,
    status: 'NEEDS_CONFIRMATION',
    activeBookingCount: 2,
    capacityLimit: 6,
    remainingRequestSlots: 4,
    requiresAdminConfirmation: false,
    message: 'LA Chef will confirm whether this date can accommodate your event.',
  });
  assert.equal('largestGuestCount' in detail!, false);
  assert.equal('hasMediumEvent' in detail!, false);
});

test('admin booking capacity mapping nests safe summary fields and removes raw aggregates', () => {
  const item = mapAdminBookingCapacity({
    id: 5,
    eventDate: '2026-12-01',
    guestCount: 250,
    activeBookingCount: 2,
    largestGuestCount: 250,
    hasMediumEvent: 1,
    total_count: 4,
  });

  assert.equal(item.capacity.status, 'NEEDS_CONFIRMATION');
  assert.equal(item.capacity.requiresAdminConfirmation, true);
  assert.equal(item.capacity.activeBookingCount, 2);
  assert.equal(item.capacity.capacityLimit, 6);
  assert.equal(item.capacity.remainingRequestSlots, 4);
  assert.equal('largestGuestCount' in item, false);
  assert.equal('hasMediumEvent' in item, false);
  assert.equal(item.total_count, 4);
});

test('medium booking approval requires explicit capacity confirmation at both boundaries', async () => {
  for (const guestCount of [150, 499]) {
    for (const capacityConfirmed of [undefined, false]) {
      const db = new BookingDb();
      db.guestCount = guestCount;
      db.largestGuestCount = guestCount;
      db.hasMediumEvent = true;
      await assert.rejects(
        transitionBooking({ reservationId: 5, nextStatus: 'APPROVED', actor: { type: 'ADMIN', id: 3 }, capacityConfirmed, request: db.request }),
        error => assertCodedStatus(error, 400, 'CAPACITY_CONFIRMATION_REQUIRED'),
      );
      assert.equal(db.invoices.length, 0);
      assert.equal(db.outbox.length, 0);
      assert.equal(db.status, 'PENDING');
    }
  }
});

test('small and large booking boundaries approve without medium confirmation', async () => {
  for (const guestCount of [149, 500]) {
    const db = new BookingDb();
    db.guestCount = guestCount;
    db.largestGuestCount = guestCount;
    await transitionBooking({ reservationId: 5, nextStatus: 'APPROVED', actor: { type: 'ADMIN', id: 3 }, request: db.request });
    assert.equal(db.status, 'AWAITING_PAYMENT');
  }
});

test('admin approval rejects a stale over-capacity date with a coded conflict', async () => {
  const db = new BookingDb();
  db.activeBookingCount = 4;
  db.largestGuestCount = 600;

  await assert.rejects(
    transitionBooking({ reservationId: 5, nextStatus: 'APPROVED', actor: { type: 'ADMIN', id: 3 }, request: db.request }),
    error => assertCodedStatus(error, 409, 'CAPACITY_CHANGED'),
  );
  assert.equal(db.status, 'PENDING');
  assert.equal(db.history.length, 0);
  assert.equal(db.invoices.length, 0);
  assert.equal(db.outbox.length, 0);
});

test('confirmed medium approval records the explicit capacity decision in admin audit', async () => {
  const db = new BookingDb();
  db.guestCount = 250;
  db.largestGuestCount = 250;
  db.hasMediumEvent = true;

  await transitionBooking({ reservationId: 5, nextStatus: 'APPROVED', actor: { type: 'ADMIN', id: 3 }, capacityConfirmed: true, request: db.request });

  assert.equal(db.status, 'AWAITING_PAYMENT');
  assert.deepEqual(JSON.parse(String(db.audit[0]?.['auditNewValues'])), {
    status: 'APPROVED',
    reason: null,
    capacityConfirmed: true,
  });
});

test('capacity confirmation remains strictly boolean and is required before medium-event approval', async () => {
 const db=new BookingDb();db.guestCount=250;db.hasMediumEvent=true;db.largestGuestCount=250;
 await assert.rejects(transitionBooking({reservationId:5,nextStatus:'APPROVED',actor:{type:'ADMIN',id:3},capacityConfirmed:'true' as never,request:db.request}),e=>assertStatus(e,400));
 assert.equal(db.queries.length,0);
 await assert.rejects(transitionBooking({reservationId:5,nextStatus:'APPROVED',actor:{type:'ADMIN',id:3},mode:'GENERIC_ADMIN',request:db.request}),e=>assertCodedStatus(e,400,'CAPACITY_CONFIRMATION_REQUIRED'));
 await transitionBooking({reservationId:5,nextStatus:'APPROVED',actor:{type:'ADMIN',id:3},mode:'GENERIC_ADMIN',capacityConfirmed:true,request:db.request});
 assert.equal(db.status,'AWAITING_PAYMENT');
});

test('booking status endpoint validates status and reason before dispatch', async () => {
  const calls: unknown[][] = [];
  const updateMock = mock.method(adminService, 'updateStatus', async (...args: unknown[]) => { calls.push(args); });
  try {
    const errors: unknown[] = [];
    const response = { json: (_body: unknown) => response };
    const invoke = async (body: unknown) => adminController.status({ params: { id: '5' }, admin: { id: 3 }, body } as never, response as never, (error: unknown) => { errors.push(error); });
    await invoke({ status: 'NOT_A_STATUS' });
    await invoke({ status: 'CANCELLED', reason: '   ' });
    assert.equal(calls.length, 0);
    assert.equal(errors.length, 2);
    errors.forEach(error => assertStatus(error, 400));
    await invoke({ status: 'CANCELLED', reason: ' Customer request ' });
    assert.deepEqual(calls, [[3, 5, 'CANCELLED', 'Customer request', undefined]]);
  } finally {
    updateMock.mock.restore();
  }
});

test('cancelling a confirmed event retires pending balance proofs while retaining their history', async () => {
  const db = new BookingDb(); db.status = 'CONFIRMED';
  await transitionBooking({ reservationId: 5, nextStatus: 'CANCELLED', actor: { type: 'ADMIN', id: 3 }, reason: 'Customer requested cancellation', request: db.request });
  assert.equal(db.status, 'CANCELLED');
  assert.equal(db.proofsSuperseded, true);
  assert.ok(db.queries.some(query => /archived_transaction_reference=transaction_reference/.test(query)));
  assert.equal(db.history.length, 1);
});

test('booking status customer cancellation records the owner and trimmed reason', async () => {
  const db = new BookingDb();
  await bookingService.cancel(7, 5, '  Plans changed  ', db.request);
  assert.equal(db.status, 'CANCELLED');
  assert.equal(db.history.length, 1);
  assert.equal(db.history[0]?.['actorType'], 'CUSTOMER');
  assert.equal(db.history[0]?.['actorId'], 7);
  assert.equal(db.history[0]?.['reason'], 'Plans changed');
  assert.equal(db.audit.length, 0);
  assert.ok(db.queries.some(query => /SELECT.*customer_id.*FROM dbo\.RESERVATION.*UPDLOCK.*HOLDLOCK/is.test(query)));
});

test('booking status customer actor cannot transition another customer booking', async () => {
  const db = new BookingDb();
  await assert.rejects(transitionBooking({ reservationId: 5, nextStatus: 'CANCELLED', actor: { type: 'CUSTOMER', id: 8 }, reason: 'Plans changed', request: db.request }), error => assertStatus(error, 404));
  assert.equal(db.status, 'PENDING');
  assert.equal(db.history.length, 0);
  assert.equal(db.queries.some(query => /UPDATE dbo\.RESERVATION/is.test(query)), false);
});

test('booking status expected state rejects a cancellation based on stale customer view', async () => {
  const db = new BookingDb();
  db.status = 'APPROVED';
  await assert.rejects(transitionBooking({ reservationId: 5, nextStatus: 'CANCELLED', actor: { type: 'CUSTOMER', id: 7 }, reason: 'Plans changed', expectedStatus: 'PENDING', request: db.request }), error => assertStatus(error, 409));
  assert.equal(db.status, 'APPROVED');
  assert.equal(db.history.length, 0);
});

test('booking status hides another customer booking within the locked read', async () => {
  const db = new BookingDb();
  await assert.rejects(bookingService.cancel(8, 5, 'Plans changed', db.request), error => assertStatus(error, 404));
  assert.equal(db.status, 'PENDING');
  assert.equal(db.history.length, 0);
  assert.equal(db.queries.filter(query => /FROM dbo\.RESERVATION.*UPDLOCK/is.test(query)).length, 1);
  assert.equal(db.queries.some(query => /UPDATE dbo\.RESERVATION/is.test(query)), false);
});

test('booking status customer cancellation requires a trimmed reason within 1000 characters', async () => {
  for (const reason of ['', '  ', 'x'.repeat(1001)]) {
    const db = new BookingDb();
    await assert.rejects(bookingService.cancel(7, 5, reason, db.request), error => assertStatus(error, 400));
    assert.equal(db.queries.length, 0);
  }
});

test('booking status customer cancellation rejects stale or non-pending bookings', async () => {
  for (const stale of [false, true]) {
    const db = new BookingDb();
    db.status = stale ? 'PENDING' : 'APPROVED';
    db.stale = stale;
    await assert.rejects(bookingService.cancel(7, 5, 'Plans changed', db.request), error => assertStatus(error, 409));
    assert.equal(db.history.length, 0);
    assert.equal(db.audit.length, 0);
  }
});

test('booking status customer cancellation rolls back when history insertion fails', async () => {
  const db = new BookingDb();
  db.failOn = 'history';
  const events: string[] = [];
  const transaction = Object.create(sql.Transaction.prototype) as sql.Transaction;
  transaction.begin = async () => { events.push('begin'); return transaction; };
  transaction.request = () => db.request;
  transaction.commit = async () => { events.push('commit'); };
  transaction.rollback = async () => { db.status = 'PENDING'; db.history = []; events.push('rollback'); };
  await assert.rejects(withBookingStatusTransaction(transaction, request => bookingService.cancel(7, 5, 'Plans changed', request)), /history insert failed/);
  assert.deepEqual(events, ['begin', 'rollback']);
  assert.equal(db.status, 'PENDING');
  assert.equal(db.history.length, 0);
});

test('booking status cancellation endpoint validates and forwards the reason', async () => {
  const calls: unknown[][] = [];
  const cancelMock = mock.method(bookingService, 'cancel', async (...args: unknown[]) => { calls.push(args); });
  try {
    const errors: unknown[] = [];
    const response = { status: (_code: number) => response, send: () => response };
    const invoke = async (body: unknown) => bookingController.cancel({ params: { id: '5' }, customer: { id: 7 }, body } as never, response as never, (error: unknown) => { errors.push(error); });
    await invoke({});
    await invoke({ reason: '   ' });
    await invoke({ reason: 'x'.repeat(1001) });
    assert.equal(calls.length, 0);
    assert.equal(errors.length, 3);
    errors.forEach(error => assertStatus(error, 400));
    await invoke({ reason: '  Plans changed  ' });
    assert.deepEqual(calls, [[7, 5, 'Plans changed']]);
  } finally { cancelMock.mock.restore(); }
});

test('booking status generic admin endpoint rejects both proof statuses', async () => {
  const calls: unknown[][] = [];
  const updateMock = mock.method(adminService, 'updateStatus', async (...args: unknown[]) => { calls.push(args); });
  try {
    const errors: unknown[] = [];
    const response = { json: (_body: unknown) => response };
    for (const status of ['PAYMENT_SUBMITTED', 'PAYMENT_VERIFIED']) {
      await adminController.status({ params: { id: '5' }, admin: { id: 3 }, body: { status } } as never, response as never, (error: unknown) => { errors.push(error); });
    }
    assert.equal(calls.length, 0);
    assert.equal(errors.length, 2);
    errors.forEach(error => assertStatus(error, 409));
  } finally { updateMock.mock.restore(); }
});

test('booking status generic admin service rejects both proof statuses before SQL', async () => {
  for (const status of ['PAYMENT_SUBMITTED', 'PAYMENT_VERIFIED'] as BookingStatus[]) {
    await assert.rejects(adminService.updateStatus(3, 5, status), error => assertStatus(error, 409));
  }
});

test('booking status generic admin mode blocks proof rejection while internal mode permits it', async () => {
  const db = new BookingDb();
  db.status = 'PAYMENT_SUBMITTED';
  await assert.rejects(transitionBooking({ reservationId: 5, nextStatus: 'AWAITING_PAYMENT', actor: { type: 'ADMIN', id: 3 }, mode: 'GENERIC_ADMIN', request: db.request }), error => assertStatus(error, 409));
  assert.equal(db.status, 'PAYMENT_SUBMITTED');
  assert.equal(db.history.length, 0);
  await transitionBooking({ reservationId: 5, nextStatus: 'AWAITING_PAYMENT', actor: { type: 'ADMIN', id: 3 }, request: db.request });
  assert.equal(db.status, 'AWAITING_PAYMENT');
});
