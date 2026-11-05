import assert from 'node:assert/strict';
import test from 'node:test';
import sql from 'mssql';
import { AppError } from '../utils/app-error.js';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

test('office cash requires a receipt/reference before any payment can be recorded', async t => {
  const { adminService } = await import('./admin.service.js');
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => { throw new Error('Invalid cash input reached SQL.'); });
  for (const reference of [undefined, '', '   ', 123]) {
    await assert.rejects(adminService.recordPayment(2, {
      reservationId: 5, amount: 100, method: 'CASH', paymentDate: '2026-10-31', reference: reference as string | undefined,
    }), (error: unknown) => error instanceof AppError && error.statusCode === 400 && /receipt|reference/.test(error.message));
  }
});

test('manual bank and e-wallet payments require a reference before reaching SQL', async t => {
  const { adminService } = await import('./admin.service.js');
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => { throw new Error('Invalid noncash input reached SQL.'); });
  for (const method of ['BANK_TRANSFER', 'E-WALLET'] as const) {
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
    if (/SELECT payment_id,amount_due,amount_paid/.test(command)) return { recordset: [{ payment_id: 3, amount_due: 100, amount_paid: 10 }], rowsAffected: [1] };
    if (/FROM dbo\.PAYMENT_TRANSACTION WITH\(UPDLOCK,HOLDLOCK\)/.test(command)) return { recordset: [], rowsAffected: [0] };
    if (/UPDATE dbo\.PAYMENT_PROOF SET status='SUPERSEDED'/.test(command)) return { recordset: [], rowsAffected: [0] };
    if (/INSERT dbo\.PAYMENT_TRANSACTION/.test(command)) throw Object.assign(new Error('Duplicate reference'), { number: 2601 });
    assert.fail('Duplicate receipt must not update payment, booking, invoice, audit, or notification rows.');
  });
  try {
    await assert.rejects(adminService.recordPayment(2, { reservationId: 5, amount: 25, method: 'CASH', reference: 'CASH-001', paymentDate: '2026-10-31' }),
      (error: unknown) => error instanceof AppError && error.statusCode === 409);
    assert.equal(rolledBack, true);
  } finally { await closeDatabase(); }
});
