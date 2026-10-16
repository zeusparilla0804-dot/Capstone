import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';

import express from 'express';
import sql from 'mssql';

process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';
process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';

test('custom quotation creation is retired while authenticated history detail remains available', async t => {
  const { customEventController } = await import('../controllers/custom-event.controller.js');
  const { errorHandler } = await import('../middleware/error.middleware.js');
  const { closeDatabase } = await import('../config/database.js');
  let createCalls = 0;
  t.mock.method(customEventController, 'create', async (_req, res) => {
    createCalls += 1;
    res.status(201).json({ success: true });
  });
  t.mock.method(customEventController, 'detail', async (_req, res) => {
    res.json({ success: true, data: { id: 42, status: 'QUOTED' } });
  });

  const pool = {
    connected: true,
    request: () => ({
      input() { return this; },
      query: async () => ({ recordset: [{
        customer_id: 7,
        first_name: 'Test',
        last_name: 'Customer',
        email: 'customer@example.test',
        contact_number: '09171234567',
      }] }),
    }),
    close: async () => undefined,
  };
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => pool);

  const { default: customEventRoutes } = await import('./custom-event.routes.js');
  const app = express().use(express.json()).use('/api/custom-events', customEventRoutes).use(errorHandler);
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api/custom-events`;

  try {
    const unauthenticated = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(unauthenticated.status, 401);

    const authenticated = await fetch(base, {
      method: 'POST',
      headers: { cookie: 'la_chef_session=customer', 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(authenticated.status, 410);
    assert.deepEqual(await authenticated.json(), {
      success: false,
      message: 'Custom quotation requests are no longer available. Select a package and add special requests to your reservation.',
      code: 'CUSTOM_QUOTATION_RETIRED',
    });
    assert.equal(createCalls, 0);

    const detail = await fetch(`${base}/42`, { headers: { cookie: 'la_chef_session=customer' } });
    assert.equal(detail.status, 200);
    assert.equal((await detail.json() as { data: { id: number } }).data.id, 42);
  } finally {
    server.close();
    await once(server, 'close');
    await closeDatabase();
  }
});
