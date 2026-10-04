import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import type { Request, Response } from 'express';
import sql from 'mssql';

const uploadRoot = await mkdtemp(path.join(tmpdir(), 'proof-routes-'));
process.env.NODE_ENV = 'test';
process.env.FRONTEND_URL = 'http://localhost:4200';
process.env.DB_SERVER = 'localhost';
process.env.DB_DATABASE = 'test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.PAYMENT_PROOF_UPLOAD_ROOT = uploadRoot;

const { default: app } = await import('../app.js');
const { createPaymentProofService, paymentProofService } = await import('../services/payment-proof.service.js');
const { proofStorage } = await import('../config/uploads.js');
const { downloadProof, safeProofFilename } = await import('../controllers/payment-proof.controller.js');
const { hashSessionToken } = await import('../utils/session.js');
const { closeDatabase } = await import('../config/database.js');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64');
const ownerCookie = 'la_chef_session=owner';
const otherCookie = 'la_chef_session=other';
const adminCookie = 'la_chef_admin_session=admin';

test('mounted proof routes integrate sessions, multipart, private storage and authorized streaming', async t => {
  let bookingStatus = 'AWAITING_PAYMENT';
  let rows: Record<string, unknown>[] = [];
  let outbox: Record<string, unknown>[] = [];
  let failCommit = false;
  let loseCommitAcknowledgement = false;
  const request = () => {
    const params: Record<string, unknown> = {};
    const runner = {
      input(name: string, _type: unknown, value: unknown) { params[name] = value; return runner; },
      replaceInput(name: string, _type: unknown, value: unknown) { params[name] = value; return runner; },
      async query(command: string) {
        let recordset: Record<string, unknown>[] = [];
        if (command.includes('dbo.ADMIN_SESSION')) {
          if (params['tokenHash'] === hashSessionToken('admin')) recordset = [{ admin_id: 3, full_name: 'Admin', email: 'admin@example.test' }];
        } else if (command.includes('dbo.AUTH_SESSION')) {
          const customerId = params['tokenHash'] === hashSessionToken('owner') ? 7 : params['tokenHash'] === hashSessionToken('other') ? 8 : undefined;
          if (customerId) recordset = [{ customer_id: customerId, first_name: 'Test', last_name: 'Customer', email: 'customer@example.test' }];
        } else if (/FROM dbo\.RESERVATION.*UPDLOCK/is.test(command)) {
          if (params['reservationId'] === 5) recordset = [{ status: bookingStatus, customerId: 7 }];
        } else if (/email outbox context.*customerEmail.*FROM dbo\.RESERVATION/is.test(command)) {
          if (params['notificationReservationId'] === 5) recordset = [{ customerEmail: 'customer@example.test',
            customerName: 'Test Customer', bookingReference: 'BK-5', eventDate: '2026-12-01' }];
        } else if (/FROM dbo\.RESERVATION/is.test(command)) {
          if (params['reservationId'] === 5 && params['customerId'] === 7) recordset = [{ id: 5 }];
        } else if (/FROM dbo\.PAYMENT\b/i.test(command)) {
          recordset = [{ paymentId: 3, amountDue: 100, amountPaid: 10 }];
        } else if (/INSERT dbo\.PAYMENT_PROOF/i.test(command)) {
          const row = { ...params, id: rows.length + 1, status: 'SUBMITTED', createdAt: new Date(), updatedAt: new Date() };
          rows.push(row); recordset = [row];
        } else if (/UPDATE dbo\.PAYMENT_PROOF/i.test(command)) {
          rows.forEach(row => { if (row.status === 'SUBMITTED') row.status = 'SUPERSEDED'; });
        } else if (/UPDATE dbo\.RESERVATION/i.test(command)) {
          bookingStatus = String(params['nextStatus']);
        } else if (/INSERT dbo\.BOOKING_STATUS_HISTORY/i.test(command)) {
          // History semantics are covered by the service suite.
        } else if (/INSERT dbo\.EMAIL_OUTBOX/i.test(command)) {
          const row = { ...params, id: String(outbox.length + 1), status: 'PENDING', attemptCount: 0 };
          outbox.push(row); recordset = [{ id: row.id }];
        } else if (/FROM dbo\.PAYMENT_PROOF/i.test(command)) {
          recordset = params['storageKey'] !== undefined ? rows.filter(row => row.storageKey === params['storageKey']) :
            params['proofId'] !== undefined ? rows.filter(row => row.id === params['proofId']) :
            rows.filter(row => row.customerId === params['customerId'] && row.reservationId === params['reservationId']).toReversed();
        } else { throw new Error(`Unexpected SQL: ${command}`); }
        return { recordset, rowsAffected: [recordset.length || 1] };
      }
    };
    return runner as unknown as sql.Request;
  };
  const pool = { connected: true, request, close: async () => {} };
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => pool);
  const service = createPaymentProofService({ storage: proofStorage, readRequest: request,
    transaction: async work => {
      const snapshot = { rows: structuredClone(rows), outbox: structuredClone(outbox), status: bookingStatus };
      let committed = false;
      try {
        const result = await work(request()); if (failCommit) throw new Error('commit failed');
        committed = true;
        if (loseCommitAcknowledgement) throw new Error('commit acknowledgement lost');
        return result;
      } catch (error) { if (!committed) { rows = snapshot.rows; outbox = snapshot.outbox; bookingStatus = snapshot.status; } throw error; }
    } });
  for (const method of ['submitCustomerProof', 'listCustomerProofs', 'openAuthorizedProof'] as const) {
    t.mock.method(paymentProofService, method, service[method]);
  }
  const server = createServer(app);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const post = (cookie: string, options: { field?: string; withFile?: boolean; amount?: string } = {}) => {
    const body = new FormData();
    body.set('method', 'BANK_TRANSFER'); body.set('claimedAmount', options.amount ?? '50.25');
    body.set('transactionReference', ' TX-HTTP '); body.set('paymentDate', '2026-10-02');
    if (options.withFile !== false) body.set(options.field ?? 'proof', new Blob([png], { type: 'image/png' }), 'receipt.png');
    return fetch(`${base}/api/bookings/5/payment-proofs`, { method: 'POST', headers: { cookie }, body });
  };
  try {
    await t.test('unauthenticated, admin-only, missing-file and incorrect multipart fields are rejected', async () => {
      for (const cookie of ['', adminCookie, 'la_chef_session=expired']) assert.equal((await post(cookie)).status, 401);
      assert.equal((await post(ownerCookie, { withFile: false })).status, 400);
      assert.equal((await post(ownerCookie, { field: 'receipt' })).status, 400);
      assert.equal((await post(ownerCookie, { amount: '1.001' })).status, 400);
      assert.equal((await post(otherCookie)).status, 404);
      assert.equal(rows.length, 0);
    });
    await t.test('valid multipart submission returns metadata without private paths and stores exact validated bytes', async () => {
      const response = await post(ownerCookie);
      assert.equal(response.status, 201);
      const json = await response.json() as { data: Record<string, unknown> };
      assert.equal(json.data['claimedAmount'], 50.25); assert.equal(json.data['transactionReference'], 'TX-HTTP');
      assert.equal('storageKey' in json.data, false);
      assert.equal(JSON.stringify(json).includes(uploadRoot), false);
      assert.deepEqual(await readFile(path.join(uploadRoot, String(rows[0]!['storageKey']))), png);
      assert.equal(bookingStatus, 'PAYMENT_SUBMITTED');
    });
    await t.test('listing is customer-owned and does not disclose storage keys', async () => {
      const response = await fetch(`${base}/api/bookings/5/payment-proofs`, { headers: { cookie: ownerCookie } });
      assert.equal(response.status, 200);
      const body = await response.json() as { data: Record<string, unknown>[] };
      assert.equal(body.data.length, 1); assert.equal('storageKey' in body.data[0]!, false);
      const other = await fetch(`${base}/api/bookings/5/payment-proofs`, { headers: { cookie: otherCookie } });
      const missing = await fetch(`${base}/api/bookings/999/payment-proofs`, { headers: { cookie: ownerCookie } });
      assert.equal(other.status, 404); assert.equal(missing.status, 404);
      assert.deepEqual(await other.json(), await missing.json());
    });
    await t.test('owner, admin and valid fallback sessions receive exact bytes and safe download headers', async () => {
      rows[0]!['originalFilename'] = 'C:\\private\\secret/receipt"\r\nX-Evil: yes.png';
      for (const cookie of [ownerCookie, adminCookie, `${ownerCookie}; la_chef_admin_session=expired`, `${otherCookie}; ${adminCookie}`]) {
        const response = await fetch(`${base}/api/payment-proofs/1/file`, { headers: { cookie } });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('content-type'), 'image/png');
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(response.headers.get('cache-control'), 'private, no-store');
        assert.equal(response.headers.get('content-disposition'), 'attachment; filename="receipt___X-Evil: yes.png"');
        assert.equal(response.headers.get('x-evil'), null);
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
      }
    });
    await t.test('authorized inline previews retain private cache and nosniff headers', async () => {
      const response = await fetch(`${base}/api/payment-proofs/1/file?view=inline`, { headers: { cookie: adminCookie } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-disposition'), 'inline; filename="receipt___X-Evil: yes.png"');
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-site');
    });
    await t.test('unauthorized and missing files have identical non-disclosing responses', async () => {
      const other = await fetch(`${base}/api/payment-proofs/1/file`, { headers: { cookie: otherCookie } });
      const missing = await fetch(`${base}/api/payment-proofs/999/file`, { headers: { cookie: ownerCookie } });
      assert.equal(other.status, 404); assert.equal(missing.status, 404);
      assert.deepEqual(await other.json(), await missing.json());
      for (const cookie of ['', 'la_chef_session=expired; la_chef_admin_session=expired']) {
        assert.equal((await fetch(`${base}/api/payment-proofs/1/file`, { headers: { cookie } })).status, 401);
      }
      assert.equal((await fetch(`${base}/api/payment-proofs/9007199254740992/file`, { headers: { cookie: adminCookie } })).status, 400);
      assert.equal((await fetch(`${base}/api/payment-proofs/0/file`, { headers: { cookie: adminCookie } })).status, 400);
    });
    await t.test('real stored files are removed on commit failure while replacement data rolls back', async () => {
      const before = await readdir(path.join(uploadRoot, 'payment-proofs'));
      failCommit = true;
      const response = await post(ownerCookie);
      assert.equal(response.status, 500); assert.equal(rows.length, 1); assert.equal(rows[0]!['status'], 'SUBMITTED');
      assert.deepEqual(await readdir(path.join(uploadRoot, 'payment-proofs')), before);
      assert.deepEqual(await response.json(), { success: false, message: 'Internal server error.' });
      failCommit = false;
    });
    await t.test('temporary lifecycle cleanup leaves successful stored files intact and no static upload exposure', async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.deepEqual(await readdir(path.join(uploadRoot, '.tmp')), []);
      assert.equal((await readdir(path.join(uploadRoot, 'payment-proofs'))).length, 1);
      assert.equal((await fetch(`${base}/${String(rows[0]!['storageKey'])}`)).status, 404);
    });
    await t.test('lost commit acknowledgement keeps the committed replacement readable from real disk', async () => {
      loseCommitAcknowledgement = true;
      const response = await post(ownerCookie);
      assert.equal(response.status, 500); assert.equal(rows.length, 2);
      assert.equal(rows[0]!['status'], 'SUPERSEDED'); assert.equal(rows[1]!['status'], 'SUBMITTED');
      const download = await fetch(`${base}/api/payment-proofs/2/file`, { headers: { cookie: ownerCookie } });
      assert.equal(download.status, 200);
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
      assert.equal((await readdir(path.join(uploadRoot, 'payment-proofs'))).length, 2);
      loseCommitAcknowledgement = false;
    });
  } finally {
    server.close(); await once(server, 'close'); await closeDatabase();
  }
});

