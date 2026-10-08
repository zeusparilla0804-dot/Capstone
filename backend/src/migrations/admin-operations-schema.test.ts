import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL('../../migrations/008_admin_operations_core.sql', import.meta.url);
const referenceReleaseUrl = new URL('../../migrations/009_release_rejected_proof_references.sql', import.meta.url);
const capacityIndexUrl = new URL('../../migrations/010_booking_capacity_availability.sql', import.meta.url);

test('admin operations schema defines payment proofs, booking history, and the email outbox', () => {
  const sql = readFileSync(migrationUrl, 'utf8');

  assert.match(sql, /SET\s+XACT_ABORT\s+ON/i);
  assert.match(sql, /BEGIN\s+TRANSACTION/i);
  assert.match(sql, /COMMIT/i);

  for (const table of ['PAYMENT_PROOF', 'BOOKING_STATUS_HISTORY', 'EMAIL_OUTBOX']) {
    assert.match(sql, new RegExp(`OBJECT_ID\\('dbo\\.${table}',\\s*'U'\\)\\s+IS\\s+NULL`, 'i'));
    assert.match(sql, new RegExp(`CREATE\\s+TABLE\\s+dbo\\.${table}`, 'i'));
  }

  assert.match(sql, /method\s+nvarchar\([^)]*\)\s+NOT\s+NULL/i);
  assert.match(sql, /method\s+IN\s*\(\s*'CASH'\s*,\s*'BANK_TRANSFER'\s*,\s*'E_WALLET'\s*\)/i);
  assert.match(sql, /status\s+IN\s*\(\s*'SUBMITTED'\s*,\s*'VERIFIED'\s*,\s*'REJECTED'\s*,\s*'SUPERSEDED'\s*\)/i);
  assert.match(sql, /byte_size\s*>\s*0\s+AND\s+byte_size\s*<=\s*5242880/i);
  assert.match(sql, /claimed_amount\s*>\s*0/i);

  assert.match(sql, /FOREIGN\s+KEY\s*\(reservation_id\)\s+REFERENCES\s+dbo\.RESERVATION\(reservation_id\)/i);
  assert.match(sql, /FOREIGN\s+KEY\s*\(customer_id\)\s+REFERENCES\s+dbo\.CUSTOMER\(customer_id\)/i);
  assert.match(sql, /FOREIGN\s+KEY\s*\(reviewed_by\)\s+REFERENCES\s+dbo\.ADMIN\(admin_id\)/i);
  assert.match(sql, /FOREIGN\s+KEY\s*\(payment_id\)\s+REFERENCES\s+dbo\.PAYMENT\(payment_id\)/i);
  assert.match(sql, /FOREIGN\s+KEY\s*\(payment_transaction_id\)\s+REFERENCES\s+dbo\.PAYMENT_TRANSACTION\(payment_transaction_id\)/i);
  assert.match(sql, /FOREIGN\s+KEY\s*\(invoice_id\)\s+REFERENCES\s+dbo\.INVOICE\(invoice_id\)/i);

  assert.match(sql, /CK_PAYMENT_PROOF_review/i);
  assert.match(sql, /status\s*=\s*'VERIFIED'[\s\S]*reviewed_by\s+IS\s+NOT\s+NULL[\s\S]*reviewed_at\s+IS\s+NOT\s+NULL[\s\S]*verified_amount\s+IS\s+NOT\s+NULL/i);
  assert.match(sql, /status\s*=\s*'REJECTED'[\s\S]*reviewed_by\s+IS\s+NOT\s+NULL[\s\S]*reviewed_at\s+IS\s+NOT\s+NULL[\s\S]*rejection_reason\s+IS\s+NOT\s+NULL/i);

  const uniqueReferenceIndex = sql.match(
    /CREATE\s+UNIQUE\s+INDEX\s+UX_PAYMENT_PROOF_active_reference\s+ON\s+dbo\.PAYMENT_PROOF\s*\(([^)]*)\)\s+WHERE\s+([^;]+);/i,
  );
  assert.ok(uniqueReferenceIndex, 'transaction-reference unique index must exist');
  assert.equal(uniqueReferenceIndex[1].trim().toLowerCase(), 'transaction_reference');
  assert.equal(uniqueReferenceIndex[2].trim().toLowerCase(), 'transaction_reference is not null');
  for (const option of [
    'ANSI_NULLS',
    'ANSI_PADDING',
    'ANSI_WARNINGS',
    'ARITHABORT',
    'CONCAT_NULL_YIELDS_NULL',
    'QUOTED_IDENTIFIER',
  ]) {
    assert.match(sql, new RegExp(`SET\\s+${option}\\s+ON`, 'i'));
  }
  assert.match(sql, /SET\s+NUMERIC_ROUNDABORT\s+OFF/i);
  assert.match(sql, /CREATE\s+INDEX\s+IX_PAYMENT_PROOF_status_created/i);
  assert.match(sql, /CREATE\s+INDEX\s+IX_BOOKING_STATUS_HISTORY_reservation_created/i);
  assert.match(sql, /CREATE\s+INDEX\s+IX_EMAIL_OUTBOX_status_next_attempt/i);

  assert.match(sql, /actor_type\s+nvarchar\([^)]*\)\s+NOT\s+NULL/i);
  assert.match(sql, /previous_status\s+nvarchar\([^)]*\)\s+NULL/i);
  assert.match(sql, /next_status\s+nvarchar\([^)]*\)\s+NOT\s+NULL/i);

  assert.match(sql, /normalized_recipient\s+nvarchar\([^)]*\)\s+NOT\s+NULL/i);
  assert.match(sql, /payload\s+nvarchar\(max\)\s+NOT\s+NULL/i);
  assert.match(sql, /ISJSON\(payload\)\s*=\s*1/i);
  assert.match(sql, /status\s+IN\s*\(\s*'PENDING'\s*,\s*'PROCESSING'\s*,\s*'SENT'\s*,\s*'FAILED'\s*\)/i);
  assert.match(sql, /datetime2/i);
});

