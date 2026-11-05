import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const componentPath = new URL(
  '../frontend/src/app/features/admin-customers/admin-customers.page.ts',
  import.meta.url,
);
const stylesheetPath = new URL(
  '../frontend/src/app/features/admin-customers/admin-customers.page.scss',
  import.meta.url,
);

test('customer table keeps contact and event columns aligned on desktop', async () => {
  const [component, stylesheet] = await Promise.all([
    readFile(componentPath, 'utf8'),
    readFile(stylesheetPath, 'utf8').catch(() => ''),
  ]);

  assert.match(component, /styleUrl:\s*'\.\/admin-customers\.page\.scss'/);
  assert.match(stylesheet, /@media\s*\(min-width:\s*768px\)/);
  assert.match(
    stylesheet,
    /\.customers-records \.admin-table--customers :is\(th, td\):is\(:nth-child\(6\), :nth-child\(7\), :nth-child\(8\)\)\s*{[^}]*text-align:\s*center;[^}]*padding-inline:\s*24px;/,
  );
  assert.match(
    stylesheet,
    /\.customers-records \.admin-table--customers th:nth-child\(6\)\s*{[^}]*width:\s*180px;/,
  );
  assert.match(
    stylesheet,
    /\.customers-records \.admin-table--customers th:nth-child\(7\)\s*{[^}]*width:\s*170px;/,
  );
  assert.match(
    stylesheet,
    /\.customers-records \.admin-table--customers th:nth-child\(8\)\s*{[^}]*width:\s*180px;/,
  );
  assert.match(
    stylesheet,
    /\.customers-records \.admin-table--customers :is\(th, td\):is\(:nth-child\(3\), :nth-child\(4\), :nth-child\(5\)\)\s*{[^}]*text-align:\s*center;/,
  );
});
