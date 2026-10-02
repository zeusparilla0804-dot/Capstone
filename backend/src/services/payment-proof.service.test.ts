import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import type sql from 'mssql';
import type { ProofStorage, ValidatedProofFile } from './proof-storage.service.js';
import { AppError } from '../utils/app-error.js';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const { createPaymentProofService } = await import('./payment-proof.service.js');
const { paymentProofRoutes, proofFileRoutes } = await import('../routes/payment-proof.routes.js');
const { logger } = await import('../utils/logger.js');

const file = { path: 'temp', originalFilename: 'receipt.png', declaredMimeType: 'image/png', byteSize: 4,
  extension: 'png', mimeType: 'image/png', bytes: Buffer.from('data'), privateRoot: 'root' } as ValidatedProofFile;
const input = { method: 'BANK_TRANSFER', claimedAmount: 50.25, transactionReference: ' TX-1 ', paymentDate: '2026-10-02' };

class FakeDb {
  status = 'AWAITING_PAYMENT';
  owner = 7;
  exists = true;
  payment: { id: number; due: number; paid: number } | null = { id: 3, due: 100, paid: 10 };
  proofs: Record<string, unknown>[] = [];
  outbox: Record<string, unknown>[] = [];
  failQueue = false;
  history: Record<string, unknown>[] = [];
  queries: string[] = [];
  failOn: 'insert' | 'history' | 'commit' | 'commitAcknowledgement' | 'begin' | undefined;
  failReconciliation = false;
  reconciliations: string[] = [];
  timeline: string[] = [];
  duplicateError: unknown;
  events: string[] = [];
  saved: string[] = [];
  deleted: string[] = [];
  request = new FakeRequest(this, 'transaction') as unknown as sql.Request;
  storage: ProofStorage = {
    save: async proof => { assert.equal(proof.bytes.toString(), 'data'); this.timeline.push('save'); const key = `payment-proofs/${crypto.randomUUID()}.png`; this.saved.push(key); return { storageKey: key, originalFilename: proof.originalFilename, mimeType: proof.mimeType, byteSize: proof.byteSize }; },
    open: async () => Readable.from(['data']) as never,
    delete: async key => { this.timeline.push('delete'); this.deleted.push(key); }
  };
  service = createPaymentProofService({ storage: this.storage, readRequest: () => new FakeRequest(this, 'read') as unknown as sql.Request,
    transaction: async <T>(work: (request: sql.Request) => Promise<T>) => {
      this.timeline.push('begin');
      if (this.failOn === 'begin') throw new Error('begin failed');
      this.events.push('begin');
      const snapshot = { status: this.status, proofs: structuredClone(this.proofs), history: structuredClone(this.history), outbox: structuredClone(this.outbox) };
      let committed = false;
      try {
        const result = await work(this.request);
        if (this.failOn === 'commit') throw new Error('commit failed');
        committed = true;
        this.events.push('commit');
        if (this.failOn === 'commitAcknowledgement') throw new Error('commit acknowledgement lost');
        return result;
      } catch (error) {
        if (!committed) {
          this.status = snapshot.status; this.proofs = snapshot.proofs; this.history = snapshot.history; this.outbox = snapshot.outbox;
          this.events.push('rollback');
        }
        throw error;
      }
    } });
}

