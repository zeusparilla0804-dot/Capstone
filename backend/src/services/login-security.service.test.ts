import assert from 'node:assert/strict';
import test from 'node:test';
import { createLoginSecurity, throttleKey } from './login-security.service.js';

test('known account aliases share a throttle key while roles and unknown accounts remain separate', () => {
  assert.equal(throttleKey('ADMIN', 7, 'admin@example.test'), throttleKey('ADMIN', 7, 'admin'));
  assert.notEqual(throttleKey('ADMIN', 7, 'admin'), throttleKey('CUSTOMER', 7, 'admin'));
  assert.equal(throttleKey('CUSTOMER', undefined, 'A@EXAMPLE.TEST'), throttleKey('CUSTOMER', undefined, ' a@example.test '));
});
test('cooldown blocks verification and session creation; failures and successes are audited without credentials', async () => {
  let allowed = true, verifies = 0, clears = 0;
  const events: any[] = [];
  const security = createLoginSecurity({
    takeAttempt: async () => allowed,
    clearAttempts: async () => { clears++; },
    recordEvent: async event => { events.push(event); },
    verify: async (_password, hash) => { verifies++; return hash === 'valid-hash'; },
    dummyHash: async () => 'dummy-hash',
  });
  const input = { role: 'ADMIN' as const, principalId: 7, identity: 'admin@example.test', password: 'secret', passwordHash: 'bad-hash', ip: '127.0.0.1' };
  await assert.rejects(security.authenticate(input), { statusCode: 401 });
  allowed = false;
  await assert.rejects(security.authenticate({ ...input, passwordHash: 'valid-hash' }), { statusCode: 429 });
  assert.equal(verifies, 1);
  allowed = true;
  const success = await security.authenticate({ ...input, passwordHash: 'valid-hash' });
  assert.equal(success.event, 'LOGIN_SUCCESS');
  assert.equal(clears, 1);
  assert.deepEqual(events.map(e => e.event), ['LOGIN_FAILED', 'LOGIN_THROTTLED']);
  const serialized = JSON.stringify(events);
  for (const secret of ['secret', 'valid-hash', 'admin@example.test', '127.0.0.1']) assert.ok(!serialized.includes(secret));
});
test('unknown identities use dummy hashing and generic errors', async () => {
  let dummyVerified = false;
  const security = createLoginSecurity({ takeAttempt: async () => true, clearAttempts: async () => {}, recordEvent: async () => {},
    dummyHash: async () => 'dummy', verify: async (_p, h) => { dummyVerified = h === 'dummy'; return false; } });
  await assert.rejects(security.authenticate({ role: 'CUSTOMER', identity: 'missing@example.test', password: 'secret' }), /Invalid email or password/);
  assert.equal(dummyVerified, true);
});
