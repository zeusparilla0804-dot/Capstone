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

test('available payment methods require a customer session and expose no account or QR details', async t => {
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => ({ connected: true, close: async () => {}, request: () => new sql.Request() }));
  let methods: { method: string }[] = [{ method: 'BANK_TRANSFER' }];
  t.mock.method(sql.Request.prototype, 'query', async (command: string) => {
    if (command.includes('dbo.AUTH_SESSION')) return { recordset: [{ customer_id: 7, first_name: 'Test', last_name: 'Customer', email: 'test@example.test' }], rowsAffected: [1] };
    if (command.includes('FROM dbo.BOOKING_POLICY')) return { recordset: [], rowsAffected: [0] };
    assert.match(command, /SELECT DISTINCT method FROM dbo.PAYMENT_DESTINATION/);
    return { recordset: methods, rowsAffected: [methods.length] };
  });
  const server = createServer(app).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/api/payment-destinations/methods`;
  try {
    assert.equal((await fetch(url)).status, 401);
    const response = await fetch(url, { headers: { cookie: 'la_chef_session=customer' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { success: true, data: ['BANK_TRANSFER'] });
    methods = [];
    const empty = await fetch(url, { headers: { cookie: 'la_chef_session=customer' } });
    assert.deepEqual(await empty.json(), { success: true, data: [] });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await closeDatabase();
  }
});
