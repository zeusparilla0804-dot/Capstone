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

  test(`booking draft resumes after refresh and Back at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.install();
    await page.route('**/api/packages', route => route.fulfill({ json: { success: true, data: packages.map(pkg => ({
      ...pkg, menu: { fields: [{ key: 'drink', label: 'Drink', dishChoices: ['Iced Tea'] }], includedItems: [] },
    })) } }));
    await page.route('**/api/add-ons', route => route.fulfill({ json: { success: true, data: [{ id: 8, name: 'Tiffany Chair', price: 100 }] } }));
    await page.route('**/api/bookings/availability**', route => {
      const url = new URL(route.request().url());
      const month = url.searchParams.get('month');
      const data = month
        ? Array.from({ length: 31 }, (_, i) => ({ date: `${month}-${String(i + 1).padStart(2, '0')}`, status: 'AVAILABLE' }))
        : { date: url.searchParams.get('date'), guestCount: Number(url.searchParams.get('guestCount')), status: 'AVAILABLE' };
      return route.fulfill({ json: { success: true, data } });
    });

    await page.goto('/book-event?package=1&new=1');
    const venue = page.getByLabel('Venue *');
    await venue.fill('Sample venue, Santa Rosa');
    await page.reload();
    await expect(venue).toHaveValue('Sample venue, Santa Rosa');
    await page.locator('#eventType').selectOption('birthday');
    await page.locator('#eventTime').selectOption({ index: 2 });
    await page.locator('#guestCount').fill('80');
    await page.getByRole('button', { name: 'Open available dates' }).click();
    let availableDays = page.locator('[data-calendar-date]:not([disabled])');
    if (!await availableDays.count()) {
      await page.getByRole('button', { name: 'Next month' }).click();
      availableDays = page.locator('[data-calendar-date]:not([disabled])');
    }
    await availableDays.first().click();
    const date = await page.locator('#eventDate').inputValue();
    await page.getByRole('button', { name: 'Continue to Menu' }).click();
    await page.locator('#menu-drink').selectOption('Iced Tea');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Menu Selection' })).toBeVisible();
    await expect(page.locator('#menu-drink')).toHaveValue('Iced Tea');

    await page.getByRole('button', { name: 'Continue to Add-ons' }).click();
    await page.getByRole('checkbox', { name: 'Tiffany Chair' }).check();
    await page.getByRole('spinbutton', { name: 'Tiffany Chair quantity' }).fill('8');
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'Tiffany Chair' })).toBeChecked();
    await expect(page.getByRole('spinbutton', { name: 'Tiffany Chair quantity' })).toHaveValue('8');
    await page.getByRole('button', { name: 'Review Booking' }).click();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Review Your Booking' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit Booking for Review' })).toBeEnabled();
    await expect(page.getByText('Sample venue, Santa Rosa', { exact: true })).toBeVisible();

    await page.clock.fastForward(4 * 60_000);
    await page.keyboard.press('Shift');
    await page.clock.fastForward(60_000);
    await expect(page.getByRole('heading', { name: 'Review Your Booking' })).toBeVisible();
    const autoReload = page.waitForEvent('framenavigated', frame => frame === page.mainFrame());
    await page.clock.fastForward(4 * 60_000);
    await autoReload;
    await expect(page.getByRole('heading', { name: 'Review Your Booking' })).toBeVisible();
    await expect(page.getByText('Sample venue, Santa Rosa', { exact: true })).toBeVisible();

    const back = page.getByRole('button', { name: 'Back', exact: true });
    await back.click();
    await back.click();
    await back.click();
    await expect(venue).toHaveValue('Sample venue, Santa Rosa');
    await expect(page.locator('#eventDate')).toHaveValue(date);
    await expect(page.locator('#guestCount')).toHaveValue('80');
  });
}

test('admin idle refresh reloads Overview and Reservations without clearing a search in progress', async ({ page }) => {
  await page.clock.install();
  await page.route('**/api/auth/admin/me', route => route.fulfill({ json: { success: true, data: { id: '99', fullName: 'QA Administrator', email: 'admin@example.test', role: 'admin' } } }));
  await page.route('**/api/admin/dashboard?**', route => route.fulfill({ json: { success: true, data: {
    period: new URL(route.request().url()).searchParams.get('period'),
    priority: { pendingBookingReviews: 0, proofsAwaitingVerification: 0, confirmedEventsNextSevenDays: 0, outstandingBalanceTotal: 0, failedEmailNotifications: 0 },
    ledger: { confirmedRevenue: 0, submittedProofValue: 0, overdueOutstanding: 0, averageConfirmedBookingValue: 0 },
    actionQueues: [], attention: [],
  } } }));
  await page.route('**/api/admin/bookings?**', route => route.fulfill({ json: { success: true, data: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 } } }));
  await page.route('**/api/admin/notifications?**', route => route.fulfill({ json: { success: true, data: { items: [], unreadCount: 0, totalItems: 0, page: 1, pageSize: 10, totalPages: 0 } } }));

  await page.goto('/admin/dashboard');
  await expect(page.getByRole('heading', { name: 'Priority queues' })).toBeVisible();
  const overviewReload = page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame(), timeout: 10_000 });
  await page.clock.fastForward(5 * 60_000);
  await overviewReload;
  await expect(page.getByRole('heading', { name: 'Priority queues' })).toBeVisible();

  await page.goto('/admin/bookings?status=PENDING');
  const search = page.getByRole('textbox', { name: 'Search reservations' });
  await search.fill('Unsubmitted search');
  await page.clock.fastForward(5 * 60_000);
  await expect(search).toHaveValue('Unsubmitted search');
  await search.fill('');
  const reservationsReload = page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame(), timeout: 10_000 });
  await page.clock.fastForward(5 * 60_000);
  await reservationsReload;
  await expect(page.getByRole('combobox', { name: 'Filter status' })).toHaveValue('PENDING');
});

for (const state of ['unpaid', 'partial', 'paid']) {
  const paid = state !== 'unpaid';
  const partial = state === 'partial';
  test(`billing document shows ${partial ? 'a partial-deposit receipt' : paid ? 'a verified receipt' : 'an unpaid invoice'}`, async ({ page }, testInfo) => {
    await page.route('**/api/invoices/999', route => route.fulfill({ json: { success: true, data: {
      invoiceId: 999, invoiceNumber: 'INV-QA-999', issueDate: '2026-11-11', dueDate: '2026-12-20', status: partial ? 'PARTIALLY_PAID' : paid ? 'PAID' : 'ISSUED',
      issuer: { name: 'QA Administrator' }, customer: { id: 999, name: 'QA Customer', email: 'qa@example.test', phone: '09171234567' },
      booking: { id: 999, reference: 'BK-QA-999', status: partial ? 'AWAITING_PAYMENT' : 'CONFIRMED', eventType: 'Wedding', eventDate: '2026-12-20', eventTime: '10:00', venue: 'QA venue', guestCount: 100 },
      items: [{ description: 'Catering package', quantity: 100, unitPrice: 480, amount: 48000 }],
      subtotal: partial ? 154000 : 48000, discount: 0, totalAmount: partial ? 154000 : 48000, amountPaid: partial ? 70000 : paid ? 48000 : 0, remainingBalance: partial ? 84000 : paid ? 0 : 48000,
      payments: paid ? [{ id: 1, date: '2026-11-11', reference: 'CASH-QA-999', method: 'CASH', amount: partial ? 70000 : 48000, status: 'VERIFIED' }] : [],
    } } }));
    await page.goto('/invoice/999');
    const document = page.locator('.invoice-document');
    await expect(document.locator('h1')).toHaveText(paid ? 'Receipt' : 'INV-QA-999');
    await expect(document.locator('.invoice-signatures')).toContainText('QA Customer');
    await expect(document.locator('.invoice-signatures')).toContainText('QA Administrator');
    await expect(document.locator('.invoice-totals')).not.toContainText('Discount');
    await expect(document.locator('.payment-history')).toHaveCount(paid ? 1 : 0);
    if (partial) {
      await expect(document.locator('[data-testid="remaining-down-payment"]')).toContainText('7,000.00');
      await expect(document.locator('.balance')).toContainText('84,000.00');
      await expect(document.locator('.invoice-deposit-help')).toContainText('included in Balance Due');
    }
    const timestamp = document.locator('footer .receipt-generated');
    if (paid) {
      await expect(timestamp).toContainText('Generated on:');
      await expect(timestamp).not.toContainText(/\bPHT\b|Philippine time/i);
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
      if (partial) await expect(document.locator('[data-testid="remaining-down-payment"]')).toBeVisible();
      await expect(timestamp).toBeVisible();
      await expect(timestamp).toHaveCSS('text-align', 'right');
      await document.screenshot({ path: testInfo.outputPath('receipt-footer-print.png') });
      await page.pdf({ path: testInfo.outputPath('receipt-footer.pdf'), printBackground: true, preferCSSPageSize: true });
    }
  });
}
