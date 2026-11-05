import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('least-privilege provisioning rejects login-management authority', async () => {
  const sql = await read('operations/sql-server/least-privilege.sql');

  assert.match(sql, /IS_SRVROLEMEMBER\(N'securityadmin', @RuntimeLogin\)/);
  assert.match(sql, /IS_SRVROLEMEMBER\(N'securityadmin', @MigrationLogin\)/);
  assert.match(sql, /'ALTER ANY LOGIN'/);
});

test('runtime verifier proves required data access and blocked administrative access', async () => {
  const sql = await read('operations/sql-server/verify-runtime-permissions.sql');

  assert.match(sql, /:on error exit/);
  assert.match(sql, /:setvar DatabaseName/);
  assert.match(sql, /:setvar RuntimeLogin/);
  assert.match(sql, /ORIGINAL_LOGIN\(\)/);

  for (const permission of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'EXECUTE']) {
    assert.match(sql, new RegExp(`HAS_PERMS_BY_NAME\\(N'dbo', N'SCHEMA', N'${permission}'\\)`));
  }

  for (const permission of [
    'CREATE TABLE',
    'ALTER',
    'CONTROL',
    'TAKE OWNERSHIP',
    'CREATE ANY DATABASE',
    'ALTER ANY DATABASE',
    'ALTER ANY LOGIN',
    'CONTROL SERVER',
  ]) {
    assert.match(sql, new RegExp(`N'${permission}'`));
  }

  assert.match(sql, /IS_SRVROLEMEMBER\(N'sysadmin'\)/);
  assert.match(sql, /IS_SRVROLEMEMBER\(N'dbcreator'\)/);
  assert.match(sql, /IS_SRVROLEMEMBER\(N'securityadmin'\)/);
  assert.match(sql, /N'PASS' AS permission_status/);
});

test('runtime verifier is a read-only permission probe', async () => {
  const sql = await read('operations/sql-server/verify-runtime-permissions.sql');
  const executableMutation = /^\s*(CREATE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE|MERGE)\s+/gim;

  assert.equal(sql.match(executableMutation), null);
});

test('CI keeps the SQL permission contracts under regression coverage', async () => {
  const workflow = await read('.github/workflows/ci.yml');

  assert.match(workflow, /node --test \.\.\/scripts\/sql-server-permissions\.test\.mjs/);
});
