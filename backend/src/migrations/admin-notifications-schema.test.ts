import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { EXPECTED_MIGRATIONS, EXPECTED_SCHEMA_CONTRACT } from './schema-contract.js';

test('admin read migration is additive, repeatable and usable as one Azure SQL batch', () => {
  const path = new URL('../../migrations/025_admin_notification_read.sql', import.meta.url);
  assert.ok(existsSync(path), 'admin read migration must exist');
  const script = readFileSync(path, 'utf8');
  assert.match(script, /IF OBJECT_ID\('dbo.ADMIN_NOTIFICATION_READ', 'U'\) IS NULL/);
  assert.match(script, /PRIMARY KEY\s*\(admin_id, notification_key\)/i);
  assert.match(script, /notification_key nvarchar\(120\) NOT NULL/);
  assert.match(script, /FOREIGN KEY\s*\(admin_id\) REFERENCES dbo.ADMIN\(admin_id\)/i);
  assert.match(script, /DEFAULT\(sysutcdatetime\(\)\)/i);
  assert.doesNotMatch(script, /^\s*GO\s*$|\b(?:DROP|DELETE|TRUNCATE|UPDATE|MERGE)\b/im);
  assert.ok(EXPECTED_MIGRATIONS.includes('025_admin_notification_read.sql'));
  assert.deepEqual(EXPECTED_SCHEMA_CONTRACT.columns.filter(item => item.table === 'ADMIN_NOTIFICATION_READ').map(item => [item.name, item.nullable]),
    [['admin_id', false], ['notification_key', false], ['read_at', false]]);
  for (const [name, type] of [['PK_ADMIN_NOTIFICATION_READ', 'PK'], ['FK_ADMIN_NOTIFICATION_READ_ADMIN', 'F'], ['DF_ADMIN_NOTIFICATION_READ_read_at', 'D']]) {
    assert.ok(EXPECTED_SCHEMA_CONTRACT.constraints.some(item => item.table === 'ADMIN_NOTIFICATION_READ' && item.name === name && item.type === type));
  }
});
