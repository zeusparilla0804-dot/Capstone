import assert from 'node:assert/strict';
import test from 'node:test';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const auth = await import('./auth.service.js');
const input = { firstName: 'Juan', lastName: 'Customer', email: 'customer@example.test', phone: '09171234567', password: 'unique-password-12345' };

test('registration refuses an email already reserved by an inactive customer', async () => {
  const service = (auth as any).createRegistrationService({
    customerEmailExists: async () => true,
    hashPassword: async () => { throw new Error('must not hash duplicate registration'); },
    createCustomer: async () => { throw new Error('must not insert duplicate registration'); },
  });
  await assert.rejects(service.register(input), (error: any) => error.statusCode === 409);
});

test('a competing registration unique-key failure becomes a controlled conflict', async () => {
  for (const error of [{ number: 2601 }, { number: 2627 }, { originalError: { info: { number: 2627 } } }]) {
    const service = (auth as any).createRegistrationService({
      customerEmailExists: async () => false,
      hashPassword: async () => 'hash',
      createCustomer: async () => { throw error; },
    });
    await assert.rejects(service.register(input), (failure: any) => failure.statusCode === 409);
  }
});

test('registration preserves unrelated storage failures and returns the new customer without a session', async () => {
  let failed = false;
  const service = (auth as any).createRegistrationService({
    customerEmailExists: async () => false,
    hashPassword: async () => 'hash',
    createCustomer: async () => { if (failed) throw new Error('outbox unavailable'); return 42; },
  });
  assert.deepEqual(await service.register(input), { user: {
    id: 42, fullName: 'Juan Customer', email: input.email, phone: input.phone, role: 'customer',
  } });
  failed = true;
  await assert.rejects(service.register(input), /outbox unavailable/);
});
