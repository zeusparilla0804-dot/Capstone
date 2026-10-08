import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const [{ availability, parseAvailabilityQuery }, { bookingService }] = await Promise.all([
  import('./booking.controller.js'),
  import('../services/booking.service.js'),
]);

test('availability parses a future ISO date and integer guest count before dispatch', async t => {
  const expected = {
    date: '2098-06-15',
    guestCount: 150,
    status: 'NEEDS_CONFIRMATION',
    activeBookingCount: 1,
    capacityLimit: 6,
    remainingRequestSlots: 4,
    requiresAdminConfirmation: true,
    message: 'LA Chef will confirm whether this date can accommodate your event.',
  } as const;
  const calls: unknown[][] = [];
  t.mock.method(bookingService, 'availability', async (...args: unknown[]) => {
    calls.push(args);
    return expected;
  });
  let responseBody: unknown;
  const response = {
    json(value: unknown) {
      responseBody = value;
      return this;
    },
  } as unknown as Response;
  let forwarded: unknown;

  await availability(
    { query: { date: '2098-06-15', guestCount: '150' }, customer: { id: 7 } } as unknown as Request,
    response,
    ((error?: unknown) => { forwarded = error; }) as NextFunction,
  );

  assert.equal(forwarded, undefined);
  assert.deepEqual(calls, [['2098-06-15', 150]]);
  assert.deepEqual(responseBody, { success: true, data: expected });
});

for (const [name, query] of [
  ['malformed date', { date: '2098-2-01', guestCount: '100' }],
  ['impossible date', { date: '2098-02-30', guestCount: '100' }],
  ['past date', { date: '2000-01-01', guestCount: '100' }],
  ['missing date', { guestCount: '100' }],
  ['zero guests', { date: '2098-06-15', guestCount: '0' }],
  ['decimal guests', { date: '2098-06-15', guestCount: '10.5' }],
  ['excessive guests', { date: '2098-06-15', guestCount: '10001' }],
  ['non-numeric guests', { date: '2098-06-15', guestCount: 'many' }],
] as const) {
  test(`availability rejects ${name}`, () => {
    assert.throws(
      () => parseAvailabilityQuery(query),
      (error: unknown) => typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 400,
    );
  });
}

test('availability route is declared before the dynamic booking identifier route', () => {
  const source = readFileSync(new URL('../routes/booking.routes.ts', import.meta.url), 'utf8');
  const availabilityIndex = source.indexOf(".get('/availability'");
  const identifierIndex = source.indexOf(".get('/:id'");

  assert.ok(availabilityIndex >= 0, 'availability route must exist');
  assert.ok(identifierIndex > availabilityIndex, 'availability route must be matched before /:id');
});
