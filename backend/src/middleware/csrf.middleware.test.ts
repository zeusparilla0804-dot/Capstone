import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createCsrfProtection } from './csrf.middleware.js';

test('CSRF defense rejects forms, missing headers, hostile origins and cross-site requests before writes', async () => {
  const app = express();
  app.use(createCsrfProtection(origin => origin === 'http://localhost:4200'));
  app.all('/write', (_req, res) => res.sendStatus(204));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/write`;
  try {
    for (const headers of [{}, { 'x-la-chef-request': '1', origin: 'https://evil.test' },
      { 'x-la-chef-request': '1', 'sec-fetch-site': 'cross-site' }]) {
      assert.equal((await fetch(base, { method: 'POST', headers })).status, 403);
    }
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal((await fetch(base, { method, headers: { 'x-la-chef-request': '1', origin: 'http://localhost:4200' } })).status, 204);
    }
    assert.equal((await fetch(base, { method: 'POST', headers: { 'x-la-chef-request': '1' } })).status, 204);
    assert.equal((await fetch(base)).status, 204);
    const multipart = new FormData(); multipart.append('reference', 'test');
    assert.equal((await fetch(base, { method: 'POST', body: multipart, headers: { 'x-la-chef-request': '1' } })).status, 204);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
