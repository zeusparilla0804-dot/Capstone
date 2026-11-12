import assert from 'node:assert/strict';
import test from 'node:test';
process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost'; process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test'; process.env.DB_PASSWORD ??= 'test';
const { assertPaymentSelection } = await import('./booking-payment-policy.js');
const { completionPaymentInput } = await import('./event-completion.service.js');
const { adminService } = await import('./admin.service.js');
const { createPaymentProofService } = await import('./payment-proof.service.js');
const { adminPaymentDestinationRoutes } = await import('../routes/payment-destination.routes.js');

test('GCash cannot be selected for a new payment even on a legacy e-wallet booking', () => {
  const booking = { status: 'AWAITING_PAYMENT', method: 'E-WALLET', amountPaid: 0 };
  assert.throws(() => assertPaymentSelection(booking, 'e-wallet'), /cash.*bank transfer|not supported/i);
  assert.equal(assertPaymentSelection(booking, 'bank-transfer'), 'BANK_TRANSFER');
  assert.equal(assertPaymentSelection(booking, 'cash'), 'CASH');
});

test('GCash cannot be recorded as a new administrator or final event payment', async () => {
  const value = { amount: 100, method: 'E-WALLET' as const, paymentDate: '2026-11-12',
    reference: 'LEGACY-TEST', requestId: 'b490835c-6ca2-4a3a-b953-5ea8c0a4167a', fundsReceived: true, eventFinished: true };
  assert.throws(() => completionPaymentInput(42, value), /method|cash.*bank transfer/i);
  await assert.rejects(adminService.recordPayment(1, { ...value, reservationId: 42 }), /invalid|cash.*bank transfer/i);
});

test('GCash proof submissions are rejected before any file or SQL write', async () => {
  let saved = false;
  const service = createPaymentProofService({ storage: { save: async () => { saved = true; throw Error('File write reached'); } },
    transaction: async () => { throw Error('SQL reached'); }, readRequest: () => { throw Error('SQL reached'); } } as any);
  await assert.rejects(service.submitCustomerProof(7, 42, { method: 'E_WALLET', claimedAmount: 100,
    paymentDate: '2026-11-12', transactionReference: 'LEGACY-TEST' }, { bytes: Buffer.from('test') } as any), /cash.*bank transfer|not supported/i);
  assert.equal(saved, false);
});

test('QR creation and editing reject GCash metadata before image or database writes', async () => {
  for (const verb of ['post', 'put']) {
    const layer = adminPaymentDestinationRoutes.stack.find((item: any) => item.route?.methods[verb]);
    const handler = layer!.route!.stack.at(-1)!.handle;
    const error = await new Promise<Error>(resolve => {
      handler({ params: { id: '1' }, body: { method: 'E-WALLET', label: 'Old account' } },
        { json: () => assert.fail('Retired method must not succeed') }, resolve);
    });
    assert.match(error.message, /cash.*bank transfer/i);
  }
});
