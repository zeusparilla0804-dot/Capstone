import assert from 'node:assert/strict';
import { emailCode } from '../src/utils/email-verification-code.js';

/** Test fixture setup only. Uses the real verification API, without reading/sending a mailbox message. */
export async function verifyFixtureEmail(baseApiUrl: string, email: string): Promise<void> {
  const [{ environment }, { getDbPool }, { default: sql }] = await Promise.all([
    import('../src/config/environment.js'), import('../src/config/database.js'), import('mssql'),
  ]);
  if (environment.isProduction) throw new Error('Fixture email verification is disabled in production.');
  assert.ok(environment.emailVerificationSecret, 'E2E fixtures require the email verification secret.');
  const result = await (await getDbPool()).request().input('email', sql.NVarChar(255), email)
    .query('SELECT v.selector FROM dbo.EMAIL_VERIFICATION_CHALLENGE v JOIN dbo.CUSTOMER c ON c.customer_id=v.customer_id WHERE c.email=@email');
  assert.ok(result.recordset[0], 'Expected a pending fixture email challenge.');
  const response = await fetch(`${baseApiUrl}/auth/email/verify`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-la-chef-request': '1' },
    body: JSON.stringify({ email, code: emailCode(result.recordset[0].selector, environment.emailVerificationSecret) }) });
  assert.equal(response.status, 200, 'Fixture email verification must succeed before fixture login.');
}
