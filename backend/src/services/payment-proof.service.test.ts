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

const file = { path: 'temp', originalFilename: 'receipt.png', declaredMimeType: 'image/png', byteSize: 4,
  extension: 'png', mimeType: 'image/png', bytes: Buffer.from('data'), privateRoot: 'root' } as ValidatedProofFile;
const input = { method: 'BANK_TRANSFER', claimedAmount: 50.25, transactionReference: ' TX-1 ', paymentDate: '2026-10-02' };

class FakeDb {
  status = 'AWAITING_PAYMENT';
  owner = 7;
  exists = true;
  payment: { id: number; due: number; paid: number } | null = { id: 3, due: 100, paid: 10 };
  proofs: Record<string, unknown>[] = [];
  history: Record<string, unknown>[] = [];
  queries: string[] = [];
  failOn: 'insert' | 'history' | 'commit' | undefined;
  duplicateError: unknown;
  events: string[] = [];
  saved: string[] = [];
  deleted: string[] = [];
  request = new FakeRequest(this) as unknown as sql.Request;
  storage: ProofStorage = {
    save: async proof => { assert.equal(proof.bytes.toString(), 'data'); this.saved.push('payment-proofs/file.png'); return { storageKey: 'payment-proofs/file.png', originalFilename: proof.originalFilename, mimeType: proof.mimeType, byteSize: proof.byteSize }; },
    open: async () => Readable.from(['data']) as never,
    delete: async key => { this.deleted.push(key); }
  };
  service = createPaymentProofService({ storage: this.storage, readRequest: () => this.request,
    transaction: async <T>(work: (request: sql.Request) => Promise<T>) => {
      this.events.push('begin');
      const snapshot = { status: this.status, proofs: structuredClone(this.proofs), history: structuredClone(this.history) };
      try {
        const result = await work(this.request);
        if (this.failOn === 'commit') throw new Error('commit failed');
        this.events.push('commit');
        return result;
      } catch (error) {
        this.status = snapshot.status; this.proofs = snapshot.proofs; this.history = snapshot.history;
        this.events.push('rollback');
        throw error;
      }
    } });
}

class FakeRequest {
  params: Record<string, unknown> = {};
  constructor(private db: FakeDb) {}
  input(name: string, _type: unknown, value: unknown) { this.params[name] = value; return this; }
  replaceInput(name: string, _type: unknown, value: unknown) { this.params[name] = value; return this; }
  async query(command: string) {
    const p = this.params; this.db.queries.push(command);
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

test('non-owner and missing booking are non-disclosing and never save', async () => {
  for (const missing of [false, true]) { const db = new FakeDb(); db.exists = !missing;
    await assert.rejects(db.service.submitCustomerProof(8, 5, input, file), status(404)); assert.equal(db.saved.length, 0); }
});

test('ineligible status and payment balance conflicts reject submission', async () => {
  for (const setup of [(db: FakeDb) => { db.status = 'PENDING'; }, (db: FakeDb) => { db.payment = null; },
    (db: FakeDb) => { db.payment!.paid = 100; }, (db: FakeDb) => { db.payment!.due = 50; }]) {
    const db = new FakeDb(); setup(db); await assert.rejects(db.service.submitCustomerProof(7, 5, input, file), status(409)); assert.equal(db.saved.length, 0);
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
  assert.deepEqual(db.events, ['begin', 'rollback']); assert.deepEqual(db.deleted, ['payment-proofs/file.png']);
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
    assert.deepEqual(db.events, ['begin', 'rollback']); assert.deepEqual(db.deleted, ['payment-proofs/file.png']);
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

test('replacement preserves reviewed and unrelated proofs and locks the balance before storage', async () => {
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
    assert.deepEqual(db.deleted, ['payment-proofs/file.png']);
  }
});

test('both SQL duplicate codes and nested driver errors become clear conflicts after cleanup', async () => {
  for (const duplicateError of [{ number: 2627 }, { originalError: { info: { number: 2601 } } }]) {
    const db = new FakeDb(); db.duplicateError = duplicateError;
    await assert.rejects(db.service.submitCustomerProof(7, 5, input, file), error => {
      status(409)(error); assert.match((error as AppError).message, /reference.*already.*used/i); return true;
    });
    assert.deepEqual(db.deleted, ['payment-proofs/file.png']);
  }
});

test('cleanup failure preserves the original database failure', async () => {
  const db = new FakeDb(); db.failOn = 'insert';
  db.storage.delete = async () => { throw new Error('cleanup failed'); };
  await assert.rejects(db.service.submitCustomerProof(7, 5, input, file), /insert failed/);
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
    assert.deepEqual(db.saved, []);
  }
});

test('payment proof routes expose upload, list, and authorized file endpoints', () => {
  const bookingPaths = (paymentProofRoutes as unknown as { stack: { route?: { path: string; methods: Record<string, boolean> } }[] }).stack.filter(layer => layer.route).map(layer => [layer.route!.path, layer.route!.methods]);
  assert.ok(bookingPaths.some(([path, methods]) => path === '/:id/payment-proofs' && (methods as Record<string, boolean>).post));
  assert.ok(bookingPaths.some(([path, methods]) => path === '/:id/payment-proofs' && (methods as Record<string, boolean>).get));
  assert.ok((proofFileRoutes as unknown as { stack: { route?: { path: string } }[] }).stack.some(layer => layer.route?.path === '/:id/file'));
});
