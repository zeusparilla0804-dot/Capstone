import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test, { type TestContext } from 'node:test';
import sql from 'mssql';
import express from 'express';
import { AppError } from '../utils/app-error.js';
import type { PaymentProofRecord } from '../types/payment-proof.types.js';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';

// Import inside the test gate so a missing implementation is an observed assertion failure.
const modulePath = './payment-verification.service.js';
const implementation = await import(modulePath).catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return undefined;
});

const proof: PaymentProofRecord = {
  id: 4_000_000_001, reservationId: 5, customerId: 7, paymentId: 3,
  method: 'E_WALLET', claimedAmount: 90, transactionReference: 'TX-1', paymentDate: '2026-10-02',
  storageKey: 'payment-proofs/private.png', originalFilename: 'receipt.png', mimeType: 'image/png', byteSize: 10,
  status: 'SUBMITTED', createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z'
};

class ReviewDb {
  booking: { status: string; customerId: number } | undefined = { status: 'PAYMENT_SUBMITTED', customerId: 7 };
  payment: { paymentId: number; amountDue: number; amountPaid: number; status: string } | undefined = {
    paymentId: 3, amountDue: 100, amountPaid: 10, status: 'PARTIALLY_PAID'
  };
  invoice: { id: number; totalAmount: number; status: string } | undefined = { id: 8, totalAmount: 100, status: 'ISSUED' };
  proofs: PaymentProofRecord[] = [structuredClone(proof)];
  credits: Record<string, unknown>[] = [];
  history: Record<string, unknown>[] = [];
  audits: Record<string, unknown>[] = [];
  outbox: Record<string, unknown>[] = [];
  queries: { command: string; params: Record<string, unknown>; transactional: boolean }[] = [];
  events: string[] = [];
  failOn?: string;
  duplicate?: unknown;
  transactionId = '6000000001';
  beforeLocks?: () => void | Promise<void>;
  private queue = Promise.resolve();
  service() {
    assert.equal(typeof implementation?.createPaymentVerificationService, 'function', 'Task 5 verification service must exist');
    return implementation.createPaymentVerificationService({
      readRequest: () => this.request(false),
      transaction: async <T>(work: (request: sql.Request) => Promise<T>) => {
        const preceding = this.queue;
        let release!: () => void;
        this.queue = new Promise<void>(resolve => { release = resolve; });
        await preceding;
        await this.beforeLocks?.(); this.beforeLocks = undefined;
        const snapshot = structuredClone({ booking: this.booking, payment: this.payment, invoice: this.invoice,
          proofs: this.proofs, credits: this.credits, history: this.history, audits: this.audits, outbox: this.outbox });
        this.events.push('begin');
        try {
          const result = await work(this.request(true));
          if (this.failOn === 'commit') throw new Error('commit failed');
          this.events.push('commit'); return result;
        } catch (error) {
          Object.assign(this, snapshot); this.events.push('rollback'); throw error;
        } finally { release(); }
      }
    });
  }
  request(transactional: boolean): sql.Request {
    const params: Record<string, unknown> = {};
    const runner = {
      input(name: string, _type: unknown, value: unknown) {
        assert.equal(name in params, false, `mssql rejects duplicate parameter ${name}`);
        params[name] = value; return runner;
      },
      replaceInput(name: string, type: unknown, value: unknown) {
        if (name === 'paymentTransactionId') assert.equal(type, sql.BigInt, 'proof FK must use SQL bigint');
        params[name] = value; return runner;
      },
      query: async (command: string) => {
        const p = { ...params }; this.queries.push({ command, params: p, transactional });
        const result = (recordset: unknown[] = [], affected = 1) => ({ recordset, rowsAffected: [affected] });
        if (/email outbox context.*customerEmail.*FROM dbo\.RESERVATION/is.test(command)) {
          assert.ok(transactional); return result([{ customerName: 'Customer', customerEmail: 'customer@example.test', bookingReference: 'BK-5', eventDate: '2026-12-01' }]);
        }
        if (/INSERT dbo\.EMAIL_OUTBOX/.test(command)) {
          assert.ok(transactional); if (this.failOn === 'outbox') throw new Error('outbox insert failed');
          this.outbox.push(p); return result([{ id: '9007199254740993' }]);
        }
        if (/FROM dbo\.RESERVATION WITH\(UPDLOCK,HOLDLOCK\)/i.test(command)) {
          assert.ok(transactional); return result(this.booking ? [this.booking] : []);
        }
        if (/FROM dbo\.PAYMENT WITH\(UPDLOCK,HOLDLOCK\)/i.test(command)) {
          assert.ok(transactional); return result(this.payment ? [this.payment] : []);
        }
        if (/FROM dbo\.PAYMENT_PROOF WITH\(UPDLOCK,HOLDLOCK\)/i.test(command)) {
          assert.ok(transactional); return result(this.proofs.filter(row => row.id === p['proofId']));
        }
        if (/INSERT dbo\.PAYMENT_TRANSACTION/i.test(command)) {
          if (this.duplicate) throw this.duplicate;
          if (this.failOn === 'transaction') throw new Error('transaction failed');
          this.credits.push(p); return result([{ id: this.transactionId }]);
        }
        if (/UPDATE dbo\.PAYMENT\s/i.test(command)) {
          if (this.failOn === 'payment') throw new Error('payment failed');
          if (this.failOn === 'stalePayment') return result([], 0);
          assert.match(command, /amount_paid\s*=\s*amount_paid\s*\+\s*@amount/i);
          assert.match(command, /status\s*=\s*CASE WHEN amount_paid\+@amount>=amount_due THEN 'PAID' ELSE 'PARTIALLY_PAID' END/i);
          this.payment!.amountPaid += Number(p['amount']);
          this.payment!.status = this.payment!.amountPaid >= this.payment!.amountDue ? 'PAID' : 'PARTIALLY_PAID';
          return result();
        }
        if (/FROM dbo\.INVOICE.*UPDLOCK/is.test(command)) return result(this.invoice ? [this.invoice] : []);
        if (/UPDATE dbo\.INVOICE/i.test(command)) {
          assert.match(command, /status\s*<>\s*'CANCELLED'/i);
          if (this.failOn === 'invoice') throw new Error('invoice failed');
          if (this.failOn === 'staleInvoice') return result([], 0);
          assert.match(command, /SET status=@invoiceStatus/i);
          if (this.invoice && this.invoice.status !== 'CANCELLED') this.invoice.status = String(p['invoiceStatus']);
          return result();
        }
        if (/UPDATE dbo\.PAYMENT_PROOF/i.test(command)) {
          if (this.failOn === 'proof') throw new Error('proof failed');
          assert.match(command, /status\s*=\s*'SUBMITTED'/i);
          for (const assignment of ['status=@reviewStatus', 'rejection_reason=@rejectionReason', 'verified_amount=@verifiedAmount',
            'payment_transaction_id=@paymentTransactionId', 'invoice_id=@invoiceId', 'reviewed_by=@adminId', 'reviewed_at=sysutcdatetime()']) {
            assert.ok(command.includes(assignment), `proof review must persist ${assignment}`);
          }
          const row = this.proofs.find(row => row.id === p['proofId'] && row.reservationId === p['reservationId'] && row.status === 'SUBMITTED');
          if (!row || this.failOn === 'staleProof') return result([], 0);
          Object.assign(row, { status: p['reviewStatus'], reviewedBy: p['adminId'], reviewedAt: '2026-10-02T01:00:00.000Z',
            rejectionReason: p['rejectionReason'] ?? undefined, verifiedAmount: p['verifiedAmount'] ?? undefined,
            paymentTransactionId: p['paymentTransactionId'] ?? undefined, invoiceId: p['invoiceId'] ?? undefined });
          return result();
        }
        if (/UPDATE dbo\.RESERVATION/i.test(command)) {
          if (this.failOn === 'staleBooking') return result([], 0);
          assert.equal(this.booking!.status, p['previousStatus']); this.booking!.status = String(p['nextStatus']); return result();
        }
        if (/INSERT dbo\.BOOKING_STATUS_HISTORY/i.test(command)) {
          if (this.failOn === 'history') throw new Error('history failed'); this.history.push(p); return result();
        }
        if (/INSERT dbo\.ADMIN_AUDIT_LOG/i.test(command)) {
          if (this.failOn === 'audit' || this.failOn === p['auditAction']) throw new Error('audit failed');
          assert.ok(transactional); this.audits.push(p); return result();
        }
        if (/FROM dbo\.PAYMENT_PROOF WHERE payment_proof_id=@proofId/i.test(command)) {
          assert.equal(transactional, false, 'initial lookup must be unlocked');
          return result(this.proofs.filter(row => row.id === p['proofId']));
        }
        if (/FROM dbo\.RESERVATION r/i.test(command) && !/FROM dbo\.PAYMENT_PROOF pp/i.test(command)) {
          return result(this.booking ? [{ reservationId: 5, bookingReference: 'LA-5', bookingStatus: this.booking.status,
            customerId: 7, customerName: 'Test Customer', customerEmail: 'test@example.test', eventDate: '2026-12-01',
            paymentId: this.payment?.paymentId, amountDue: this.payment?.amountDue, amountPaid: this.payment?.amountPaid,
            paymentStatus: this.payment?.status, invoiceId: this.invoice?.id, invoiceNumber: 'INV-8',
            invoiceTotal: this.invoice?.totalAmount, invoiceStatus: this.invoice?.status }] : []);
        }
        if (/FROM dbo\.PAYMENT_PROOF pp/i.test(command)) {
          assert.equal(transactional, false);
          let depth = 0;
          for (const token of command.replace(/'(?:''|[^'])*'/g, "''")) {
            if (token === '(') depth++;
            if (token === ')') depth--;
            assert.ok(depth >= 0, 'emitted queue SQL must have balanced parentheses');
          }
          assert.equal(depth, 0, 'emitted queue SQL must have balanced parentheses');
          if (p['dateTo'] === '9999-12-31' && /DATEADD\(day,1,/i.test(command)) throw new Error('SQL date overflow');
          const rows = this.proofs.filter(row => (!p['status'] || row.status === p['status']) && (!p['method'] || row.method === p['method']) &&
            (!p['date'] || row.paymentDate === p['date']) && (!p['dateFrom'] || row.paymentDate >= String(p['dateFrom'])) &&
            (!p['dateTo'] || row.paymentDate <= String(p['dateTo'])) && (!p['search'] || row.transactionReference?.includes(String(p['search']))));
          const newest = /ORDER BY pp\.created_at DESC,\s*pp\.payment_proof_id DESC/i.test(command);
          assert.match(command, /ORDER BY pp\.created_at (ASC|DESC),\s*pp\.payment_proof_id (ASC|DESC)/i);
          rows.sort((a, b) => (a.createdAt.localeCompare(b.createdAt) || a.id - b.id) * (newest ? -1 : 1));
          const page = rows.slice(Number(p['offset']), Number(p['offset']) + Number(p['pageSize']));
          return { recordsets: [[{ totalItems: rows.length }], page], recordset: [{ totalItems: rows.length }], rowsAffected: [] };
        }
        throw new Error(`Unexpected SQL: ${command}`);
      }
    };
    return runner as unknown as sql.Request;
  }
}

