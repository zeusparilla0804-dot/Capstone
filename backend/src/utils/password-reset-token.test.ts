import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { readPasswordResetConfiguration } from '../config/environment.js';
import {
  createPasswordResetToken,
  reconstructPasswordResetToken,
  validatePasswordResetToken,
} from './password-reset-token.js';

const secret = '0123456789abcdef0123456789abcdef';

test('creates unique role-bound reset tokens with storage hashes', () => {
  const first = createPasswordResetToken('CUSTOMER', secret);
  const second = createPasswordResetToken('CUSTOMER', secret);

  assert.match(first.selector, /^[A-Za-z0-9_-]{22}$/);
  assert.match(first.token, /^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
  assert.match(first.tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(first.selector, second.selector);
  assert.equal(first.tokenHash, createHash('sha256').update(first.token).digest('hex'));
  assert.deepEqual(validatePasswordResetToken(first.token, 'CUSTOMER', secret), {
    selector: first.selector,
    tokenHash: first.tokenHash,
  });
});

test('reconstructs only the token for the intended principal and secret', () => {
  const issued = createPasswordResetToken('ADMIN', secret);

  assert.equal(reconstructPasswordResetToken(issued.selector, 'ADMIN', secret), issued.token);
  assert.equal(validatePasswordResetToken(issued.token, 'CUSTOMER', secret), undefined);
  assert.equal(validatePasswordResetToken(issued.token, 'ADMIN', `${secret}rotated`), undefined);
});

test('rejects malformed and forged reset tokens without throwing', () => {
  const issued = createPasswordResetToken('CUSTOMER', secret);
  const replacement = issued.token.endsWith('A') ? 'B' : 'A';
  const forged = `${issued.token.slice(0, -1)}${replacement}`;

  for (const token of ['', 'selector', '.proof', `${issued.selector}.short`, `${issued.selector}.${'!'.repeat(43)}`, forged]) {
    assert.equal(validatePasswordResetToken(token, 'CUSTOMER', secret), undefined);
  }
  assert.throws(() => reconstructPasswordResetToken('bad selector', 'CUSTOMER', secret), /selector/i);
});

test('password reset configuration is optional outside production and fixed to approved timing', () => {
  assert.deepEqual(readPasswordResetConfiguration({}, 'development'), {
    hmacSecret: undefined,
    ttlMs: 900_000,
    cooldownMs: 60_000,
  });
  assert.deepEqual(readPasswordResetConfiguration({ PASSWORD_RESET_HMAC_SECRET: ` ${secret} ` }, 'test'), {
    hmacSecret: secret,
    ttlMs: 900_000,
    cooldownMs: 60_000,
  });
});

test('password reset configuration rejects unsafe production and supplied short secrets', () => {
  assert.throws(() => readPasswordResetConfiguration({}, 'production'), /PASSWORD_RESET_HMAC_SECRET/);
  assert.throws(
    () => readPasswordResetConfiguration({ PASSWORD_RESET_HMAC_SECRET: 'too-short' }, 'production'),
    /at least 32 bytes/i,
  );
  assert.throws(
    () => readPasswordResetConfiguration({ PASSWORD_RESET_HMAC_SECRET: 'too-short' }, 'development'),
    /at least 32 bytes/i,
  );
});
