import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import test from 'node:test';
import { hashPassword, verifyPassword } from './password.js';

test('new hashes record explicit stronger scrypt work factors and unique salts', async () => {
  const first = await hashPassword('a long catering passphrase');
  assert.match(first, /^scrypt\$v1\$16384\$8\$5\$/);
  assert.notEqual(first, await hashPassword('a long catering passphrase'));
  assert.equal(await verifyPassword('a long catering passphrase', first), true);
  assert.equal(await verifyPassword('incorrect', first), false);
});
test('existing scrypt passwords still authenticate without forced reset', async () => {
  const salt = Buffer.alloc(16, 7);
  const legacy = `scrypt:${salt.toString('hex')}:${scryptSync('old-password', salt, 64).toString('hex')}`;
  assert.equal(await verifyPassword('old-password', legacy), true);
  assert.equal(await verifyPassword('wrong', legacy), false);
});
test('malformed hashes and attacker-selected work factors fail safely', async () => {
  for (const hash of ['scrypt:zz:ab', 'scrypt:aa:bb', 'scrypt$v1$999999999$8$5$aa$bb']) {
    assert.equal(await verifyPassword('password', hash), false);
  }
});
