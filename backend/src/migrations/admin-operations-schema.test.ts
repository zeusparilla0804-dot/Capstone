import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL('../../migrations/008_admin_operations_core.sql', import.meta.url);

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

  assert.match(sql, /CREATE\s+UNIQUE\s+INDEX\s+UX_PAYMENT_PROOF_active_reference/i);
  assert.match(sql, /WHERE\s+transaction_reference\s+IS\s+NOT\s+NULL\s+AND\s+status\s+IN\s*\(\s*'SUBMITTED'\s*,\s*'VERIFIED'\s*\)/i);
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
