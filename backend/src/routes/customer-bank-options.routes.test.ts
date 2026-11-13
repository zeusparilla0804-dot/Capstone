import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import sql from 'mssql';
process.env.NODE_ENV = 'test';
process.env.FRONTEND_URL = 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT = 'test-proofs';
process.env.DB_SERVER = 'localhost'; process.env.DB_DATABASE = 'test';
process.env.DB_USER = 'test'; process.env.DB_PASSWORD = 'test';
const { default: app } = await import('../app.js');
const { closeDatabase } = await import('../config/database.js');

test('customers select versioned bank QRs without assignments and cannot open another booking', async t => {
  const bank = { id: 2, method: 'BANK_TRANSFER', label: 'Bank B', accountName: 'LA Chef', accountHint: '••1234',
    isAvailable: true, mime: 'image/png', image: Buffer.from('bank-b-image') };
  let owner = 7;
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => ({ connected: true, close: async () => {}, request: () => new sql.Request() }));
  t.mock.method(sql.Request.prototype, 'query', async (command: string) => {
    if (command.includes('dbo.AUTH_SESSION')) return { recordset: [{ customer_id: 7, first_name: 'Test', last_name: 'Customer', email: 'test@example.test' }], rowsAffected: [1] };
    if (command.includes('FROM dbo.BOOKING_POLICY')) return { recordset: [], rowsAffected: [0] };
    assert.doesNotMatch(command, /\b(INSERT|UPDATE|MERGE|DELETE)\b/i);
    assert.doesNotMatch(command, /BOOKING_PAYMENT_DESTINATION/);
    if (command.includes('FROM dbo.RESERVATION')) return { recordset: [{ customerId: owner, status: 'CONFIRMED', method: 'BANK_TRANSFER', amountDue: 100000, amountPaid: 50000 }], rowsAffected: [1] };
    assert.match(command, /dbo.PAYMENT_DESTINATION/);
    return { recordset: [bank], rowsAffected: [1] };
  });
  const server = createServer(app).listen(0, '127.0.0.1'); await once(server, 'listening');
  const root = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/payment-destinations/bookings/42/options`;
  const headers = { cookie: 'la_chef_session=customer' };
  try {
    assert.equal((await fetch(root)).status, 401);
    const response = await fetch(root, { headers });
    assert.equal(response.status, 200, 'an owner can select a bank without an assignment');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const { data } = await response.json() as { data: { id: number; label: string; version: string }[] };
    assert.equal(data[0]?.label, 'Bank B'); assert.match(data[0]!.version, /^[a-f0-9]{64}$/);
    const image = await fetch(`${root}/2/image?version=${data[0]!.version}`, { headers });
    assert.equal(image.status, 200); assert.equal(image.headers.get('content-type'), 'image/png');
    assert.equal(await image.text(), 'bank-b-image');
    bank.image = Buffer.from('updated-image');
    assert.equal((await fetch(`${root}/2/image?version=${data[0]!.version}`, { headers })).status, 409);
    bank.isAvailable = false;
    assert.equal((await fetch(`${root}/2/image?version=${data[0]!.version}`, { headers })).status, 409);
    owner = 8;
    assert.equal((await fetch(root, { headers })).status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await closeDatabase();
  }
});
