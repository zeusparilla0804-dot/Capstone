import assert from 'node:assert/strict';
import test from 'node:test';

import { AppError } from '../utils/app-error.js';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';

const { createCustomerAdminService } = await import('./customer-admin.service.js');

const customer = {
  id: 7,
  firstName: 'Klint',
  lastName: 'Charles',
  email: 'klint@example.test',
  phone: '09171234567',
  status: 'ACTIVE' as const,
};

test('customer profile update normalizes allowed fields before persistence', async () => {
  let observed: unknown;
  const service = createCustomerAdminService({
    updateProfile: async (adminId, customerId, input) => {
      observed = { adminId, customerId, input };
      return { ...customer, ...input };
    },
    setStatus: async () => customer,
  });

  const result = await service.updateProfile(3, 7, {
    firstName: '  Klint  ', lastName: '  Charles ', email: ' KLINT@EXAMPLE.TEST ', phone: ' 09171234567 ',
  });

  assert.deepEqual(observed, {
    adminId: 3,
    customerId: 7,
    input: { firstName: 'Klint', lastName: 'Charles', email: 'klint@example.test', phone: '09171234567' },
  });
  assert.equal(result.email, 'klint@example.test');
  assert.equal('password' in result, false);
});

test('customer profile update rejects invalid fields before persistence', async () => {
  let calls = 0;
  const service = createCustomerAdminService({
    updateProfile: async () => { calls += 1; return customer; },
    setStatus: async () => customer,
  });

  await assert.rejects(
    service.updateProfile(3, 7, { firstName: '', lastName: 'Charles', email: 'invalid', phone: '' }),
    (error: unknown) => error instanceof AppError && error.statusCode === 400,
  );
  assert.equal(calls, 0);
});

test('customer profile update maps missing and duplicate records to safe errors', async () => {
  const missing = createCustomerAdminService({
    updateProfile: async () => undefined,
    setStatus: async () => customer,
  });
  await assert.rejects(
    missing.updateProfile(3, 77, customer),
    (error: unknown) => error instanceof AppError && error.statusCode === 404,
  );

  const duplicate = createCustomerAdminService({
    updateProfile: async () => { throw Object.assign(new Error('duplicate'), { number: 2627 }); },
    setStatus: async () => customer,
  });
  await assert.rejects(
    duplicate.updateProfile(3, 7, customer),
    (error: unknown) => error instanceof AppError && error.statusCode === 409 && error.message === 'Email is already in use.',
  );
});

test('customer status accepts only active or inactive and returns a sanitized record', async () => {
  const observed: unknown[] = [];
  const service = createCustomerAdminService({
    updateProfile: async () => customer,
    setStatus: async (adminId, customerId, status) => {
      observed.push({ adminId, customerId, status });
      return { ...customer, status };
    },
  });

  assert.equal((await service.setStatus(3, 7, 'inactive')).status, 'INACTIVE');
  assert.deepEqual(observed, [{ adminId: 3, customerId: 7, status: 'INACTIVE' }]);
  await assert.rejects(
    service.setStatus(3, 7, 'SUSPENDED'),
    (error: unknown) => error instanceof AppError && error.statusCode === 400,
  );
});
