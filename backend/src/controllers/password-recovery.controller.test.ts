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
const { passwordRecoveryService } = await import('../services/password-recovery.service.js');

function responseCapture() {
  const capture: { status?: number; body?: unknown } = {};
  const response = {
    status(value: number) { capture.status = value; return this; },
    json(value: unknown) { capture.body = value; return this; },
  } as unknown as Response;
  return { capture, response };
}

test('forgot handlers map fixed roles and always return the exact generic accepted response', async t => {
  const calls: unknown[][] = [];
  t.mock.method(passwordRecoveryService, 'request', async (...args: unknown[]) => { calls.push(args); });
  const expected = {
    success: true,
    message: 'If an account uses that email, password reset instructions will arrive shortly.',
  };

  for (const [handler, role] of [
    [controller.customerForgotPassword, 'CUSTOMER'],
    [controller.adminForgotPassword, 'ADMIN'],
  ] as const) {
    const { capture, response } = responseCapture();
    let forwarded: unknown;
    await handler({ body: { email: ' Person@Example.TEST ' } } as Request, response,
      ((error?: unknown) => { forwarded = error; }) as NextFunction);
    assert.equal(forwarded, undefined);
    assert.equal(capture.status, 202);
    assert.deepEqual(capture.body, expected);
    assert.deepEqual(calls.at(-1), [role, 'person@example.test']);
  }
});

test('reset handlers map fixed roles without echoing token or password', async t => {
  const calls: unknown[][] = [];
  t.mock.method(passwordRecoveryService, 'reset', async (...args: unknown[]) => { calls.push(args); });
  const token = `${'a'.repeat(22)}.${'b'.repeat(43)}`;

  for (const [handler, role] of [
    [controller.customerResetPassword, 'CUSTOMER'],
    [controller.adminResetPassword, 'ADMIN'],
  ] as const) {
    const { capture, response } = responseCapture();
    await handler({ body: { token, password: 'new-password-123', confirmPassword: 'new-password-123' } } as Request,
      response, assert.fail as unknown as NextFunction);
    assert.deepEqual(calls.at(-1), [role, token, 'new-password-123', 'new-password-123']);
    assert.equal(capture.status, 200);
    assert.deepEqual(capture.body, { success: true, message: 'Your password has been changed. Please sign in again.' });
    assert.equal(JSON.stringify(capture.body).includes(token), false);
    assert.equal(JSON.stringify(capture.body).includes('new-password-123'), false);
  }
});

test('recovery handlers reject invalid email, token, password length, and confirmation before service dispatch', async t => {
  let calls = 0;
  t.mock.method(passwordRecoveryService, 'request', async () => { calls++; });
  t.mock.method(passwordRecoveryService, 'reset', async () => { calls++; });
  const cases: Array<[Function, Record<string, unknown>]> = [
    [controller.customerForgotPassword, { email: 'not-an-email' }],
    [controller.adminForgotPassword, { email: '' }],
    [controller.customerResetPassword, { token: '', password: 'valid-password-123', confirmPassword: 'valid-password-123' }],
    [controller.customerResetPassword, { token: 'token', password: 'short', confirmPassword: 'short' }],
    [controller.adminResetPassword, { token: 'token', password: 'valid-password-123', confirmPassword: 'different-password' }],
  ];
  for (const [handler, body] of cases) {
    const { response } = responseCapture();
    let forwarded: any;
    await handler({ body } as Request, response, ((error?: unknown) => { forwarded = error; }) as NextFunction);
    assert.equal(forwarded?.statusCode, 400);
  }
  assert.equal(calls, 0);
});

test('invalid-token service failure is forwarded unchanged through the safe API contract', async t => {
  const failure = Object.assign(new Error('This password reset link is invalid.'), {
    statusCode: 400,
    code: 'PASSWORD_RESET_INVALID',
  });
  t.mock.method(passwordRecoveryService, 'reset', async () => { throw failure; });
  const { response } = responseCapture();
  let forwarded: unknown;
  await controller.customerResetPassword({ body: { token: 'token', password: 'valid-password-123',
    confirmPassword: 'valid-password-123' } } as Request, response,
  ((error?: unknown) => { forwarded = error; }) as NextFunction);
  assert.equal(forwarded, failure);
});