class FakeRequest {
  params: Record<string, unknown> = {};
  constructor(private db: FakeDb, private context: 'transaction' | 'read') {}
  input(name: string, _type: unknown, value: unknown) { this.params[name] = value; return this; }
  replaceInput(name: string, _type: unknown, value: unknown) { this.params[name] = value; return this; }
  async query(command: string) {
    const p = this.params; this.db.queries.push(command);
    if (/email outbox context.*customerEmail.*FROM dbo\.RESERVATION/is.test(command)) {
      assert.equal(this.context, 'transaction');
      return { recordset: [{ customerEmail: 'customer@example.test', customerName: 'Customer', bookingReference: 'BK-5', eventDate: '2026-12-01' }], rowsAffected: [1] };
    }
    if (/INSERT dbo\.EMAIL_OUTBOX/.test(command)) {
      assert.equal(this.context, 'transaction'); if (this.db.failQueue) throw new Error('outbox insert failed');
      this.db.outbox.push({ ...p }); return { recordset: [{ id: '9007199254740993' }], rowsAffected: [1] };
    }
    if (/WHERE storage_key=@storageKey/i.test(command)) {
      assert.equal(this.context, 'read', 'reconciliation must use a fresh non-transaction request');
      this.db.timeline.push('reconcile'); this.db.reconciliations.push(String(p['storageKey']));
      if (this.db.failReconciliation) throw new Error('query failed: private path and database details');
      return { recordset: this.db.proofs.filter(proof => proof.storageKey === p['storageKey']), rowsAffected: [1] };
    }
    if (/FROM dbo\.RESERVATION.*UPDLOCK/is.test(command)) return { recordset: this.db.exists ? [{ status: this.db.status, customerId: this.db.owner }] : [], rowsAffected: [1] };
    if (/FROM dbo\.PAYMENT\b/is.test(command)) return { recordset: this.db.payment ? [{ paymentId: this.db.payment.id, amountDue: this.db.payment.due, amountPaid: this.db.payment.paid }] : [], rowsAffected: [1] };
    if (/UPDATE dbo\.PAYMENT_PROOF/is.test(command)) { for (const proof of this.db.proofs) if (proof.status === 'SUBMITTED' && proof.reservationId === p['reservationId'] && proof.customerId === p['customerId']) proof.status = 'SUPERSEDED'; return { recordset: [], rowsAffected: [1] }; }
    if (/INSERT dbo\.PAYMENT_PROOF/is.test(command)) {
      if (this.db.duplicateError) throw this.db.duplicateError;
      if (this.db.failOn === 'insert') throw new Error('insert failed');
      if (p['transactionReference'] && this.db.proofs.some(proof => proof.transactionReference === p['transactionReference'])) throw Object.assign(new Error('duplicate'), { number: 2601 });
      const record = { id: this.db.proofs.length + 1, reservationId: p['reservationId'], customerId: p['customerId'], paymentId: p['paymentId'],
        method: p['method'], claimedAmount: p['claimedAmount'], transactionReference: p['transactionReference'], paymentDate: p['paymentDate'],
        storageKey: p['storageKey'], originalFilename: p['originalFilename'], mimeType: p['mimeType'], byteSize: p['byteSize'], status: 'SUBMITTED',
        rejectionReason: null, createdAt: new Date(), updatedAt: new Date() };
      this.db.proofs.push(record); return { recordset: [record], rowsAffected: [1] };
    }
    if (/UPDATE dbo\.RESERVATION/is.test(command)) { this.db.status = String(p['nextStatus']); return { recordset: [], rowsAffected: [1] }; }
    if (/INSERT dbo\.BOOKING_STATUS_HISTORY/is.test(command)) { if (this.db.failOn === 'history') throw new Error('history failed'); this.db.history.push({ ...p }); return { recordset: [], rowsAffected: [1] }; }
    if (/FROM dbo\.PAYMENT_PROOF/is.test(command)) {
      let rows = this.db.proofs;
      if (p['proofId'] !== undefined) rows = rows.filter(proof => proof.id === p['proofId']);
      else rows = rows.filter(proof => proof.reservationId === p['reservationId'] && proof.customerId === p['customerId']);
      return { recordset: [...rows].reverse(), rowsAffected: [rows.length] };
    }
    if (/FROM dbo\.RESERVATION/is.test(command)) return { recordset: this.db.exists && this.db.owner === p['customerId'] ? [{ id: 5 }] : [], rowsAffected: [1] };
    throw new Error(`Unexpected SQL: ${command}`);
  }
}

function status(code: number) { return (error: unknown) => { assert.ok(error instanceof AppError); assert.equal(error.statusCode, code); return true; }; }

test('eligible owner submits exact bytes and initial transition records customer history', async () => {
  const db = new FakeDb();
  const proof = await db.service.submitCustomerProof(7, 5, input, file);
  assert.equal(proof.status, 'SUBMITTED'); assert.equal(proof.transactionReference, 'TX-1');
  assert.equal(db.status, 'PAYMENT_SUBMITTED'); assert.equal(db.history.length, 1);
  assert.equal(db.history[0]?.['actorType'], 'CUSTOMER'); assert.equal(db.history[0]?.['actorId'], 7);
  assert.deepEqual(db.events, ['begin', 'commit']); assert.deepEqual(db.deleted, []);
  assert.match(db.queries[0]!, /UPDLOCK.*HOLDLOCK/i);
});

