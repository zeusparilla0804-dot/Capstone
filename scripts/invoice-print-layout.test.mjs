import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const templatePath = new URL('../frontend/src/app/features/invoice/invoice.page.html', import.meta.url);
const stylesheetPath = new URL('../frontend/src/app/features/invoice/invoice.page.scss', import.meta.url);

test('invoice print layout uses readable Letter output and shows payment history only on receipts', async () => {
  const [template, stylesheet] = await Promise.all([
    readFile(templatePath, 'utf8'),
    readFile(stylesheetPath, 'utf8'),
  ]);

  assert.match(template, /class="payment-history" \[class\.no-print\]="!isReceipt\(doc\)"/);
  assert.match(stylesheet, /@page\s*{[\s\S]*?size:\s*Letter;/);
  assert.match(stylesheet, /\.invoice-document\s*{[\s\S]*?font-size:\s*11pt;/);
});
