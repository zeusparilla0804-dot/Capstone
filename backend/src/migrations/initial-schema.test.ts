import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL('../../migrations/000_initial_schema.sql', import.meta.url);

const foundationalColumns = {
  CUSTOMER: ['customer_id', 'first_name', 'last_name', 'email', 'contact_number', 'address', 'password', 'created_at'],
  ADMIN: ['admin_id', 'username', 'password', 'full_name', 'role', 'contact_number', 'email', 'status'],
  EVENT: ['event_id', 'event_type', 'description'],
  PACKAGE: ['package_id', 'event_id', 'package_name', 'description', 'price_per_head', 'min_guest', 'max_guest'],
  MENU_ITEM: ['menu_item_id', 'package_id', 'item_name', 'category', 'description'],
  RESERVATION: ['reservation_id', 'customer_id', 'event_id', 'event_date', 'event_time', 'guest_count', 'venue_address', 'special_request', 'status', 'created_at'],
  PAYMENT: ['payment_id', 'reservation_id', 'admin_id', 'amount_due', 'amount_paid', 'payment_method', 'payment_date', 'transaction_ref', 'status'],
  NOTIFICATION: ['notification_id', 'reservation_id', 'recipient_type', 'recipient_id', 'message', 'status', 'sent_at'],
} as const;

function migrationSql(): string {
  return readFileSync(migrationUrl, 'utf8');
}

function tableBody(sql: string, table: string): string {
  const match = sql.match(new RegExp(`CREATE\\s+TABLE\\s+dbo\\.${table}\\s*\\(([\\s\\S]*?)\\n\\s*\\);`, 'i'));
  assert.ok(match, `Expected CREATE TABLE dbo.${table}`);
  return match[1]!;
}

function declaredColumns(body: string): string[] {
  return [...body.matchAll(/^\s*([a-z_]+)\s+(?:bigint|bit|char|date|datetime2|decimal|int|nvarchar|time)\b/gim)]
    .map((match) => match[1]!.toLowerCase());
}

test('baseline creates exactly the eight guarded foundational tables', () => {
  const sql = migrationSql();
  const createdTables = [...sql.matchAll(/CREATE\s+TABLE\s+dbo\.([A-Z_]+)/gi)].map((match) => match[1]!.toUpperCase());

  assert.deepEqual(createdTables.sort(), Object.keys(foundationalColumns).sort());
  for (const table of Object.keys(foundationalColumns)) {
    assert.match(sql, new RegExp(`IF\\s+OBJECT_ID\\('dbo\\.${table}',\\s*'U'\\)\\s+IS\\s+NULL`, 'i'));
  }
  assert.match(sql, /SET\s+XACT_ABORT\s+ON/i);
  assert.match(sql, /BEGIN\s+TRANSACTION/i);
  assert.match(sql, /COMMIT/i);
});

test('baseline defines the pre-001 columns and relationships', () => {
  const sql = migrationSql();

  for (const [table, columns] of Object.entries(foundationalColumns)) {
    assert.deepEqual(declaredColumns(tableBody(sql, table)), [...columns], `${table} pre-001 columns`);
  }

  for (const constraint of [
    'PK_CUSTOMER', 'UQ_CUSTOMER_email', 'PK_ADMIN', 'UQ_ADMIN_username', 'UQ_ADMIN_email',
    'PK_EVENT', 'UQ_EVENT_event_type', 'PK_PACKAGE', 'FK_PACKAGE_EVENT', 'UQ_PACKAGE_event_name',
    'PK_MENU_ITEM', 'FK_MENU_ITEM_PACKAGE', 'UQ_MENU_ITEM_package_item', 'PK_RESERVATION',
    'FK_RESERVATION_CUSTOMER', 'FK_RESERVATION_EVENT', 'PK_PAYMENT', 'FK_PAYMENT_RESERVATION',
    'FK_PAYMENT_ADMIN', 'UQ_PAYMENT_reservation', 'PK_NOTIFICATION', 'FK_NOTIFICATION_RESERVATION',
    'CK_ADMIN_status', 'CK_PACKAGE_price_per_head', 'CK_PACKAGE_min_guest', 'CK_PACKAGE_max_guest',
    'CK_RESERVATION_guest_count', 'CK_RESERVATION_status', 'CK_PAYMENT_amount_due',
    'CK_PAYMENT_amount_paid', 'CK_PAYMENT_method', 'CK_PAYMENT_status',
    'CK_NOTIFICATION_recipient_type', 'CK_NOTIFICATION_status',
    'DF_CUSTOMER_created_at', 'DF_ADMIN_status', 'DF_RESERVATION_status', 'DF_RESERVATION_created_at',
    'DF_PAYMENT_amount_paid', 'DF_PAYMENT_status', 'DF_NOTIFICATION_status',
  ]) {
    assert.match(sql, new RegExp(`\\b${constraint}\\b`, 'i'), constraint);
  }

  for (const index of [
    'IX_PACKAGE_event_id', 'IX_MENU_ITEM_package_id', 'IX_RESERVATION_customer_id',
    'IX_RESERVATION_event_id', 'IX_RESERVATION_event_date', 'IX_RESERVATION_status',
    'IX_PAYMENT_admin_id', 'IX_PAYMENT_status', 'IX_NOTIFICATION_reservation_id',
  ]) {
    assert.match(sql, new RegExp(`CREATE\\s+INDEX\\s+${index}\\b`, 'i'), index);
  }
});

test('baseline validates compatible existing objects and throws on violations', () => {
  const sql = migrationSql();

  assert.match(sql, /DECLARE\s+@violations\s+TABLE/i);
  assert.match(sql, /sys\.tables/i);
  assert.match(sql, /sys\.columns/i);
  assert.match(sql, /sys\.types/i);
  assert.match(sql, /sys\.identity_columns/i);
  assert.match(sql, /sys\.key_constraints/i);
  assert.match(sql, /sys\.foreign_keys/i);
  assert.match(sql, /sys\.check_constraints/i);
  assert.match(sql, /sys\.default_constraints/i);
  assert.match(sql, /sys\.indexes/i);
  assert.match(sql, /THROW\s+51000/i);
});

test('baseline contains no business inserts or later-migration objects', () => {
  const sql = migrationSql();

  assert.doesNotMatch(sql, /\b(?:INSERT|MERGE)\s+(?:INTO\s+)?dbo\./i);
  assert.doesNotMatch(sql, /SCHEMA_MIGRATION/i);
  assert.doesNotMatch(sql, /INVOICE_NUMBER_SEQUENCE/i);

  for (const table of [
    'ADD_ON', 'RESERVATION_ADD_ON', 'AUTH_SESSION', 'ADMIN_SESSION', 'PAYMENT_TRANSACTION',
    'INVOICE', 'INVOICE_ITEM', 'ADMIN_AUDIT_LOG', 'PAYMENT_PROOF', 'BOOKING_STATUS_HISTORY',
    'EMAIL_OUTBOX',
  ]) {
    assert.doesNotMatch(sql, new RegExp(`CREATE\\s+TABLE\\s+dbo\\.${table}\\b`, 'i'), table);
  }

  assert.doesNotMatch(tableBody(sql, 'PACKAGE'), /\bis_active\b/i);
  assert.doesNotMatch(
    tableBody(sql, 'RESERVATION'),
    /\b(package_id|booking_reference|package_unit_price|subtotal|discount_amount|total_amount)\b/i,
  );
});