test('email outbox proof submissions and replacements queue safe intent within domain transaction', async () => {
  const db = new FakeDb(); await db.service.submitCustomerProof(7, 5, input, file);
  await db.service.submitCustomerProof(7, 5, { ...input, transactionReference: 'TX-2' }, file);
  assert.equal(db.outbox.length, 2); assert.ok(db.outbox.every(row => row['templateKey'] === 'PAYMENT_PROOF_SUBMITTED'));
  assert.equal(/storageKey|receipt.png|TX-1|payment-proofs/.test(JSON.stringify(db.outbox.map(row => JSON.parse(String(row['payload']))))), false);
  assert.equal(db.proofs[0]!['status'], 'SUPERSEDED');
});

test('email outbox failure rolls back proof and booking and cleans unreferenced stored file', async () => {
  const db = new FakeDb(); db.failQueue = true;
  await assert.rejects(db.service.submitCustomerProof(7, 5, input, file), /outbox insert failed/);
  assert.equal(db.proofs.length, 0); assert.equal(db.outbox.length, 0); assert.equal(db.history.length, 0);
  assert.equal(db.status, 'AWAITING_PAYMENT'); assert.deepEqual(db.deleted, db.saved); assert.deepEqual(db.events, ['begin', 'rollback']);
});

test('non-owner and missing booking are non-disclosing and reconcile stored files before cleanup', async () => {
  for (const missing of [false, true]) { const db = new FakeDb(); db.exists = !missing;
    await assert.rejects(db.service.submitCustomerProof(8, 5, input, file), status(404));
    assert.equal(db.saved.length, 1); assert.deepEqual(db.reconciliations, db.saved); assert.deepEqual(db.deleted, db.saved); }
});

test('ineligible status and payment balance conflicts reject submission', async () => {
  for (const setup of [(db: FakeDb) => { db.status = 'PENDING'; }, (db: FakeDb) => { db.payment = null; },
    (db: FakeDb) => { db.payment!.paid = 100; }, (db: FakeDb) => { db.payment!.due = 50; }]) {
    const db = new FakeDb(); setup(db); await assert.rejects(db.service.submitCustomerProof(7, 5, input, file), status(409));
    assert.equal(db.saved.length, 1); assert.deepEqual(db.reconciliations, db.saved); assert.deepEqual(db.deleted, db.saved);
  }
});

test('method, reference, date, amount, and identifiers are validated before SQL', async () => {
  const invalid = [
    { ...input, method: 'CARD' }, { ...input, transactionReference: '  ' }, { ...input, transactionReference: 'x'.repeat(151) },
    { ...input, paymentDate: '2026-02-30' }, { ...input, paymentDate: '10/02/2026' },
    { ...input, claimedAmount: 0 }, { ...input, claimedAmount: -1 }, { ...input, claimedAmount: 1.001 }, { ...input, claimedAmount: Number.POSITIVE_INFINITY }
  ];
  for (const item of invalid) { const db = new FakeDb(); await assert.rejects(db.service.submitCustomerProof(7, 5, item as never, file), status(400)); assert.equal(db.queries.length, 0); }
  const db = new FakeDb(); await assert.rejects(db.service.submitCustomerProof(7, Number.MAX_SAFE_INTEGER + 1, input, file), status(400));
});

test('cash may omit reference but transfer may not', async () => {
  const db = new FakeDb(); await db.service.submitCustomerProof(7, 5, { ...input, method: 'CASH', transactionReference: undefined }, file);
  assert.equal(db.proofs[0]?.transactionReference, null);
  const other = new FakeDb(); await assert.rejects(other.service.submitCustomerProof(7, 5, { ...input, method: 'E_WALLET', transactionReference: undefined }, file), status(400));
});