function status(code: number) {
  return (error: unknown) => { assert.ok(error instanceof AppError); assert.equal(error.statusCode, code); return true; };
}
function unchanged(db: ReviewDb) {
  assert.equal(db.payment?.amountPaid, 10); assert.equal(db.credits.length, 0);
  assert.equal(db.proofs[0]?.status, 'SUBMITTED'); assert.equal(db.history.length, 0); assert.equal(db.audits.length, 0);
}
function lockOrder(db: ReviewDb) {
  const locks = db.queries.filter(query => /UPDLOCK/i.test(query.command));
  assert.match(locks[0]!.command, /dbo\.RESERVATION WITH\(UPDLOCK,HOLDLOCK\)/);
  assert.match(locks[1]!.command, /dbo\.PAYMENT WITH\(UPDLOCK,HOLDLOCK\)/);
  assert.match(locks[2]!.command, /dbo\.PAYMENT_PROOF WITH\(UPDLOCK,HOLDLOCK\)/);
  assert.ok(locks.every(query => query.transactional));
}

for (const [amount, wantPaid, wantStatus] of [[90, 100, 'PAID'], [40.25, 50.25, 'PARTIALLY_PAID']] as const) {
  test(`verification credits ${amount} atomically and sets payment/invoice ${wantStatus}`, async () => {
    const db = new ReviewDb(); db.proofs[0]!.claimedAmount = amount;
    const reviewed = await db.service().verifyProof(2, proof.id, amount, '  checked  ');
    assert.equal(db.payment!.amountPaid, wantPaid); assert.equal(db.payment!.status, wantStatus);
    assert.equal(db.invoice!.status, wantStatus); assert.equal(db.booking!.status, 'PAYMENT_VERIFIED');
    assert.equal(db.credits.length, 1); assert.equal(db.credits[0]!['method'], 'E-WALLET');
    assert.equal(db.credits[0]!['reference'], 'TX-1'); assert.equal((db.credits[0]!['paymentDate'] as Date).toISOString(), '2026-10-02T00:00:00.000Z');
    assert.equal(db.proofs[0]!.paymentTransactionId, '6000000001'); assert.equal(db.proofs[0]!.invoiceId, 8);
    assert.equal(db.proofs[0]!.reviewedBy, 2); assert.ok(db.proofs[0]!.reviewedAt); assert.equal(db.proofs[0]!.verifiedAmount, amount);
    assert.equal(reviewed.status, 'VERIFIED'); assert.equal('storageKey' in reviewed, false);
    assert.equal(db.history[0]!['previousStatus'], 'PAYMENT_SUBMITTED'); assert.equal(db.history[0]!['nextStatus'], 'PAYMENT_VERIFIED');
    assert.equal(db.history[0]!['reason'], 'checked'); assert.equal(db.history[0]!['actorId'], 2);
    const audit = db.audits.find(row => row['auditAction'] === 'PAYMENT_PROOF_VERIFIED'); assert.ok(audit);
    assert.equal(audit['auditEntityId'], 5); assert.equal(JSON.parse(String(audit['auditNewValues'])).proofId, proof.id);
    assert.deepEqual(db.events, ['begin', 'commit']); lockOrder(db);
  });
}

