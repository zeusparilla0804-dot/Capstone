import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const repositoryUrl = new URL('./auth.repository.ts', import.meta.url);
const source = readFileSync(repositoryUrl, 'utf8');

test('customer and admin session expiry comparisons use the SQL UTC clock', () => {
  const utcComparisons = source.match(/expires_at\s*>\s*SYSUTCDATETIME\(\)/gi) ?? [];

  assert.equal(utcComparisons.length, 2);
  assert.doesNotMatch(source, /expires_at\s*>\s*SYSDATETIME\(\)/i);
});

test('session revocation and cleanup stay scoped to session rows', () => {
  assert.match(source, /DELETE\s+dbo\.AUTH_SESSION\s+WHERE\s+customer_id\s*=\s*@customerId/i);
  assert.match(source, /DELETE\s+dbo\.ADMIN_SESSION\s+WHERE\s+admin_id\s*=\s*@adminId/i);
  assert.match(source, /DELETE\s+dbo\.AUTH_SESSION\s+WHERE\s+expires_at\s*<=\s*SYSUTCDATETIME\(\)/i);
  assert.match(source, /DELETE\s+dbo\.ADMIN_SESSION\s+WHERE\s+expires_at\s*<=\s*SYSUTCDATETIME\(\)/i);
  assert.doesNotMatch(source, /DELETE\s+dbo\.(CUSTOMER|ADMIN(?!_SESSION)|RESERVATION|PAYMENT(?!_PROOF)|INVOICE)\b/i);
});

test('customer password and session authentication require an active account', () => {
  assert.match(source, /FROM\s+dbo\.CUSTOMER\s+WHERE\s+email\s*=\s*@email\s+AND\s+status\s*=\s*'ACTIVE'/i);
  assert.match(source, /JOIN\s+dbo\.CUSTOMER\s+c\s+ON\s+c\.customer_id\s*=\s*s\.customer_id[\s\S]*s\.expires_at\s*>\s*SYSUTCDATETIME\(\)[\s\S]*c\.status\s*=\s*'ACTIVE'/i);
});
