import 'dotenv/config';

import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import sql from 'mssql';

const hmacSecret = randomBytes(48).toString('base64url');
process.env['PASSWORD_RESET_HMAC_SECRET'] = hmacSecret;
process.env['EMAIL_WORKER_ENABLED'] = 'false';

const [{ default: app }, database, { environment }, password, resetTokens] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/database.js'),
  import('../src/config/environment.js'),
  import('../src/utils/password.js'),
  import('../src/utils/password-reset-token.js'),
]);

if (environment.isProduction) throw new Error('Password recovery E2E is disabled in production.');

const marker = `RECOVERY-${randomUUID().slice(0, 8)}`;
const customerEmail = `${marker.toLowerCase()}-customer@example.test`;
const adminEmail = `${marker.toLowerCase()}-admin@example.test`;
const originalPassword = `Original-${randomUUID()}!aA1`;
const customerPassword = `Customer-${randomUUID()}!aA1`;
const adminPassword = `Admin-${randomUUID()}!aA1`;
let server: ReturnType<typeof app.listen> | undefined;

function cookie(response: Response): string {
  const value = response.headers.get('set-cookie');
  assert.ok(value, 'Expected a session cookie.');
  return value.split(';', 1)[0]!;
}

async function api(base: string, path: string, init: RequestInit = {}, expected = 200) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = response.status === 204 ? undefined : await response.json();
  assert.equal(response.status, expected, `${init.method ?? 'GET'} ${path}: ${JSON.stringify(body)}`);
  return { response, body };
}

async function cleanup(): Promise<void> {
  const pool = await database.getDbPool();
  await pool.request()
    .input('customerEmail', sql.NVarChar(255), customerEmail)
    .input('adminEmail', sql.NVarChar(255), adminEmail)
    .query(`
      DECLARE @customerId int=(SELECT customer_id FROM dbo.CUSTOMER WHERE email=@customerEmail);
      DECLARE @adminId int=(SELECT admin_id FROM dbo.ADMIN WHERE email=@adminEmail);
      DELETE FROM dbo.EMAIL_OUTBOX WHERE recipient IN(@customerEmail,@adminEmail);
      DELETE FROM dbo.PASSWORD_RESET_TOKEN WHERE customer_id=@customerId OR admin_id=@adminId;
      DELETE FROM dbo.AUTH_SESSION WHERE customer_id=@customerId;
      DELETE FROM dbo.ADMIN_SESSION WHERE admin_id=@adminId;
      DELETE FROM dbo.ADMIN_AUDIT_LOG WHERE admin_id=@adminId;
      DELETE FROM dbo.CUSTOMER WHERE customer_id=@customerId;
      DELETE FROM dbo.ADMIN WHERE admin_id=@adminId;
    `);
}