test('filename sanitization handles control bytes, Unicode, paths, empty names and length limits', () => {
  assert.equal(safeProofFilename('C:\\private\\receipt.png'), 'receipt.png');
  assert.equal(safeProofFilename('../../receipt.png'), 'receipt.png');
  assert.equal(safeProofFilename(''), 'payment-proof');
  assert.equal(safeProofFilename('a'.repeat(300)).length, 180);
  assert.match(safeProofFilename('\u0000\u007f\u0080\u2028".png'), /^[\x20-\x7e]+$/);
});

test('download destroys the source stream when the response closes early', async t => {
  const stream = new PassThrough();
  t.mock.method(paymentProofService, 'openAuthorizedProof', async () => ({
    proof: { mimeType: 'image/png', originalFilename: 'receipt.png' }, stream
  }));
  const response = new PassThrough() as PassThrough & { setHeader: () => void };
  response.setHeader = () => {};
  const errors: unknown[] = [];
  await downloadProof({ params: { id: '1' }, admin: { id: 3 } } as unknown as Request,
    response as unknown as Response, error => errors.push(error));
  response.emit('close');
  assert.equal(stream.destroyed, true);
  assert.deepEqual(errors, []);
});

test('disconnect during awaited open destroys the returned readable without headers, pipe or next', async t => {
  for (const state of ['destroyed', 'closed', 'writableEnded'] as const) {
    const stream = Readable.from(['private proof']);
    let resolveOpen!: (value: unknown) => void;
    const opening = new Promise(resolve => { resolveOpen = resolve; });
    const mocked = t.mock.method(paymentProofService, 'openAuthorizedProof', () => opening);
    const response = new PassThrough() as PassThrough & { setHeader: () => void };
    let headers = 0; let pipes = 0; const errors: unknown[] = [];
    response.setHeader = () => { headers++; }; response.on('pipe', () => { pipes++; });
    const downloading = downloadProof({ params: { id: '1' }, admin: { id: 3 } } as unknown as Request,
      response as unknown as Response, error => errors.push(error));
    if (state === 'writableEnded') response.end();
    else { response.destroy(); if (state === 'closed') await once(response, 'close'); }
    resolveOpen({ proof: { mimeType: 'image/png', originalFilename: 'receipt.png' }, stream });
    await downloading;
    assert.equal(stream.destroyed, true); assert.equal(headers, 0); assert.equal(pipes, 0); assert.deepEqual(errors, []);
    mocked.mock.restore();
  }
});

