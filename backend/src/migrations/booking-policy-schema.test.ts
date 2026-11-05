import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { EXPECTED_MIGRATIONS, EXPECTED_SCHEMA_CONTRACT, findSchemaContractViolations } from './schema-contract.js';

test('booking policy migration uses guarded schema changes without backfilling historical bookings', () => {
  const script = readFileSync(new URL('../../migrations/020_booking_timing_policy.sql', import.meta.url), 'utf8');
  assert.match(script, /IF OBJECT_ID\('dbo\.BOOKING_POLICY','U'\) IS NULL/);
  assert.match(script, /PRIMARY KEY\(reservation_id\)/);
  assert.match(script, /FOREIGN KEY\(reservation_id\) REFERENCES dbo\.RESERVATION\(reservation_id\)/);
  assert.match(script, /FOREIGN KEY\(exception_approved_by\) REFERENCES dbo\.ADMIN\(admin_id\)/);
  assert.match(script, /DEFAULT\(SYSUTCDATETIME\(\)\)/i);
  assert.match(script, /'EXPIRED'/);
  assert.match(script, /IF NOT EXISTS[\s\S]+sys\.indexes/);
  assert.doesNotMatch(script, /\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\s+(?:INTO\s+|FROM\s+)?dbo\./i);
});

test('schema contract requires policy persistence, saved deadlines, constraints, and deadline scan indexes', () => {
  assert.ok(EXPECTED_MIGRATIONS.includes('020_booking_timing_policy.sql'));
  assert.ok(EXPECTED_SCHEMA_CONTRACT.tables.includes('BOOKING_POLICY'));
  const snapshot = structuredClone({ ...EXPECTED_SCHEMA_CONTRACT, migrations: [...EXPECTED_MIGRATIONS] });
  snapshot.columns = snapshot.columns.filter(column => !(column.table === 'BOOKING_POLICY' && column.name === 'payment_due_at'));
  snapshot.indexes = snapshot.indexes.filter(index => index.name !== 'IX_BOOKING_POLICY_payment_due');
  assert.deepEqual(findSchemaContractViolations(snapshot), [
    'dbo.BOOKING_POLICY.payment_due_at: missing column',
    'dbo.BOOKING_POLICY.IX_BOOKING_POLICY_payment_due: missing index',
  ]);
});
