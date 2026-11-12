import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const repositoryUrl = new URL('./auth.repository.ts', import.meta.url);
const source = readFileSync(repositoryUrl, 'utf8');

test('background admin session checks validate absolute expiry without an inactivity limit', async () => {
  const { findAdminBySession } = await import('./auth.repository.js');
  let command = '';
  const request = { input() { return this; }, async query(value: string) { command = value; return { recordset: [{ admin_id: 7, full_name: 'Admin', email: 'admin@example.test' }] }; } };
  assert.equal((await (findAdminBySession as any)('0'.repeat(64), request, false))?.id, 7);
  assert.doesNotMatch(command, /UPDATE|SET last_seen_at/i);
  assert.match(command, /expires_at>SYSUTCDATETIME\(\)/);
  assert.doesNotMatch(command, /last_seen_at\s*>|@idleMinutes/i);
});

test('customer and admin session expiry comparisons use the SQL UTC clock', () => {
  const utcComparisons = source.match(/expires_at\s*>\s*SYSUTCDATETIME\(\)/gi) ?? [];

  assert.equal(utcComparisons.length, 2);
  assert.doesNotMatch(source, /expires_at\s*>\s*SYSDATETIME\(\)/i);
});

test('admin session lookup works before the optional local MFA migration', async () => {
  const { findAdminBySession } = await import('./auth.repository.js');
  let query = '';
  const request = {
    input() { return this; },
    async query(statement: string) { query = statement; return { recordset: [] }; },
  };
  assert.equal(await findAdminBySession('0'.repeat(64), request as never), undefined);
  assert.doesNotMatch(query, /ADMIN_MFA/);
});

test('session revocation and cleanup stay scoped to session rows', () => {
  assert.match(source, /DELETE\s+dbo\.AUTH_SESSION\s+WHERE\s+customer_id\s*=\s*@customerId/i);
  assert.match(source, /DELETE\s+dbo\.ADMIN_SESSION\s+WHERE\s+admin_id\s*=\s*@adminId/i);
  assert.match(source, /DELETE\s+dbo\.AUTH_SESSION\s+WHERE\s+expires_at\s*<=\s*SYSUTCDATETIME\(\)/i);
  assert.match(source, /DELETE\s+dbo\.ADMIN_SESSION\s+WHERE\s+expires_at\s*<=\s*SYSUTCDATETIME\(\)/i);
  assert.doesNotMatch(source, /DELETE\s+dbo\.(CUSTOMER|ADMIN(?!_SESSION)|RESERVATION|PAYMENT(?!_PROOF)|INVOICE)\b/i);
});

test('customer password and session authentication require an active account', () => {
  assert.match(source, /FROM\s+dbo\.CUSTOMER\s+WHERE\s+email\s*=\s*@email\s+AND\s+status\s*=\s*'ACTIVE'/i);
  assert.match(source, /JOIN\s+dbo\.CUSTOMER\s+c\s+ON\s+c\.customer_id\s*=\s*s\.customer_id[\s\S]*s\.expires_at\s*>\s*SYSUTCDATETIME\(\)[\s\S]*c\.status\s*=\s*'ACTIVE'/i);
});

test('registration email existence includes inactive customers without returning password data', async t => {
  const sql = (await import('mssql')).default;
  const repository = await import('./auth.repository.js');
  const { closeDatabase } = await import('../config/database.js');
  let command = '';
  const request = {
    input() { return this; },
    async query(query: string) { command = query; return { recordset: [{ customer_id: 42 }] }; },
  };
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => ({ connected: true, request: () => request, close: async () => {} }));
  try {
    assert.equal(await (repository as any).customerEmailExists('inactive@example.test'), true);
    assert.match(command, /WHERE email\s*=\s*@email/i);
    assert.doesNotMatch(command, /status\s*=|password/i);
  } finally { await closeDatabase(); }
});

