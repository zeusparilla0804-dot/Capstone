import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const [{ errorHandler }, { AppError }] = await Promise.all([
  import('./error.middleware.js'),
  import('../utils/app-error.js'),
]);

function capture(error: unknown) {
  let statusCode = 0;
  let body: unknown;
  const response = {
    status(value: number) {
      statusCode = value;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
  } as unknown as Response;

  errorHandler(error, {} as Request, response, (() => undefined) as NextFunction);
  return { statusCode, body };
}

test('error middleware includes a safe code for coded application errors', () => {
  assert.deepEqual(capture(new AppError(409, 'This date is full.', 'BOOKING_DATE_FULL')), {
    statusCode: 409,
    body: { success: false, message: 'This date is full.', code: 'BOOKING_DATE_FULL' },
  });
});

test('error middleware preserves the legacy body for uncoded application errors', () => {
  assert.deepEqual(capture(new AppError(400, 'Request is invalid.')), {
    statusCode: 400,
    body: { success: false, message: 'Request is invalid.' },
  });
});

test('unexpected errors remain generic and never expose an internal code', () => {
  assert.deepEqual(capture(new Error('database credentials leaked')), {
    statusCode: 500,
    body: { success: false, message: 'Internal server error.' },
  });
});
