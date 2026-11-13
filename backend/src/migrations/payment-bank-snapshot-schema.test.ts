import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { EXPECTED_MIGRATIONS, EXPECTED_SCHEMA_CONTRACT } from './schema-contract.js';

test('bank snapshot migration preserves historical rows and registers nullable columns for proofs and credits', () => {
  const url = new URL('../../migrations/024_customer_bank_payment_snapshots.sql', import.meta.url);
  assert.ok(existsSync(url), 'bank snapshot migration must exist');
  const script = readFileSync(url, 'utf8');
  assert.ok(EXPECTED_MIGRATIONS.includes('024_customer_bank_payment_snapshots.sql'));
  for (const table of ['PAYMENT_PROOF', 'PAYMENT_TRANSACTION']) {
    for (const name of ['destination_id', 'destination_label', 'destination_account_name', 'destination_account_hint', 'destination_version']) {
      const column = EXPECTED_SCHEMA_CONTRACT.columns.find(item => item.table === table && item.name === name);
      assert.ok(column, `${table}.${name} must be verified`);
      assert.equal(column.nullable, true, 'historical payments must remain valid');
      assert.ok(script.includes(`COL_LENGTH('dbo.${table}','${name}') IS NULL`));
    }
    assert.ok(EXPECTED_SCHEMA_CONTRACT.constraints.some(item => item.table === table && item.name === `FK_${table}_DESTINATION`));
  }
  assert.doesNotMatch(script, /ON DELETE CASCADE|\b(?:UPDATE|DELETE|TRUNCATE)\s+(?:FROM\s+)?dbo\./i);
});
