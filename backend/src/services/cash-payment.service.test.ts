import assert from 'node:assert/strict';
import test from 'node:test';
import sql from 'mssql';
import { AppError } from '../utils/app-error.js';
import type { Request, Response, NextFunction } from 'express';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

test('office cash requires a valid request ID before generating a receipt reference', async t => {
  const { adminService } = await import('./admin.service.js');
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => { throw new Error('Invalid cash input reached SQL.'); });
  for (const requestId of [undefined, '', '   ', 123, 'not-a-uuid']) {
    await assert.rejects(adminService.recordPayment(2, {
      reservationId: 5, amount: 100, method: 'CASH', paymentDate: '2026-10-31', requestId: requestId as string | undefined,
    }), (error: unknown) => error instanceof AppError && error.statusCode === 400 && /request/i.test(error.message));
  }
});

test('manual bank payments require a reference before reaching SQL', async t => {
  const { adminService } = await import('./admin.service.js');
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => { throw new Error('Invalid noncash input reached SQL.'); });
  for (const method of ['BANK_TRANSFER'] as const) {
    for (const reference of [undefined, '', '   ']) {
      await assert.rejects(adminService.recordPayment(2, { reservationId: 5, amount: 25, method, paymentDate: '2026-10-31', reference }),
        (error: unknown) => error instanceof AppError && error.statusCode === 400 && /reference/.test(error.message));
    }
  }
});

test('a duplicate cash receipt rolls back before crediting the balance', async t => {
  const { adminService } = await import('./admin.service.js');
  const { closeDatabase } = await import('../config/database.js');
  let rolledBack = false;
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => ({ connected: true, close: async () => {} }));
  t.mock.method(sql.Transaction.prototype, 'begin', async () => {});
  t.mock.method(sql.Transaction.prototype, 'commit', async () => { assert.fail('Duplicate receipt must not commit.'); });
  t.mock.method(sql.Transaction.prototype, 'rollback', async () => { rolledBack = true; });
  t.mock.method(sql.Request.prototype, 'query', async (command: string) => {
    if (/FROM dbo\.BOOKING_POLICY\b/i.test(command)) return { recordset: [], rowsAffected: [0] };
    if (/SELECT status,customer_id/.test(command)) return { recordset: [{ status: 'AWAITING_PAYMENT', customerId: 7 }], rowsAffected: [1] };
    if (/SELECT payment_id,amount_due,amount_paid/.test(command)) return { recordset: [{ payment_id: 3, amount_due: 100, amount_paid: 10, payment_method: 'CASH' }], rowsAffected: [1] };
    if (/FROM dbo\.PAYMENT_TRANSACTION WITH\(UPDLOCK,HOLDLOCK\)/.test(command)) return { recordset: [], rowsAffected: [0] };
    if (/UPDATE dbo\.PAYMENT_PROOF SET status='SUPERSEDED'/.test(command)) return { recordset: [], rowsAffected: [0] };
    if (/INSERT dbo\.PAYMENT_TRANSACTION/.test(command)) throw Object.assign(new Error('Duplicate reference'), { number: 2601 });
    assert.fail('Duplicate receipt must not update payment, booking, invoice, audit, or notification rows.');
  });
  try {
    await assert.rejects(adminService.recordPayment(2, { reservationId: 5, amount: 25, method: 'CASH', requestId: '5f874d08-73a1-4839-b830-ff155512e314', paymentDate: '2026-10-31' }),
      (error: unknown) => error instanceof AppError && error.statusCode === 409);
    assert.equal(rolledBack, true);
  } finally { await closeDatabase(); }
});