test('payment proof below the half-deposit threshold remains awaiting payment while the proof is verified', async () => {
  const db = new ReviewDb();
  db.proofs[0]!.claimedAmount = 39.99;

  const reviewed = await db.service().verifyProof(2, proof.id, 39.99);

  assert.equal(reviewed.status, 'VERIFIED');
  assert.equal(db.payment!.amountPaid, 49.99);
  assert.equal(db.booking!.status, 'AWAITING_PAYMENT');
  assert.equal(db.history[0]!['nextStatus'], 'AWAITING_PAYMENT');
});

test('payment proof uses cumulative paid amount and advances at the exact half-deposit threshold', async () => {
  const db = new ReviewDb();
  db.payment!.amountPaid = 30;
  db.proofs[0]!.claimedAmount = 20;

  const reviewed = await db.service().verifyProof(2, proof.id, 20);

  assert.equal(reviewed.status, 'VERIFIED');
  assert.equal(db.payment!.amountPaid, 50);
  assert.equal(db.booking!.status, 'PAYMENT_VERIFIED');
  assert.equal(db.history[0]!['nextStatus'], 'PAYMENT_VERIFIED');
});

test('corrected amount requires reason and preserves it in history/audit', async () => {
  for (const reason of [undefined, '', '   ']) { const db = new ReviewDb(); await assert.rejects(db.service().verifyProof(2, proof.id, 40, reason), status(400)); unchanged(db); }
  const db = new ReviewDb(); await db.service().verifyProof(2, proof.id, 40, '  Actual receipt amount  ');
  assert.equal(db.payment!.amountPaid, 50); assert.equal(db.history[0]!['reason'], 'Actual receipt amount');
  const values = JSON.parse(String(db.audits.at(-1)!['auditNewValues'])); assert.equal(values.reason, 'Actual receipt amount');
  assert.equal(db.proofs[0]!.rejectionReason, undefined);
});

