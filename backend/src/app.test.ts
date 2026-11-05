import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import app from './app.js';
import { passwordRecoveryService } from './services/password-recovery.service.js';
import { emailVerificationService } from './services/email-verification.service.js';
import { authService } from './services/auth.service.js';

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
    headers: { 'content-type': 'application/json', 'x-la-chef-request': '1' },
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
  const customer = await fetch(`${origin}/api/auth/logout-all`, { method: 'POST', headers: { 'x-la-chef-request': '1' } });
  const administrator = await fetch(`${origin}/api/auth/admin/logout-all`, { method: 'POST', headers: { 'x-la-chef-request': '1' } });
  assert.equal(customer.status, 401);
  assert.equal(administrator.status, 401);
});

test('admin password step with MFA does not issue a session cookie', async t => {
  t.mock.method(authService, 'adminLogin', async () => ({ requiresMfa: true as const, challenge: 'test-challenge', setupSecret: 'SETUPKEY' }));
  const response = await fetch(`${origin}/api/auth/admin/login`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-la-chef-request': '1' },
    body: JSON.stringify({ identity: 'admin@example.test', password: 'existing-password' }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.has('set-cookie'), false);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).data.requiresMfa, true);
});

test('admin MFA completion issues the session only after verification', async t => {
  t.mock.method(authService, 'completeAdminMfa', async () => ({
    user: { id: 7, fullName: 'Admin', email: 'admin@example.test', role: 'admin' as const },
    session: { token: 'session-token', expiresAt: new Date(Date.now() + 60_000) },
    recoveryCodes: ['A'.repeat(20)],
  }));
  const response = await fetch(`${origin}/api/auth/admin/mfa/complete`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-la-chef-request': '1' },
    body: JSON.stringify({ challenge: 'a'.repeat(43), code: '123456' }) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie') ?? '', /la_chef_admin_session=session-token/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await response.json()).data.recoveryCodes, ['A'.repeat(20)]);
});

test('email verification and resend have independent IP limits and never issue a session cookie', async t => {
  t.mock.method(emailVerificationService, 'verify', async () => undefined);
  t.mock.method(emailVerificationService, 'requestCode', async () => undefined);
  for (const [path, count, success] of [['verify', 20, 200], ['resend', 5, 202]] as const) {
    for (let attempt = 0; attempt <= count; attempt++) {
      const response = await fetch(`${origin}/api/auth/email/${path}`, { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-la-chef-request': '1' },
        body: JSON.stringify({ email: 'person@example.test', code: '012345' }) });
      assert.equal(response.status, attempt < count ? success : 429);
      assert.equal(response.headers.has('set-cookie'), false);
    }
  }
});
