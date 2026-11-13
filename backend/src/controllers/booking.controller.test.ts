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

const [{ availability, create, parseAvailabilityQuery, parseBooking, parsePendingBookingUpdate, updateDetails }, { bookingService }] = await Promise.all([
  import('./booking.controller.js'),
  import('../services/booking.service.js'),
]);

const validBookingBody = {
  eventType: 'Wedding',
  eventDate: '2098-06-15',
  eventTime: '12:30',
  venue: 'Panorama Ville, Santa Rosa',
  guestCount: 120,
  packageId: 3,
  addOnIds: [4, 7],
  paymentMethod: 'cash',
};

test('booking create accepts only an optional UUIDv4 Idempotency-Key header and forwards the normalized key', async t => {
  const calls: unknown[][] = [];
  t.mock.method(bookingService, 'create', async (...args: unknown[]) => { calls.push(args); return {} as never; });
  const response = { status() { return this; }, json() { return this; } } as unknown as Response;
  const key = 'D845E41F-9D9F-4A79-B77E-E840E66154CD';
  let forwarded: unknown;
  await create({ customer: { id: 7 }, headers: { 'idempotency-key': key }, body: { ...validBookingBody, submissionKey: 'ignored-body-key' } } as unknown as Request,
    response, ((error?: unknown) => { forwarded = error; }) as NextFunction);
  assert.equal(forwarded, undefined); assert.equal((calls[0]![1] as { submissionKey?: string }).submissionKey, key.toLowerCase());
  for (const value of ['', 'invalid', ['d845e41f-9d9f-4a79-b77e-e840e66154cd'], 'd845e41f-9d9f-1a79-b77e-e840e66154cd']) {
    forwarded = undefined;
    await create({ customer: { id: 7 }, headers: { 'idempotency-key': value }, body: validBookingBody } as unknown as Request,
      response, ((error?: unknown) => { forwarded = error; }) as NextFunction);
    assert.ok(forwarded instanceof Error && 'statusCode' in forwarded && forwarded.statusCode === 400);
  }
  assert.equal(calls.length, 1);
  await create({ customer: { id: 7 }, headers: {}, body: validBookingBody } as unknown as Request,
    response, ((error?: unknown) => { forwarded = error; }) as NextFunction);
  assert.equal((calls[1]![1] as { submissionKey?: string }).submissionKey, undefined);
});

test('keyed replay parsing defers time-dependent booking restrictions to the transaction', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2098-06-15T00:00:00Z') });
  let captured: unknown;
  t.mock.method(bookingService, 'create', async (_customerId: number, dto: unknown) => { captured = dto; return {} as never; });
  let forwarded: unknown;
  await create({ customer: { id: 7 }, headers: { 'idempotency-key': 'd845e41f-9d9f-4a79-b77e-e840e66154cd' }, body: validBookingBody } as unknown as Request,
    { status() { return this; }, json() { return this; } } as unknown as Response,
    ((error?: unknown) => { forwarded = error; }) as NextFunction);
  assert.equal(forwarded, undefined); assert.equal((captured as { eventDate: string }).eventDate, validBookingBody.eventDate);
});

test('parses only positive integer quantities for selected add-ons', () => {
  assert.deepEqual(parseBooking({ ...validBookingBody, addOnQuantities: { '4': 2 } }).addOnQuantities, { '4': 2 });
  for (const addOnQuantities of [[], null, { '4': 0 }, { '4': 1.5 }, { '4': '2' }, { '9': 2 }]) {
    assert.throws(() => parseBooking({ ...validBookingBody, addOnQuantities }), /quantit|selected/i);
  }
});

test('customer booking and availability accept only whole guest counts from 1 to 1500', () => {
  for (const guestCount of [1, 1500]) {
    assert.equal(parseBooking({ ...validBookingBody, guestCount }).guestCount, guestCount);
    assert.equal(parseAvailabilityQuery({ date: '2098-06-15', guestCount: String(guestCount) }).guestCount, guestCount);
  }
  for (const guestCount of [0, -1, 1.5, 1501, 10000, NaN, Infinity]) {
    const invalid = (error: unknown) => error instanceof Error && 'statusCode' in error && error.statusCode === 400;
    assert.throws(() => parseBooking({ ...validBookingBody, guestCount }), invalid);
    assert.throws(() => parsePendingBookingUpdate({ ...validBookingBody, guestCount }), invalid);
    assert.throws(() => parseAvailabilityQuery({ date: '2098-06-15', guestCount: String(guestCount) }), invalid);
  }
});