test('global duplicate reference maps to conflict and deletes new stored file', async () => {
  const db = new FakeDb(); db.proofs.push({ id: 99, transactionReference: 'TX-1', status: 'REJECTED' });
  await assert.rejects(db.service.submitCustomerProof(7, 5, input, file), status(409));
  assert.deepEqual(db.events, ['begin', 'rollback']); assert.deepEqual(db.deleted, db.saved);
});

test('replacement supersedes submitted proofs without a self-transition', async () => {
  const db = new FakeDb(); db.status = 'PAYMENT_SUBMITTED'; db.proofs.push({ id: 1, status: 'SUBMITTED', reservationId: 5, customerId: 7 });
  await db.service.submitCustomerProof(7, 5, { ...input, transactionReference: 'TX-2' }, file);
  assert.equal(db.proofs[0]?.status, 'SUPERSEDED'); assert.equal(db.proofs[1]?.status, 'SUBMITTED');
  assert.equal(db.history.length, 0); assert.equal(db.status, 'PAYMENT_SUBMITTED');
});

test('database failure rolls back status and proofs and removes stored file', async () => {
  for (const failOn of ['insert', 'history', 'commit'] as const) { const db = new FakeDb(); db.failOn = failOn;
    await assert.rejects(db.service.submitCustomerProof(7, 5, input, file), /failed/);
    assert.equal(db.status, 'AWAITING_PAYMENT'); assert.equal(db.proofs.length, 0);
    assert.deepEqual(db.events, ['begin', 'rollback']); assert.deepEqual(db.deleted, db.saved);
  }
});

test('listing verifies owner and returns newest proofs including rejection reason', async () => {
  const db = new FakeDb(); db.proofs.push({ ...proofRow, id: 1, status: 'REJECTED', rejectionReason: 'Unreadable' },
    { ...proofRow, id: 2, status: 'SUBMITTED' });
  const list = await db.service.listCustomerProofs(7, 5);
  assert.deepEqual(list.map(proof => proof.id), [2, 1]); assert.equal(list[1]?.rejectionReason, 'Unreadable');
  await assert.rejects(db.service.listCustomerProofs(8, 5), status(404));
  assert.match(db.queries.at(-2)!, /ORDER BY.*created_at DESC/is);
});

test('owner and admin may open proof, other customer and missing proof get 404', async () => {
  const db = new FakeDb(); db.proofs.push({ ...proofRow });
  assert.equal((await db.service.openAuthorizedProof({ type: 'CUSTOMER', id: 7 }, 1)).proof.id, 1);
  assert.equal((await db.service.openAuthorizedProof({ type: 'ADMIN', id: 3 }, 1)).proof.id, 1);
  await assert.rejects(db.service.openAuthorizedProof({ type: 'CUSTOMER', id: 8 }, 1), status(404));
  await assert.rejects(db.service.openAuthorizedProof({ type: 'ADMIN', id: 3 }, 99), status(404));
});

test('customer proof list and authorized open preserve the exact bigint transaction identity', async () => {
  const db = new FakeDb(); db.proofs.push({ ...proofRow, status: 'VERIFIED', paymentTransactionId: '9007199254740993' });
  const list = await db.service.listCustomerProofs(7, 5);
  assert.equal(list[0]!.paymentTransactionId, '9007199254740993');
  const opened = await db.service.openAuthorizedProof({ type: 'ADMIN', id: 3 }, 1);
  assert.equal(opened.proof.paymentTransactionId, '9007199254740993');
  assert.equal(JSON.parse(JSON.stringify(opened.proof)).paymentTransactionId, '9007199254740993');
  for (const command of db.queries.filter(command => /FROM dbo\.PAYMENT_PROOF/.test(command))) {
    assert.match(command, /CONVERT\(varchar\(20\),\s*payment_transaction_id\) paymentTransactionId/i);
  }
});

test('submission projects its nullable transaction identity as text in SQL OUTPUT', async () => {
  const db = new FakeDb(); const submitted = await db.service.submitCustomerProof(7, 5, input, file);
  assert.equal(submitted.paymentTransactionId, undefined);
  const command = db.queries.find(command => /INSERT dbo\.PAYMENT_PROOF/.test(command)); assert.ok(command);
  assert.match(command, /CONVERT\(varchar\(20\),\s*INSERTED\.payment_transaction_id\) paymentTransactionId/i);
});

