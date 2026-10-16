import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const controller = await import('./auth.controller.js');
const { authService } = await import('../services/auth.service.js');

function responseCapture() {
  const capture: { cleared?: string; status?: number; sent?: boolean } = {};
  const response = {
    clearCookie(name: string) { capture.cleared = name; return this; },
    status(value: number) { capture.status = value; return this; },
    send() { capture.sent = true; return this; },
  } as unknown as Response;
  return { capture, response };
}

test('customer and admin all-device logout revoke by authenticated id and clear the correct cookie', async t => {
  const customerCalls: number[] = [];
  const adminCalls: number[] = [];
  const customerMethod = (authService as unknown as Record<string, unknown>)['logoutAllCustomerSessions'];
  const adminMethod = (authService as unknown as Record<string, unknown>)['logoutAllAdminSessions'];
  const customerHandler = (controller as unknown as Record<string, unknown>)['logoutAll'];
  const adminHandler = (controller as unknown as Record<string, unknown>)['adminLogoutAll'];
  assert.equal(typeof customerMethod, 'function');
  assert.equal(typeof adminMethod, 'function');
  assert.equal(typeof customerHandler, 'function');
  assert.equal(typeof adminHandler, 'function');

  t.mock.method(authService as never, 'logoutAllCustomerSessions' as never,
    async (id: number) => { customerCalls.push(id); });
  t.mock.method(authService as never, 'logoutAllAdminSessions' as never,
    async (id: number) => { adminCalls.push(id); });

  const customerResponse = responseCapture();
  await (customerHandler as Function)({ customer: { id: 42 } } as Request, customerResponse.response,
    assert.fail as unknown as NextFunction);
  assert.deepEqual(customerCalls, [42]);
  assert.deepEqual(customerResponse.capture, { cleared: 'la_chef_session', status: 204, sent: true });

  const adminResponse = responseCapture();
  await (adminHandler as Function)({ admin: { id: 7 } } as Request, adminResponse.response,
    assert.fail as unknown as NextFunction);
  assert.deepEqual(adminCalls, [7]);
  assert.deepEqual(adminResponse.capture, { cleared: 'la_chef_admin_session', status: 204, sent: true });
});
