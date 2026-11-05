import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { EXPECTED_MIGRATIONS, EXPECTED_SCHEMA_CONTRACT } from './schema-contract.js';

test('booking submission migration adds an owner-scoped durable key without altering existing business rows', () => {
  const path = new URL('../../migrations/017_booking_submission_idempotency.sql', import.meta.url);
  assert.ok(EXPECTED_MIGRATIONS.includes('017_booking_submission_idempotency.sql'));
  const script = readFileSync(path, 'utf8');
  assert.match(script, /IF OBJECT_ID\('dbo\.BOOKING_SUBMISSION','U'\) IS NULL/);
  assert.match(script, /PRIMARY KEY\(customer_id,submission_key\)/);
  assert.match(script, /submission_key uniqueidentifier NOT NULL/);
  assert.match(script, /request_hash char\(64\) NOT NULL/);
  assert.match(script, /FOREIGN KEY\(customer_id\) REFERENCES dbo\.CUSTOMER\(customer_id\)/);
  assert.match(script, /FOREIGN KEY\(reservation_id\) REFERENCES dbo\.RESERVATION\(reservation_id\)/);
  assert.match(script, /CHECK\(ISJSON\(response_json\)=1\)/);
  assert.doesNotMatch(script, /\b(?:INSERT|UPDATE|DELETE|MERGE|DROP|TRUNCATE)\b/i);
  assert.ok(EXPECTED_SCHEMA_CONTRACT.columns.some(column => column.table === 'BOOKING_SUBMISSION' && column.name === 'response_json' && column.maxLength === -1));
  assert.ok(EXPECTED_MIGRATIONS.includes('016_reservation_add_on_quantity.sql'));
  assert.ok(EXPECTED_SCHEMA_CONTRACT.columns.some(column => column.table === 'RESERVATION_ADD_ON' && column.name === 'quantity' && column.type === 'int'));
});