const proofRow = { id: 1, reservationId: 5, customerId: 7, paymentId: 3,
  method: 'BANK_TRANSFER', claimedAmount: 50.25, transactionReference: 'OLD',
  paymentDate: new Date('2026-10-02'), createdAt: new Date('2026-10-02'), updatedAt: new Date('2026-10-02'),
  storageKey: 'payment-proofs/file.png', originalFilename: 'receipt.png', mimeType: 'image/png', byteSize: 4, status: 'SUBMITTED' };

test('amount validation rejects tiny excess precision and multipart coercion tricks', async () => {
  for (const claimedAmount of [1.0000000001, '1.0000000001', '0x10', '1e1', '', ' ', null, true, [], ['10'], '1.001', NaN]) {
    const db = new FakeDb();
    await assert.rejects(db.service.submitCustomerProof(7, 5, { ...input, claimedAmount } as never, file), status(400));
    assert.deepEqual(db.events, []);
  }
});

test('ordinary decimal amounts, multipart strings, leap dates and trimmed references are accepted', async () => {
  for (const claimedAmount of [0.29, 1.1, ' 50.25 ']) {
    const db = new FakeDb();
    const proof = await db.service.submitCustomerProof(7, 5, { ...input, claimedAmount, paymentDate: '2024-02-29' } as never, file);
    assert.equal(proof.claimedAmount, Number(claimedAmount));
    assert.equal(proof.paymentDate, '2024-02-29');
  }
});

test('boundary validation rejects invalid methods, references, calendars and IDs without storage', async () => {
  for (const raw of [null, {}, { ...input, method: ['CASH'] }, { ...input, transactionReference: 12 },
    { ...input, transactionReference: null }, { ...input, paymentDate: '2025-02-29' }, { ...input, paymentDate: '2026-13-01' }]) {
    const db = new FakeDb();
    await assert.rejects(db.service.submitCustomerProof(7, 5, raw as never, file), status(400));
    assert.deepEqual(db.saved, []);
  }
  for (const invalid of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const db = new FakeDb();
    await assert.rejects(db.service.listCustomerProofs(7, invalid), status(400));
    await assert.rejects(db.service.openAuthorizedProof({ type: 'ADMIN', id: 3 }, invalid), status(400));
    await assert.rejects(db.service.submitCustomerProof(invalid, 5, input, file), status(400));
  }
});

test('replacement preserves reviewed and unrelated proofs and locks the balance before proof writes', async () => {
  const db = new FakeDb(); db.status = 'PAYMENT_SUBMITTED';
  db.proofs.push({ ...proofRow }, { ...proofRow, id: 2 }, { ...proofRow, id: 3, status: 'REJECTED' },
    { ...proofRow, id: 4, reservationId: 6 }, { ...proofRow, id: 5, customerId: 8 });
  await db.service.submitCustomerProof(7, 5, { ...input, transactionReference: 'NEW' }, file);
  assert.deepEqual(db.proofs.map(row => row.status), ['SUPERSEDED', 'SUPERSEDED', 'REJECTED', 'SUBMITTED', 'SUBMITTED', 'SUBMITTED']);
  assert.match(db.queries[1]!, /PAYMENT WITH\(UPDLOCK,HOLDLOCK\)/);
  assert.match(db.queries[2]!, /reservation_id=@reservationId AND customer_id=@customerId AND status='SUBMITTED'/);
  assert.equal(db.history.length, 0);
  assert.equal(db.payment!.paid, 10);
});

test('failed replacement restores prior submitted proof even when commit fails', async () => {
  for (const failOn of ['insert', 'commit'] as const) {
    const db = new FakeDb(); db.status = 'PAYMENT_SUBMITTED'; db.failOn = failOn;
    db.proofs.push({ ...proofRow });
    await assert.rejects(db.service.submitCustomerProof(7, 5, input, file), /failed/);
    assert.deepEqual(db.proofs, [{ ...proofRow }]);
    assert.equal(db.status, 'PAYMENT_SUBMITTED'); assert.deepEqual(db.history, []);
    assert.deepEqual(db.deleted, db.saved);
  }
});

