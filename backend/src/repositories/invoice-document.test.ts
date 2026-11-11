import assert from 'node:assert/strict';
import test from 'node:test';
import sql from 'mssql';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const [{ findInvoice }, { closeDatabase }] = await Promise.all([
  import('./invoice.repository.js'), import('../config/database.js'),
]);

test('invoice and receipt use the issuing administrator and retain the recorded payment ledger', async t => {
  const pool = { connected: true, close: async () => {}, request: () => new sql.Request() };
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => pool);
  t.mock.method(sql.Request.prototype, 'query', async (command: string) => {
    if (command.includes('SELECT i.invoice_id,i.invoice_number')) {
      assert.match(command, /issuer\.admin_id=i\.issued_by/);
      assert.match(command, /@customerId IS NULL OR c\.customer_id=@customerId/);
      return { recordset: [{ invoice_id: 8, invoice_number: 'INV-8', issued_at: '2026-11-10', status: 'ISSUED',
        subtotal: 10000, discount_amount: 0, total_amount: 10000, amount_paid: 5000,
        reservation_id: 42, reservation_status: 'CONFIRMED', booking_reference: 'BK-42',
        event_type: 'Wedding', event_date: '2026-12-10', event_time: '1970-01-01T12:00:00Z',
        guest_count: 50, customer_id: 7, customer_name: 'Preview Customer', issuer_name: 'Issuing Administrator' }] };
    }
    if (command.includes('FROM dbo.INVOICE_ITEM')) return { recordset: [] };
    if (command.includes('FROM dbo.PAYMENT_TRANSACTION')) {
      assert.match(command, /ORDER BY pt\.payment_date DESC,pt\.payment_transaction_id DESC/);
      return { recordset: [{ id: 1, payment_date: '2026-11-10',
        transaction_ref: 'CASH-42', payment_method: 'CASH', amount: 5000, status: 'RECORDED' }] };
    }
    throw new Error('Unexpected invoice query');
  });
  try {
    const doc = await findInvoice(8, 7);
    assert.equal(doc?.issuer?.name, 'Issuing Administrator');
    assert.equal(doc?.customer.name, 'Preview Customer');
    assert.equal(doc?.amountPaid, 5000);
    assert.equal(doc?.remainingBalance, 5000);
    assert.equal(doc?.payments[0].reference, 'CASH-42');
  } finally { await closeDatabase(); }
});
