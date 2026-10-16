import assert from 'node:assert/strict';
import test from 'node:test';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const { createCustomEventAdminService } = await import('./custom-event-admin.service.js');

function fixture() {
  const calls: { name: string; args: unknown[] }[] = [];
  const service = createCustomEventAdminService({
    list: async (...args: unknown[]) => { calls.push({ name: 'list', args }); return { items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 }; },
    detail: async (...args: unknown[]) => { calls.push({ name: 'detail', args }); return { id: 5 } as never; },
    sendQuote: async (...args: unknown[]) => { calls.push({ name: 'sendQuote', args }); return { id: 9, requestId: 5, version: 2, subtotal: 2600, discount: 0, total: 2600, requiredDownPayment: 780, validUntil: '2098-12-31', terms: null, status: 'SENT', sentBy: 3, sentAt: null, acceptedAt: null, declinedAt: null, createdAt: '', items: [] } as never; },
    clarify: async (...args: unknown[]) => { calls.push({ name: 'clarify', args }); },
    reject: async (...args: unknown[]) => { calls.push({ name: 'reject', args }); },
  });
  return { service, calls };
}

test('normalizes bounded admin queue filters', async () => {
  const { service, calls } = fixture();
  await service.list({ page: '2', pageSize: '500', status: ' quote_sent ', search: '  Cruz  ' });
  assert.deepEqual(calls[0], { name: 'list', args: [{ page: 2, pageSize: 100, status: 'QUOTE_SENT', search: 'Cruz' }] });
  await assert.rejects(service.list({ status: 'PAID' }), error => typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 400);
});

test('computes quote line totals server-side and preserves the authenticated administrator', async () => {
  const { service, calls } = fixture();
  const quote = await service.sendQuote(3, 5, {
    adminId: 99,
    items: [
      { description: '  Buffet service ', quantity: 100, unitPrice: 25 },
      { description: 'Coffee station', quantity: 2, unitPrice: 50 },
    ],
    requiredDownPayment: 780,
    validUntil: '2098-12-31',
    terms: '  Valid for the stated event details. ',
  });
  assert.equal(quote.version, 2);
  assert.deepEqual(calls[0], {
    name: 'sendQuote',
    args: [3, 5, {
      items: [
        { description: 'Buffet service', quantity: 100, unitPrice: 25, lineTotal: 2500 },
        { description: 'Coffee station', quantity: 2, unitPrice: 50, lineTotal: 100 },
      ],
      subtotal: 2600,
      total: 2600,
      requiredDownPayment: 780,
      validUntil: '2098-12-31',
      terms: 'Valid for the stated event details.',
    }],
  });
});

test('rejects invalid quotation values before repository work', async () => {
  const { service, calls } = fixture();
  for (const body of [
    { items: [], requiredDownPayment: 0, validUntil: '2098-12-31' },
    { items: [{ description: 'Food', quantity: 1, unitPrice: -1 }], requiredDownPayment: 0, validUntil: '2098-12-31' },
    { items: [{ description: 'Food', quantity: 1, unitPrice: 100 }], requiredDownPayment: 101, validUntil: '2098-12-31' },
    { items: [{ description: 'Food', quantity: 1, unitPrice: 100 }], requiredDownPayment: 30, validUntil: '2020-01-01' },
  ]) await assert.rejects(service.sendQuote(3, 5, body));
  assert.equal(calls.length, 0);
});

test('clarification and rejection require bounded reasons and retain admin identity', async () => {
  const { service, calls } = fixture();
  await service.requestClarification(3, 5, { reason: '  Please confirm dietary needs. ' });
  await service.reject(3, 5, { reason: '  Date cannot be accommodated. ' });
  assert.deepEqual(calls, [
    { name: 'clarify', args: [3, 5, 'Please confirm dietary needs.'] },
    { name: 'reject', args: [3, 5, 'Date cannot be accommodated.'] },
  ]);
  for (const body of [{}, { reason: '' }, { reason: 'x'.repeat(1001) }]) {
    await assert.rejects(service.requestClarification(3, 5, body));
    await assert.rejects(service.reject(3, 5, body));
  }
});
