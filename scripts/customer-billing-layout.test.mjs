import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const stylesheetPath = new URL(
  '../frontend/src/app/features/customer-billing/customer-billing.page.scss',
  import.meta.url,
);
const badgeStylesheetPath = new URL(
  '../frontend/src/app/shared/components/status-badge/status-badge.scss',
  import.meta.url,
);

test('customer billing records keep amounts and actions in independent layout areas without offsets', async () => {
  const stylesheet = await readFile(stylesheetPath, 'utf8');

  assert.match(
    stylesheet,
    /\.billing-record\s*{[\s\S]*?grid-template-areas:\s*'event'\s+'status'\s+'amounts'\s+'actions';/,
  );
  assert.match(
    stylesheet,
    /\.billing-record__amounts\s*{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.doesNotMatch(stylesheet, /translateX\(/);
  assert.match(stylesheet, /@container billing \(min-width: 520px\)/);
  assert.match(stylesheet, /grid-template-areas:\s*'event status'\s+'amounts amounts'\s+'actions actions';/);
  assert.match(stylesheet, /@container billing \(min-width: 980px\)/);
  assert.match(stylesheet, /grid-template-areas:\s*'event amounts actions status';/);
  assert.match(stylesheet, /@container billing \(max-width: 320px\)/);
});

test('customer billing status labels fit their available space instead of overflowing a fixed pill', async () => {
  const [billingStylesheet, badgeStylesheet] = await Promise.all([
    readFile(stylesheetPath, 'utf8'),
    readFile(badgeStylesheetPath, 'utf8'),
  ]);

  assert.match(
    billingStylesheet,
    /\.billing-record app-status-badge\s*{[\s\S]*?--status-badge-width:\s*auto;/,
  );
  assert.match(
    badgeStylesheet,
    /width:\s*var\(--status-badge-width,\s*auto\);/,
  );
});
