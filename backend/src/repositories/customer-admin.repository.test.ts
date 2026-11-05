import assert from 'node:assert/strict';
import test from 'node:test';
import type sql from 'mssql';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';

const { createCustomerAdminRepository } = await import('./customer-admin.repository.js');

type QueryResult = { recordset?: Record<string, unknown>[]; rowsAffected?: number[] };

class RequestRecorder {
  readonly calls: { command: string; params: Record<string, unknown> }[] = [];
  private readonly params: Record<string, unknown> = {};

  constructor(private readonly responder: (command: string) => QueryResult) {}

  replaceInput(name: string, _type: unknown, value: unknown) {
    this.params[name] = value;
    return this;
  }

  async query(command: string) {
    this.calls.push({ command, params: { ...this.params } });
    return this.responder(command);
  }
}

const current = {
  id: 7, firstName: 'Old', lastName: 'Name', email: 'old@example.test', phone: '09000000000', status: 'ACTIVE',
};

test('profile update locks the customer, updates allowed fields, and audits old and new values', async () => {
  const request = new RequestRecorder((command) => /SELECT/i.test(command) ? { recordset: [current] } : { rowsAffected: [1] });
  const audits: unknown[] = [];
  let transactions = 0;
  const repository = createCustomerAdminRepository({
    transaction: async (work) => { transactions += 1; return work(request as unknown as sql.Request); },
    audit: async (event) => { audits.push(event); },
  });

  const result = await repository.updateProfile(3, 7, {
    firstName: 'Klint', lastName: 'Charles', email: 'klint@example.test', phone: '09171234567',
  });

  assert.equal(transactions, 1);
  assert.match(request.calls[0]!.command, /WITH\s*\(UPDLOCK,HOLDLOCK\)/i);
  assert.match(request.calls[1]!.command, /UPDATE\s+dbo\.CUSTOMER/i);
  assert.doesNotMatch(request.calls[1]!.command, /password/i);
  const invalidation = request.calls.find(call => /UPDATE\s+dbo\.PASSWORD_RESET_TOKEN/i.test(call.command));
  assert.ok(invalidation, 'Changing email must invalidate links sent to the previous address');
  assert.match(invalidation.command, /customer_id=@customerId/);
  assert.match(invalidation.command, /used_at IS NULL AND invalidated_at IS NULL/);
  assert.deepEqual(audits, [{
    adminId: 3, action: 'CUSTOMER_UPDATED', entityType: 'CUSTOMER', entityId: 7,
    oldValues: { firstName: 'Old', lastName: 'Name', email: 'old@example.test', phone: '09000000000' },
    newValues: { firstName: 'Klint', lastName: 'Charles', email: 'klint@example.test', phone: '09171234567' },
  }]);
  assert.deepEqual(result, { ...current, firstName: 'Klint', lastName: 'Charles', email: 'klint@example.test', phone: '09171234567' });
});

test('deactivation revokes only the customer sessions and records the status transition', async () => {
  const request = new RequestRecorder((command) => /SELECT/i.test(command) ? { recordset: [current] } : { rowsAffected: [1] });
  const audits: unknown[] = [];
  const repository = createCustomerAdminRepository({
    transaction: async (work) => work(request as unknown as sql.Request),
    audit: async (event) => { audits.push(event); },
  });

  const result = await repository.setStatus(3, 7, 'INACTIVE');

  assert.equal(result?.status, 'INACTIVE');
  assert.ok(request.calls.some((call) => /DELETE\s+dbo\.AUTH_SESSION\s+WHERE\s+customer_id\s*=\s*@customerId/i.test(call.command)));
  assert.ok(request.calls.every((call) => !/DELETE\s+dbo\.CUSTOMER/i.test(call.command)));
  assert.deepEqual(audits, [{
    adminId: 3, action: 'CUSTOMER_DEACTIVATED', entityType: 'CUSTOMER', entityId: 7,
    oldValues: { status: 'ACTIVE' }, newValues: { status: 'INACTIVE' },
  }]);
});

test('reactivation keeps sessions untouched and audit failure aborts the transaction result', async () => {
  const inactive = { ...current, status: 'INACTIVE' };
  const request = new RequestRecorder((command) => /SELECT/i.test(command) ? { recordset: [inactive] } : { rowsAffected: [1] });
  let rolledBack = false;
  const repository = createCustomerAdminRepository({
    transaction: async (work) => {
      try { return await work(request as unknown as sql.Request); }
      catch (error) { rolledBack = true; throw error; }
    },
    audit: async () => { throw new Error('audit unavailable'); },
  });

  await assert.rejects(repository.setStatus(3, 7, 'ACTIVE'), /audit unavailable/);
  assert.equal(rolledBack, true);
  assert.equal(request.calls.some((call) => /DELETE\s+dbo\.AUTH_SESSION/i.test(call.command)), false);
});
