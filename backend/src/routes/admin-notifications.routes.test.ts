import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import sql from 'mssql';

process.env.NODE_ENV = 'test';
process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.DB_SERVER ??= 'localhost'; process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test'; process.env.DB_PASSWORD ??= 'test';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
const { default: app } = await import('../app.js');
const { adminNotificationRepository } = await import('../repositories/admin-notifications.repository.js');
const { closeDatabase } = await import('../config/database.js');

test('admin notification endpoints enforce admin sessions, validate selection, and never acknowledge on GET', async t => {
  let adminId = 7;
  const lists: unknown[][] = [], writes: unknown[][] = [], bulkWrites: unknown[] = [];
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => ({ connected: true, close: async () => {}, request: () => new sql.Request() }));
  t.mock.method(sql.Request.prototype, 'query', async (command: string) => {
    assert.match(command, /FROM dbo.ADMIN_SESSION/);
    return { recordset: [{ admin_id: adminId, full_name: 'Administrator', email: 'admin@example.test' }], rowsAffected: [1] };
  });
  t.mock.method(adminNotificationRepository, 'list', async (...args: unknown[]) => {
    lists.push(args); return { items: [], page: 2, pageSize: 20, totalItems: 24, totalPages: 2, unreadCount: 99 };
  });
  t.mock.method(adminNotificationRepository, 'markRead', async (...args: unknown[]) => { writes.push(args); });
  t.mock.method(adminNotificationRepository, 'markAllRead', async (id: number) => { bulkWrites.push(id); });
  const server = createServer(app).listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/admin/notifications`;
  const headers = { cookie: 'la_chef_admin_session=test', 'content-type': 'application/json', 'x-la-chef-request': '1' };
  const post = (body: unknown, sentHeaders = headers) => fetch(`${url}/read`, { method: 'POST', headers: sentHeaders, body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { cookie: 'la_chef_session=customer' } })).status, 401);
    assert.equal((await post({ ids: ['proof:1'] }, { ...headers, cookie: '' })).status, 401);
    const response = await fetch(`${url}?page=2&unreadOnly=true&adminId=99&period=2020-01`, { headers });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { success: true, data: { items: [], page: 2, pageSize: 20, totalItems: 24, totalPages: 2, unreadCount: 99 } });
    assert.deepEqual(lists, [[7, { page: 2, pageSize: 20, unreadOnly: true }]]);
    assert.equal(writes.length, 0, 'opening Overview does not acknowledge anything');
    for (const suffix of ['?page=0', '?pageSize=101', '?unreadOnly=1', '?page=1&page=2']) assert.equal((await fetch(url + suffix, { headers })).status, 400);
    for (const body of [{}, { ids: [12] }, { ids: ['x'.repeat(121)] }, { ids: Array(51).fill('proof:1') }]) assert.equal((await post(body)).status, 400);
    assert.equal(writes.length, 0);
    const read = await post({ ids: ['proof:1', 'proof:1'], adminId: 99 });
    assert.equal(read.status, 200); assert.deepEqual(await read.json(), { success: true });
    assert.deepEqual(writes, [[7, ['proof:1']]]);
    adminId = 8;
    assert.equal((await post({ ids: ['proof:1'] })).status, 200);
    assert.deepEqual(writes[1], [8, ['proof:1']], 'a new session writes only the new administrator state');
    const readAll = (sentHeaders = headers) => fetch(`${url}/read-all`, { method: 'POST', headers: sentHeaders, body: JSON.stringify({ adminId: 99 }) });
    assert.equal((await readAll({ ...headers, cookie: '' })).status, 401);
    assert.equal((await readAll({ ...headers, 'x-la-chef-request': '' })).status, 403);
    assert.equal((await fetch(`${url}/read-all`, { headers })).status, 404);
    assert.deepEqual(bulkWrites, []);
    const allRead = await readAll();
    assert.equal(allRead.status, 200);
    assert.equal(allRead.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await allRead.json(), { success: true });
    assert.deepEqual(bulkWrites, [8], 'bulk acknowledgment uses the authenticated administrator, never the posted ID');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await closeDatabase();
  }
});