test('customer registration and confirmation intent commit or roll back together', async t => {
  const sql = (await import('mssql')).default;
  const { createCustomer } = await import('./auth.repository.js');
  const { closeDatabase } = await import('../config/database.js');
  const events: string[] = [];
  const notifications: unknown[] = [];
  let committedCustomers = 0;
  let workingCustomers = 0;

  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => ({ connected: true, close: async () => {} }));
  t.mock.method(sql.Transaction.prototype, 'begin', async function () {
    workingCustomers = committedCustomers;
    events.push('begin');
    return this;
  });
  t.mock.method(sql.Transaction.prototype, 'commit', async () => {
    committedCustomers = workingCustomers;
    events.push('commit');
  });
  t.mock.method(sql.Transaction.prototype, 'rollback', async () => {
    workingCustomers = committedCustomers;
    events.push('rollback');
  });
  t.mock.method(sql.Request.prototype, 'query', async function (command: string) {
    assert.match(command, /INSERT\s+dbo\.CUSTOMER/i);
    workingCustomers++;
    return { recordset: [{ customer_id: workingCustomers }], rowsAffected: [1] };
  });

  const input = { firstName: 'Juan', lastName: 'Customer', email: 'Juan@Example.test', phone: '09171234567', passwordHash: 'hash' };
  const queue = async (notification: unknown, request: unknown) => {
    assert.ok(request instanceof sql.Request);
    notifications.push(notification);
    return '1';
  };

  const issueVerification = async (email: string, request: unknown, enqueue: any) => {
    await enqueue({ recipient: email, templateKey: 'EMAIL_VERIFICATION_CODE',
      payload: { accountName: 'Juan Customer', accountType: 'CUSTOMER', selector: 'a'.repeat(22) },
      relatedEntityType: 'CUSTOMER', relatedEntityId: '1' }, request);
  };
  assert.equal(await (createCustomer as any)(input, queue, issueVerification), 1);
  assert.equal(committedCustomers, 1);
  assert.deepEqual(notifications, [{
    recipient: input.email,
    templateKey: 'EMAIL_VERIFICATION_CODE',
    payload: { accountName: 'Juan Customer', accountType: 'CUSTOMER', selector: 'a'.repeat(22) },
    relatedEntityType: 'CUSTOMER',
    relatedEntityId: '1'
  }]);

  await assert.rejects((createCustomer as any)(input, async () => { throw new Error('outbox failed'); }, issueVerification), /outbox failed/);
  assert.equal(committedCustomers, 1);
  assert.deepEqual(events, ['begin', 'commit', 'begin', 'rollback']);
  await closeDatabase();
});

test('customer phone update changes only the active authenticated customer contact field', async t => {
  const sql = (await import('mssql')).default;
  const { updateCustomerPhone } = await import('./auth.repository.js');
  const { closeDatabase } = await import('../config/database.js');
  const inputs: Record<string, unknown> = {};
  let command = '';
  let found = true;
  const request = {
    input(name: string, _type: unknown, value: unknown) { inputs[name] = value; return this; },
    async query(query: string) {
      command = query;
      return { recordset: found ? [{ customer_id: 42, first_name: 'New', last_name: 'Customer', email: 'new@example.test', contact_number: inputs.phone }] : [] };
    },
  };
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => ({ connected: true, request: () => request, close: async () => {} }));
  try {
    assert.deepEqual(await updateCustomerPhone(42, '+639171234567'), {
      id: 42, fullName: 'New Customer', email: 'new@example.test', phone: '+639171234567', role: 'customer',
    });
    assert.deepEqual(inputs, { customerId: 42, phone: '+639171234567' });
    assert.match(command, /UPDATE\s+dbo\.CUSTOMER\s+SET\s+contact_number\s*=\s*@phone\s+OUTPUT/i);
    assert.match(command, /WHERE\s+customer_id\s*=\s*@customerId\s+AND\s+status\s*=\s*'ACTIVE'/i);
    found = false;
    assert.equal(await updateCustomerPhone(999, '09171234567'), undefined);
  } finally { await closeDatabase(); }
});
