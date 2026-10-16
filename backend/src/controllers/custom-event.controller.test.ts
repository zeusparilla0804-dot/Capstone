import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const [{ customEventController, parseCustomEventRequest }, { customEventService }] = await Promise.all([
  import('./custom-event.controller.js'),
  import('../services/custom-event.service.js'),
]);

const validBody = {
  eventType: 'Wedding', eventDate: '2098-10-20', eventTime: '18:00', venue: 'Panorama Ville',
  guestCount: 120, sourcePackageId: 4, targetBudget: 150_000,
  menuPreferences: 'Filipino buffet', dietaryNotes: 'No shellfish', setupPreferences: 'White and gold',
  requestedServices: ['Photo coverage', 'Coffee bar'], specialRequest: 'Wheelchair access',
};

test('parses package-derived and blank custom requests without accepting financial totals', () => {
  assert.deepEqual(parseCustomEventRequest(validBody), validBody);
  assert.deepEqual(parseCustomEventRequest({
    eventType: 'Other', eventDate: '2098-10-21', eventTime: '10:00', venue: 'Client venue', guestCount: 40,
  }), {
    eventType: 'Other', eventDate: '2098-10-21', eventTime: '10:00', venue: 'Client venue', guestCount: 40,
    sourcePackageId: undefined, targetBudget: undefined, menuPreferences: undefined, dietaryNotes: undefined,
    setupPreferences: undefined, requestedServices: [], specialRequest: undefined,
  });
});

test('rejects invalid guest budget source package and planning field bounds', () => {
  for (const body of [
    { ...validBody, guestCount: 0 },
    { ...validBody, guestCount: 10_001 },
    { ...validBody, sourcePackageId: 0 },
    { ...validBody, targetBudget: -1 },
    { ...validBody, requestedServices: ['Coffee bar', 'Coffee bar'] },
    { ...validBody, requestedServices: Array.from({ length: 21 }, (_, index) => `Service ${index}`) },
    { ...validBody, menuPreferences: 'x'.repeat(2_001) },
  ]) assert.throws(() => parseCustomEventRequest(body), (error: unknown) => typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 400);
});

test('customer handlers dispatch authenticated ownership and safe identifiers', async t => {
  const created = { id: 12, reservationId: 31, reference: 'CQ-2026-ABCDEF12', status: 'AWAITING_QUOTE' } as never;
  const detail = { id: 12, reservationId: 31 } as never;
  const calls: unknown[][] = [];
  t.mock.method(customEventService, 'submit', async (...args: unknown[]) => { calls.push(args); return created; });
  t.mock.method(customEventService, 'detail', async (...args: unknown[]) => { calls.push(args); return detail; });
  t.mock.method(customEventService, 'accept', async (...args: unknown[]) => { calls.push(args); return { status: 'ACCEPTED' } as never; });
  t.mock.method(customEventService, 'decline', async (...args: unknown[]) => { calls.push(args); });
  let status = 200;
  let body: unknown;
  const response = {
    status(value: number) { status = value; return this; },
    json(value: unknown) { body = value; return this; },
  } as unknown as Response;
  let forwarded: unknown;
  const next = ((error?: unknown) => { forwarded = error; }) as NextFunction;

  await customEventController.create({ customer: { id: 7 }, body: validBody } as unknown as Request, response, next);
  assert.equal(status, 201);
  assert.deepEqual(body, { success: true, data: created });
  await customEventController.detail({ customer: { id: 7 }, params: { id: '12' } } as unknown as Request, response, next);
  await customEventController.accept({ customer: { id: 7 }, params: { id: '12', quoteId: '9' } } as unknown as Request, response, next);
  await customEventController.decline({ customer: { id: 7 }, params: { id: '12', quoteId: '9' }, body: { reason: 'Plans changed' } } as unknown as Request, response, next);
  assert.equal(forwarded, undefined);
  assert.deepEqual(calls, [[7, validBody], [7, 12], [7, 12, 9], [7, 12, 9, 'Plans changed']]);
  assert.deepEqual(body, { success: true, message: 'Quotation declined.' });
});