test('invalid money, reason and schema-compatible identifiers fail before SQL', async () => {
  for (const amount of [0, -1, NaN, Infinity, 1.001, 1.0000000001, '90', null, true, [], 10_000_000_000]) {
    const db = new ReviewDb(); await assert.rejects(db.service().verifyProof(2, proof.id, amount), status(400)); assert.equal(db.queries.length, 0);
  }
  for (const reason of [null, 4, {}, 'x'.repeat(1001)]) {
    const db = new ReviewDb(); await assert.rejects(db.service().verifyProof(2, proof.id, 90, reason), status(400)); assert.equal(db.queries.length, 0);
  }
  for (const id of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, '5']) {
    const db = new ReviewDb(); await assert.rejects(db.service().verifyProof(2, id, 90), status(400));
    await assert.rejects(db.service().getProofForReview(id), status(400)); await assert.rejects(db.service().rejectProof(2, id, 'bad'), status(400));
    assert.equal(db.queries.length, 0);
  }
  for (const adminId of [0, 2_147_483_648]) {
    const db = new ReviewDb(); await assert.rejects(db.service().verifyProof(adminId, proof.id, 90), status(400));
    await assert.rejects(db.service().rejectProof(adminId, proof.id, 'bad'), status(400)); assert.equal(db.queries.length, 0);
  }
});

test('money uses exact cents, supports cash without reference and bank transfer vocabulary', async () => {
  for (const [method, wantMethod] of [['CASH', 'CASH'], ['BANK_TRANSFER', 'BANK_TRANSFER']] as const) {
    const db = new ReviewDb(); db.proofs[0]!.method = method; db.proofs[0]!.claimedAmount = 0.29;
    if (method === 'CASH') db.proofs[0]!.transactionReference = undefined;
    await db.service().verifyProof(2, proof.id, 0.29);
    assert.equal(db.payment!.amountPaid, 10.29); assert.equal(db.credits[0]!['method'], wantMethod);
    if (method === 'CASH') assert.equal(db.credits[0]!['reference'], null);
  }
});

test('rejection requires trimmed reason, returns awaiting payment and never credits money', async () => {
  for (const reason of [undefined, null, '', ' ', 2, 'x'.repeat(1001)]) {
    const db = new ReviewDb(); await assert.rejects(db.service().rejectProof(2, proof.id, reason), status(400)); assert.equal(db.queries.length, 0);
  }
  const db = new ReviewDb(); const reviewed = await db.service().rejectProof(2, proof.id, '  Unreadable receipt  ');
  assert.equal(reviewed.status, 'REJECTED'); assert.equal(reviewed.rejectionReason, 'Unreadable receipt');
  assert.equal(db.booking!.status, 'AWAITING_PAYMENT'); assert.equal(db.payment!.amountPaid, 10); assert.equal(db.invoice!.status, 'ISSUED');
  assert.equal(db.credits.length, 0); assert.equal(db.proofs[0]!.verifiedAmount, undefined); assert.equal(db.proofs[0]!.reviewedBy, 2);
  assert.equal(db.history[0]!['nextStatus'], 'AWAITING_PAYMENT'); assert.equal(db.audits.at(-1)!['auditAction'], 'PAYMENT_PROOF_REJECTED');
  assert.equal('storageKey' in reviewed, false); lockOrder(db);
});

async function completeManualPayment(db: ReviewDb, t: TestContext): Promise<void> {
  const { recordPayment } = await import('../repositories/admin.repository.js');
  const { closeDatabase } = await import('../config/database.js');
  const events: string[] = [];
  const pool = { connected: true, close: async () => {} };
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => pool);
  t.mock.method(sql.Transaction.prototype, 'begin', async () => { events.push('begin'); });
  t.mock.method(sql.Transaction.prototype, 'commit', async () => { events.push('commit'); });
  t.mock.method(sql.Transaction.prototype, 'rollback', async () => { events.push('rollback'); });
  // Exercise the existing manual-payment repository; replace only SQL execution.
  t.mock.method(sql.Request.prototype, 'query', async function (this: sql.Request, command: string) {
    const values = Object.fromEntries(Object.entries(this.parameters).map(([name, parameter]) => [name, parameter.value]));
    if (/SELECT status,customer_id customerId[\s\S]*FROM dbo\.RESERVATION/i.test(command)) {
      assert.match(command, /UPDLOCK,HOLDLOCK/);
      return { recordset: [{ status: db.booking!.status, customerId: db.booking!.customerId,
        eventDate: '2026-12-01', guestCount: 100 }], rowsAffected: [1] };
    }
    if (/SELECT payment_id,amount_due,amount_paid FROM dbo\.PAYMENT/i.test(command)) {
      assert.match(command, /UPDLOCK,HOLDLOCK/);
      return { recordset: [{ payment_id: 3, amount_due: 100, amount_paid: 10 }], rowsAffected: [] };
    }
    if (/UPDATE dbo\.PAYMENT_PROOF SET status='SUPERSEDED'/i.test(command)) {
      for (const item of db.proofs) if (item.status === 'SUBMITTED') item.status = 'SUPERSEDED';
    } else if (/INSERT dbo\.PAYMENT_TRANSACTION/i.test(command)) {
      db.credits.push({ ...values, source: 'MANUAL' });
    } else if (/UPDATE dbo\.PAYMENT SET/i.test(command)) {
      assert.equal(values['paymentId'], 3); assert.equal(values['amount'], 90);
      db.payment!.amountPaid = 100; db.payment!.status = 'PAID';
    } else if (/UPDATE i SET status/i.test(command)) {
      db.invoice!.status = 'PAID';
    } else if (/UPDATE dbo\.RESERVATION SET status=@nextStatus/i.test(command)) {
      db.booking!.status = values['nextStatus'] as BookingStatus;
    } else if (/INSERT dbo\.BOOKING_STATUS_HISTORY/i.test(command)) {
      db.history.push(values);
    } else if (/INSERT dbo\.ADMIN_AUDIT_LOG/i.test(command)) {
      db.audits.push(values);
    } else if (/email outbox context.*customerEmail.*FROM dbo\.RESERVATION/is.test(command)) {
      return { recordset: [{ customerEmail: 'customer@example.test', customerName: 'Customer', bookingReference: 'BK-5', eventDate: '2026-12-01' }], rowsAffected: [1] };
    } else if (/INSERT dbo\.EMAIL_OUTBOX/i.test(command)) {
      db.outbox.push(values); return { recordset: [{ id: '1' }], rowsAffected: [1] };
    } else { throw new Error(`Unexpected manual payment SQL: ${command}`); }
    return { recordset: [], rowsAffected: [1] };
  });
  try {
    assert.equal(await recordPayment(2, { reservationId: 5, amount: 90, method: 'CASH', paymentDate: '2026-10-02' }), true);
    assert.deepEqual(events, ['begin', 'commit']); assert.equal(db.booking!.status, 'PAYMENT_VERIFIED');
    assert.equal(db.proofs[0]!.status, 'SUPERSEDED'); assert.equal(db.credits.length, 1);
    assert.equal(db.audits.at(-1)!['auditAction'], 'PAYMENT_RECORDED');
  } finally { await closeDatabase(); }
}

