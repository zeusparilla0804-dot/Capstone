import assert from 'node:assert/strict';
import test from 'node:test';
import sql from 'mssql';
process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost'; process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test'; process.env.DB_PASSWORD ??= 'test';
const { customerUpdates, markCustomerUpdatesRead } = await import('./customer-notifications.repository.js');
const { replacePackageImages } = await import('./package-images.repository.js');
const { closeDatabase } = await import('../config/database.js');

test('customer notifications scope email and QR updates to the owner and only acknowledge owned keys', async t => {
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => ({ connected: true, close: async () => {}, request: () => new sql.Request() }));
  let readKeys: unknown[] = [];
  t.mock.method(sql.Request.prototype, 'query', async function (command: string) {
    assert.equal(this.parameters['customerId']?.value, 7);
    if (command.includes('WITH updates AS')) {
      assert.match(command, /WHERE r.customer_id=@customerId/g);
      assert.equal(command.match(/r.customer_id=@customerId/g)?.length, 2);
      assert.match(command, /d.method=p.payment_method/);
      return { recordset: [{ id: 'email:1', templateKey: 'BOOKING_APPROVED', bookingId: 42, reference: 'BK-42', createdAt: new Date('2026-11-08'), isRead: 0 }], rowsAffected: [1] };
    }
    assert.match(command, /MERGE dbo.CUSTOMER_NOTIFICATION_READ/);
    readKeys = Object.entries(this.parameters).filter(([name]) => name.startsWith('key')).map(([, parameter]) => parameter.value);
    return { recordset: [], rowsAffected: [1] };
  });
  try {
    assert.equal((await customerUpdates(7))[0]?.title, 'Booking approved');
    await markCustomerUpdatesRead(7, ['email:1', 'email:another-customer', 'email:1']);
    assert.deepEqual(readKeys, ['email:1']);
  } finally { await closeDatabase(); }
});

test('gallery replacement rejects an image belonging to another package before deleting existing photos', async t => {
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => ({ connected: true, close: async () => {} }));
  t.mock.method(sql.Transaction.prototype, 'begin', async function () { return this; });
  let rolledBack = false;
  t.mock.method(sql.Transaction.prototype, 'rollback', async () => { rolledBack = true; });
  t.mock.method(sql.Request.prototype, 'query', async (command: string) => {
    if (command.includes('FROM dbo.PACKAGE WITH')) return { recordset: [{ package_id: 2 }], rowsAffected: [1] };
    if (command.includes('FROM dbo.PACKAGE_IMAGE')) return { recordset: [{ id: 11, assetPath: 'assets/images/packages/debut/amethyst-01.webp' }], rowsAffected: [1] };
    throw Error('Existing gallery must not be deleted or modified');
  });
  try {
    await assert.rejects(replacePackageImages(2, [{ id: 999 }], []), /images changed/);
    assert.equal(rolledBack, true);
  } finally { await closeDatabase(); }
});
