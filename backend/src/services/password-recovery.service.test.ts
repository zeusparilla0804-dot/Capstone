import assert from 'node:assert/strict';
import test from 'node:test';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const { createPasswordRecoveryService } = await import('./password-recovery.service.js');
const { createPasswordResetToken } = await import('../utils/password-reset-token.js');

const secret = '0123456789abcdef0123456789abcdef';
const now = new Date('2026-10-10T01:00:00.000Z');
const customer = { id: 7, principalType: 'CUSTOMER' as const, email: 'Customer@Example.test', displayName: 'Juan Customer' };
const admin = { id: 8, principalType: 'ADMIN' as const, email: 'Admin@Example.test', displayName: 'Ana Admin' };

function harness(overrides: Record<string, unknown> = {}) {
  const calls: Record<string, any[]> = { find: [], issue: [], consume: [], hash: [] };
  const repository = {
    async findPrincipal(principalType: string, email: string) {
      calls.find.push([principalType, email]);
      return principalType === 'CUSTOMER' ? customer : admin;
    },
    async issue(input: unknown) { calls.issue.push(input); return 'ISSUED' as const; },
    async consume(input: unknown) { calls.consume.push(input); return 'CONSUMED' as const; },
    async isDeliverable() { return true; },
  };
  const service = createPasswordRecoveryService({
    repository,
    hmacSecret: secret,
    ttlMs: 900_000,
    cooldownMs: 60_000,
    now: () => now,
    hashPassword: async (password: string) => { calls.hash.push(password); return `hashed:${password}`; },
    queueNotification: async () => '1',
    ...overrides,
  });
  return { service, repository, calls };
}

test('forgot request normalizes email and keeps customer and administrator namespaces separate', async () => {
  const { service, calls } = harness();

  assert.equal(await service.request('CUSTOMER', '  Customer@Example.TEST '), undefined);
  assert.equal(await service.request('ADMIN', '  Customer@Example.TEST '), undefined);

  assert.deepEqual(calls.find, [
    ['CUSTOMER', 'customer@example.test'],
    ['ADMIN', 'customer@example.test'],
  ]);
  assert.equal(calls.issue[0].principal.id, customer.id);
  assert.equal(calls.issue[1].principal.id, admin.id);
  assert.match(calls.issue[0].selector, /^[A-Za-z0-9_-]{22}$/);
  assert.match(calls.issue[0].tokenHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(calls.issue[0].expiresAt, new Date(+now + 900_000));
  assert.equal('token' in calls.issue[0], false);
});

test('forgot request is indistinguishable for missing, inactive, cooled-down, and locally disabled recovery', async () => {
  for (const scenario of ['missing', 'cooldown', 'disabled'] as const) {
    let tokenCreations = 0;
    const { service, repository, calls } = harness({
      hmacSecret: scenario === 'disabled' ? undefined : secret,
      createToken: () => { tokenCreations++; return createPasswordResetToken('CUSTOMER', secret); },
    });
    if (scenario === 'missing') repository.findPrincipal = async () => undefined;
    if (scenario === 'cooldown') repository.issue = async input => { calls.issue.push(input); return 'COOLDOWN'; };

    assert.equal(await service.request('CUSTOMER', 'person@example.test'), undefined);
    assert.equal(calls.issue.length, scenario === 'cooldown' ? 1 : 0);
    assert.equal(tokenCreations, scenario === 'cooldown' ? 1 : 0);
  }
});

test('reset validates password policy before hashing or database mutation', async () => {
  const token = createPasswordResetToken('CUSTOMER', secret).token;
  for (const [password, confirmation] of [
    ['short', 'short'],
    ['a'.repeat(129), 'a'.repeat(129)],
    ['valid-password-123', 'different-password-123'],
  ]) {
    const { service, calls } = harness();
    await assert.rejects(service.reset('CUSTOMER', token, password, confirmation), (error: any) => error.statusCode === 400);
    assert.equal(calls.hash.length, 0);
    assert.equal(calls.consume.length, 0);
  }
});

test('malformed, forged, wrong-role, disabled, and repository-rejected tokens share one safe failure', async () => {
  const customerToken = createPasswordResetToken('CUSTOMER', secret).token;
  const forged = `${customerToken.slice(0, -1)}${customerToken.endsWith('A') ? 'B' : 'A'}`;
  const scenarios = [
    { token: 'not-a-token', role: 'CUSTOMER', secret },
    { token: forged, role: 'CUSTOMER', secret },
    { token: customerToken, role: 'ADMIN', secret },
    { token: customerToken, role: 'CUSTOMER', secret: undefined },
    { token: customerToken, role: 'CUSTOMER', secret, invalidAtRepository: true },
  ] as const;

  for (const scenario of scenarios) {
    const { service, repository } = harness({ hmacSecret: scenario.secret });
    if (scenario.invalidAtRepository) repository.consume = async () => 'INVALID';
    await assert.rejects(
      service.reset(scenario.role, scenario.token, 'valid-password-123', 'valid-password-123'),
      (error: any) => error.statusCode === 400 && error.code === 'PASSWORD_RESET_INVALID' && !/expired|used|role/i.test(error.message),
    );
  }
});

test('successful reset hashes once and delegates authoritative single-use consumption', async () => {
  const issued = createPasswordResetToken('ADMIN', secret);
  const { service, calls } = harness();

  assert.equal(await service.reset('ADMIN', issued.token, 'new-password-123', 'new-password-123'), undefined);
  assert.deepEqual(calls.hash, ['new-password-123']);
  assert.equal(calls.consume.length, 1);
  assert.deepEqual(calls.consume[0], {
    principalType: 'ADMIN',
    selector: issued.selector,
    tokenHash: issued.tokenHash,
    passwordHash: 'hashed:new-password-123',
    now,
  });
});

test('repository and notification failures propagate without being disguised as token failures', async () => {
  const issued = createPasswordResetToken('CUSTOMER', secret);
  const databaseFailure = new Error('database unavailable');
  const { service, repository } = harness();
  repository.consume = async () => { throw databaseFailure; };

  await assert.rejects(
    service.reset('CUSTOMER', issued.token, 'new-password-123', 'new-password-123'),
    error => error === databaseFailure,
  );
});
