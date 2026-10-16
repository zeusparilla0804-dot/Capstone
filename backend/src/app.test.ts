import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import app from './app.js';
import { passwordRecoveryService } from './services/password-recovery.service.js';

let server: Server;
let origin: string;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('session checks do not consume the authentication-attempt rate limit', async () => {
  const statuses: number[] = [];

  for (let request = 0; request < 21; request += 1) {
    const response = await fetch(`${origin}/api/auth/me`);
    statuses.push(response.status);
  }

  assert.deepEqual(statuses, Array.from({ length: 21 }, () => 401));
});

test('password recovery has dedicated forgot and reset limits without consuming session checks', async t => {
  t.mock.method(passwordRecoveryService, 'request', async () => undefined);
  t.mock.method(passwordRecoveryService, 'reset', async () => undefined);
  const post = (path: string, body: Record<string, unknown>) => fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const forgotStatuses: number[] = [];
  for (let request = 0; request < 6; request += 1) {
    forgotStatuses.push((await post('/api/auth/password/forgot', { email: 'person@example.test' })).status);
  }
  assert.deepEqual(forgotStatuses, [202, 202, 202, 202, 202, 429]);

  const token = `${'a'.repeat(22)}.${'b'.repeat(43)}`;
  const resetStatuses: number[] = [];
  for (let request = 0; request < 11; request += 1) {
    resetStatuses.push((await post('/api/auth/admin/password/reset', {
      token,
      password: 'new-password-123',
      confirmPassword: 'new-password-123',
    })).status);
  }
  assert.deepEqual(resetStatuses, [...Array.from({ length: 10 }, () => 200), 429]);
  assert.equal((await fetch(`${origin}/api/auth/me`)).status, 401);
});

test('all-device logout routes require the matching authenticated account type', async () => {
  const customer = await fetch(`${origin}/api/auth/logout-all`, { method: 'POST' });
  const administrator = await fetch(`${origin}/api/auth/admin/logout-all`, { method: 'POST' });
  assert.equal(customer.status, 401);
  assert.equal(administrator.status, 401);
});