test('rejected and superseded proof references are archived before their active uniqueness slot is released', () => {
  const sql = readFileSync(referenceReleaseUrl, 'utf8');
  assert.match(sql, /archived_transaction_reference\s+nvarchar\(150\)\s+NULL/i);
  assert.match(sql, /status\s+IN\s*\(\s*''REJECTED''\s*,\s*''SUPERSEDED''\s*\)/i);
  assert.match(sql, /archived_transaction_reference\s*=\s*transaction_reference/i);
  assert.match(sql, /transaction_reference\s*=\s*NULL/i);
  assert.match(sql, /DROP\s+CONSTRAINT\s+CK_PAYMENT_PROOF_reference/i);
  assert.match(sql, /archived_transaction_reference\s+IS\s+NOT\s+NULL/i);
});

test('booking capacity migration adds the ordered reservation availability index idempotently', () => {
  const sql = readFileSync(capacityIndexUrl, 'utf8');

  assert.match(sql, /SET\s+XACT_ABORT\s+ON/i);
  assert.match(sql, /BEGIN\s+TRANSACTION/i);
  assert.match(sql, /COMMIT/i);
  assert.match(sql, /sys\.indexes/i);
  assert.match(sql, /name\s*=\s*'IX_RESERVATION_event_capacity'/i);
  assert.match(sql, /object_id\s*=\s*OBJECT_ID\s*\(\s*'dbo\.RESERVATION'\s*\)/i);
  assert.match(
    sql,
    /CREATE\s+INDEX\s+IX_RESERVATION_event_capacity\s+ON\s+dbo\.RESERVATION\s*\(\s*event_date\s*,\s*status\s*\)\s+INCLUDE\s*\(\s*guest_count\s*\)/i,
  );
});
