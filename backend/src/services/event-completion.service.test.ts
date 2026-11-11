import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from '../utils/app-error.js';
process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost'; process.env.DB_DATABASE ??= 'test'; process.env.DB_USER ??= 'test'; process.env.DB_PASSWORD ??= 'test';
const { completionPaymentInput } = await import('./event-completion.service.js');
const value = { amount: 40000, method: 'CASH', paymentDate: '2026-11-08', requestId: 'b490835c-6ca2-4a3a-b953-5ea8c0a4167a', fundsReceived: true, eventFinished: true };

test('completion requires actual funds received and explicit event-finished acknowledgement', () => {
  for (const invalid of [{ fundsReceived: false }, { eventFinished: false }, { fundsReceived: 'true' }, { eventFinished: undefined }]) {
    assert.throws(() => completionPaymentInput(42, { ...value, ...invalid }), (e: unknown) => e instanceof AppError && e.statusCode === 400);
  }
});
test('completion cash references are generated from the retry key', () => {
  const input = completionPaymentInput(42, { ...value, reference: 'DO-NOT-USE' });
  assert.equal(input.reference, 'CASH-B490835C6CA24A3AB9535EA8C0A4167A'); assert.equal(input.amount, 40000);
});
test('online final payments require a transaction reference and supported method', () => {
  assert.throws(() => completionPaymentInput(42, { ...value, method: 'BANK_TRANSFER' }), /reference/i);
  assert.equal(completionPaymentInput(42, { ...value, method: 'BANK_TRANSFER', reference: 'BANK-ACTUAL-1' }).reference, 'BANK-ACTUAL-1');
  assert.throws(() => completionPaymentInput(42, { ...value, method: 'UNKNOWN' }), /method/i);
});
test('already-paid completion accepts zero without creating a new receipt reference', () => {
  const input = completionPaymentInput(42, { ...value, amount: 0, fundsReceived: false });
  assert.equal(input.amount, 0); assert.equal(input.reference, undefined);
});
test('invalid IDs, money, dates and retry keys are rejected before accessing the ledger', () => {
  for (const invalid of [{ amount: -1 }, { amount: null }, { amount: '40000' }, { paymentDate: '2026-02-31' }, { requestId: 'bad' }]) {
    assert.throws(() => completionPaymentInput(42, { ...value, ...invalid }), (e: unknown) => e instanceof AppError && e.statusCode === 400);
  }
  assert.throws(() => completionPaymentInput(0, value), /identifier/i);
});