test('both SQL duplicate codes and nested driver errors become clear conflicts after cleanup', async () => {
  for (const duplicateError of [{ number: 2627 }, { originalError: { info: { number: 2601 } } }]) {
    const db = new FakeDb(); db.duplicateError = duplicateError;
    await assert.rejects(db.service.submitCustomerProof(7, 5, input, file), error => {
      status(409)(error); assert.match((error as AppError).message, /reference.*already.*used/i); return true;
    });
    assert.deepEqual(db.deleted, db.saved);
  }
});

test('cleanup failure logs safely and preserves the original database failure', async t => {
  const db = new FakeDb(); db.failOn = 'insert';
  const warnings: string[] = [];
  t.mock.method(logger, 'warn', (event: string, message: string) => { warnings.push(`${event}: ${message}`); });
  db.storage.delete = async () => { throw new Error('cleanup failed: private path and database details'); };
  await assert.rejects(db.service.submitCustomerProof(7, 5, input, file), /insert failed/);
  assert.equal(warnings.length, 1); assert.match(warnings[0]!, /cleanup/i);
  assert.equal(warnings.join('').includes('private path'), false);
  assert.equal(warnings.join('').includes(db.saved[0]!), false);
});

test('missing file and storage failure do not leave database writes', async () => {
  const db = new FakeDb();
  await assert.rejects(db.service.submitCustomerProof(7, 5, input, undefined as never), status(400));
  db.storage.save = async () => { throw new Error('storage failed'); };
  await assert.rejects(db.service.submitCustomerProof(7, 5, input, file), /storage failed/);
  assert.deepEqual(db.proofs, []); assert.deepEqual(db.history, []); assert.deepEqual(db.deleted, []);
});

test('proof authorization requires current booking ownership before opening storage', async () => {
  const db = new FakeDb(); db.proofs.push({ ...proofRow }); db.owner = 8;
  let opened = 0; db.storage.open = async () => { opened++; return Readable.from(['data']) as never; };
  await assert.rejects(db.service.openAuthorizedProof({ type: 'CUSTOMER', id: 7 }, 1), status(404));
  assert.equal(opened, 0);
  await db.service.openAuthorizedProof({ type: 'ADMIN', id: 3 }, 1);
  assert.equal(opened, 1);
});

test('safe identifiers beyond the booking schema int range return 404 without overflowing SQL parameters', async () => {
  for (const [customerId, reservationId] of [[7, 2_147_483_648], [7, Number.MAX_SAFE_INTEGER], [2_147_483_648, 5]]) {
    const db = new FakeDb();
    await assert.rejects(db.service.submitCustomerProof(customerId!, reservationId!, input, file), status(404));
    await assert.rejects(db.service.listCustomerProofs(customerId!, reservationId!), status(404));
    assert.deepEqual(db.queries, []); assert.deepEqual(db.saved, []);
  }
});

test('finite whole amounts above the balance are domain conflicts, including large amounts', async () => {
  for (const claimedAmount of [100_000_000, '100000000', 1e308]) {
    const db = new FakeDb();
    await assert.rejects(db.service.submitCustomerProof(7, 5, { ...input, claimedAmount } as never, file), status(409));
    assert.equal(db.saved.length, 1); assert.deepEqual(db.reconciliations, db.saved); assert.deepEqual(db.deleted, db.saved);
  }
});

test('storage completes before transaction acquisition and all locked eligibility checks run afterward', async () => {
  for (const { mutate, code } of [{ mutate: (db: FakeDb) => { db.owner = 8; }, code: 404 },
    { mutate: (db: FakeDb) => { db.status = 'CONFIRMED'; }, code: 409 },
    { mutate: (db: FakeDb) => { db.payment = null; }, code: 409 },
    { mutate: (db: FakeDb) => { db.payment!.paid = 100; }, code: 409 }]) {
    const db = new FakeDb(); const save = db.storage.save;
    db.storage.save = async validated => { const stored = await save(validated); mutate(db); return stored; };
    await assert.rejects(db.service.submitCustomerProof(7, 5, input, file), status(code));
    assert.deepEqual(db.timeline, ['save', 'begin', 'reconcile', 'delete']);
    assert.deepEqual(db.proofs, []);
    assert.match(db.queries[0]!, /RESERVATION WITH\(UPDLOCK,HOLDLOCK\)/);
  }
});

