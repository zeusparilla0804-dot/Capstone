import { verifyFixtureEmail } from './verify-fixture-email.js';
import 'dotenv/config';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sql from 'mssql';

// These fixtures import app.ts, never server.ts; no mail worker is started.
process.env['EMAIL_WORKER_ENABLED'] = 'true';

const [{ default: app }, database, { environment }, password, sessions, authRepository] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/database.js'),
  import('../src/config/environment.js'),
  import('../src/utils/password.js'),
  import('../src/utils/session.js'),
  import('../src/repositories/auth.repository.js'),
]);

if (environment.isProduction) throw new Error('Session security E2E is disabled in production.');

const marker = `SESSION-${randomUUID().slice(0, 8)}`;
const customerEmail = `${marker.toLowerCase()}-customer@example.test`;
const adminEmail = `${marker.toLowerCase()}-admin@example.test`;
const accountPassword = `Session-${randomUUID()}!aA1`;
let server: ReturnType<typeof app.listen> | undefined;

function cookie(response: Response): string {
  const value = response.headers.get('set-cookie');
  assert.ok(value, 'Expected a session cookie.');
  return value.split(';', 1)[0]!;
}

async function api(base: string, path: string, init: RequestInit = {}, expected = 200) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-la-chef-request': '1', ...(init.headers ?? {}) },
  });
  const body = response.status === 204 ? undefined : await response.json();
  assert.equal(response.status, expected, `${init.method ?? 'GET'} ${path}: ${JSON.stringify(body)}`);
  if (path === '/auth/register' && response.status === 201) {
    await verifyFixtureEmail(base, JSON.parse(String(init.body)).email);
  }
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
      DELETE FROM dbo.AUTH_SESSION WHERE customer_id=@customerId;
      DELETE FROM dbo.ADMIN_SESSION WHERE admin_id=@adminId;
      DELETE FROM dbo.ADMIN_AUDIT_LOG WHERE admin_id=@adminId;
      DELETE FROM dbo.CUSTOMER WHERE customer_id=@customerId;
      DELETE FROM dbo.ADMIN WHERE admin_id=@adminId;
    `);
}

try {
  const pool = await database.getDbPool();
  await cleanup();
  await pool.request()
    .input('username', sql.NVarChar(100), `${marker}-admin`)
    .input('email', sql.NVarChar(255), adminEmail)
    .input('name', sql.NVarChar(200), `${marker} Administrator`)
    .input('password', sql.NVarChar(255), await password.hashPassword(accountPassword))
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
      password: accountPassword,
    }),
  }, 201);
  assert.equal(registration.response.headers.get('set-cookie'), null, 'Registration must not authenticate the customer.');
  await api(base, '/auth/me', {}, 401);
  const firstCustomerLogin = await api(base, '/auth/login', {
    method: 'POST', body: JSON.stringify({ email: customerEmail, password: accountPassword }),
  });
  const customerSessionA = cookie(firstCustomerLogin.response);
  const customerLogin = await api(base, '/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: customerEmail, password: accountPassword }),
  });
  const customerSessionB = cookie(customerLogin.response);

  const adminLoginA = await api(base, '/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ identity: adminEmail, password: accountPassword }),
  });
  const adminSessionA = cookie(adminLoginA.response);
  const adminLoginB = await api(base, '/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ identity: adminEmail, password: accountPassword }),
  });
  const adminSessionB = cookie(adminLoginB.response);

  await api(base, '/auth/logout-all', { method: 'POST', headers: { cookie: customerSessionA } }, 204);
  await api(base, '/auth/me', { headers: { cookie: customerSessionA } }, 401);
  await api(base, '/auth/me', { headers: { cookie: customerSessionB } }, 401);
  await api(base, '/auth/admin/me', { headers: { cookie: adminSessionA } });
  await api(base, '/auth/admin/me', { headers: { cookie: adminSessionB } });

  await api(base, '/auth/admin/logout-all', { method: 'POST', headers: { cookie: adminSessionB } }, 204);
  await api(base, '/auth/admin/me', { headers: { cookie: adminSessionA } }, 401);
  await api(base, '/auth/admin/me', { headers: { cookie: adminSessionB } }, 401);

  const ids = await pool.request()
    .input('customerEmail', sql.NVarChar(255), customerEmail)
    .input('adminEmail', sql.NVarChar(255), adminEmail)
    .query(`
      SELECT customer_id id FROM dbo.CUSTOMER WHERE email=@customerEmail;
      SELECT admin_id id FROM dbo.ADMIN WHERE email=@adminEmail;
    `);
  const customerId = Number(ids.recordsets[0]![0]!.id);
  const adminId = Number(ids.recordsets[1]![0]!.id);
  const expiredCustomerHash = sessions.hashSessionToken(`expired-customer-${marker}`);
  const activeCustomerHash = sessions.hashSessionToken(`active-customer-${marker}`);
  const expiredAdminHash = sessions.hashSessionToken(`expired-admin-${marker}`);
  const activeAdminHash = sessions.hashSessionToken(`active-admin-${marker}`);

  await pool.request()
    .input('customerId', sql.Int, customerId)
    .input('adminId', sql.Int, adminId)
    .input('expiredCustomerHash', sql.Char(64), expiredCustomerHash)
    .input('activeCustomerHash', sql.Char(64), activeCustomerHash)
    .input('expiredAdminHash', sql.Char(64), expiredAdminHash)
    .input('activeAdminHash', sql.Char(64), activeAdminHash)
    .query(`
      INSERT dbo.AUTH_SESSION(customer_id,token_hash,expires_at) VALUES
        (@customerId,@expiredCustomerHash,DATEADD(minute,-1,SYSUTCDATETIME())),
        (@customerId,@activeCustomerHash,DATEADD(day,1,SYSUTCDATETIME()));
      INSERT dbo.ADMIN_SESSION(admin_id,token_hash,expires_at) VALUES
        (@adminId,@expiredAdminHash,DATEADD(minute,-1,SYSUTCDATETIME())),
        (@adminId,@activeAdminHash,DATEADD(day,1,SYSUTCDATETIME()));
    `);

  const removed = await authRepository.deleteExpiredSessions();
  assert.ok(removed.customers >= 1, 'Cleanup must remove the expired customer session.');
  assert.ok(removed.administrators >= 1, 'Cleanup must remove the expired administrator session.');

  const remaining = await pool.request()
    .input('expiredCustomerHash', sql.Char(64), expiredCustomerHash)
    .input('activeCustomerHash', sql.Char(64), activeCustomerHash)
    .input('expiredAdminHash', sql.Char(64), expiredAdminHash)
    .input('activeAdminHash', sql.Char(64), activeAdminHash)
    .query(`
      SELECT token_hash FROM dbo.AUTH_SESSION WHERE token_hash IN(@expiredCustomerHash,@activeCustomerHash);
      SELECT token_hash FROM dbo.ADMIN_SESSION WHERE token_hash IN(@expiredAdminHash,@activeAdminHash);
    `);
  assert.deepEqual(remaining.recordsets[0]!.map(row => row.token_hash), [activeCustomerHash]);
  assert.deepEqual(remaining.recordsets[1]!.map(row => row.token_hash), [activeAdminHash]);

  console.log('Session security SQL-backed E2E verification passed.');
} finally {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  try {
    await cleanup();
  } finally {
    await database.closeDatabase();
  }
}
