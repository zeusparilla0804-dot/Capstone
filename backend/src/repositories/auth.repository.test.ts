import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const repositoryUrl = new URL('./auth.repository.ts', import.meta.url);

test('customer and admin session expiry comparisons use the SQL UTC clock', () => {
  const source = readFileSync(repositoryUrl, 'utf8');
  const utcComparisons = source.match(/expires_at\s*>\s*SYSUTCDATETIME\(\)/gi) ?? [];

  assert.equal(utcComparisons.length, 2);
  assert.doesNotMatch(source, /expires_at\s*>\s*SYSDATETIME\(\)/i);
});
