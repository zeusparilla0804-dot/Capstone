import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type sql from 'mssql';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost'; process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test'; process.env.DB_PASSWORD ??= 'test';
const { createEmailVerificationRepository } = await import('./email-verification.repository.js');
const { emailCodeHash } = await import('../utils/email-verification-code.js');
const now = new Date('2026-11-01T05:00:00Z');
const email = 'customer@example.test', secret = 'a'.repeat(40), selector = 'a'.repeat(22);

function harness(results: any[]) {
  const commands: any[] = [], events: string[] = [], notices: any[] = [];
  const params: Record<string, unknown> = {};
  const request = { replaceInput(name: string, _type: unknown, value: unknown) { params[name] = value; return this; },
    async query(command: string) { commands.push({ command, params: { ...params } }); return results.shift() ?? { recordset: [], rowsAffected: [1] }; } } as unknown as sql.Request;
  return { commands, events, notices, request,
    queue: async (input: unknown, supplied: sql.Request) => { assert.equal(supplied, request); notices.push(input); return '1'; },
    repository: createEmailVerificationRepository({ readRequest: async () => request,
      transaction: async (work: any) => { events.push('begin'); try { const value = await work(request); events.push('commit'); return value; } catch (error) { events.push('rollback'); throw error; } } }),
  };
}
const principal = { customerId: 42, email, accountName: 'Juan', verificationRequired: true, verifiedEmail: null };
const challenge = { selector, email, codeHash: emailCodeHash(selector, email, '012345', secret), attempts: 0,
  expiresAt: new Date(+now + 600_000), lockedUntil: null, createdAt: now, windowStartedAt: now, issuanceCount: 1 };
test('registration queues only a private selector and stores no plaintext code', async () => {
  const db = harness([{ recordset: [principal] }, { recordset: [] }]);
  assert.equal(await db.repository.issue({ email, selector, codeHash: challenge.codeHash, now, expiresAt: challenge.expiresAt }, db.queue, db.request), true);
  assert.equal(db.notices[0].templateKey, 'EMAIL_VERIFICATION_CODE');
  assert.equal(JSON.stringify(db.notices).includes('012345'), false);
  assert.match(db.commands[0].command, /UPDLOCK,HOLDLOCK/);
});
test('resend cooldown does not queue or overwrite an active code', async () => {
  const db = harness([{ recordset: [principal] }, { recordset: [challenge] }]);
  assert.equal(await db.repository.issue({ email, selector, codeHash: challenge.codeHash, now, expiresAt: challenge.expiresAt }, db.queue), false);
  assert.equal(db.notices.length, 0); assert.equal(db.commands.length, 2);
});
test('valid code verifies identity, consumes challenge and queues welcome in one transaction', async () => {
  const db = harness([{ recordset: [principal] }, { recordset: [challenge] }]);
  assert.equal(await db.repository.consume(email, '012345', secret, now, db.queue), true);
  assert.ok(db.commands.some(q => /email_verified_at=@now/.test(q.command)));
  assert.ok(db.commands.some(q => /DELETE dbo.EMAIL_VERIFICATION_CHALLENGE/.test(q.command)));
  assert.equal(db.notices[0].templateKey, 'ACCOUNT_REGISTERED');
  assert.deepEqual(db.events, ['begin', 'commit']);
});
test('wrong fifth code records lockout and never verifies or queues welcome', async () => {
  const db = harness([{ recordset: [principal] }, { recordset: [{ ...challenge, attempts: 4 }] }]);
  assert.equal(await db.repository.consume(email, '999999', secret, now, db.queue), false);
  const update = db.commands.at(-1);
  assert.equal(update.params.attempts, 5); assert.equal(+update.params.lockedUntil, +now + 900_000);
  assert.equal(db.notices.length, 0);
});
test('expired, used, missing or email-mismatched challenges do not verify accounts', async () => {
  for (const row of [undefined, { ...challenge, expiresAt: now }, { ...challenge, email: 'old@example.test' }, { ...challenge, attempts: 5 }]) {
    const db = harness([{ recordset: [principal] }, { recordset: row ? [row] : [] }]);
    assert.equal(await db.repository.consume(email, '012345', secret, now, db.queue), false);
    assert.equal(db.notices.length, 0);
  }
});
test('customer auth gates pending verification in credentials and both session paths', () => {
  const source = readFileSync(new URL('./auth.repository.ts', import.meta.url), 'utf8');
  assert.match(source, /requires_email_verification/);
  assert.match(source, /verified_email=c\.email/);
  assert.match(source, /verified_email=email/);
});
