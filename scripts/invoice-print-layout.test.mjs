import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const templatePath = new URL('../frontend/src/app/features/invoice/invoice.page.html', import.meta.url);
const stylesheetPath = new URL('../frontend/src/app/features/invoice/invoice.page.scss', import.meta.url);

test('invoice print layout targets one Letter sheet and omits payment history', async () => {
  const [template, stylesheet] = await Promise.all([
    readFile(templatePath, 'utf8'),
    readFile(stylesheetPath, 'utf8'),
  ]);

  assert.match(template, /class="payment-history no-print"/);
  assert.match(stylesheet, /@page\s*{[\s\S]*?size:\s*Letter;/);
  assert.match(stylesheet, /\.invoice-document\s*{[\s\S]*?font-size:\s*8\.5pt;/);
});
