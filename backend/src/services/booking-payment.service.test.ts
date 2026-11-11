import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPaymentDeferred, assertPaymentSelection, assertProofMatchesPayment } from './booking-payment-policy.js';

test('new and pending bookings defer payment choice', () => {
  assert.doesNotThrow(() => assertPaymentDeferred(undefined));
  assert.throws(() => assertPaymentDeferred('cash'), /requests payment/i);
});

test('payment method is chosen only after admin requests payment and can change before any proof or payment', () => {
  assert.equal(assertPaymentSelection({ status: 'AWAITING_PAYMENT', method: null, amountPaid: 0 }, 'cash'), 'CASH');
  assert.equal(assertPaymentSelection({ status: 'AWAITING_PAYMENT', method: 'E-WALLET', amountPaid: 0, hasProof: false }, 'bank-transfer'), 'BANK_TRANSFER');
  for (const state of [
    { status: 'PENDING', method: null, amountPaid: 0 },
    { status: 'APPROVED', method: null, amountPaid: 0 },
    { status: 'REJECTED', method: null, amountPaid: 0 },
    { status: 'APPROVED', method: null, amountPaid: 1 },
    { status: 'AWAITING_PAYMENT', method: 'E-WALLET', amountPaid: 0, hasProof: true },
  ]) assert.throws(() => assertPaymentSelection(state, 'cash'), /request|selected|payment/i);
  assert.throws(() => assertPaymentSelection({ status: 'APPROVED', method: null, amountPaid: 0 }, 'card'), /method/i);
});

test('proofs require a previously selected matching online method', () => {
  assert.doesNotThrow(() => assertProofMatchesPayment('BANK_TRANSFER', 'BANK_TRANSFER'));
  assert.throws(() => assertProofMatchesPayment(null, 'BANK_TRANSFER'), /choose.*method/i);
  assert.throws(() => assertProofMatchesPayment('E-WALLET', 'BANK_TRANSFER'), /chosen.*method/i);
});
