import assert from 'node:assert/strict';
import test from 'node:test';
import { newPassword } from './password-policy.js';

test('new passwords require 8–128 characters without artificial composition requirements', () => {
  assert.throws(() => newPassword('seven77'), /8/);
  assert.equal(newPassword('Secret82'), 'Secret82');
  assert.throws(() => newPassword('x'.repeat(129)), /128/);
  assert.equal(newPassword('thoughtful food warm celebrations'), 'thoughtful food warm celebrations');
});
test('commonly guessed passwords are rejected at registration and reset', () => {
  for (const password of ['123456789012345', 'Password123456789', 'LaChefPassword123!']) {
    assert.throws(() => newPassword(password), /commonly used/);
  }
});