test('readable errors complete at most once and late errors after close do not reach next', async t => {
  for (const closeFirst of [false, true]) {
    const stream = new Readable({ read() {} });
    const mocked = t.mock.method(paymentProofService, 'openAuthorizedProof', async () => ({
      proof: { mimeType: 'image/png', originalFilename: 'receipt.png' }, stream
    }));
    const response = new PassThrough() as PassThrough & { setHeader: () => void };
    response.setHeader = () => {};
    const errors: unknown[] = [];
    await downloadProof({ params: { id: '1' }, admin: { id: 3 } } as unknown as Request,
      response as unknown as Response, error => errors.push(error));
    if (closeFirst) { response.destroy(); await once(response, 'close'); }
    const primary = new Error('read failed');
    stream.emit('error', primary); stream.emit('error', new Error('second read error'));
    response.emit('close'); stream.emit('error', new Error('late error'));
    assert.deepEqual(errors, closeFirst ? [] : [primary]); assert.equal(stream.destroyed, true);
    response.destroy(); mocked.mock.restore();
  }
});

test('open rejection after client disconnect never calls next', async t => {
  let rejectOpen!: (error: Error) => void;
  const opening = new Promise((_resolve, reject) => { rejectOpen = reject; });
  t.mock.method(paymentProofService, 'openAuthorizedProof', () => opening);
  const response = new PassThrough(); const errors: unknown[] = [];
  const downloading = downloadProof({ params: { id: '1' }, admin: { id: 3 } } as unknown as Request,
    response as unknown as Response, error => errors.push(error));
  response.destroy(); await once(response, 'close'); rejectOpen(new Error('open failed'));
  await downloading; assert.deepEqual(errors, []);
});
