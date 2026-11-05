import assert from 'node:assert/strict';
import test from 'node:test';
process.env.FRONTEND_URL ??= 'http://localhost:4200'; process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost'; process.env.DB_DATABASE ??= 'test'; process.env.DB_USER ??= 'test'; process.env.DB_PASSWORD ??= 'test';
const { createEmailVerificationService } = await import('./email-verification.service.js');
const { createEmailCodeChallenge, emailCode, emailCodeHash } = await import('../utils/email-verification-code.js');
const now = new Date('2026-11-01T05:00:00Z'), secret = 'a'.repeat(40), email = 'customer@example.test';
function harness(overrides: any = {}) {
  const requests: any[] = [], consumed: any[] = [], checked: any[] = [];
  const repository = { issue: async (...args: any[]) => { requests.push(args); return true; },
    consume: async (...args: any[]) => { consumed.push(args); return true; },
    isDeliverable: async (...args: any[]) => { checked.push(args); return true; } };
  const service = createEmailVerificationService({ repository, secret, smtpConfigured: true, queue: async () => '1', now: () => now, ...overrides });
  return { service, repository, requests, consumed, checked };
}
test('registration requires configured email verification and issues a ten-minute challenge', async () => {
  for (const values of [{ secret: undefined }, { smtpConfigured: false }]) {
    await assert.rejects(harness(values).service.requestCode(email), { statusCode: 503 });
  }
  const h = harness(); await h.service.requestCode(email);
  assert.equal(+h.requests[0][0].expiresAt, +now + 600_000);
  assert.equal('code' in h.requests[0][0], false);
});
test('malformed and rejected codes cannot complete verification', async () => {
  const h = harness(); await assert.rejects(h.service.verify(email, '12a456'), { statusCode: 400 });
  assert.equal(h.consumed.length, 0);
  h.repository.consume = async () => false;
  await assert.rejects(h.service.verify(email, '012345'), { statusCode: 400 });
});
test('an already delivered code can be consumed while email delivery is temporarily disabled', async () => {
  const h = harness({ smtpConfigured: false });
  await h.service.verify(email, '012345');
  assert.equal(h.consumed.length, 1);
});
test('private renderer binds current selector, recipient and keyed proof before disclosing the code', async () => {
  const h = harness(); const challenge = createEmailCodeChallenge(secret, email);
  const item = { templateKey: 'EMAIL_VERIFICATION_CODE', recipient: email,
    payload: { accountName: 'Juan', selector: challenge.selector, accountType: 'CUSTOMER' } } as any;
  const rendered = await h.service.renderCode(item, now);
  assert.ok(rendered?.text.includes(emailCode(challenge.selector, secret)));
  assert.equal(h.checked[0][3], emailCodeHash(challenge.selector, email, emailCode(challenge.selector, secret), secret));
  h.repository.isDeliverable = async () => false;
  assert.equal(await h.service.renderCode(item, now), undefined);
});
