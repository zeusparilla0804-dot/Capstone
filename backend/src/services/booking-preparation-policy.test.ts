import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCustomerBookingDate } from './booking-submission-policy.js';

test('booking size policy includes a deposit day: six calendar days from 501 guests and four below 501', () => {
  const now = new Date('2026-11-05T03:00:00Z');
  assert.doesNotThrow(() => assertCustomerBookingDate('2026-11-09', 499, now));
  assert.doesNotThrow(() => assertCustomerBookingDate('2026-11-09', 500, now));
  assert.throws(() => assertCustomerBookingDate('2026-11-08', 500, now), /4 days/i);
  assert.throws(() => assertCustomerBookingDate('2026-11-09', 501, now), /6 days/i);
  assert.doesNotThrow(() => assertCustomerBookingDate('2026-11-11', 501, now));
});
