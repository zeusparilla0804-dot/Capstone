import assert from 'node:assert/strict';
import test from 'node:test';
import { nextLoginAttempt } from './login-attempt-policy.js';

test('five attempts are admitted, further attempts blocked, and cooldown expires at its exact boundary', () => {
  const now = new Date('2026-11-01T00:00:00Z');
  let state: any;
  for (let count = 1; count <= 5; count++) {
    const result = nextLoginAttempt(state, now);
    assert.equal(result.allowed, true); state = result.state;
    assert.equal(state.attempts, count);
  }
  assert.equal(nextLoginAttempt(state, new Date(+now + 899999)).allowed, false);
  const expired = nextLoginAttempt(state, new Date(+now + 900000));
  assert.equal(expired.allowed, true); assert.equal(expired.state.attempts, 1);
});
test('old attempt windows reset without retaining failures indefinitely', () => {
  const now = new Date('2026-11-01T00:00:00Z');
  const state = { attempts: 3, windowStartedAt: now, blockedUntil: null };
  assert.equal(nextLoginAttempt(state, new Date(+now + 900000)).state.attempts, 1);
});