for (const initialMethod of ['CASH', 'E-WALLET']) test(`cash recording from ${initialMethod} generates durable references and replays without a second credit`, async t => {
  const { adminService } = await import('./admin.service.js');
  const { adminController } = await import('../controllers/admin.controller.js');
  const { closeDatabase } = await import('../config/database.js');
  const credits: { payment_id: number; amount: number; payment_date: string; reference: string }[] = [];
  let paid = 0, notifications = 0, audits = 0;
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => ({ connected: true, close: async () => {} }));
  t.mock.method(sql.Transaction.prototype, 'begin', async () => {});
  t.mock.method(sql.Transaction.prototype, 'commit', async () => {});
  t.mock.method(sql.Transaction.prototype, 'rollback', async () => {});
  t.mock.method(sql.Request.prototype, 'query', async function (command: string) {
    const values = Object.fromEntries(Object.entries(this.parameters).map(([key, input]) => [key, input.value]));
    const result = (recordset: Record<string, unknown>[] = []) => ({ recordset, rowsAffected: [recordset.length] });
    if (/SELECT status,customer_id/.test(command)) return result([{ status: 'AWAITING_PAYMENT', customerId: 7 }]);
    if (/SELECT payment_id,amount_due,amount_paid/.test(command)) return result([{ payment_id: 3, amount_due: 1000, amount_paid: paid, payment_method: initialMethod }]);
    if (/FROM dbo\.PAYMENT_TRANSACTION WITH\(UPDLOCK,HOLDLOCK\)/.test(command)) return result(credits.filter(row => row.reference === values['reference']));
    if (/INSERT dbo\.PAYMENT_TRANSACTION/.test(command)) {
      credits.push({ payment_id: 3, amount: Number(values['amount']), payment_date: (values['date'] as Date).toISOString().slice(0, 10), reference: String(values['reference']) });
      return result();
    }
    if (/UPDATE dbo\.PAYMENT SET amount_paid/.test(command)) { paid += Number(values['amount']); return result(); }
    if (/email outbox context.*customerEmail.*FROM dbo\.RESERVATION/is.test(command)) return result([{ customerEmail: 'customer@example.test', customerName: 'Customer', bookingReference: 'BK-5', eventDate: '2027-12-01' }]);
    if (/INSERT dbo\.EMAIL_OUTBOX/.test(command)) { notifications++; return result([{ id: String(notifications) }]); }
    if (/INSERT dbo\.ADMIN_AUDIT_LOG/.test(command)) { audits++; return result(); }
    if (/UPDATE dbo\.PAYMENT_PROOF/.test(command) || /UPDATE i SET status/.test(command)) return result();
    throw Error(`Unexpected cash receipt query: ${command}`);
  });
  const input = { reservationId: 5, amount: 25, method: 'CASH' as const, paymentDate: '2026-11-08', requestId: '5f874d08-73a1-4839-b830-ff155512e314' };
  try {
    let response: { data: { reference: string } } | undefined, error: unknown;
    const res = { status: () => res, json: (value: typeof response) => { response = value; } };
    await adminController.recordPayment({ admin: { id: 2 }, body: { ...input, reference: 'STAFF-TYPED' } } as unknown as Request,
      res as unknown as Response, (value => { error = value; }) as NextFunction);
    assert.equal(error, undefined);
    const firstReference = response!.data.reference;
    assert.match(firstReference, /^CASH-[0-9A-F]{32}$/);
    assert.equal(credits[0]?.reference, firstReference);
    assert.equal((await adminService.recordPayment(2, { ...input })).reference, firstReference);
    assert.equal(credits.length, 1);
    assert.equal(paid, 25);
    await assert.rejects(adminService.recordPayment(2, { ...input, amount: 30 }), (value: unknown) => value instanceof AppError && value.statusCode === 409);
    const next = await adminService.recordPayment(2, { ...input, requestId: 'b514a72e-2cd7-47f1-8b99-00a7c44ae068' });
    assert.notEqual(next.reference, firstReference);
    assert.equal(credits.length, 2);
    assert.equal(paid, 50);
    assert.equal(notifications, 2);
    assert.equal(audits, 2);
  } finally { await closeDatabase(); }
});
