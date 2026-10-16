import assert from 'node:assert/strict';
import test from 'node:test';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const invoiceRepository = await import('./invoice.repository.js');

test('per-head invoice package line keeps guest quantity and per-head rate', () => {
  const buildLine = (invoiceRepository as typeof invoiceRepository & {
    buildInvoicePackageLine: (row: Record<string, unknown>) => Record<string, unknown>;
  }).buildInvoicePackageLine;

  assert.deepEqual(buildLine({
    package_name_snapshot: 'Premium Buffet',
    package_pricing_type: 'PER_HEAD',
    guest_count: 100,
    package_unit_price: 580,
    package_total: 58_000,
  }), {
    description: 'Premium Buffet - 100 guests at PHP 580.00 per guest',
    quantity: 100,
    unitPrice: 580,
    total: 58_000,
  });
});

test('base-plus-excess invoice package line states included and excess guests', () => {
  const buildLine = (invoiceRepository as typeof invoiceRepository & {
    buildInvoicePackageLine: (row: Record<string, unknown>) => Record<string, unknown>;
  }).buildInvoicePackageLine;

  assert.deepEqual(buildLine({
    package_name_snapshot: 'Amethyst Package',
    package_pricing_type: 'BASE_PLUS_EXCESS',
    guest_count: 51,
    package_base_price: 85_888,
    package_included_guests: 50,
    package_excess_guest_price: 650,
    package_total: 86_538,
  }), {
    description: 'Amethyst Package - includes 50 guests; 1 excess guest at PHP 650.00',
    quantity: 1,
    unitPrice: 86_538,
    total: 86_538,
  });
});