test('booking input preserves a trimmed optional special request', () => {
  assert.deepEqual(parseBooking({ ...validBookingBody, specialRequest: '  Vegetarian table for six.  ' }), {
    ...validBookingBody,
    specialRequest: 'Vegetarian table for six.',
  });
});

test('pending booking update uses the same validated details contract', () => {
  assert.deepEqual(parsePendingBookingUpdate({ ...validBookingBody, specialRequest: '' }), {
    ...validBookingBody,
    specialRequest: undefined,
  });
});

test('booking input rejects an excessive special request', () => {
  assert.throws(
    () => parseBooking({ ...validBookingBody, specialRequest: 'x'.repeat(2_001) }),
    (error: unknown) => typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 400,
  );
});

test('pending details endpoint dispatches the authenticated owner and validated identifiers', async (t) => {
  const expected = { id: 31, status: 'pending' } as never;
  const calls: unknown[][] = [];
  t.mock.method(bookingService, 'updateDetails', async (...args: unknown[]) => {
    calls.push(args);
    return expected;
  });
  let responseBody: unknown;
  const response = {
    json(value: unknown) { responseBody = value; return this; },
  } as unknown as Response;
  let forwarded: unknown;

  await updateDetails(
    { params: { id: '31' }, body: validBookingBody, customer: { id: 7 } } as unknown as Request,
    response,
    ((error?: unknown) => { forwarded = error; }) as NextFunction,
  );

  assert.equal(forwarded, undefined);
  assert.deepEqual(calls, [[7, 31, { ...validBookingBody, specialRequest: undefined }]]);
  assert.deepEqual(responseBody, { success: true, data: expected });
});

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
  assert.deepEqual(calls, [['2098-06-15', 150, 7, undefined]]);
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

test('booking routes expose owner-only pending details updates', () => {
  const source = readFileSync(new URL('../routes/booking.routes.ts', import.meta.url), 'utf8');
  assert.match(source, /\.patch\('\/:id\/details',\s*updateDetails\)/);
});

 test('booking and availability enforce four Manila calendar days, including month rollover', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-29T14:59:59Z') });
  for (const eventDate of ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']) {
    assert.throws(() => parseBooking({ ...validBookingBody, paymentMethod: 'e-wallet', eventDate }), /at least 4 days/);
    assert.throws(() => parseAvailabilityQuery({ date: eventDate, guestCount: '100' }), /at least 4 days/);
  }
  assert.equal(parseBooking({ ...validBookingBody, paymentMethod: 'e-wallet', eventDate: '2026-11-02' }).eventDate, '2026-11-02');
  assert.throws(() => parsePendingBookingUpdate({ ...validBookingBody, paymentMethod: 'e-wallet', eventDate: '2026-10-31' }), /at least 4 days/);
 });
 test('cash submissions include one deposit day before three or five preparation days', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-29T04:00:00Z') });
  for (const [guestCount, earliest, earlier] of [[499,'2026-11-02','2026-11-01'],[501,'2026-11-04','2026-11-03']]) {
    assert.equal(parseBooking({ ...validBookingBody, guestCount, eventDate: earliest }).eventDate, earliest);
    assert.throws(() => parseBooking({ ...validBookingBody, guestCount, eventDate: earlier }), /at least [46] days/i);
  }
 });

 test('cash booking allowance remains available after 6 PM Philippine time', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-29T10:00:00Z') });
  for (const [guestCount, earliest, earlier] of [[499,'2026-11-02','2026-11-01'],[501,'2026-11-04','2026-11-03']]) {
    assert.equal(parseBooking({ ...validBookingBody, guestCount, eventDate: earliest }).eventDate, earliest);
    assert.throws(() => parseBooking({ ...validBookingBody, guestCount, eventDate: earlier }), /at least [46] days/i);
  }
 });
