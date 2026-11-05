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

test('all authenticated administrator quotation endpoints are retired', async t => {
  const { errorHandler } = await import('../middleware/error.middleware.js');
  const { closeDatabase } = await import('../config/database.js');

  const pool = {
    connected: true,
    request: () => ({
      input() { return this; },
      query: async () => ({ recordset: [{
        admin_id: 3,
        full_name: 'Test Administrator',
        email: 'admin@example.test',
      }] }),
    }),
    close: async () => undefined,
  };
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => pool);

  const { default: adminRoutes } = await import('./admin.routes.js');
  const app = express().use(express.json()).use('/api/admin', adminRoutes).use(errorHandler);
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api/admin/custom-events`;

  try {
    const unauthenticated = await fetch(base);
    assert.equal(unauthenticated.status, 401);

    for (const request of [
      { path: '', method: 'GET' },
      { path: '/42', method: 'GET' },
      { path: '/42/quotes', method: 'POST' },
      { path: '/42/request-clarification', method: 'POST' },
      { path: '/42/reject', method: 'POST' },
    ]) {
      const response = await fetch(`${base}${request.path}`, {
        method: request.method,
        headers: { cookie: 'la_chef_admin_session=admin', 'content-type': 'application/json' },
        body: request.method === 'POST' ? '{}' : undefined,
      });
      assert.equal(response.status, 410);
      assert.equal((await response.json() as { code: string }).code, 'CUSTOM_QUOTATION_RETIRED');
    }
  } finally {
    server.close();
    await once(server, 'close');
    await closeDatabase();
  }
});