async function recoveryRecord(principal: 'CUSTOMER' | 'ADMIN') {
  const pool = await database.getDbPool();
  const result = principal === 'CUSTOMER'
    ? await pool.request().input('email', sql.NVarChar(255), customerEmail).query(`
        SELECT TOP (1) r.selector,r.token_hash tokenHash,o.payload
        FROM dbo.PASSWORD_RESET_TOKEN r
        JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id
        JOIN dbo.EMAIL_OUTBOX o ON o.recipient=c.email AND o.template_key='PASSWORD_RESET_REQUESTED'
        WHERE c.email=@email ORDER BY r.reset_id DESC,o.notification_id DESC`)
    : await pool.request().input('email', sql.NVarChar(255), adminEmail).query(`
        SELECT TOP (1) r.selector,r.token_hash tokenHash,o.payload
        FROM dbo.PASSWORD_RESET_TOKEN r
        JOIN dbo.ADMIN a ON a.admin_id=r.admin_id
        JOIN dbo.EMAIL_OUTBOX o ON o.recipient=a.email AND o.template_key='PASSWORD_RESET_REQUESTED'
        WHERE a.email=@email ORDER BY r.reset_id DESC,o.notification_id DESC`);
  const row = result.recordset[0] as { selector?: string; tokenHash?: string; payload?: string } | undefined;
  assert.ok(row?.selector && row.tokenHash && row.payload, `Expected ${principal} recovery record.`);
  const token = resetTokens.reconstructPasswordResetToken(row.selector, principal, hmacSecret);
  assert.equal(row.payload.includes(token), false, 'Outbox payload must not persist the complete reset token.');
  assert.equal(row.payload.includes(token.split('.')[1]!), false, 'Outbox payload must not persist the reset proof.');
  assert.doesNotMatch(row.payload, /https?:\/\//i, 'Outbox payload must not persist a reset URL.');
  assert.deepEqual(Object.keys(JSON.parse(row.payload)).sort(), ['accountName', 'accountType', 'selector']);
  return { selector: row.selector, token };
}

try {
  const pool = await database.getDbPool();
  await cleanup();
  await pool.request()
    .input('username', sql.NVarChar(100), `${marker}-admin`)
    .input('email', sql.NVarChar(255), adminEmail)
    .input('name', sql.NVarChar(200), `${marker} Administrator`)
    .input('password', sql.NVarChar(255), await password.hashPassword(originalPassword))
    .query(`INSERT dbo.ADMIN(username,email,full_name,password,role,status)
      VALUES(@username,@email,@name,@password,'ADMIN','ACTIVE')`);

  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}/api`;

  const registration = await api(base, '/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      firstName: marker,
      lastName: 'Customer',
      email: customerEmail,
      phone: '09171234567',
      password: originalPassword,
    }),
  }, 201);
  const customerSession = cookie(registration.response);
  const adminLogin = await api(base, '/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ identity: adminEmail, password: originalPassword }),
  });
  const adminSession = cookie(adminLogin.response);

  await api(base, '/auth/password/forgot', {
    method: 'POST',
    body: JSON.stringify({ email: customerEmail }),
  }, 202);
  const customerRecovery = await recoveryRecord('CUSTOMER');
  await api(base, '/auth/admin/password/reset', {
    method: 'POST',
    body: JSON.stringify({
      token: customerRecovery.token,
      password: customerPassword,
      confirmPassword: customerPassword,
    }),
  }, 400);
  await api(base, '/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({
      token: customerRecovery.token,
      password: customerPassword,
      confirmPassword: customerPassword,
    }),
  });
  await api(base, '/auth/me', { headers: { cookie: customerSession } }, 401);
  await api(base, '/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: customerEmail, password: customerPassword }),
  });
  await api(base, '/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({
      token: customerRecovery.token,
      password: customerPassword,
      confirmPassword: customerPassword,
    }),
  }, 400);

  await api(base, '/auth/admin/password/forgot', {
    method: 'POST',
    body: JSON.stringify({ email: adminEmail }),
  }, 202);
  const adminRecovery = await recoveryRecord('ADMIN');
  const resetAdmin = () => fetch(`${base}/auth/admin/password/reset`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token: adminRecovery.token,
      password: adminPassword,
      confirmPassword: adminPassword,
    }),
  });
  const concurrent = await Promise.all([resetAdmin(), resetAdmin()]);
  assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 400]);
  await api(base, '/auth/admin/me', { headers: { cookie: adminSession } }, 401);
  await api(base, '/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ identity: adminEmail, password: adminPassword }),
  });
  await api(base, '/auth/admin/password/reset', {
    method: 'POST',
    body: JSON.stringify({
      token: adminRecovery.token,
      password: adminPassword,
      confirmPassword: adminPassword,
    }),
  }, 400);

  const state = await pool.request()
    .input('customerEmail', sql.NVarChar(255), customerEmail)
    .input('adminEmail', sql.NVarChar(255), adminEmail)
    .query(`
      SELECT COUNT(*) count FROM dbo.AUTH_SESSION s
        JOIN dbo.CUSTOMER c ON c.customer_id=s.customer_id WHERE c.email=@customerEmail;
      SELECT COUNT(*) count FROM dbo.ADMIN_SESSION s
        JOIN dbo.ADMIN a ON a.admin_id=s.admin_id WHERE a.email=@adminEmail;
      SELECT recipient,COUNT(*) count FROM dbo.EMAIL_OUTBOX
        WHERE recipient IN(@customerEmail,@adminEmail) AND template_key='PASSWORD_CHANGED'
        GROUP BY recipient;
    `);
  assert.equal(Number(state.recordsets[0]![0]!.count), 1, 'Only the new customer login session should remain.');
  assert.equal(Number(state.recordsets[1]![0]!.count), 1, 'Only the new admin login session should remain.');
  assert.equal(state.recordsets[2]!.length, 2, 'Both account types require password-change confirmation intent.');
  assert.ok(state.recordsets[2]!.every((row) => Number(row.count) === 1));

  console.log('Password recovery SQL-backed E2E verification passed.');
} finally {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  try {
    await cleanup();
  } finally {
    await database.closeDatabase();
  }
}