test('manual payment wins safely when it supersedes a proof between discovery and review locks', async t => {
  const db = new ReviewDb(); db.beforeLocks = () => completeManualPayment(db, t);
  await assert.rejects(db.service().rejectProof(2, proof.id, ' Already paid manually '), status(409));
  assert.equal(db.proofs[0]!.status, 'SUPERSEDED'); assert.equal(db.booking!.status, 'PAYMENT_VERIFIED'); assert.equal(db.payment!.amountPaid, 100);
  assert.equal(db.payment!.status, 'PAID'); assert.equal(db.invoice!.status, 'PAID');
  assert.equal(db.credits.length, 1); assert.equal(db.credits[0]!['source'], 'MANUAL');
  assert.equal(db.history.length, 1); assert.equal(db.history[0]!['nextStatus'], 'PAYMENT_VERIFIED');
  assert.equal(db.audits.length, 2); assert.equal(db.audits.at(-1)!['auditAction'], 'PAYMENT_RECORDED');
  await assert.rejects(db.service().rejectProof(2, proof.id, 'stale retry'), status(409));
  assert.equal(db.credits.length, 1); assert.equal(db.history.length, 1);
});

for (const other of ['verifyProof', 'rejectProof'] as const) {
  test(`manual completion prevents concurrent ${other} and rejection from double-processing`, async t => {
    const db = new ReviewDb(); await completeManualPayment(db, t); const service = db.service();
    const results = await Promise.allSettled([
      service[other](2, proof.id, other === 'verifyProof' ? 90 : 'duplicate receipt'),
      service.rejectProof(2, proof.id, 'already paid manually')
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 0);
    for (const result of results) { assert.equal(result.status, 'rejected'); if (result.status === 'rejected') status(409)(result.reason); }
    assert.equal(db.proofs[0]!.status, 'SUPERSEDED'); assert.equal(db.booking!.status, 'PAYMENT_VERIFIED');
    assert.equal(db.payment!.amountPaid, 100); assert.equal(db.invoice!.status, 'PAID'); assert.equal(db.credits.length, 1);
    assert.equal(db.history.length, 1); assert.equal(db.audits.length, 2);
  });
}

test('manual completion leaves no proof review writes to roll back', async t => {
  const db = new ReviewDb(); await completeManualPayment(db, t); db.failOn = 'PAYMENT_PROOF_REJECTED';
  await assert.rejects(db.service().rejectProof(2, proof.id, 'already paid manually'), status(409));
  assert.equal(db.proofs[0]!.status, 'SUPERSEDED'); assert.equal(db.booking!.status, 'PAYMENT_VERIFIED');
  assert.equal(db.payment!.amountPaid, 100); assert.equal(db.invoice!.status, 'PAID'); assert.equal(db.credits.length, 1);
  assert.equal(db.history.length, 1); assert.equal(db.audits.length, 2);
});

test('transaction identity above MAX_SAFE_INTEGER remains exact in FK binding, response, audit and admin reads', async () => {
  const db = new ReviewDb(); db.transactionId = '9007199254740993';
  const reviewed = await db.service().verifyProof(2, proof.id, 90);
  const update = db.queries.find(query => /UPDATE dbo\.PAYMENT_PROOF/.test(query.command)); assert.ok(update);
  assert.equal(update.params['paymentTransactionId'], '9007199254740993');
  assert.equal(db.proofs[0]!.paymentTransactionId, '9007199254740993');
  assert.equal(reviewed.paymentTransactionId, '9007199254740993');
  assert.equal(JSON.parse(JSON.stringify(reviewed)).paymentTransactionId, '9007199254740993');
  assert.equal(JSON.parse(String(db.audits.at(-1)!['auditNewValues'])).paymentTransactionId, '9007199254740993');
  const detail = await db.service().getProofForReview(proof.id); assert.equal(detail.proof.paymentTransactionId, '9007199254740993');
  const page = await db.service().listPendingProofs({ status: 'VERIFIED' }); assert.equal(page.items[0].paymentTransactionId, '9007199254740993');
  const insert = db.queries.find(query => /INSERT dbo\.PAYMENT_TRANSACTION/.test(query.command)); assert.ok(insert);
  assert.match(insert.command, /OUTPUT CONVERT\(varchar\(20\),\s*INSERTED\.payment_transaction_id\) id/i);
  for (const query of db.queries.filter(query => /FROM dbo\.PAYMENT_PROOF/.test(query.command))) {
    assert.match(query.command, /CONVERT\(varchar\(20\),\s*payment_transaction_id\) paymentTransactionId/i);
  }
});

for (const action of ['verifyProof', 'rejectProof'] as const) {
  test(`email outbox ${action} queues safe intent with the credit/review transaction`, async () => {
    const db = new ReviewDb(); await db.service()[action](2, proof.id, action === 'verifyProof' ? 90 : 'invalid receipt');
    assert.equal(db.outbox.length, 1); assert.equal(db.outbox[0]!['templateKey'], action === 'verifyProof' ? 'PAYMENT_PROOF_VERIFIED' : 'PAYMENT_PROOF_REJECTED');
    assert.equal(/private.png|storageKey|TX-1|invalid receipt/.test(String(db.outbox[0]!['payload'])), false);
    if (action === 'verifyProof') assert.equal(JSON.parse(String(db.outbox[0]!['payload'])).amount, '90.00');
  });
  test(`email outbox ${action} queue failure rolls back all review writes`, async () => {
    const db = new ReviewDb(); db.failOn = 'outbox';
    await assert.rejects(db.service()[action](2, proof.id, action === 'verifyProof' ? 90 : 'invalid receipt'), /outbox insert failed/);
    assert.equal(db.outbox.length, 0); assert.equal(db.credits.length, 0); assert.equal(db.payment!.amountPaid, 10);
    assert.equal(db.proofs[0]!.status, 'SUBMITTED'); assert.equal(db.booking!.status, 'PAYMENT_SUBMITTED');
    assert.equal(db.invoice!.status, 'ISSUED'); assert.equal(db.history.length, 0); assert.equal(db.audits.length, 0);
    assert.deepEqual(db.events, ['begin', 'rollback']);
  });
}

test('verification permits absent invoice and preserves cancelled invoices', async () => {
  for (const absent of [true, false]) {
    const db = new ReviewDb(); if (absent) db.invoice = undefined; else db.invoice!.status = 'CANCELLED';
    await db.service().verifyProof(2, proof.id, 90);
    assert.equal(db.payment!.status, 'PAID'); assert.equal(db.invoice?.status, absent ? undefined : 'CANCELLED');
    assert.equal(db.proofs[0]!.invoiceId, absent ? undefined : 8);
  }
});

test('invoice status follows its total even when it differs from the payment amount due', async () => {
  const db = new ReviewDb(); db.invoice!.totalAmount = 120; await db.service().verifyProof(2, proof.id, 90);
  assert.equal(db.payment!.status, 'PAID'); assert.equal(db.invoice!.status, 'PARTIALLY_PAID');
});

test('missing proofs return 404; reviewed or superseded proofs return actionable 409', async () => {
  for (const action of ['verifyProof', 'rejectProof'] as const) {
    const absent = new ReviewDb(); absent.proofs = []; await assert.rejects(absent.service()[action](2, proof.id, action === 'verifyProof' ? 90 : 'bad'), status(404));
    for (const state of ['VERIFIED', 'REJECTED', 'SUPERSEDED'] as const) {
      const db = new ReviewDb(); db.proofs[0]!.status = state;
      await assert.rejects(db.service()[action](2, proof.id, action === 'verifyProof' ? 90 : 'bad'), error => {
        status(409)(error); assert.match((error as Error).message, /refresh|already|submitted/i); return true;
      }); assert.equal(db.credits.length, 0); assert.equal(db.audits.length, 0);
    }
  }
});

test('booking, proof linkage/status and balance are revalidated under ordered locks', async () => {
  for (const mutate of [
    (db: ReviewDb) => { db.proofs = []; },
    (db: ReviewDb) => { db.proofs[0]!.reservationId = 6; },
    (db: ReviewDb) => { db.proofs[0]!.customerId = 9; },
    (db: ReviewDb) => { db.proofs[0]!.paymentId = 9; },
    (db: ReviewDb) => { db.proofs[0]!.status = 'SUPERSEDED'; },
    (db: ReviewDb) => { db.booking!.status = 'CONFIRMED'; },
    (db: ReviewDb) => { db.booking = undefined; },
    (db: ReviewDb) => { db.payment = undefined; },
    (db: ReviewDb) => { db.payment!.amountPaid = 11; },
    (db: ReviewDb) => { db.payment!.amountPaid = 100; }
  ]) {
    const db = new ReviewDb(); db.beforeLocks = () => mutate(db);
    await assert.rejects(db.service().verifyProof(2, proof.id, 90), status(409));
    assert.equal(db.credits.length, 0); assert.equal(db.history.length, 0); assert.equal(db.audits.length, 0);
  }
});

test('overpayment is a conflict and rejection also revalidates booking/proof links', async () => {
  const db = new ReviewDb(); await assert.rejects(db.service().verifyProof(2, proof.id, 90.01, 'Correction'), status(409)); unchanged(db);
  for (const mutate of [(db: ReviewDb) => { db.proofs[0]!.reservationId = 6; }, (db: ReviewDb) => { db.booking!.status = 'CONFIRMED'; }]) {
    const other = new ReviewDb(); other.beforeLocks = () => mutate(other);
    await assert.rejects(other.service().rejectProof(2, proof.id, 'bad'), status(409)); assert.equal(other.proofs[0]!.status, 'SUBMITTED');
  }
});

test('two concurrent verifications allow exactly one credit; verify/reject and reject/reject have one winner', async () => {
  for (const pair of [['verifyProof', 'verifyProof'], ['verifyProof', 'rejectProof'], ['rejectProof', 'verifyProof'], ['rejectProof', 'rejectProof']] as const) {
    const db = new ReviewDb(); const service = db.service();
    const results = await Promise.allSettled(pair.map(action => service[action](2, proof.id, action === 'verifyProof' ? 90 : 'bad')));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const loser = results.find(result => result.status === 'rejected'); assert.ok(loser && loser.status === 'rejected'); status(409)(loser.reason);
    const verified = db.proofs[0]!.status === 'VERIFIED'; assert.equal(db.credits.length, verified ? 1 : 0);
    assert.equal(db.payment!.amountPaid, verified ? 100 : 10); assert.equal(db.history.length, 1);
    assert.deepEqual(db.events, ['begin', 'commit', 'begin', 'rollback']);
  }
});

test('every verification write failure rolls back credit, proof, invoice, booking, history and audit', async () => {
  for (const failOn of ['transaction', 'payment', 'invoice', 'proof', 'history', 'audit', 'PAYMENT_PROOF_VERIFIED', 'commit']) {
    const db = new ReviewDb(); db.failOn = failOn;
    await assert.rejects(db.service().verifyProof(2, proof.id, 90), /failed/); unchanged(db);
    assert.equal(db.invoice!.status, 'ISSUED'); assert.equal(db.booking!.status, 'PAYMENT_SUBMITTED'); assert.deepEqual(db.events, ['begin', 'rollback']);
  }
  for (const failOn of ['proof', 'history', 'audit', 'PAYMENT_PROOF_REJECTED', 'commit']) {
    const db = new ReviewDb(); db.failOn = failOn;
    await assert.rejects(db.service().rejectProof(2, proof.id, 'bad'), /failed/); unchanged(db); assert.equal(db.booking!.status, 'PAYMENT_SUBMITTED');
  }
});

for (const failOn of ['stalePayment', 'staleInvoice', 'staleProof', 'staleBooking']) {
  test(`${failOn} conditional update miss returns 409 and rolls back`, async () => {
    const db = new ReviewDb(); db.failOn = failOn; await assert.rejects(db.service().verifyProof(2, proof.id, 90), status(409)); unchanged(db);
  });
}

test('database uniqueness conflicts become safe 409 with rollback', async () => {
  for (const duplicate of [{ number: 2601 }, { number: 2627 }, { originalError: { info: { number: 2601 } } }]) {
    const db = new ReviewDb(); db.duplicate = duplicate;
    await assert.rejects(db.service().verifyProof(2, proof.id, 90), error => {
      status(409)(error); assert.match((error as Error).message, /already|reference|refresh/i); assert.equal((error as Error).message.includes('dbo.'), false); return true;
    }); unchanged(db);
  }
});

test('queue defaults to submitted oldest-first with stable tie-breaker and accurate empty-page totals', async () => {
  const db = new ReviewDb(); db.proofs.push({ ...proof, id: proof.id + 1 }, { ...proof, id: 99, status: 'REJECTED' });
  const service = db.service(); const page = await service.listPendingProofs({});
  assert.deepEqual(page.items.map((row: PaymentProofRecord) => row.id), [proof.id, proof.id + 1]);
  assert.equal(page.page, 1); assert.equal(page.pageSize, 20); assert.equal(page.totalItems, 2);
  assert.equal(JSON.stringify(page).includes('private.png'), false); assert.equal('storageKey' in page.items[0], false);
  const newest = await service.listPendingProofs({ order: 'newest', pageSize: '1' }); assert.equal(newest.items[0].id, proof.id + 1);
  const empty = await service.listPendingProofs({ page: '3', pageSize: '1' }); assert.equal(empty.items.length, 0); assert.equal(empty.totalItems, 2); assert.equal(empty.totalPages, 2);
});

test('queue filters and pagination are bound SQL values; malformed inputs fail before SQL', async () => {
  const db = new ReviewDb(); db.proofs.push({ ...proof, id: 99, status: 'REJECTED', transactionReference: 'OTHER' });
  const service = db.service(); const page = await service.listPendingProofs({ status: 'rejected', method: 'e_wallet', search: ' OTHER ',
    date: '2026-10-02', dateFrom: '2026-10-01', dateTo: '2026-10-03', page: '1', pageSize: '100' });
  assert.equal(page.items.length, 1); assert.equal(page.items[0].id, 99);
  const query = db.queries.at(-1)!; assert.equal(query.params['search'], 'OTHER'); assert.equal(query.params['method'], 'E_WALLET');
  for (const filter of ['@search', '@status', '@method', '@date', '@dateFrom', '@dateTo', '@offset', '@pageSize']) assert.ok(query.command.includes(filter));
  for (const input of [null, [], { page: 0 }, { page: '1.5' }, { page: '0x10' }, { page: Number.MAX_SAFE_INTEGER },
    { pageSize: 101 }, { pageSize: '0' }, { status: 'PAID' }, { method: 'CARD' }, { search: ['x'] }, { search: 'x'.repeat(201) },
    { date: '2026-02-30' }, { date: '0000-01-01' }, { dateFrom: '2026-10-03', dateTo: '2026-10-01' }, { order: 'random' }, { status: {} }]) {
    const invalid = new ReviewDb(); await assert.rejects(invalid.service().listPendingProofs(input), status(400)); assert.equal(invalid.queries.length, 0);
  }
});

test('detail supplies authorized metadata, booking/customer/payment/invoice/balance and file URL without private paths', async () => {
  const db = new ReviewDb(); db.proofs[0]!.originalFilename = 'C:\\private\\receipt.png';
  const detail = await db.service().getProofForReview(proof.id);
  assert.equal(detail.proof.id, proof.id); assert.equal(detail.proof.fileUrl, `/api/payment-proofs/${proof.id}/file`);
  assert.equal(detail.booking.id, 5); assert.equal(detail.booking.status, 'PAYMENT_SUBMITTED'); assert.equal(detail.customer.id, 7);
  assert.equal(detail.payment.amountDue, 100); assert.equal(detail.payment.amountPaid, 10); assert.equal(detail.payment.outstandingBalance, 90);
  assert.equal(detail.payment.requiredDeposit, 50); assert.equal(detail.payment.remainingDeposit, 40);
  assert.equal(detail.invoice.id, 8); assert.equal(detail.invoice.status, 'ISSUED'); assert.equal(detail.proof.originalFilename, 'receipt.png');
  assert.equal(JSON.stringify(detail).includes('private'), false); assert.equal('storageKey' in detail.proof, false);
  await assert.rejects(db.service().getProofForReview(99), status(404));
});

test('inclusive payment date filters accept SQL datetime2 endpoints without next-day overflow', async () => {
  const db = new ReviewDb(); const page = await db.service().listPendingProofs({ dateFrom: '0001-01-01', dateTo: '9999-12-31' });
  assert.equal(page.items.length, 1);
  assert.equal(db.queries.at(-1)!.params['dateFrom'], '0001-01-01'); assert.equal(db.queries.at(-1)!.params['dateTo'], '9999-12-31');
});

test('admin routes require real admin authentication, validate HTTP inputs and return safe results', async t => {
  const { default: adminRoutes } = await import('../routes/admin.routes.js');
  const { errorHandler } = await import('../middleware/error.middleware.js');
  const { hashSessionToken } = await import('../utils/session.js');
  const { closeDatabase } = await import('../config/database.js');
  const pool = { connected: true, request: () => {
    let token: unknown;
    return { input(_name: string, _type: unknown, value: unknown) { token = value; return this; },
      query: async () => ({ recordset: token === hashSessionToken('admin') ? [{ admin_id: 2, full_name: 'Admin', email: 'admin@example.test' }] : [] }) };
  }, close: async () => {} };
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => pool);
  const app = express().use(express.json()).use('/api/admin', adminRoutes).use(errorHandler);
  const server = createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api/admin/payment-proofs`;
  const request = (url = '', body?: unknown, cookie = 'la_chef_admin_session=admin') => fetch(`${base}${url}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body)
  });
  try {
    for (const path of ['', `/${proof.id}`, `/${proof.id}/verify`, `/${proof.id}/reject`]) {
      for (const cookie of ['', 'la_chef_session=customer', 'la_chef_admin_session=expired']) {
        assert.equal((await request(path, /verify|reject/.test(path) ? {} : undefined, cookie)).status, 401);
      }
    }
    // This is also an independent RED gate for the missing route, before service construction.
    assert.equal((await request('?pageSize=0')).status, 400);
    assert.ok(implementation);
    let db = new ReviewDb();
    for (const method of ['listPendingProofs', 'getProofForReview', 'verifyProof', 'rejectProof'] as const) {
      t.mock.method(implementation.paymentVerificationService, method, (...args: unknown[]) => db.service()[method](...args));
    }
    for (const path of ['/0', '/1.5', '/0x10', '/9007199254740992']) assert.equal((await request(path)).status, 400);
    for (const body of [{}, { verifiedAmount: '90' }, { verifiedAmount: 90, reason: 2 }, null, []]) {
      assert.equal((await request(`/${proof.id}/verify`, body)).status, 400);
    }
    assert.equal((await request(`/${proof.id}/reject`, { reason: ' ' })).status, 400);
    assert.equal((await request('/99')).status, 404);
    const listing = await request(); assert.equal(listing.status, 200); assert.equal(JSON.stringify(await listing.json()).includes('storageKey'), false);
    const detail = await request(`/${proof.id}`); assert.equal(detail.status, 200); assert.equal(JSON.stringify(await detail.json()).includes('private.png'), false);
    db.transactionId = '9007199254740993';
    const accepted = await request(`/${proof.id}/verify`, { verifiedAmount: 90 }); assert.equal(accepted.status, 200);
    assert.equal((await accepted.json() as { data: PaymentProofRecord }).data.paymentTransactionId, '9007199254740993');
    assert.equal(db.payment!.amountPaid, 100); assert.equal(db.proofs[0]!.reviewedBy, 2);
    const reviewedDetail = await request(`/${proof.id}`);
    assert.equal((await reviewedDetail.json() as { data: { proof: PaymentProofRecord } }).data.proof.paymentTransactionId, '9007199254740993');
    const reviewedList = await request('?status=VERIFIED');
    assert.equal((await reviewedList.json() as { data: { items: PaymentProofRecord[] } }).data.items[0]!.paymentTransactionId, '9007199254740993');
    assert.equal((await request(`/${proof.id}/verify`, { verifiedAmount: 90 })).status, 409);
    db = new ReviewDb(); const rejected = await request(`/${proof.id}/reject`, { reason: ' Invalid receipt ' });
    assert.equal(rejected.status, 200); assert.equal(db.booking!.status, 'AWAITING_PAYMENT'); assert.equal(db.payment!.amountPaid, 10);
  } finally { server.close(); await once(server, 'close'); await closeDatabase(); }
});
