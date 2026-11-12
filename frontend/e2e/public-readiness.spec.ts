import { expect, test } from '@playwright/test';

const packages = [
  { id: 1, name: 'PHP 480 Per Head', category: 'Standard', description: 'Classic buffet catering tier.', pricingType: 'PER_HEAD', pricePerGuest: 480 },
  { id: 2, name: 'Bronze Package', category: 'Wedding', description: 'Wedding package.', pricingType: 'BASE_PLUS_EXCESS', basePrice: 32500, includedGuests: 50, excessGuestPrice: 650 },
  { id: 3, name: 'Amethyst Package', category: 'Debut', description: 'Debut package.', pricingType: 'BASE_PLUS_EXCESS', basePrice: 85888, includedGuests: 50, excessGuestPrice: 650 },
].map(pkg => ({ ...pkg, features: [], minGuests: null, maxGuests: null, isActive: true }));

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    // No real customer records, email messages, or financial mutations are allowed in visual QA.
    if (route.request().method() !== 'GET') throw new Error(`Unexpected mutation: ${path}`);
    let data: unknown = [];
    if (path.endsWith('/auth/me')) data = { id: '999', fullName: 'QA Customer', email: 'qa@example.test', role: 'customer', phone: '09171234567' };
    if (path.endsWith('/packages')) data = packages;
    if (path.endsWith('/payment-destinations/methods')) data = ['BANK_TRANSFER'];
    await route.fulfill({ json: { success: true, data } });
  });
});

for (const width of [390, 1440]) {
  test(`public pages and booking layout fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/packages', '/about', '/contact', '/book-event']) {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (path === '/') {
        await expect(page.locator('.popular__grid .package-card')).toHaveCount(3);
        await expect(page.locator('.popular__grid')).toContainText('Bronze Package');
        await expect(page.locator('.popular__grid')).toContainText('Amethyst Package');
        for (const image of await page.locator('.popular__grid img').all()) {
          await image.scrollIntoViewIfNeeded();
          await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
        }
      }
      if (path === '/book-event') {
        await expect(page.locator('#date-preparation-note')).toContainText('4 calendar days');
        const note = await page.locator('#date-preparation-note').boundingBox();
        const date = await page.locator('#eventDate').boundingBox();
        expect(note!.y + note!.height).toBeLessThanOrEqual(date!.y);
        if (width > 767) {
          const eventType = await page.locator('#eventType').boundingBox();
          expect(Math.abs(eventType!.y - date!.y)).toBeLessThanOrEqual(2);
        }
      }
    }
  });
}

for (const paid of [false, true]) {
  test(`billing document shows ${paid ? 'a verified receipt' : 'an unpaid invoice'}`, async ({ page }, testInfo) => {
    await page.route('**/api/invoices/999', route => route.fulfill({ json: { success: true, data: {
      invoiceId: 999, invoiceNumber: 'INV-QA-999', issueDate: '2026-11-11', dueDate: '2026-12-20', status: paid ? 'PAID' : 'ISSUED',
      issuer: { name: 'QA Administrator' }, customer: { id: 999, name: 'QA Customer', email: 'qa@example.test', phone: '09171234567' },
      booking: { id: 999, reference: 'BK-QA-999', status: 'CONFIRMED', eventType: 'Wedding', eventDate: '2026-12-20', eventTime: '10:00', venue: 'QA venue', guestCount: 100 },
      items: [{ description: 'Catering package', quantity: 100, unitPrice: 480, amount: 48000 }],
      subtotal: 48000, discount: 0, totalAmount: 48000, amountPaid: paid ? 48000 : 0, remainingBalance: paid ? 0 : 48000,
      payments: paid ? [{ id: 1, date: '2026-11-11', reference: 'CASH-QA-999', method: 'CASH', amount: 48000, status: 'VERIFIED' }] : [],
    } } }));
    await page.goto('/invoice/999');
    const document = page.locator('.invoice-document');
    await expect(document.locator('h1')).toHaveText(paid ? 'Receipt' : 'INV-QA-999');
    await expect(document.locator('.invoice-signatures')).toContainText('QA Customer');
    await expect(document.locator('.invoice-signatures')).toContainText('QA Administrator');
    await expect(document.locator('.invoice-totals')).not.toContainText('Discount');
    await expect(document.locator('.payment-history')).toHaveCount(paid ? 1 : 0);
    const timestamp = document.locator('footer .receipt-generated');
    if (paid) {
      await expect(timestamp).toContainText('Generated on:');
      await expect(timestamp).toContainText('PHT');
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(timestamp).toHaveCSS('text-align', 'right');
        expect(await timestamp.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      }
    } else await expect(timestamp).toHaveCount(0);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.invoice-actions')).toBeHidden();
    if (paid) {
      await expect(document.locator('.payment-history')).toBeVisible();
      await expect(timestamp).toBeVisible();
      await expect(timestamp).toHaveCSS('text-align', 'right');
      await document.screenshot({ path: testInfo.outputPath('receipt-footer-print.png') });
      await page.pdf({ path: testInfo.outputPath('receipt-footer.pdf'), printBackground: true, preferCSSPageSize: true });
    }
  });
}
