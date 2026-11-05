import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

test('production requires a valid 32-byte MFA encryption key', async () => {
  // Import after supplying the environment module's startup configuration.
  const { readAdminMfaConfiguration } = await import('./environment.js');
  assert.throws(() => readAdminMfaConfiguration({}, 'production'), /ADMIN_MFA_ENCRYPTION_KEY/);
  assert.throws(() => readAdminMfaConfiguration({ ADMIN_MFA_ENCRYPTION_KEY: 'short' }, 'production'), /32-byte/);
  const key = Buffer.alloc(32, 7).toString('base64');
  assert.deepEqual(readAdminMfaConfiguration({ ADMIN_MFA_ENCRYPTION_KEY: key }, 'production').key, Buffer.alloc(32, 7));
  assert.equal(readAdminMfaConfiguration({}, 'test').key, undefined);
});
