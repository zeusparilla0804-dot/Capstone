import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const componentPath = new URL(
  '../frontend/src/app/features/admin-payments/admin-payments.page.ts',
  import.meta.url,
);
const stylesheetPath = new URL(
  '../frontend/src/app/features/admin-payments/admin-payments.page.scss',
  import.meta.url,
);

test('admin payment ledger uses aligned desktop-only columns', async () => {
  const [component, stylesheet] = await Promise.all([
    readFile(componentPath, 'utf8'),
    readFile(stylesheetPath, 'utf8').catch(() => ''),
  ]);

  assert.match(component, /styleUrl:\s*'\.\/admin-payments\.page\.scss'/);
  assert.match(stylesheet, /@media\s*\(min-width:\s*768px\)/);
  assert.match(
    stylesheet,
    /\.payment-records \.admin-table--payments\s*{[^}]*table-layout:\s*fixed;/,
  );
  assert.match(
    stylesheet,
    /\.payment-records \.admin-table--payments :is\(th, td\):is\(:nth-child\(3\), :nth-child\(4\)\)\s*{[^}]*text-align:\s*center;/,
  );
  assert.match(
    stylesheet,
    /\.payment-records \.admin-table--payments td:nth-child\(8\) app-status-badge\s*{[^}]*--status-badge-width:\s*120px;/,
  );
});
