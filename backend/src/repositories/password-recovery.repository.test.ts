import assert from 'node:assert/strict';
import test from 'node:test';
import type sql from 'mssql';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const { createPasswordRecoveryRepository } = await import('./password-recovery.repository.js');
const now = new Date('2026-10-10T01:00:00.000Z');
const principal = { id: 7, principalType: 'CUSTOMER' as const, email: 'Customer@Example.test', displayName: 'Juan Customer' };

interface Result { rows?: any[]; affected?: number; }

function harness(results: Result[]) {
  const commands: { sql: string; params: Record<string, unknown>; request: unknown }[] = [];
  const events: string[] = [];
  const notifications: any[] = [];
  const request = {} as sql.Request;
  const runner = {
    replaceInput(name: string, _type: unknown, value: unknown) {
      (runner as any).parameters[name] = value;
      return runner;
    },
    parameters: {} as Record<string, unknown>,
    async query(command: string) {
      commands.push({ sql: command, params: { ...runner.parameters }, request });
      runner.parameters = {};
      const next = results.shift() ?? {};
      return { recordset: next.rows ?? [], rowsAffected: [next.affected ?? (next.rows?.length ?? 0)] };
    },
  };
  Object.assign(request, runner);
  const repository = createPasswordRecoveryRepository({
    readRequest: async () => request,
    transaction: async (work: (request: sql.Request) => Promise<unknown>) => {
      events.push('begin');
      try { const value = await work(request); events.push('commit'); return value; }
      catch (error) { events.push('rollback'); throw error; }
    },
  });
  const queue = async (input: unknown, supplied: sql.Request) => {
    assert.equal(supplied, request);
    notifications.push(input);
    return '42';
  };
  return { repository, commands, events, notifications, queue, request };
}

test('findPrincipal uses normalized role-specific parameterized lookups and requires active administrators', async () => {
  const customerDb = harness([{ rows: [{ id: 7, email: 'Customer@Example.test', displayName: 'Juan Customer' }] }]);
  assert.deepEqual(await customerDb.repository.findPrincipal('CUSTOMER', 'customer@example.test'), principal);
  assert.match(customerDb.commands[0].sql, /FROM dbo\.CUSTOMER/);
  assert.match(customerDb.commands[0].sql, /LOWER\(email\)=@email/i);
  assert.equal(customerDb.commands[0].params.email, 'customer@example.test');

  const adminDb = harness([{ rows: [{ id: 8, email: 'Admin@Example.test', displayName: 'Ana Admin' }] }]);
  assert.deepEqual(await adminDb.repository.findPrincipal('ADMIN', 'admin@example.test'), {
    id: 8, principalType: 'ADMIN', email: 'Admin@Example.test', displayName: 'Ana Admin',
  });
  assert.match(adminDb.commands[0].sql, /FROM dbo\.ADMIN/);
  assert.match(adminDb.commands[0].sql, /status='ACTIVE'/i);
  assert.equal(/UNION|\+\s*principal/i.test(adminDb.commands[0].sql), false);
});

test('issue enforces a locked account cooldown without invalidating or queuing', async () => {
  const db = harness([
    { rows: [{ id: 7 }] },
    { rows: [{ resetId: '10' }] },
  ]);
  const result = await db.repository.issue({ principal, selector: 'a'.repeat(22), tokenHash: 'b'.repeat(64), now,
    expiresAt: new Date(+now + 900_000), cooldownMs: 60_000 }, db.queue);

  assert.equal(result, 'COOLDOWN');
  assert.deepEqual(db.events, ['begin', 'commit']);
  assert.equal(db.notifications.length, 0);
  assert.equal(db.commands.length, 2);
  assert.match(db.commands[0].sql, /UPDLOCK,HOLDLOCK/);
  assert.match(db.commands[0].sql, /LOWER\(email\)=@principalEmail/i);
  assert.equal(db.commands[0].params.principalEmail, 'customer@example.test');
  assert.match(db.commands[1].sql, /UPDLOCK,HOLDLOCK/);
  assert.deepEqual(db.commands[1].params.cooldownCutoff, new Date(+now - 60_000));
});

test('issue invalidates prior tokens, stores only hash and selector, and atomically queues safe intent', async () => {
  const db = harness([{ rows: [{ id: 7 }] }, { rows: [] }, { affected: 2 }, { rows: [{ resetId: '11' }] }]);
  const result = await db.repository.issue({ principal, selector: 'a'.repeat(22), tokenHash: 'b'.repeat(64), now,
    expiresAt: new Date(+now + 900_000), cooldownMs: 60_000 }, db.queue);

  assert.equal(result, 'ISSUED');
  assert.deepEqual(db.events, ['begin', 'commit']);
  assert.match(db.commands[2].sql, /UPDATE dbo\.PASSWORD_RESET_TOKEN.*invalidated_at/s);
  assert.match(db.commands[3].sql, /INSERT dbo\.PASSWORD_RESET_TOKEN/);
  assert.equal(db.commands[3].params.tokenHash, 'b'.repeat(64));
  assert.equal(Object.values(db.commands[3].params).some(value => String(value).includes('.')), false);
  assert.deepEqual(db.notifications, [{
    recipient: principal.email,
    templateKey: 'PASSWORD_RESET_REQUESTED',
    payload: { accountName: principal.displayName, selector: 'a'.repeat(22), accountType: 'CUSTOMER' },
  }]);
});

