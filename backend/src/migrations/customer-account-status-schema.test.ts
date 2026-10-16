import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL('../../migrations/015_customer_account_status.sql', import.meta.url);

test('customer account status migration is transactional and idempotent', () => {
  const sql = readFileSync(migrationUrl, 'utf8');

  assert.match(sql, /SET\s+XACT_ABORT\s+ON/i);
  assert.match(sql, /BEGIN\s+TRANSACTION/i);
  assert.match(sql, /COL_LENGTH\('dbo\.CUSTOMER',\s*'status'\)\s+IS\s+NULL/i);
  assert.match(sql, /status\s+nvarchar\(20\)\s+NOT\s+NULL/i);
  assert.match(sql, /CONSTRAINT\s+DF_CUSTOMER_status\s+DEFAULT\s*\('ACTIVE'\)\s+WITH\s+VALUES/i);
  assert.match(sql, /EXEC\s*\(N'ALTER\s+TABLE\s+dbo\.CUSTOMER[\s\S]*CONSTRAINT\s+CK_CUSTOMER_status/i);
  assert.match(sql, /CHECK\s*\(status\s+IN\s*\(''ACTIVE'',\s*''INACTIVE''\)\)/i);
  assert.match(sql, /EXEC\s*\(N'CREATE\s+INDEX\s+IX_CUSTOMER_status/i);
  assert.match(sql, /CREATE\s+INDEX\s+IX_CUSTOMER_status\s+ON\s+dbo\.CUSTOMER\s*\(status\)/i);
  assert.match(sql, /COMMIT/i);
});
