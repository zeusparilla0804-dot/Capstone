import assert from 'node:assert/strict';
import test from 'node:test';
import type { CustomEventRequestStatus, CustomQuoteStatus } from '../types/custom-event.types.js';
import { AppError } from '../utils/app-error.js';
import {
  assertQuoteAcceptable,
  assertQuoteTransition,
  assertRequestTransition,
  calculateQuoteTotals,
} from './custom-quote-domain.service.js';

test('calculates exact decimal line totals and quotation totals', () => {
  const result = calculateQuoteTotals([
    { description: 'Catering service', quantity: 51, unitPrice: 650.25 },
    { description: 'Styled backdrop', quantity: 1, unitPrice: 15_000 },
  ], 14_454.83);

  assert.deepEqual(result, {
    lineTotals: [33_162.75, 15_000],
    subtotal: 48_162.75,
    total: 48_162.75,
    requiredDownPayment: 14_454.83,
  });
});

test('rounds fractional line products to SQL decimal cents', () => {
  assert.deepEqual(
    calculateQuoteTotals([{ description: 'Partial service unit', quantity: 2.5, unitPrice: 10.99 }], 0),
    { lineTotals: [27.48], subtotal: 27.48, total: 27.48, requiredDownPayment: 0 },
  );
});

test('rejects invalid quantities prices and empty quote lines', () => {
  for (const items of [
    [],
    [{ description: 'Invalid', quantity: 0, unitPrice: 100 }],
    [{ description: 'Invalid', quantity: 1.001, unitPrice: 100 }],
    [{ description: 'Invalid', quantity: 1, unitPrice: -1 }],
    [{ description: 'Invalid', quantity: 1, unitPrice: Number.NaN }],
  ]) {
    assert.throws(
      () => calculateQuoteTotals(items, 0),
      (error) => error instanceof AppError && error.code === 'CUSTOM_QUOTE_ITEM_INVALID',
    );
  }
});

test('rejects down payments outside exact quotation bounds', () => {
  const items = [{ description: 'Event service', quantity: 1, unitPrice: 10_000 }];
  for (const amount of [-1, 10_000.01, 10.001, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => calculateQuoteTotals(items, amount),
      (error) => error instanceof AppError && error.code === 'CUSTOM_QUOTE_DOWN_PAYMENT_INVALID',
    );
  }
});

test('accepts only the current sent quote through its validity date', () => {
  const now = new Date('2026-10-12T23:59:59.999Z');
  assert.doesNotThrow(() => assertQuoteAcceptable({ status: 'SENT', validUntil: '2026-10-12' }, now));

  for (const quote of [
    { status: 'SUPERSEDED' as const, validUntil: '2026-10-13' },
    { status: 'EXPIRED' as const, validUntil: '2026-10-13' },
    { status: 'DECLINED' as const, validUntil: '2026-10-13' },
    { status: 'SENT' as const, validUntil: '2026-10-11' },
  ]) {
    assert.throws(
      () => assertQuoteAcceptable(quote, now),
      (error) => error instanceof AppError && error.statusCode === 409 && error.code === 'CUSTOM_QUOTE_NOT_ACCEPTABLE',
    );
  }
});

test('allows only deterministic request and quote state transitions', () => {
  const requestAllowed: Array<[CustomEventRequestStatus, CustomEventRequestStatus]> = [
    ['AWAITING_QUOTE', 'NEEDS_CLARIFICATION'],
    ['AWAITING_QUOTE', 'QUOTE_SENT'],
    ['NEEDS_CLARIFICATION', 'QUOTE_SENT'],
    ['QUOTE_SENT', 'ACCEPTED'],
    ['QUOTE_SENT', 'DECLINED'],
    ['QUOTE_SENT', 'EXPIRED'],
  ];
  for (const [from, to] of requestAllowed) assert.doesNotThrow(() => assertRequestTransition(from, to));

  const quoteAllowed: Array<[CustomQuoteStatus, CustomQuoteStatus]> = [
    ['DRAFT', 'SENT'],
    ['SENT', 'SUPERSEDED'],
    ['SENT', 'ACCEPTED'],
    ['SENT', 'DECLINED'],
    ['SENT', 'EXPIRED'],
  ];
  for (const [from, to] of quoteAllowed) assert.doesNotThrow(() => assertQuoteTransition(from, to));

  assert.throws(() => assertRequestTransition('ACCEPTED', 'QUOTE_SENT'), (error) => error instanceof AppError && error.code === 'CUSTOM_REQUEST_STATE_CONFLICT');
  assert.throws(() => assertQuoteTransition('SUPERSEDED', 'ACCEPTED'), (error) => error instanceof AppError && error.code === 'CUSTOM_QUOTE_STATE_CONFLICT');
});
