import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sql from 'mssql';
import { environment } from '../src/config/environment.js';
import { getDbPool, closeDatabase } from '../src/config/database.js';
import { takeLoginAttempt, clearLoginAttempts } from '../src/repositories/login-security.repository.js';
import { digest } from '../src/services/login-security.service.js';
import { createSession, createAdminSession, findAdminBySession } from '../src/repositories/auth.repository.js';
import { assertCurrentSchema } from '../src/migrations/schema-contract.js';

// No emails, bookings, account changes, or mutations of existing sessions.
// The generated attempt row is removed in finally; the generated session is rolled back.
if (environment.isProduction) throw new Error('Run this verifier only against the local development database.');
const key = digest(`security-verification:${randomUUID()}`);
let transaction: sql.Transaction | undefined;
try {
  const pool = await getDbPool();
  await assertCurrentSchema(pool, { migrationHistory: 'compatible' });
  console.log('PASS current schema including migration 018');

  const outcomes = await Promise.all(Array.from({ length: 8 }, () => takeLoginAttempt(key)));
  assert.equal(outcomes.filter(Boolean).length, 5);
  assert.equal(await takeLoginAttempt(key), false);
  console.log('PASS concurrent login attempts: exactly five admitted, subsequent attempts blocked');
  await pool.request().input('key', sql.Char(64), key)
    .query(`UPDATE dbo.AUTH_LOGIN_ATTEMPT SET blocked_until=DATEADD(second,-1,SYSUTCDATETIME()) WHERE subject_hash=@key`);
  assert.equal(await takeLoginAttempt(key), true);
  console.log('PASS expired cooldown admits the next attempt');

  transaction = new sql.Transaction(pool);
  await transaction.begin();
  const tokenHash = digest(`security-session:${randomUUID()}`);
  const fixture = await new sql.Request(transaction).input('hash', sql.Char(64), tokenHash)
    .query(`DECLARE @id int=(SELECT TOP(1) admin_id FROM dbo.ADMIN WHERE status='ACTIVE' ORDER BY admin_id);
      IF @id IS NULL THROW 51020,'A local active administrator is required for this verifier.',1;
      INSERT dbo.ADMIN_SESSION(admin_id,token_hash,expires_at,last_seen_at)
      VALUES(@id,@hash,DATEADD(day,1,SYSUTCDATETIME()),DATEADD(minute,-${environment.adminIdleMinutes + 1},SYSUTCDATETIME()));`);
  assert.equal(fixture.rowsAffected.at(-1), 1);
  assert.equal(await findAdminBySession(tokenHash, new sql.Request(transaction)), undefined);
  console.log('PASS idle session cannot be renewed');
  await new sql.Request(transaction).input('hash', sql.Char(64), tokenHash)
    .query('UPDATE dbo.ADMIN_SESSION SET last_seen_at=SYSUTCDATETIME() WHERE token_hash=@hash');
  assert.equal((await findAdminBySession(tokenHash, new sql.Request(transaction)))?.role, 'admin');
  await new sql.Request(transaction).input('hash', sql.Char(64), tokenHash)
    .query('UPDATE dbo.ADMIN_SESSION SET expires_at=DATEADD(second,-1,SYSUTCDATETIME()) WHERE token_hash=@hash');
  assert.equal(await findAdminBySession(tokenHash, new sql.Request(transaction)), undefined);
  console.log('PASS fresh activity works; absolute expiry cannot be renewed');

  const fixtureId = randomUUID();
  const customer = await new sql.Request(transaction).input('email', sql.NVarChar(255), `${fixtureId}@example.test`)
    .query(`INSERT dbo.CUSTOMER(first_name,last_name,email,contact_number,password)
      OUTPUT INSERTED.customer_id id VALUES('Security','Verifier',@email,'09171234567','before-reset-hash')`);
  const administrator = await new sql.Request(transaction).input('identity', sql.NVarChar(100), fixtureId)
    .input('email', sql.NVarChar(255), `${fixtureId}-admin@example.test`)
    .query(`INSERT dbo.ADMIN(username,email,full_name,password,role,status)
      OUTPUT INSERTED.admin_id id VALUES(@identity,@email,'Security Verifier','before-reset-hash','ADMIN','ACTIVE')`);
  for (const role of ['CUSTOMER', 'ADMIN'] as const) {
    const id = Number((role === 'CUSTOMER' ? customer : administrator).recordset[0].id);
    const create = role === 'CUSTOMER' ? createSession : createAdminSession;
    await create(id, digest(randomUUID()), new Date(Date.now() + 60_000), 'before-reset-hash', new sql.Request(transaction));
    await new sql.Request(transaction).input('id', sql.Int, id)
      .query(role === 'CUSTOMER' ? 'UPDATE dbo.CUSTOMER SET password=\'after-reset-hash\' WHERE customer_id=@id'
        : 'UPDATE dbo.ADMIN SET password=\'after-reset-hash\' WHERE admin_id=@id');
    await assert.rejects(create(id, digest(randomUUID()), new Date(Date.now() + 60_000), 'before-reset-hash', new sql.Request(transaction)), { statusCode: 401 });
  }
  console.log('PASS customer and admin session issuance rejects a previously verified, now-reset password');
} finally {
  try { if (transaction) await transaction.rollback(); }
  finally { try { await clearLoginAttempts(key); } finally { await closeDatabase(); } }
}
