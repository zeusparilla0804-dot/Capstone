import assert from 'node:assert/strict';
import test from 'node:test';
import sql from 'mssql';
import type { Request, Response, NextFunction } from 'express';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost'; process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test'; process.env.DB_PASSWORD ??= 'test';
const { payments } = await import('./admin.repository.js');
const { closeDatabase } = await import('../config/database.js');
const { adminController } = await import('../controllers/admin.controller.js');
const { adminService } = await import('../services/admin.service.js');

test('payment method filter is bound before pagination and exposes the reservation for recording', async t => {
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => ({ connected: true, close: async () => {}, request: () => new sql.Request() }));
  let method = '';
  t.mock.method(sql.Request.prototype, 'query', async function (command: string) {
    assert.equal(this.parameters['paymentMethod']?.value, method);
    assert.match(command, /r\.reservation_id reservationId/);
    assert.match(command, /r\.status bookingStatus/);
    assert.match(command, /@paymentMethod\s*=\s*''\s+OR\s+pay\.payment_method\s*=\s*@paymentMethod/i);
    assert.ok(command.indexOf('@paymentMethod') < command.indexOf('OFFSET'));
    return { recordset: [{ id: 7, reservationId: 42, bookingReference: 'BK-42', bookingStatus: 'AWAITING_PAYMENT', total_count: 24 }], rowsAffected: [1] };
  });
  try {
    for (method of ['', 'CASH', 'BANK_TRANSFER', 'E-WALLET']) {
      const result = await payments({ page: 2, pageSize: 20, search: '', status: '', eventType: '', date: '', paymentMethod: method });
      assert.equal(result.items[0]?.reservationId, 42);
      assert.equal(result.totalItems, 24);
    }
  } finally { await closeDatabase(); }
});

test('admin payment endpoint accepts supported filters and rejects invalid methods', async t => {
  const calls: unknown[] = [];
  t.mock.method(adminService, 'payments', async value => { calls.push(value); return { items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 }; });
  for (const method of ['', 'cash', 'BANK_TRANSFER', 'E-WALLET']) {
    let error: unknown;
    await adminController.payments({ query: { paymentMethod: method } } as unknown as Request, { json: () => {} } as unknown as Response, (value => { error = value; }) as NextFunction);
    assert.equal(error, undefined);
    assert.equal((calls.at(-1) as { paymentMethod: string }).paymentMethod, method.toUpperCase());
  }
  let error: unknown;
  await adminController.payments({ query: { paymentMethod: "CASH' OR 1=1" } } as unknown as Request, { json: () => {} } as unknown as Response, (value => { error = value; }) as NextFunction);
  assert.equal((error as { statusCode: number }).statusCode, 400);
  assert.equal(calls.length, 4);
});
