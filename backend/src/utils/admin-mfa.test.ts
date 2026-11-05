import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decryptSecret, encryptSecret, newRecoveryCodes, newTotpSecret, recoveryCodeHash, totpAt, verifyTotp } from './admin-mfa.js';

test('TOTP follows the RFC 6238 SHA1 test vector and blocks replay', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(totpAt(secret, 1), '287082');
  assert.equal(verifyTotp(secret, '287082', 59_000, null), 1);
  assert.equal(verifyTotp(secret, '287082', 59_000, 1), null);
});

test('MFA secrets are authenticated ciphertext and recovery codes are unique', () => {
  const key = Buffer.alloc(32, 9);
  const secret = newTotpSecret();
  const encrypted = encryptSecret(secret, key);
  assert.equal(decryptSecret(encrypted, key), secret);
  encrypted[encrypted.length - 1] ^= 1;
  assert.throws(() => decryptSecret(encrypted, key));
  const codes = newRecoveryCodes();
  assert.equal(new Set(codes).size, 10);
  assert.notEqual(recoveryCodeHash(codes[0], 1, key), recoveryCodeHash(codes[0], 2, key));
});