test('consume treats expired, invalidated, used, superseded, and unknown rows as one invalid result', async () => {
  const db = harness([{ rows: [] }]);
  assert.equal(await db.repository.consume({ principalType: 'CUSTOMER', selector: 'a'.repeat(22), tokenHash: 'b'.repeat(64),
    passwordHash: 'hashed', now }, db.queue), 'INVALID');
  assert.deepEqual(db.events, ['begin', 'commit']);
  assert.equal(db.commands.length, 1);
  assert.match(db.commands[0].sql, /UPDLOCK,HOLDLOCK/);
  assert.match(db.commands[0].sql, /used_at IS NULL/i);
  assert.match(db.commands[0].sql, /invalidated_at IS NULL/i);
  assert.match(db.commands[0].sql, /expires_at>@now/i);
  assert.equal(db.notifications.length, 0);
});

test('customer consume changes password, consumes token, invalidates peers, revokes sessions, and queues confirmation atomically', async () => {
  const db = harness([
    { rows: [{ resetId: '11', principalId: 7, email: principal.email, displayName: principal.displayName }] },
    { affected: 1 }, { affected: 1 }, { affected: 2 }, { affected: 3 },
  ]);
  const result = await db.repository.consume({ principalType: 'CUSTOMER', selector: 'a'.repeat(22), tokenHash: 'b'.repeat(64),
    passwordHash: 'hashed:new-password', now }, db.queue);

  assert.equal(result, 'CONSUMED');
  assert.deepEqual(db.events, ['begin', 'commit']);
  assert.match(db.commands[1].sql, /UPDATE dbo\.CUSTOMER SET password=@passwordHash/);
  assert.match(db.commands[2].sql, /used_at=@now/);
  assert.match(db.commands[3].sql, /invalidated_at=@now/);
  assert.match(db.commands[4].sql, /DELETE dbo\.AUTH_SESSION/);
  assert.deepEqual(db.notifications, [{ recipient: principal.email, templateKey: 'PASSWORD_CHANGED',
    payload: { displayName: principal.displayName } }]);
});

test('administrator consume uses only administrator password and session tables', async () => {
  const db = harness([
    { rows: [{ resetId: '11', principalId: 8, email: 'Admin@example.test', displayName: 'Ana Admin' }] },
    { affected: 1 }, { affected: 1 }, { affected: 0 }, { affected: 2 },
  ]);
  assert.equal(await db.repository.consume({ principalType: 'ADMIN', selector: 'a'.repeat(22), tokenHash: 'b'.repeat(64),
    passwordHash: 'hashed', now }, db.queue), 'CONSUMED');
  assert.match(db.commands[0].sql, /JOIN dbo\.ADMIN/);
  assert.match(db.commands[0].sql, /status='ACTIVE'/);
  assert.match(db.commands[1].sql, /UPDATE dbo\.ADMIN SET password=@passwordHash/);
  assert.match(db.commands[4].sql, /DELETE dbo\.ADMIN_SESSION/);
  assert.equal(db.commands.some(command => /AUTH_SESSION/.test(command.sql) && !/ADMIN_SESSION/.test(command.sql)), false);
  assert.ok(db.commands.some(command => /AUTH_SECURITY_EVENT/.test(command.sql) && command.params.securityEvent === 'PASSWORD_RESET'));
  assert.ok(db.commands.some(command => /DELETE dbo.AUTH_LOGIN_ATTEMPT/.test(command.sql)));
});

test('queue failure aborts issuance and consumption transactions', async () => {
  for (const operation of ['issue', 'consume'] as const) {
    const results = operation === 'issue'
      ? [{ rows: [{ id: 7 }] }, { rows: [] }, { affected: 0 }, { rows: [{ resetId: '11' }] }]
      : [{ rows: [{ resetId: '11', principalId: 7, email: principal.email, displayName: principal.displayName }] },
          { affected: 1 }, { affected: 1 }, { affected: 0 }, { affected: 1 }];
    const db = harness(results);
    const failQueue = async () => { throw new Error('outbox unavailable'); };
    const action = operation === 'issue'
      ? db.repository.issue({ principal, selector: 'a'.repeat(22), tokenHash: 'b'.repeat(64), now,
          expiresAt: new Date(+now + 900_000), cooldownMs: 60_000 }, failQueue)
      : db.repository.consume({ principalType: 'CUSTOMER', selector: 'a'.repeat(22), tokenHash: 'b'.repeat(64),
          passwordHash: 'hashed', now }, failQueue);
    await assert.rejects(action, /outbox unavailable/);
    assert.deepEqual(db.events, ['begin', 'rollback']);
  }
});

test('isDeliverable binds queued mail to the current recipient as well as token validity', async () => {
  const db = harness([{ rows: [{ deliverable: 1 }] }]);
  assert.equal(await db.repository.isDeliverable('a'.repeat(22), 'ADMIN', now, 'old@example.test'), true);
  assert.match(db.commands[0].sql, /principal_type=@principalType/);
  assert.match(db.commands[0].sql, /used_at IS NULL/);
  assert.match(db.commands[0].sql, /invalidated_at IS NULL/);
  assert.match(db.commands[0].sql, /expires_at>@now/);
  assert.match(db.commands[0].sql, /status='ACTIVE'/);
  assert.match(db.commands[0].sql, /LOWER\(a\.email\)=@recipient/i);
  assert.equal(db.commands[0].params.recipient, 'old@example.test');
});
