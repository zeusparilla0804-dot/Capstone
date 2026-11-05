import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';
import { AppError } from '../utils/app-error.js';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

test('registration returns the account without issuing an authentication cookie', async () => {
  const { authService } = await import('../services/auth.service.js');
  const { register } = await import('./auth.controller.js');
  const user = { id: 42, fullName: 'New Customer', email: 'new@example.test', phone: '09171234567', role: 'customer' as const };
  const originalRegister = authService.register;
  authService.register = async () => ({ user });
  let status = 0;
  let body: unknown;
  const response = {
    cookie() { assert.fail('Registration must not set an authentication cookie.'); },
    status(value: number) { status = value; return this; },
    json(value: unknown) { body = value; return this; },
  };
  try {
    await register({ body: { firstName: 'New', lastName: 'Customer', email: user.email, phone: user.phone, password: 'new-password-123' } } as Request,
      response as unknown as Response, error => { throw error; });
    assert.equal(status, 201);
    assert.deepEqual(body, { success: true, data: user });
  } finally {
    authService.register = originalRegister;
  }
});

test('registration rejects invalid Philippine mobile numbers before creating an account', async () => {
  const { authService } = await import('../services/auth.service.js');
  const { register } = await import('./auth.controller.js');
  const originalRegister = authService.register;
  let registrations = 0;
  authService.register = async () => { registrations++; throw new Error('Invalid phone reached registration.'); };
  try {
    for (const phone of ['', '09999999999999999999999', '0917123456', '091712345678', '08171234567', '+6391712345678', '0917abc4567', '02 8123 4567', 9171234567]) {
      let failure: unknown;
      await register({ body: { firstName: 'New', lastName: 'Customer', email: 'new@example.test', phone, password: 'new-password-123' } } as Request,
        { status() { assert.fail('Invalid phone must not return success.'); } } as unknown as Response,
        error => { failure = error; });
      assert.ok(failure instanceof AppError && failure.statusCode === 400, `Expected invalid phone to be rejected: ${phone}`);
    }
    assert.equal(registrations, 0);
  } finally {
    authService.register = originalRegister;
  }
});

test('customer phone update uses the authenticated account ID and validates before saving', async () => {
  const controller = await import('./auth.controller.js');
  const { authService } = await import('../services/auth.service.js');
  const updatePhone = (controller as any).updateCustomerPhone;
  assert.equal(typeof updatePhone, 'function');
  const service = authService as typeof authService & { updatePhone: (id: number, phone: string) => Promise<unknown> };
  const original = service.updatePhone;
  const customer = { id: 42, fullName: 'New Customer', email: 'new@example.test', phone: '09171234567', role: 'customer' as const };
  const saved: unknown[] = [];
  service.updatePhone = async (...args) => { saved.push(args); return customer; };
  try {
    let result: unknown;
    await updatePhone({ customer, body: { customerId: 999, phone: '0917 123 4567', email: 'ignored@example.test' } },
      { json(value: unknown) { result = value; } }, (error: unknown) => { throw error; });
    assert.deepEqual(saved, [[42, '09171234567']]);
    assert.deepEqual(result, { success: true, data: customer });
    for (const request of [{ customer, body: { phone: '09999999999999999999999' } }, { body: { phone: '09171234567' } }]) {
      let failure: unknown;
      await updatePhone(request, { json() { assert.fail('Invalid update returned success.'); } }, (error: unknown) => { failure = error; });
      assert.ok(failure instanceof AppError);
      assert.equal(failure.statusCode, 'customer' in request ? 400 : 401);
    }
    assert.equal(saved.length, 1);
  } finally { service.updatePhone = original; }
});
