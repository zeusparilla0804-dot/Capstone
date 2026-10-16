import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';

const [{ customerAdminController }, { customerAdminService }] = await Promise.all([
  import('./customer-admin.controller.js'),
  import('../services/customer-admin.service.js'),
]);

test('customer maintenance handlers dispatch authenticated admin id and safe inputs', async t => {
  const updated = { id: 7, firstName: 'Klint', lastName: 'Charles', email: 'klint@example.test', phone: '0917', status: 'ACTIVE' } as const;
  const calls: unknown[][] = [];
  t.mock.method(customerAdminService, 'updateProfile', async (...args: unknown[]) => { calls.push(args); return updated; });
  t.mock.method(customerAdminService, 'setStatus', async (...args: unknown[]) => { calls.push(args); return { ...updated, status: 'INACTIVE' as const }; });
  let body: unknown;
  const response = { json(value: unknown) { body = value; return this; } } as unknown as Response;
  let forwarded: unknown;
  const next = ((error?: unknown) => { forwarded = error; }) as NextFunction;

  await customerAdminController.updateProfile({
    admin: { id: 3 }, params: { id: '7' }, body: { firstName: 'Klint' },
  } as unknown as Request, response, next);
  assert.deepEqual(body, { success: true, data: updated });

  await customerAdminController.updateStatus({
    admin: { id: 3 }, params: { id: '7' }, body: { status: 'INACTIVE' },
  } as unknown as Request, response, next);
  assert.equal(forwarded, undefined);
  assert.deepEqual(calls, [[3, '7', { firstName: 'Klint' }], [3, '7', 'INACTIVE']]);
  assert.equal(JSON.stringify(body).includes('password'), false);
});

test('admin routes expose customer PATCH actions behind the shared admin guard', () => {
  const source = readFileSync(new URL('../routes/admin.routes.ts', import.meta.url), 'utf8');
  assert.match(source, /Router\(\)\.use\(requireAdmin\)/);
  assert.match(source, /\.patch\('\/customers\/:id',\s*customerAdminController\.updateProfile\)/);
  assert.match(source, /\.patch\('\/customers\/:id\/status',\s*customerAdminController\.updateStatus\)/);
});
