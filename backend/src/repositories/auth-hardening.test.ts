import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { EXPECTED_MIGRATIONS, EXPECTED_SCHEMA_CONTRACT } from '../migrations/schema-contract.js';

test('durable security schema records attempts/events and last activity without touching bookings or payments', () => {
  assert.ok(EXPECTED_MIGRATIONS.includes('018_authentication_security.sql'));
  const script = readFileSync(new URL('../../migrations/018_authentication_security.sql', import.meta.url), 'utf8');
  assert.match(script, /AUTH_LOGIN_ATTEMPT/); assert.match(script, /AUTH_SECURITY_EVENT/);
  assert.match(script, /last_seen_at/);
  assert.doesNotMatch(script, /(?:UPDATE|DELETE|INSERT|DROP|TRUNCATE)\s+(?:dbo\.)?(?:CUSTOMER|RESERVATION|PAYMENT)\b/i);
  assert.ok(EXPECTED_SCHEMA_CONTRACT.columns.some(c => c.table === 'ADMIN_SESSION' && c.name === 'last_seen_at'));
});
test('admin activity is recorded while absolute expiry remains enforced', () => {
  const source = readFileSync(new URL('./auth.repository.ts', import.meta.url), 'utf8');
  assert.match(source, /UPDATE\s+s\s+SET\s+last_seen_at\s*=\s*SYSUTCDATETIME\(\)/i);
  assert.doesNotMatch(source, /last_seen_at\s*>|@idleMinutes/i);
  assert.match(source, /s\.expires_at>SYSUTCDATETIME\(\)/);
  assert.match(source, /OUTPUT\s+INSERTED\.admin_id/i);
});
test('session issuance locks the principal and requires the verified password to remain current', () => {
  const source = readFileSync(new URL('./auth.repository.ts', import.meta.url), 'utf8');
  assert.match(source, /FROM dbo\.CUSTOMER WITH\(UPDLOCK,HOLDLOCK\)[\s\S]*password=@expectedPasswordHash/);
  assert.match(source, /FROM dbo\.ADMIN WITH\(UPDLOCK,HOLDLOCK\)[\s\S]*password=@expectedPasswordHash/);
  const service = readFileSync(new URL('../services/auth.service.ts', import.meta.url), 'utf8');
  assert.match(service, /issueSession\(Number\(row\.customer_id\), row\.password\)/);
  assert.match(service, /createAdminSession\(Number\(row\.admin_id\), hashSessionToken\(token\), expiresAt, row\.password\)/);
});
