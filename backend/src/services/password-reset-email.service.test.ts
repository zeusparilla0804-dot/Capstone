import assert from 'node:assert/strict';
import test from 'node:test';
import type { ClaimedEmail } from '../repositories/email-outbox.repository.js';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const { createPasswordResetEmailService } = await import('./password-reset-email.service.js');
const secret = '0123456789abcdef0123456789abcdef';
const now = new Date('2026-10-10T01:00:00.000Z');

function item(accountType: 'CUSTOMER' | 'ADMIN', accountName = 'Juan & <Customer>'): ClaimedEmail {
  return {
    id: '10',
    recipient: 'customer@example.test',
    normalizedRecipient: 'customer@example.test',
    templateKey: 'PASSWORD_RESET_REQUESTED',
    payload: { accountName, accountType, selector: 'a'.repeat(22) },
    status: 'PROCESSING',
    attemptCount: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

test('derives the customer reset URL only in memory and escapes the account name', async () => {
  const calls: unknown[][] = [];
  const service = createPasswordResetEmailService({
    repository: { isDeliverable: async (...args: unknown[]) => { calls.push(args); return true; } },
    hmacSecret: secret,
    frontendOrigin: 'https://lachef.example',
  });
  const queued = item('CUSTOMER');
  const persisted = JSON.stringify(queued.payload);
  assert.equal(persisted.includes('.'), false);
  assert.equal(/token|proof|url|secret/i.test(persisted), false);

  const rendered = await service.renderPasswordResetEmail(queued, now);
  assert.ok(rendered);
  assert.deepEqual(calls, [['a'.repeat(22), 'CUSTOMER', now]]);
  assert.match(rendered.text, /https:\/\/lachef\.example\/reset-password\?token=[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/);
  assert.match(rendered.html, /href="https:\/\/lachef\.example\/reset-password\?token=/);
  assert.equal(rendered.html.includes('Juan & <Customer>'), false);
  assert.ok(rendered.html.includes('Juan &amp; &lt;Customer&gt;'));
  assert.equal(rendered.text.includes(secret), false);
  assert.equal(rendered.html.includes(secret), false);
});

test('uses the administrator reset route and keeps customer and administrator proofs role-bound', async () => {
  const service = createPasswordResetEmailService({
    repository: { isDeliverable: async () => true },
    hmacSecret: secret,
    frontendOrigin: 'https://lachef.example',
  });
  const customer = await service.renderPasswordResetEmail(item('CUSTOMER'), now);
  const admin = await service.renderPasswordResetEmail(item('ADMIN'), now);
  assert.match(admin!.text, /\/admin\/reset-password\?token=/);
  assert.doesNotMatch(customer!.text, /\/admin\/reset-password/);
  assert.notEqual(customer!.text.match(/token=([^\s]+)/)![1], admin!.text.match(/token=([^\s]+)/)![1]);
});

test('refuses expired, invalidated, used, malformed, and unconfigured reset delivery', async () => {
  let checks = 0;
  const unavailable = createPasswordResetEmailService({
    repository: { isDeliverable: async () => { checks++; return false; } },
    hmacSecret: secret,
    frontendOrigin: 'https://lachef.example',
  });
  assert.equal(await unavailable.renderPasswordResetEmail(item('CUSTOMER'), now), undefined);
  assert.equal(checks, 1);

  const unconfigured = createPasswordResetEmailService({
    repository: { isDeliverable: async () => { throw new Error('must not query'); } },
    hmacSecret: undefined,
    frontendOrigin: 'https://lachef.example',
  });
  assert.equal(await unconfigured.renderPasswordResetEmail(item('CUSTOMER'), now), undefined);
  await assert.rejects(unavailable.renderPasswordResetEmail({ ...item('CUSTOMER'), payload: {
    accountName: 'Juan', accountType: 'CUSTOMER', selector: 'bad selector',
  } }, now));
});
