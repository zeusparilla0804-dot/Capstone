import assert from 'node:assert/strict';
import test from 'node:test';
import { canIssueEmailCode, canAttemptEmailCode } from './email-verification-policy.js';

const now = new Date('2026-11-01T05:00:00Z');
test('email code resend enforces a minute cooldown and five issuances per fifteen minutes', () => {
  const state = { createdAt: now, windowStartedAt: now, issuanceCount: 1, lockedUntil: null };
  assert.equal(canIssueEmailCode(state, new Date(+now + 59_999)), false);
  assert.equal(canIssueEmailCode(state, new Date(+now + 60_000)), true);
  assert.equal(canIssueEmailCode({ ...state, issuanceCount: 5 }, new Date(+now + 899_999)), false);
  assert.equal(canIssueEmailCode({ ...state, issuanceCount: 5 }, new Date(+now + 900_000)), true);
  assert.equal(canIssueEmailCode({ ...state, lockedUntil: new Date(+now + 900_000) }, new Date(+now + 60_000)), false);
});
test('expired, exhausted and locked email codes cannot be attempted', () => {
  const state = { attempts: 0, expiresAt: new Date(+now + 600_000), lockedUntil: null };
  assert.equal(canAttemptEmailCode(state, now), true);
  assert.equal(canAttemptEmailCode(state, new Date(+now + 600_000)), false);
  assert.equal(canAttemptEmailCode({ ...state, attempts: 5 }, now), false);
  assert.equal(canAttemptEmailCode({ ...state, lockedUntil: new Date(+now + 900_000) }, now), false);
});
