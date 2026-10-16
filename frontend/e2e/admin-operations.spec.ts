import { expect, test } from '@playwright/test';

const adminEmail = 'browser.admin@example.test';
const customerEmail = 'browser.customer@example.test';
const password = 'Browser-QA-2026!';
const mediumPackageName = 'Browser Medium Capacity Package';

async function assertNoHorizontalOverflow(page: import('@playwright/test').Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
}

test('admin review journey and customer result', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('Email or username').fill(adminEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in to dashboard' }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible();

  const proofQueue = page.getByRole('link').filter({ hasText: 'Proof verification' });
  await expect(proofQueue).toHaveCount(1);
  await proofQueue.click();
  await expect(page).toHaveURL(/\/admin\/payments/);
  await page.getByRole('row').filter({ hasText: 'BROWSER-QA-REFERENCE' })
    .getByRole('link', { name: 'Review proof' }).click();
  await expect(page.getByRole('heading', { name: 'Payment proof review' })).toBeVisible();
  const originalUrl = await page.getByRole('link', { name: 'Open original image' }).getAttribute('href');
  expect(originalUrl).toBeTruthy();
  const originalResponse = await page.request.get(originalUrl!);
  expect(originalResponse.status(), await originalResponse.text()).toBe(200);
  const inlineResponse = await page.request.get(`${originalUrl!}?view=inline`);
  expect(inlineResponse.status()).toBe(200);
  expect(inlineResponse.headers()['content-type']).toContain('image/jpeg');
  expect(inlineResponse.headers()['content-disposition']).toContain('inline');
  expect(inlineResponse.headers()['cross-origin-resource-policy']).toBe('same-site');
  expect((await inlineResponse.body()).byteLength).toBeGreaterThan(128);
  await expect(page.getByAltText('Customer payment receipt')).toBeVisible();
  expect(await page.getByAltText('Customer payment receipt').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.getByAltText('Customer payment receipt')).toHaveCSS('transform', /matrix\(1\.25/);
  await page.setViewportSize({ width: 390, height: 844 });
  await assertNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  const proofId = originalUrl!.match(/payment-proofs\/(\d+)/)?.[1];
  expect(proofId).toBeTruthy();
  const proofDetail = await page.request.get(
    originalUrl!.replace(`/payment-proofs/${proofId}/file`, `/admin/payment-proofs/${proofId}`),
  );
  expect(proofDetail.status()).toBe(200);
  const bookingId = (await proofDetail.json()).data.booking.id;
  await page.goto(`/admin/bookings/${bookingId}`);
  await expect(page.getByText('Reservation detail', { exact: false })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.goto(`/admin/payments/proofs/${proofId}`);
  await page.getByTestId('verify-proof').click();
  await expect(page.getByText('Payment verified and recorded.')).toBeVisible();

  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email').fill(customerEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/my-bookings');
  await expect(page.getByText('Payment verified', { exact: false })).toBeVisible();
});

test('customer account navigation and package booking journey', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/login');
  await page.getByLabel('Email').fill(customerEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator('.dashboard-sidebar__avatar')).toHaveText('BC');
  await page.screenshot({ path: 'test-results/customer-dashboard-1280.png', fullPage: true });
  const firstBookingRow = page.locator('.booking-table__row').first();
  const statusBox = await firstBookingRow.locator('[data-label="Status"] .status-badge').boundingBox();
  const actionBox = await firstBookingRow.locator('[data-label="Action"]').boundingBox();
  expect(statusBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  expect(statusBox!.x + statusBox!.width).toBeLessThanOrEqual(actionBox!.x);

  const customerSidebar = page.locator('#dashboard-navigation');
  const customerContent = page.locator('.dashboard-content');
  const expandedSidebarWidth = await customerSidebar.evaluate(element => element.getBoundingClientRect().width);
  const expandedContentLeft = await customerContent.evaluate(element => element.getBoundingClientRect().left);
  const customerCollapse = page.locator('.dashboard-sidebar__collapse');
  await customerCollapse.click();
  await expect(customerCollapse).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => customerSidebar.evaluate(element => element.getBoundingClientRect().width)).toBeLessThan(100);
  await expect.poll(() => customerContent.evaluate(element => element.getBoundingClientRect().left)).toBeLessThan(expandedContentLeft);
  expect(expandedSidebarWidth).toBeGreaterThan(250);
  await expect(page.getByRole('link', { name: 'My Reservations' })).toBeVisible();
  const customerBadges = await customerSidebar.locator('.dashboard-sidebar__badge').allTextContents();
  expect(customerBadges.length).toBeGreaterThan(0);
  expect(customerBadges.every(value => Number(value.trim()) > 0)).toBe(true);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('button', { name: 'Expand dashboard navigation' }).click();
  await expect.poll(() => customerSidebar.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(250);

  await page.getByRole('link', { name: 'Billing & Payments' }).click();
  await expect(page).toHaveURL(/\/billing$/);
  await expect(page.getByRole('heading', { name: 'Billing & Payments' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View Invoice' })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: 'test-results/customer-billing-1280.png', fullPage: true });

  await page.getByRole('link', { name: 'Profile' }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('heading', { name: 'Browser Customer' })).toBeVisible();
  await expect(page.getByText(customerEmail)).toBeVisible();
  await expect(page.getByText('09171234567')).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: 'test-results/customer-profile-1280.png', fullPage: true });

  await page.goto('/packages');
  const profileLink = page.getByRole('link', { name: 'Open profile for Browser Customer' });
  await expect(profileLink).toHaveText('BC');
  await profileLink.click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.goto('/packages');
  const packageCard = page.locator('app-package-experience').filter({
    has: page.getByRole('heading', { name: 'Browser QA Package', exact: true }),
  });
  await expect(packageCard).toBeVisible();
  const eventType = (await packageCard.locator('.package-experience__category').textContent())
    ?.replace(/\s+catering\s*$/i, '')
    .trim()
    .toLowerCase();
  expect(eventType).toBeTruthy();
  await packageCard.getByRole('button', { name: 'Plan with this package' }).click();
  await expect(page).toHaveURL(/\/book-event\?package=\d+$/);
  await expect(page.getByLabel('Selected Package *')).toHaveValue(/\d+/);
  await expect(page.getByLabel('Selected Package *').locator('option:checked')).toContainText('Browser QA Package');

  const eventDate = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel('Event Type *').selectOption(eventType!);
  await page.getByLabel('Event Date *').fill(eventDate);
  await page.getByLabel('Event Time *').selectOption('2:00 PM');
  await page.getByLabel('Venue *').fill('Browser Booking Journey Venue');
  await page.getByLabel('Estimated number of guests *').fill('1000');
  await page.getByRole('button', { name: /Continue to Add-ons/ }).click();
  await expect(page.getByText('Guest count must be between 10 and 50.')).toBeVisible();
  await page.getByLabel('Estimated number of guests *').fill('10');
  await page.getByRole('button', { name: /Continue to Add-ons/ }).click();
  await expect(page.getByRole('heading', { name: 'Select Add-ons' })).toBeVisible();
  await page.getByRole('button', { name: 'Review Booking' }).click();
  await expect(page.getByRole('heading', { name: 'Review Your Booking' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to Payment' }).click();
  await page.getByRole('radio', { name: /^GCash\b/ }).check();
  await page.getByRole('button', { name: 'Confirm Booking' }).click();
  await expect(page.getByRole('heading', { name: 'Booking request submitted' })).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

test('customer submits a medium event after responsive availability review', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login');
  await page.getByLabel('Email').fill(customerEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/packages');

  const packageCard = page.locator('app-package-experience').filter({
    has: page.getByRole('heading', { name: mediumPackageName, exact: true }),
  });
  await expect(packageCard).toBeVisible();
  const eventType = (await packageCard.locator('.package-experience__category').textContent())
    ?.replace(/\s+catering\s*$/i, '')
    .trim()
    .toLowerCase();
  expect(eventType).toBeTruthy();
  await packageCard.getByRole('button', { name: 'Plan with this package' }).click();

  const eventDate = new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel('Event Type *').selectOption(eventType!);
  await page.getByLabel('Event Date *').fill(eventDate);
  await page.getByLabel('Event Time *').selectOption('2:00 PM');
  await page.getByLabel('Venue *').fill('Browser Medium Event Venue');
  await page.getByLabel('Estimated number of guests *').fill('250');
  await expect(page.getByText('Available for review')).toBeVisible();
  await expect(page.getByText('LA Chef will confirm whether this date can accommodate your event.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue to Add-ons/ })).toBeEnabled();

  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: `test-results/customer-availability-${width}.png`, fullPage: true });
  }

  await page.getByRole('button', { name: /Continue to Add-ons/ }).click();
  await page.getByRole('button', { name: 'Review Booking' }).click();
  await page.getByRole('button', { name: 'Continue to Payment' }).click();
  await page.getByRole('radio', { name: /^GCash\b/ }).check();
  await page.getByRole('button', { name: 'Confirm Booking' }).click();
  await expect(page.getByRole('heading', { name: 'Booking request submitted' })).toBeVisible();
});

test('admin reviews and explicitly confirms medium-event capacity', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/login');
  await page.getByLabel('Email or username').fill(adminEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in to dashboard' }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await page.goto('/admin/bookings');

  const mediumRow = page.locator('tbody tr').filter({ hasText: mediumPackageName }).first();
  await expect(mediumRow).toBeVisible();
  await expect(mediumRow).toContainText('Needs confirmation');
  await mediumRow.getByRole('link', { name: 'View details' }).click();
  await expect(page.getByRole('heading', { name: 'Needs confirmation' })).toBeVisible();
  await expect(page.getByText(/active reservations/)).toBeVisible();
  await expect(page.getByText(/reservation limit/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve and confirm capacity' })).toBeVisible();

  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await assertNoHorizontalOverflow(page);
    if (width <= 767) {
      const drawer = page.locator('#dashboard-navigation');
      await expect(drawer).not.toHaveClass(/is-open/);
      await expect.poll(() => drawer.evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
      await expect(page.locator('.empty-history')).toHaveCSS('display', 'block');
    }
    await page.screenshot({ path: `test-results/admin-capacity-${width}.png`, fullPage: width > 767 });
  }

  await page.getByRole('button', { name: 'Approve and confirm capacity' }).click();
  await expect(page.getByText(/This approval confirms that LA Chef can accommodate 250 guests/)).toBeVisible();
  await page.getByRole('button', { name: 'Approve and confirm capacity' }).last().click();
  await expect(page.getByText('Reservation status updated.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Needs confirmation' })).toBeVisible();
  await expect(page.getByText(/active reservations/)).toBeVisible();
});

test('customer profile and billing navigation stay usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.getByLabel('Email').fill(customerEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.screenshot({ path: 'test-results/customer-dashboard-390.png', fullPage: true });

  const openNavigation = async (): Promise<void> => {
    const menu = page.getByRole('button', { name: 'Toggle dashboard navigation' });
    await menu.click();
    await expect(page.getByRole('navigation', { name: 'Dashboard navigation' })).toBeVisible();
  };

  const menu = page.getByRole('button', { name: 'Toggle dashboard navigation' });
  await expect(page.getByRole('button', { name: 'Collapse dashboard navigation' })).toBeHidden();
  await openNavigation();
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'My Reservations' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#dashboard-navigation')).not.toHaveClass(/is-open/);
  await expect(menu).toBeFocused();

  await openNavigation();
  await page.getByRole('link', { name: 'Profile' }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.locator('.profile-avatar')).toHaveText('BC');
  await expect(page.getByText('09171234567')).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: 'test-results/customer-profile-390.png', fullPage: true });

  await openNavigation();
  await page.getByRole('link', { name: 'Billing & Payments' }).click();
  await expect(page).toHaveURL(/\/billing$/);
  await expect(page.getByRole('heading', { name: 'Billing & Payments' })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: 'test-results/customer-billing-390.png', fullPage: true });

  await openNavigation();
  await page.getByRole('link', { name: 'My Reservations' }).click();
  await expect(page).toHaveURL(/\/my-bookings$/);
  await openNavigation();
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await openNavigation();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('admin dashboard is responsive and keyboard operable across target widths', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/login');
  await page.getByLabel('Email or username').fill(adminEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in to dashboard' }).click();
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible();

  const adminSidebar = page.locator('#dashboard-navigation');
  const adminContent = page.locator('.admin-main');
  const expandedSidebarWidth = await adminSidebar.evaluate(element => element.getBoundingClientRect().width);
  const expandedContentLeft = await adminContent.evaluate(element => element.getBoundingClientRect().left);
  const collapse = page.locator('.dashboard-sidebar__collapse');
  await collapse.click();
  await expect(collapse).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => adminSidebar.evaluate(element => element.getBoundingClientRect().width)).toBeLessThan(100);
  await expect.poll(() => adminContent.evaluate(element => element.getBoundingClientRect().left)).toBeLessThan(expandedContentLeft);
  expect(expandedSidebarWidth).toBeGreaterThan(250);
  await expect(page.getByRole('link', { name: 'Reservations' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Customers' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Billing & Payments' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Reports' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Packages & Menu' })).toBeVisible();
  await expect(adminSidebar.getByRole('link', { name: 'Quotations' })).toHaveCount(0);
  await expect(adminSidebar.getByRole('link', { name: 'Email operations' })).toHaveCount(0);
  await expect(adminSidebar.getByRole('link', { name: 'Audit log' })).toHaveCount(0);
  const adminBadges = await adminSidebar.locator('.dashboard-sidebar__badge').allTextContents();
  expect(adminBadges.length).toBeGreaterThan(0);
  expect(adminBadges.every(value => Number(value.trim()) > 0)).toBe(true);
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await page.getByRole('button', { name: 'Expand dashboard navigation' }).click();
  await expect.poll(() => adminSidebar.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(250);

  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await assertNoHorizontalOverflow(page);

    if (width <= 767) {
      const menu = page.getByRole('button', { name: 'Toggle dashboard navigation' });
      await menu.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('navigation', { name: 'Dashboard navigation' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Reservations' })).toBeVisible();
      await page.locator('.dashboard-sidebar__backdrop').click({ position: { x: 380, y: 400 } });
      const drawer = page.locator('#dashboard-navigation');
      await expect(drawer).not.toHaveClass(/is-open/);
      await expect.poll(() => drawer.evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
      await expect(menu).toBeFocused();
    }

    await page.screenshot({ path: `test-results/admin-dashboard-${width}.png`, fullPage: true });
  }
});

test('admin records keep readable alignment from desktop tables to mobile cards', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/login');
  await page.getByLabel('Email or username').fill(adminEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in to dashboard' }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await page.goto('/admin/bookings');

  const toolbarControls = page.locator('.admin-toolbar input, .admin-toolbar select, .admin-toolbar button');
  for (const control of await toolbarControls.all()) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: 'test-results/admin-bookings-1440.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await assertNoHorizontalOverflow(page);

  const bookingsTable = page.locator('.admin-record-table');
  await expect(bookingsTable).toBeVisible();
  const firstRecord = bookingsTable.locator('tbody tr').filter({ has: page.locator('td[data-label="Reference"]') }).first();
  await expect(firstRecord).toBeVisible();
  await expect(firstRecord).toHaveCSS('display', 'grid');
  await expect(firstRecord.locator('td[data-label="Customer"]')).toBeVisible();
  await expect(firstRecord.locator('td[data-label="Status"]')).toBeVisible();
  await expect(firstRecord.locator('td[data-label="Actions"]')).toBeVisible();
  await page.screenshot({ path: 'test-results/admin-bookings-390.png', fullPage: true });
});

test('admin reports support filters, CSV export, tabs, and target widths', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/login');
  await page.getByLabel('Email or username').fill(adminEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in to dashboard' }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await page.goto('/admin/reports');

  await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Reservations' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Reservation summary')).toBeVisible();

  await page.locator('#reservation-report-filters').getByLabel('Status').selectOption('APPROVED');
  const filteredResponse = page.waitForResponse(response =>
    response.url().includes('/api/admin/reports/reservations?') &&
    response.url().includes('status=APPROVED'),
  );
  await page.locator('#reservation-report-filters').getByRole('button', { name: 'Apply filters' }).click();
  expect((await filteredResponse).status()).toBe(200);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  await expect.poll(async () => (await download).suggestedFilename()).toMatch(/^la-chef-reservations-\d{4}-\d{2}-\d{2}\.csv$/);

  await page.getByRole('tab', { name: 'Payments' }).click();
  await expect(page.getByRole('tab', { name: 'Payments' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Payment summary')).toBeVisible();

  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await assertNoHorizontalOverflow(page);
    await expect(page.getByRole('tab', { name: 'Payments' })).toBeVisible();
    if (width === 390) {
      const drawer = page.locator('#dashboard-navigation');
      await expect(drawer).not.toHaveClass(/is-open/);
      await expect.poll(() => drawer.evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
    }
    if (width === 768) {
      for (const value of await page.locator('.report-summary--payments dd').all()) {
        expect(await value.evaluate(element => {
          const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
          return element.getBoundingClientRect().height <= lineHeight * 1.25;
        })).toBe(true);
      }
    }
    await page.screenshot({ path: `test-results/admin-reports-${width}.png`, fullPage: true });
  }
});

test('admin management pages stay aligned across desktop and mobile widths', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/login');
  await page.getByLabel('Email or username').fill(adminEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in to dashboard' }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);

  const pages = [
    { route: '/admin/customers', heading: 'Customers' },
    { route: '/admin/payments', heading: 'Billing & Payments' },
    { route: '/admin/reports', heading: 'Reports' },
    { route: '/admin/custom-events', heading: 'Custom quotations' },
    { route: '/admin/packages', heading: 'Packages & Menu' },
    { route: '/admin/add-ons', heading: 'Packages & Menu' },
    { route: '/admin/email-outbox', heading: 'Email operations' },
    { route: '/admin/audit-log', heading: 'Audit log' },
  ];

  for (const item of pages) {
    await page.goto(item.route);
    await expect(page.getByRole('heading', { name: item.heading, exact: true })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow(page);
    await expect(page.locator('#dashboard-navigation')).not.toHaveClass(/is-open/);
    await page.setViewportSize({ width: 1440, height: 900 });
  }
});
