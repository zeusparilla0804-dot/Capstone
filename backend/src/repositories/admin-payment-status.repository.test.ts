import assert from 'node:assert/strict';
import test from 'node:test';
import sql from 'mssql';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const [adminRepository, { closeDatabase }] = await Promise.all([
  import('./admin.repository.js'), import('../config/database.js'),
]);

test('admin reservation and payment reloads expose the same recorded amount and latest proof', async t => {
  const pool = { connected: true, close: async () => {}, request: () => new sql.Request() };
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => pool);
  t.mock.method(sql.Request.prototype, 'query', async (command: string) => {
    assert.match(command, /PAYMENT_PROOF pp/);
    assert.match(command, /proof\.latestProofStatus/);
    if (command.includes('FROM dbo.RESERVATION r JOIN dbo.CUSTOMER')) {
      assert.match(command, /COALESCE\(pay\.amount_paid,0\) amountPaid/);
      return { recordset: [{ id: 42, reference: 'BK-42', eventDate: '2027-12-20', guestCount: 100,
        total: 10000, amountPaid: 5000, latestProofStatus: 'VERIFIED', status: 'PAYMENT_VERIFIED',
        activeBookingCount: 1, largestGuestCount: 100, hasMediumEvent: 0, total_count: 1 }], rowsAffected: [1] };
    }
    if (command.includes('FROM dbo.PAYMENT pay')) {
      return { recordset: [{ id: 7, bookingReference: 'BK-42', amountDue: 10000,
        amountPaid: 5000, latestProofStatus: 'VERIFIED', status: 'PARTIALLY_PAID', total_count: 1 }], rowsAffected: [1] };
    }
    throw new Error(`Unexpected query: ${command}`);
  });
  const query = { page: 1, pageSize: 20, search: '', status: '', eventType: '', date: '' };
  try {
    const [bookings, payments] = await Promise.all([
      adminRepository.bookings(query), adminRepository.payments(query),
    ]);
    assert.equal(bookings.items[0]?.amountPaid, payments.items[0]?.amountPaid);
    assert.equal(bookings.items[0]?.latestProofStatus, payments.items[0]?.latestProofStatus);
  } finally { await closeDatabase(); }
});
