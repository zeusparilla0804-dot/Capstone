import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RESERVATION_DEPOSIT_RATE,
  hasRequiredReservationDeposit,
  requiredReservationDeposit,
} from './reservation-billing-policy.js';

test('reservation billing policy requires exactly half of the reservation total', () => {
  assert.equal(RESERVATION_DEPOSIT_RATE, 0.5);
  assert.equal(requiredReservationDeposit(1_000), 500);
});

test('reservation billing policy rounds an odd-cent deposit to currency cents', () => {
  assert.equal(requiredReservationDeposit(100.01), 50.01);
});

test('reservation billing policy rejects one cent below the required deposit', () => {
  assert.equal(hasRequiredReservationDeposit(1_000, 499.99), false);
});

test('reservation billing policy accepts the exact threshold and cumulative overpayment', () => {
  assert.equal(hasRequiredReservationDeposit(1_000, 500), true);
  assert.equal(hasRequiredReservationDeposit(1_000, 725), true);
});

test('reservation billing policy rejects invalid server values', () => {
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => requiredReservationDeposit(value),
      (error: unknown) => {
        assert.equal((error as { statusCode?: number }).statusCode, 500);
        assert.equal((error as { code?: string }).code, 'RESERVATION_BILLING_INVALID');
        return true;
      },
    );
  }

  assert.throws(() => hasRequiredReservationDeposit(100, -0.01), /billing/i);
});
