import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL('../../migrations/012_package_pricing_models.sql', import.meta.url);

test('package pricing migration adds guarded catalog pricing models', () => {
  const sql = readFileSync(migrationUrl, 'utf8');

  assert.match(sql, /SET\s+XACT_ABORT\s+ON/i);
  assert.match(sql, /BEGIN\s+TRANSACTION/i);
  assert.match(sql, /COMMIT/i);
  assert.match(sql, /COL_LENGTH\('dbo\.PACKAGE',\s*'pricing_type'\)\s+IS\s+NULL/i);
  assert.match(sql, /pricing_type\s+varchar\(20\)\s+NULL/i);
  assert.match(sql, /base_price\s+decimal\(12,2\)\s+NULL/i);
  assert.match(sql, /included_guests\s+int\s+NULL/i);
  assert.match(sql, /excess_guest_price\s+decimal\(12,2\)\s+NULL/i);
  assert.match(sql, /sp_executesql\s+N'UPDATE\s+dbo\.PACKAGE\s+SET\s+pricing_type/i);
  assert.match(sql, /ALTER\s+COLUMN\s+price_per_head\s+decimal\(12,2\)\s+NULL/i);
  assert.match(sql, /ALTER\s+COLUMN\s+min_guest\s+int\s+NULL/i);
  assert.match(sql, /ALTER\s+COLUMN\s+max_guest\s+int\s+NULL/i);
  assert.match(sql, /pricing_type\s*=\s*''PER_HEAD''/i);
  assert.match(sql, /ALTER\s+COLUMN\s+pricing_type\s+varchar\(20\)\s+NOT\s+NULL/i);
  assert.match(sql, /CONSTRAINT\s+CK_PACKAGE_pricing_model/i);
  assert.match(sql, /pricing_type\s*=\s*''PER_HEAD''[\s\S]*price_per_head\s+IS\s+NOT\s+NULL[\s\S]*base_price\s+IS\s+NULL[\s\S]*included_guests\s+IS\s+NULL[\s\S]*excess_guest_price\s+IS\s+NULL/i);
  assert.match(sql, /pricing_type\s*=\s*''BASE_PLUS_EXCESS''[\s\S]*price_per_head\s+IS\s+NULL[\s\S]*base_price\s+IS\s+NOT\s+NULL[\s\S]*included_guests\s+IS\s+NOT\s+NULL[\s\S]*excess_guest_price\s+IS\s+NOT\s+NULL/i);
  assert.match(sql, /CONSTRAINT\s+CK_PACKAGE_guest_limits/i);
  assert.match(sql, /min_guest\s+IS\s+NULL\s+OR\s+min_guest\s*>=\s*1/i);
  assert.match(sql, /max_guest\s+IS\s+NULL\s+OR\s+max_guest\s*>=\s*min_guest/i);
});

test('package pricing migration adds immutable reservation pricing snapshots', () => {
  const sql = readFileSync(migrationUrl, 'utf8');

  for (const [name, type] of [
    ['package_name_snapshot', 'nvarchar\\(150\\)'],
    ['package_pricing_type', 'varchar\\(20\\)'],
    ['package_base_price', 'decimal\\(12,2\\)'],
    ['package_included_guests', 'int'],
    ['package_excess_guest_price', 'decimal\\(12,2\\)'],
    ['package_total', 'decimal\\(12,2\\)'],
  ] as const) {
    assert.match(sql, new RegExp(`COL_LENGTH\\('dbo\\.RESERVATION',\\s*'${name}'\\)\\s+IS\\s+NULL`, 'i'));
    assert.match(sql, new RegExp(`${name}\\s+${type}\\s+NULL`, 'i'));
  }

  assert.match(sql, /CONSTRAINT\s+CK_RESERVATION_package_pricing_snapshot/i);
  assert.match(sql, /CREATE\s+INDEX\s+IX_PACKAGE_active_event\s+ON\s+dbo\.PACKAGE\s*\(is_active,\s*event_id\)/i);
});
