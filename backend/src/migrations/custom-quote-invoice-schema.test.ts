import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { EXPECTED_MIGRATIONS, EXPECTED_SCHEMA_CONTRACT } from './schema-contract.js';

const migrationUrl = new URL('../../migrations/014_custom_quote_invoice_quantity.sql', import.meta.url);

test('custom quote invoice migration preserves decimal line quantities', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /ALTER TABLE dbo\.INVOICE_ITEM DROP CONSTRAINT CK_INVOICE_ITEM_values/i);
  assert.match(sql, /ALTER TABLE dbo\.INVOICE_ITEM ALTER COLUMN quantity decimal\(12,2\) NOT NULL/i);
  assert.match(sql, /ADD CONSTRAINT CK_INVOICE_ITEM_values CHECK\(quantity>0/i);
  assert.ok(EXPECTED_MIGRATIONS.includes('014_custom_quote_invoice_quantity.sql'));
  const quantity = EXPECTED_SCHEMA_CONTRACT.columns.find(column => column.table === 'INVOICE_ITEM' && column.name === 'quantity');
  assert.equal(quantity?.type, 'decimal');
  assert.equal(quantity?.precision, 12);
  assert.equal(quantity?.scale, 2);
});
