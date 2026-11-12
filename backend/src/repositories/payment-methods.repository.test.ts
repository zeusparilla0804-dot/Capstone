import assert from 'node:assert/strict';
import test from 'node:test';
import sql from 'mssql';
process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost'; process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test'; process.env.DB_PASSWORD ??= 'test';
const { availableOnlinePaymentMethods, hasAvailablePaymentQr } = await import('./payment-methods.repository.js');
const { chooseBookingPayment } = await import('../services/booking-payment.service.js');
const { closeDatabase } = await import('../config/database.js');

test('online choices expose only distinct methods with an available nonempty QR image', async t => {
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => ({ connected: true, close: async () => {}, request: () => new sql.Request() }));
  t.mock.method(sql.Request.prototype, 'query', async (command: string) => {
    assert.match(command, /SELECT DISTINCT method/);
    assert.match(command, /is_available\s*=\s*1/);
    assert.match(command, /DATALENGTH\(image_bytes\)\s*>\s*0/);
    assert.match(command, /BANK_TRANSFER/);
    assert.doesNotMatch(command, /E-WALLET/);
    return { recordset: [{ method: 'BANK_TRANSFER' }], rowsAffected: [1] };
  });
  try { assert.deepEqual(await availableOnlinePaymentMethods(), ['BANK_TRANSFER']); }
  finally { await closeDatabase(); }
});

test('QR availability checks bind the chosen method and reject an empty result', async t => {
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => ({ connected: true, close: async () => {}, request: () => new sql.Request() }));
  t.mock.method(sql.Request.prototype, 'query', async function (command: string) {
    assert.equal(this.parameters['method']?.value, 'BANK_TRANSFER');
    assert.match(command, /is_available\s*=\s*1/);
    assert.match(command, /DATALENGTH\(image_bytes\)\s*>\s*0/);
    return { recordset: [], rowsAffected: [0] };
  });
  try { assert.equal(await hasAvailablePaymentQr('BANK_TRANSFER'), false); }
  finally { await closeDatabase(); }
});

test('a QR deactivated after the page loaded cannot be saved as a payment choice', async t => {
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => ({ connected: true, close: async () => {} }));
  t.mock.method(sql.Transaction.prototype, 'begin', async function () { return this; });
  let rolledBack = false;
  t.mock.method(sql.Transaction.prototype, 'rollback', async () => { rolledBack = true; });
  t.mock.method(sql.Request.prototype, 'query', async (command: string) => {
    if (command.includes('FROM dbo.RESERVATION')) return { recordset: [{ status: 'AWAITING_PAYMENT', method: null, amountPaid: 0, hasProof: false, eventDate: '2027-12-01', guestCount: 50 }], rowsAffected: [1] };
    if (command.includes('FROM dbo.PAYMENT_DESTINATION')) return { recordset: [], rowsAffected: [0] };
    throw Error('An unavailable QR method must not be saved');
  });
  try {
    await assert.rejects(chooseBookingPayment(7, 42, 'bank-transfer'), /no available QR/i);
    assert.equal(rolledBack, true);
  } finally { await closeDatabase(); }
});
