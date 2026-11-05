import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmailCodeChallenge, emailCode, emailCodeHash } from './email-verification-code.js';

const secret = 'a'.repeat(40);
test('six-digit email codes reconstruct privately and bind their proof to the email identity', () => {
  const challenge = createEmailCodeChallenge(secret, 'customer@example.test');
  assert.match(challenge.selector, /^[A-Za-z0-9_-]{22}$/);
  const code = emailCode(challenge.selector, secret);
  assert.match(code, /^\d{6}$/);
  assert.equal(challenge.codeHash, emailCodeHash(challenge.selector, 'customer@example.test', code, secret));
  assert.notEqual(challenge.codeHash, emailCodeHash(challenge.selector, 'other@example.test', code, secret));
  assert.notEqual(challenge.codeHash, emailCodeHash(challenge.selector, 'customer@example.test', code, 'b'.repeat(40)));
  assert.equal('code' in challenge, false);
  assert.notEqual(challenge.selector, createEmailCodeChallenge(secret, 'customer@example.test').selector);
});
test('invalid selectors and malformed codes are rejected before cryptographic work', () => {
  assert.throws(() => emailCode('invalid', secret));
  assert.throws(() => emailCode('a'.repeat(22), 'short'));
  for (const code of ['12345', '1234567', '12e456', '12 456']) {
    assert.throws(() => emailCodeHash('a'.repeat(22), 'customer@example.test', code, secret));
  }
});
