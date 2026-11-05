import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sql from 'mssql';
import { environment } from '../src/config/environment.js';
import { getDbPool, closeDatabase } from '../src/config/database.js';
import { assertCurrentSchema } from '../src/migrations/schema-contract.js';
import { createEmailVerificationRepository } from '../src/repositories/email-verification.repository.js';
import { createEmailCodeChallenge, emailCode, emailCodeHash } from '../src/utils/email-verification-code.js';
import { createSession, findCustomerBySession } from '../src/repositories/auth.repository.js';
import { queueNotification } from '../src/services/notification.service.js';
import { digest } from '../src/services/login-security.service.js';

if (environment.isProduction) throw new Error('This rollback-only verifier is for local development.');
const secret = environment.emailVerificationSecret;
if (!secret) throw new Error('Configure the email verification server secret before running this verifier.');
let tx: sql.Transaction | undefined;
try {
  const pool = await getDbPool(); await assertCurrentSchema(pool, { migrationHistory: 'compatible' });
  tx = new sql.Transaction(pool); await tx.begin();
  const request = () => new sql.Request(tx!);
  const repository = createEmailVerificationRepository({ readRequest: async () => request(), transaction: async work => work(request()) });
  const email = `${randomUUID()}@example.test`, token = digest(randomUUID());
  const result = await request().input('email', sql.NVarChar(255), email)
    .query(`INSERT dbo.CUSTOMER(first_name,last_name,email,contact_number,password,requires_email_verification)
      OUTPUT INSERTED.customer_id id VALUES('Email','Verifier',@email,'09171234567','fixture-hash',1)`);
  const id = Number(result.recordset[0].id), now = new Date();
  const issue = async (at: Date, previousCode?: string) => {
    let challenge = createEmailCodeChallenge(secret, email);
    while (previousCode === emailCode(challenge.selector, secret)) challenge = createEmailCodeChallenge(secret, email);
    const issued = await repository.issue({ email, ...challenge, now: at, expiresAt: new Date(+at + 600_000) }, queueNotification, request());
    return { ...challenge, issued, code: emailCode(challenge.selector, secret) };
  };
  const first = await issue(now); assert.equal(first.issued, true);
  assert.equal((await issue(new Date(+now + 59_999))).issued, false);
  await assert.rejects(createSession(id, token, new Date(+now + 3_600_000), 'fixture-hash', request()), { statusCode: 401 });
  await request().input('id', sql.Int, id).input('token', sql.Char(64), token)
    .query('INSERT dbo.AUTH_SESSION(customer_id,token_hash,expires_at) VALUES(@id,@token,DATEADD(hour,1,SYSUTCDATETIME()))');
  assert.equal(await findCustomerBySession(token, request()), undefined);
  console.log('PASS new unverified customer cannot create or use a session; resend cooldown is enforced');

  const secondAt = new Date(+now + 61_000), second = await issue(secondAt, first.code);
  assert.equal(second.issued, true);
  assert.equal(await repository.isDeliverable(first.selector, email, secondAt, first.codeHash), false);
  assert.equal(await repository.consume(email, first.code, secret, secondAt, queueNotification), false);
  const rotatedSecret = 'rotation-test-secret-with-at-least-32-bytes';
  assert.equal(await repository.isDeliverable(second.selector, email, secondAt,
    emailCodeHash(second.selector, email, emailCode(second.selector, rotatedSecret), rotatedSecret)), false);
  assert.equal(await repository.consume(email, second.code, secret, secondAt, queueNotification), true);
  assert.equal(await repository.consume(email, second.code, secret, secondAt, queueNotification), false);
  const sessions = await request().input('id', sql.Int, id).query('SELECT COUNT(*) count FROM dbo.AUTH_SESSION WHERE customer_id=@id');
  assert.equal(sessions.recordset[0].count, 0);
  const messages = await request().input('id', sql.Int, id)
    .query("SELECT template_key,payload FROM dbo.EMAIL_OUTBOX WHERE related_entity_type='CUSTOMER' AND related_entity_id=@id");
  assert.equal(messages.recordset.filter(r => r.template_key === 'ACCOUNT_REGISTERED').length, 1);
  for (const row of messages.recordset.filter(r => r.template_key === 'EMAIL_VERIFICATION_CODE')) {
    assert.deepEqual(Object.keys(JSON.parse(row.payload)).sort(), ['accountName', 'accountType', 'selector']);
  }
  await createSession(id, token, new Date(+now + 3_600_000), 'fixture-hash', request());
  assert.equal((await findCustomerBySession(token, request()))?.id, id);
  console.log('PASS superseded/reused codes fail; verification queues one welcome with no auto-login; verified customer can sign in');

  await request().input('id', sql.Int, id).input('email', sql.NVarChar(255), `changed-${email}`)
    .query('UPDATE dbo.CUSTOMER SET email=@email WHERE customer_id=@id');
  assert.equal(await findCustomerBySession(token, request()), undefined);
  await request().input('id', sql.Int, id).input('email', sql.NVarChar(255), email)
    .query('UPDATE dbo.CUSTOMER SET email=@email,verified_email=NULL,email_verified_at=NULL WHERE customer_id=@id');
  const thirdAt = new Date(+now + 121_000), third = await issue(thirdAt);
  assert.equal(await repository.consume(email, third.code, secret, new Date(+thirdAt + 600_000), queueNotification), false);
  const wrong = third.code === '999999' ? '888888' : '999999';
  for (let i = 0; i < 5; i++) assert.equal(await repository.consume(email, wrong, secret, thirdAt, queueNotification), false);
  assert.equal(await repository.consume(email, third.code, secret, thirdAt, queueNotification), false);
  assert.equal(await repository.isDeliverable(third.selector, email, thirdAt, third.codeHash), false);
  assert.equal((await issue(new Date(+thirdAt + 60_000))).issued, false);
  console.log('PASS changed email invalidates session; five wrong codes lock verification and resend');
  console.log('PASS all verification emails remain uncommitted; no SMTP delivery was started');
} finally {
  try { if (tx) await tx.rollback(); } finally { await closeDatabase(); }
}
