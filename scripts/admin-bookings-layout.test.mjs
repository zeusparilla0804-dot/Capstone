import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const stylesheetPath = new URL(
  '../frontend/src/app/features/admin-bookings/admin-bookings.page.scss',
  import.meta.url,
);

test('admin reservation totals and statuses use aligned desktop columns', async () => {
  const stylesheet = await readFile(stylesheetPath, 'utf8');

  assert.match(stylesheet, /@media\s*\(min-width:\s*768px\)/);
  assert.match(
    stylesheet,
    /\.admin-table--bookings\s+:is\(th,\s*td\):nth-child\(7\)\s*{[^}]*text-align:\s*center;/,
  );
  assert.match(
    stylesheet,
    /\.admin-table--bookings\s+:is\(th,\s*td\):nth-child\(8\)\s*{[^}]*text-align:\s*center;/,
  );
  assert.match(
    stylesheet,
    /\.admin-table--bookings\s+td:nth-child\(8\)\s+app-status-badge\s*{[\s\S]*?--status-badge-width:\s*120px;/,
  );
});
