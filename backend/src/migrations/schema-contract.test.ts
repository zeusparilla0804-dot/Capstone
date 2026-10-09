import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXPECTED_MIGRATIONS,
  EXPECTED_SCHEMA_CONTRACT,
  findSchemaContractViolations,
  type SchemaSnapshot,
} from './schema-contract.js';

function validSnapshot(): SchemaSnapshot {
  return structuredClone({
    ...EXPECTED_SCHEMA_CONTRACT,
    migrations: [...EXPECTED_MIGRATIONS],
  });
}

test('complete migrated schema satisfies the contract', () => {
  assert.deepEqual(findSchemaContractViolations(validSnapshot(), { migrationHistory: 'fresh' }), []);
});

test('missing or incompatible columns produce named violations', () => {
  const missing = validSnapshot();
  missing.columns = missing.columns.filter((column) => !(column.table === 'RESERVATION' && column.name === 'booking_reference'));
  assert.deepEqual(findSchemaContractViolations(missing, { migrationHistory: 'fresh' }), [
    'dbo.RESERVATION.booking_reference: missing column',
  ]);

  const incompatible = validSnapshot();
  const email = incompatible.columns.find((column) => column.table === 'CUSTOMER' && column.name === 'email')!;
  email.maxLength = 200;
  email.nullable = true;
  assert.deepEqual(findSchemaContractViolations(incompatible, { migrationHistory: 'fresh' }), [
    'dbo.CUSTOMER.email: incompatible column (expected nvarchar(255) NOT NULL)',
  ]);
});

test('missing keys constraints indexes defaults and sequence produce named violations', () => {
  const snapshot = validSnapshot();
  snapshot.constraints = snapshot.constraints.filter((constraint) => constraint.name !== 'FK_RESERVATION_PACKAGE');
  snapshot.constraints = snapshot.constraints.filter((constraint) => constraint.name !== 'DF_RESERVATION_discount');
  snapshot.indexes = snapshot.indexes.filter((index) => index.name !== 'IX_RESERVATION_event_capacity');
  snapshot.sequences = [];

  assert.deepEqual(findSchemaContractViolations(snapshot, { migrationHistory: 'fresh' }), [
    'dbo.RESERVATION.DF_RESERVATION_discount: missing D constraint',
    'dbo.RESERVATION.FK_RESERVATION_PACKAGE: missing F constraint',
    'dbo.RESERVATION.IX_RESERVATION_event_capacity: missing index',
    'dbo.INVOICE_NUMBER_SEQUENCE: missing sequence',
  ]);
});

test('fresh migration history requires 000-006 and 008-010 without 007', () => {
  const snapshot = validSnapshot();
  snapshot.migrations.push('007_starter_catalog.sql');
  assert.deepEqual(findSchemaContractViolations(snapshot, { migrationHistory: 'fresh' }), [
    'dbo.SCHEMA_MIGRATION.007_starter_catalog.sql: unexpected migration',
  ]);

  snapshot.migrations = snapshot.migrations.filter((migration) => migration !== '010_booking_capacity_availability.sql');
  assert.deepEqual(findSchemaContractViolations(snapshot, { migrationHistory: 'fresh' }), [
    'dbo.SCHEMA_MIGRATION.007_starter_catalog.sql: unexpected migration',
    'dbo.SCHEMA_MIGRATION.010_booking_capacity_availability.sql: missing migration',
  ]);
});

test('compatible migration history permits historical 007 but requires tracked migrations', () => {
  const snapshot = validSnapshot();
  snapshot.migrations.push('007_starter_catalog.sql');
  assert.deepEqual(findSchemaContractViolations(snapshot), []);

  snapshot.migrations = snapshot.migrations.filter((migration) => migration !== '008_admin_operations_core.sql');
  assert.deepEqual(findSchemaContractViolations(snapshot), [
    'dbo.SCHEMA_MIGRATION.008_admin_operations_core.sql: missing migration',
  ]);
});

test('business row metadata is outside schema validation', () => {
  const snapshot = Object.assign(validSnapshot(), { rowCounts: { CUSTOMER: 100, PACKAGE: 8 } });
  assert.deepEqual(findSchemaContractViolations(snapshot, { migrationHistory: 'fresh' }), []);
});
