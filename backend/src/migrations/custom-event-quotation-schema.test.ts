import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL('../../migrations/013_custom_event_quotation.sql', import.meta.url);

test('custom event quotation migration creates guarded request quote and line tables', () => {
  const sql = readFileSync(migrationUrl, 'utf8');

  assert.match(sql, /SET\s+XACT_ABORT\s+ON/i);
  assert.match(sql, /CREATE\s+TABLE\s+dbo\.CUSTOM_EVENT_REQUEST/i);
  assert.match(sql, /request_id\s+int\s+IDENTITY\(1,1\)/i);
  assert.match(sql, /reservation_id\s+int\s+NOT\s+NULL/i);
  assert.match(sql, /source_package_id\s+int\s+NULL/i);
  assert.match(sql, /target_budget\s+decimal\(12,2\)\s+NULL/i);
  assert.match(sql, /CONSTRAINT\s+UQ_CUSTOM_EVENT_REQUEST_reservation\s+UNIQUE\(reservation_id\)/i);
  assert.match(sql, /CONSTRAINT\s+CK_CUSTOM_EVENT_REQUEST_status/i);
  for (const status of ['AWAITING_QUOTE', 'NEEDS_CLARIFICATION', 'QUOTE_SENT', 'ACCEPTED', 'DECLINED', 'REJECTED', 'EXPIRED']) {
    assert.match(sql, new RegExp(`'${status}'`));
  }

  assert.match(sql, /CREATE\s+TABLE\s+dbo\.CUSTOM_QUOTE/i);
  assert.match(sql, /CONSTRAINT\s+UQ_CUSTOM_QUOTE_request_version\s+UNIQUE\(request_id,version\)/i);
  assert.match(sql, /CONSTRAINT\s+CK_CUSTOM_QUOTE_amounts/i);
  assert.match(sql, /CONSTRAINT\s+CK_CUSTOM_QUOTE_status/i);
  for (const status of ['DRAFT', 'SENT', 'SUPERSEDED', 'ACCEPTED', 'DECLINED', 'EXPIRED']) {
    assert.match(sql, new RegExp(`'${status}'`));
  }

  assert.match(sql, /CREATE\s+TABLE\s+dbo\.CUSTOM_QUOTE_ITEM/i);
  assert.match(sql, /quantity\s+decimal\(12,2\)\s+NOT\s+NULL/i);
  assert.match(sql, /unit_price\s+decimal\(12,2\)\s+NOT\s+NULL/i);
  assert.match(sql, /line_total\s+decimal\(12,2\)\s+NOT\s+NULL/i);
  assert.match(sql, /CONSTRAINT\s+UQ_CUSTOM_QUOTE_ITEM_order\s+UNIQUE\(quote_id,sort_order\)/i);
  assert.match(sql, /CONSTRAINT\s+CK_CUSTOM_QUOTE_ITEM_values/i);
});

test('custom event quotation migration links accepted quote and provides queue indexes', () => {
  const sql = readFileSync(migrationUrl, 'utf8');

  assert.match(sql, /COL_LENGTH\('dbo\.RESERVATION',\s*'accepted_quote_id'\)\s+IS\s+NULL/i);
  assert.match(sql, /accepted_quote_id\s+int\s+NULL/i);
  assert.match(sql, /CONSTRAINT\s+FK_RESERVATION_ACCEPTED_QUOTE/i);
  assert.match(sql, /CREATE\s+INDEX\s+IX_CUSTOM_EVENT_REQUEST_status_created/i);
  assert.match(sql, /CREATE\s+INDEX\s+IX_CUSTOM_QUOTE_request_status/i);
  assert.match(sql, /CREATE\s+INDEX\s+IX_CUSTOM_QUOTE_ITEM_quote_order/i);
});