test('pre-commit rollback reconciles exact generated key and deletes only its unreferenced file', async () => {
  const db = new FakeDb(); db.failOn = 'insert'; db.proofs.push({ ...proofRow });
  await assert.rejects(db.service.submitCustomerProof(7, 5, input, file), /insert failed/);
  assert.deepEqual(db.reconciliations, db.saved); assert.deepEqual(db.deleted, db.saved);
  assert.deepEqual(db.proofs, [{ ...proofRow }]);
  assert.deepEqual(db.timeline, ['save', 'begin', 'reconcile', 'delete']);
  assert.match(db.queries.at(-1)!, /WITH\(READCOMMITTEDLOCK\)/);
});

test('commit applied but acknowledgement lost preserves the referenced file and committed state', async t => {
  const db = new FakeDb(); db.failOn = 'commitAcknowledgement';
  t.mock.method(logger, 'warn', () => {});
  await assert.rejects(db.service.submitCustomerProof(7, 5, input, file), /acknowledgement lost/);
  assert.deepEqual(db.events, ['begin', 'commit']); assert.equal(db.status, 'PAYMENT_SUBMITTED');
  assert.equal(db.history.length, 1); assert.equal(db.proofs[0]?.storageKey, db.saved[0]);
  assert.deepEqual(db.deleted, []); assert.deepEqual(db.reconciliations, db.saved);
});

test('failed reconciliation preserves file and primary failure with a safe warning', async t => {
  const db = new FakeDb(); db.failOn = 'commit'; db.failReconciliation = true;
  const warnings: string[] = [];
  t.mock.method(logger, 'warn', (event: string, message: string) => { warnings.push(`${event}: ${message}`); });
  await assert.rejects(db.service.submitCustomerProof(7, 5, input, file), /commit failed/);
  assert.deepEqual(db.deleted, []); assert.deepEqual(db.reconciliations, db.saved);
  assert.equal(warnings.length, 1); assert.match(warnings[0]!, /preserv|retain/i);
  assert.equal(warnings.join('').includes('private path'), false); assert.equal(warnings.join('').includes(db.saved[0]!), false);
});

test('failed transaction acquisition also reconciles and deletes a definitively absent proof', async () => {
  const db = new FakeDb(); db.failOn = 'begin';
  await assert.rejects(db.service.submitCustomerProof(7, 5, input, file), /begin failed/);
  assert.deepEqual(db.timeline, ['save', 'begin', 'reconcile', 'delete']);
  assert.deepEqual(db.deleted, db.saved);
});

test('year zero is rejected before storage or SQL while DateTime2 boundary years remain valid', async () => {
  const invalid = new FakeDb();
  await assert.rejects(invalid.service.submitCustomerProof(7, 5, { ...input, paymentDate: '0000-01-01' }, file), status(400));
  assert.deepEqual(invalid.saved, []); assert.deepEqual(invalid.queries, []);
  for (const paymentDate of ['0001-01-01', '9999-12-31']) {
    const db = new FakeDb();
    assert.equal((await db.service.submitCustomerProof(7, 5, { ...input, paymentDate }, file)).paymentDate, paymentDate);
  }
});

test('payment proof routes expose upload, list, and authorized file endpoints', () => {
  const bookingPaths = (paymentProofRoutes as unknown as { stack: { route?: { path: string; methods: Record<string, boolean> } }[] }).stack.filter(layer => layer.route).map(layer => [layer.route!.path, layer.route!.methods]);
  assert.ok(bookingPaths.some(([path, methods]) => path === '/:id/payment-proofs' && (methods as Record<string, boolean>).post));
  assert.ok(bookingPaths.some(([path, methods]) => path === '/:id/payment-proofs' && (methods as Record<string, boolean>).get));
  assert.ok((proofFileRoutes as unknown as { stack: { route?: { path: string } }[] }).stack.some(layer => layer.route?.path === '/:id/file'));
});
