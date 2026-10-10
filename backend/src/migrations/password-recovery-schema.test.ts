import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL('../../migrations/011_password_recovery.sql', import.meta.url);

test('password recovery migration defines the guarded reset-token table', () => {
  const sql = readFileSync(migrationUrl, 'utf8');

  assert.match(sql, /SET\s+XACT_ABORT\s+ON/i);
  assert.match(sql, /BEGIN\s+TRANSACTION/i);
  assert.match(sql, /OBJECT_ID\('dbo\.PASSWORD_RESET_TOKEN',\s*'U'\)\s+IS\s+NULL/i);
  assert.match(sql, /CREATE\s+TABLE\s+dbo\.PASSWORD_RESET_TOKEN/i);
  assert.match(sql, /COMMIT/i);

  for (const column of [
    /reset_id\s+bigint\s+IDENTITY\(1,1\)\s+NOT\s+NULL/i,
    /selector\s+char\(22\)\s+NOT\s+NULL/i,
    /token_hash\s+char\(64\)\s+NOT\s+NULL/i,
    /principal_type\s+varchar\(10\)\s+NOT\s+NULL/i,
    /customer_id\s+int\s+NULL/i,
    /admin_id\s+int\s+NULL/i,
    /expires_at\s+datetime2\s+NOT\s+NULL/i,
    /used_at\s+datetime2\s+NULL/i,
    /invalidated_at\s+datetime2\s+NULL/i,
    /created_at\s+datetime2\s+NOT\s+NULL/i,
  ]) assert.match(sql, column);

  assert.match(sql, /CONSTRAINT\s+PK_PASSWORD_RESET_TOKEN\s+PRIMARY\s+KEY/i);
  assert.match(sql, /CONSTRAINT\s+UQ_PASSWORD_RESET_TOKEN_selector\s+UNIQUE\s*\(selector\)/i);
  assert.match(sql, /CONSTRAINT\s+UQ_PASSWORD_RESET_TOKEN_hash\s+UNIQUE\s*\(token_hash\)/i);
  assert.match(sql, /CONSTRAINT\s+DF_PASSWORD_RESET_TOKEN_created\s+DEFAULT\s*\(sysutcdatetime\(\)\)/i);
  assert.match(sql, /CONSTRAINT\s+FK_PASSWORD_RESET_TOKEN_CUSTOMER\s+FOREIGN\s+KEY\s*\(customer_id\)\s+REFERENCES\s+dbo\.CUSTOMER\(customer_id\)/i);
  assert.match(sql, /CONSTRAINT\s+FK_PASSWORD_RESET_TOKEN_ADMIN\s+FOREIGN\s+KEY\s*\(admin_id\)\s+REFERENCES\s+dbo\.ADMIN\(admin_id\)/i);
  assert.match(sql, /principal_type\s*=\s*'CUSTOMER'[\s\S]*customer_id\s+IS\s+NOT\s+NULL[\s\S]*admin_id\s+IS\s+NULL/i);
  assert.match(sql, /principal_type\s*=\s*'ADMIN'[\s\S]*admin_id\s+IS\s+NOT\s+NULL[\s\S]*customer_id\s+IS\s+NULL/i);
});

test('password recovery migration provides cooldown and cleanup indexes', () => {
  const sql = readFileSync(migrationUrl, 'utf8');

  assert.match(sql, /CREATE\s+INDEX\s+IX_PASSWORD_RESET_TOKEN_customer_created\s+ON\s+dbo\.PASSWORD_RESET_TOKEN\s*\(customer_id,\s*created_at\s+DESC\)/i);
  assert.match(sql, /WHERE\s+customer_id\s+IS\s+NOT\s+NULL/i);
  assert.match(sql, /CREATE\s+INDEX\s+IX_PASSWORD_RESET_TOKEN_admin_created\s+ON\s+dbo\.PASSWORD_RESET_TOKEN\s*\(admin_id,\s*created_at\s+DESC\)/i);
  assert.match(sql, /WHERE\s+admin_id\s+IS\s+NOT\s+NULL/i);
  assert.match(sql, /CREATE\s+INDEX\s+IX_PASSWORD_RESET_TOKEN_expiry\s+ON\s+dbo\.PASSWORD_RESET_TOKEN\s*\(expires_at\)/i);
  assert.match(sql, /INCLUDE\s*\(used_at,\s*invalidated_at\)/i);
});
