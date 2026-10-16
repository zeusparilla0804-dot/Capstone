import { expect, test, type Page } from '@playwright/test';

const targetWidths = [390, 768, 1024, 1440];
const controlledToken = 'browser-fixture-token';
const customerEmail = 'browser.customer@example.test';
const adminEmail = 'browser.admin@example.test';
const customerPassword = 'Browser-QA-2026!';
const basePackageName = 'Browser Debut Package';

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
}

async function signInCustomer(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(customerEmail);
  await page.getByLabel('Password').fill(customerPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function signInAdmin(page: Page): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Email or username').fill(adminEmail);
  await page.getByLabel('Password').fill(customerPassword);
  await page.getByRole('button', { name: 'Sign in to dashboard' }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
}

async function packageEventType(packageExperience: ReturnType<Page['locator']>): Promise<string> {
  const text = await packageExperience.locator('.package-experience__category').textContent();
  return text?.replace(/\s+catering\s*$/i, '').trim().toLowerCase() ?? '';
}

test('Messenger contact stays safe, visible, and clear of viewport edges outside admin routes', async ({ page }) => {
  await page.goto('/packages');
  const contact = page.getByRole('link', { name: 'Message LA Chef on Messenger' });
  await expect(contact).toHaveAttribute('href', 'https://www.facebook.com/share/1F8DnqJnB9/');
  await expect(contact).toHaveAttribute('target', '_blank');
  await expect(contact).toHaveAttribute('rel', /noopener/);
  await expect(contact).toHaveAttribute('rel', /noreferrer/);

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await expect(contact).toBeVisible();
    const box = await contact.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(10);
    expect(box!.y).toBeGreaterThanOrEqual(10);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width - 10);
    expect(box!.y + box!.height).toBeLessThanOrEqual((width === 390 ? 844 : 900) - 10);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: `test-results/messenger-public-${width}.png`, fullPage: true });
  }

  await signInCustomer(page);
  await expect(page.getByRole('link', { name: 'Message LA Chef on Messenger' })).toBeVisible();

  await page.goto('/admin/login');
  await expect(page.getByRole('link', { name: 'Message LA Chef on Messenger' })).toHaveCount(0);
});

test('customer and admin recovery routes remain responsive at release widths', async ({ page }) => {
  const routes = [
    { name: 'customer-forgot', path: '/forgot-password', heading: 'Reset your password' },
    { name: 'customer-reset', path: `/reset-password?token=${controlledToken}`, heading: 'Choose a new password' },
    { name: 'admin-forgot', path: '/admin/forgot-password', heading: 'Reset your password' },
    { name: 'admin-reset', path: `/admin/reset-password?token=${controlledToken}`, heading: 'Choose a new password' },
  ];

  for (const route of routes) {
    for (const width of targetWidths) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(route.path);
      await expect(page.getByRole('heading', { name: route.heading, level: 1 })).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await page.screenshot({ path: `test-results/recovery-${route.name}-${width}.png`, fullPage: true });
    }
  }
});

test('forgot-password forms are keyboard operable and keep account existence private', async ({ page }) => {
  await page.route('**/api/auth/password/forgot', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ email: 'customer@example.test' });
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        message: 'If an account uses that email, password reset instructions will arrive shortly.',
      }),
    });
  });
  await page.goto('/forgot-password');
  const customerEmail = page.getByLabel('Email address');
  await customerEmail.fill('customer@example.test');
  await customerEmail.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Send reset link' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await expect(page.getByText('If an LA Chef account uses that email, password reset instructions will arrive shortly.')).toBeVisible();

  await page.route('**/api/auth/admin/password/forgot', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ email: 'administrator@example.test' });
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  await page.goto('/admin/forgot-password');
  await page.getByLabel('Email address').fill('administrator@example.test');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Return to sign in' })).toHaveAttribute('href', '/admin/login');
});

test('successful customer reset removes the token URL and invalid admin links fail safely', async ({ page }) => {
  await page.route('**/api/auth/password/reset', async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      token: controlledToken,
      password: 'New-Customer-Password-2026!',
      confirmPassword: 'New-Customer-Password-2026!',
    });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  await page.goto(`/reset-password?token=${controlledToken}`);
  await page.getByLabel('New password', { exact: true }).fill('New-Customer-Password-2026!');
  await page.getByLabel('Confirm new password', { exact: true }).fill('New-Customer-Password-2026!');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByRole('heading', { name: 'Password changed' })).toBeVisible();
  await expect(page.getByText('All previous sessions have been signed out.', { exact: false })).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByRole('link', { name: 'Sign in with new password' })).toHaveAttribute('href', '/login');

  await page.goto('/admin/reset-password');
  await expect(page.getByRole('heading', { name: 'Link unavailable' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Request another link' })).toHaveAttribute('href', '/admin/forgot-password');

  await page.route('**/api/auth/admin/password/reset', async (route) => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        code: 'PASSWORD_RESET_INVALID',
        message: 'This password reset link is invalid.',
      }),
    });
  });
  await page.goto(`/admin/reset-password?token=${controlledToken}`);
  await page.getByLabel('New password', { exact: true }).fill('New-Administrator-Password-2026!');
  await page.getByLabel('Confirm new password', { exact: true }).fill('New-Administrator-Password-2026!');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByRole('heading', { name: 'Link unavailable' })).toBeVisible();
});

test('customer and administrator logout requires confirmation while admin retains all-device revocation', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('browser.customer@example.test');
  await page.getByLabel('Password').fill('Browser-QA-2026!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/profile');

  for (const width of targetWidths) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    if (width <= 767) {
      await page.getByRole('button', { name: 'Toggle dashboard navigation' }).click();
      const customerDrawer = page.locator('#dashboard-navigation');
      await expect.poll(() => customerDrawer.evaluate(element => Math.round(element.getBoundingClientRect().left))).toBe(0);
    }
    await expect(page.getByRole('button', { name: 'Logout', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out all devices' })).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: `test-results/session-security-customer-${width}.png`, fullPage: true });
  }

  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/admin/login');
  await page.getByLabel('Email or username').fill('browser.admin@example.test');
  await page.getByLabel('Password').fill('Browser-QA-2026!');
  await page.getByRole('button', { name: 'Sign in to dashboard' }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle dashboard navigation' }).click();
  const adminDrawer = page.locator('#dashboard-navigation');
  await expect.poll(() => adminDrawer.evaluate(element => Math.round(element.getBoundingClientRect().left))).toBe(0);
  await expect(page.getByRole('button', { name: 'Sign out all devices' })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: 'test-results/session-security-admin-390.png', fullPage: true });

  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Sign out all devices' }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test('approved scope package discovery is responsive and enters the reservation flow', async ({ page }) => {
  await page.goto('/packages');
  const experience = page.locator('app-package-experience').filter({
    has: page.getByRole('heading', { name: basePackageName, exact: true }),
  });
  await expect(experience).toBeVisible();
  await expect(experience.getByText('PHP 85,888 includes 50 guests, then PHP 650 for each additional guest.')).toBeVisible();
  await expect(page.getByText(/quotation/i)).toHaveCount(0);

  const image = experience.locator('img');
  const firstImage = await image.getAttribute('src');
  await experience.getByRole('button', { name: 'Next design image' }).click();
  await expect.poll(() => image.getAttribute('src')).not.toBe(firstImage);

  const gallery = experience.locator('.package-experience__media');
  await gallery.focus();
  await gallery.press('End');
  await expect(image).toHaveAttribute('alt', /design 3 of 3$/);

  for (const packageImage of await page.locator('app-package-experience img').all()) {
    await packageImage.scrollIntoViewIfNeeded();
    await expect.poll(() => packageImage.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  }

  for (const width of targetWidths) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: `test-results/package-catalog-${width}.png`, fullPage: true });
  }

  const sourceId = (await experience.getAttribute('id'))?.replace('package-', '');
  expect(sourceId).toBeTruthy();
  await experience.getByRole('button', { name: 'Customize this package' }).click();
  await expect(page).toHaveURL(new RegExp(`/login\\?returnUrl=.*book-event.*package.*${sourceId}`));
  await page.getByLabel('Email').fill(customerEmail);
  await page.getByLabel('Password').fill(customerPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`/book-event\\?package=${sourceId}$`));
});

test('fifty percent deposit is shown with supported payments and recalculates after guest updates', async ({ page }) => {
  await signInCustomer(page);
  await page.goto('/packages');
  const experience = page.locator('app-package-experience').filter({
    has: page.getByRole('heading', { name: basePackageName, exact: true }),
  });
  const eventType = await packageEventType(experience);
  expect(eventType).toBeTruthy();
  await experience.getByRole('button', { name: 'Plan with this package' }).click();

  const eventDate = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel('Event Type *').selectOption(eventType);
  await page.getByLabel('Event Date *').fill(eventDate);
  await page.getByLabel('Event Time *').selectOption('2:00 PM');
  await page.getByLabel('Estimated number of guests *').fill('51');
  await page.getByLabel('Venue *').fill('Browser Base Package Venue');
  await expect(page.getByText('Date available')).toBeVisible();
  await page.getByRole('button', { name: /Continue to Add-ons/ }).click();
  await page.getByRole('button', { name: 'Review Booking' }).click();
  await expect(page.getByRole('heading', { name: 'Review Your Booking' })).toBeVisible();
  await expect(page.locator('.pricing-review')).toContainText('86,538');
  await page.getByRole('button', { name: 'Continue to Payment' }).click();
  await expect(page.getByText('Down Payment (50%)')).toBeVisible();
  await expect(page.locator('.payment-summary')).toContainText('43,269');
  await expect(page.locator('.payment-methods .selection-row')).toHaveCount(3);
  await expect(page.getByRole('radio', { name: /^Cash\b/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Bank Transfer\b/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: /^GCash\b/ })).toBeVisible();
  await expect(page.getByText(/credit|debit card/i)).toHaveCount(0);
  await page.getByRole('radio', { name: /^GCash\b/ }).check();
  await page.getByRole('button', { name: 'Confirm Booking' }).click();
  await expect(page.getByRole('heading', { name: 'Booking request submitted' })).toBeVisible();

  await page.getByRole('link', { name: 'View My Reservations' }).click();
  const pendingBooking = page.locator('app-booking-card').filter({ hasText: basePackageName }).first();
  await expect(pendingBooking).toContainText('51 guests');
  await pendingBooking.getByRole('link', { name: 'Edit Booking' }).click();
  await expect(page.getByRole('heading', { name: 'Update Your Event' })).toBeVisible();
  await page.getByLabel('Estimated number of guests *').fill('52');
  await expect(page.getByText('Date available')).toBeVisible();
  await page.getByRole('button', { name: /Continue to Add-ons/ }).click();
  await page.getByRole('button', { name: 'Review Booking' }).click();
  await expect(page.locator('.pricing-review')).toContainText('87,188');
  await page.getByRole('button', { name: 'Continue to Payment' }).click();
  await page.getByRole('radio', { name: /^GCash\b/ }).check();
  await page.getByRole('button', { name: 'Save Booking Changes' }).click();
  await expect(page.getByRole('heading', { name: 'Booking updated' })).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

test('admin package pricing editor remains readable and operable at release widths', async ({ page }) => {
  await signInAdmin(page);
  await page.goto('/admin/packages');
  await expect(page.getByRole('heading', { name: 'Packages & Menu', exact: true })).toBeVisible();
  const basePackageRow = page.getByRole('row').filter({
    has: page.getByText(basePackageName, { exact: true }),
  });
  await expect(basePackageRow.getByText('PHP 85,888 includes 50 guests + PHP 650 each additional guest')).toBeVisible();

  for (const width of targetWidths) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: `test-results/admin-packages-${width}.png`, fullPage: true });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Create Package' }).click();
  await page.getByLabel('Package plus excess').check();
  await expect(page.getByLabel('Base package price')).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Included guests', exact: true })).toBeVisible();
  await expect(page.getByLabel('Each additional guest')).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: 'test-results/admin-package-editor-390.png', fullPage: true });
});

test('approved scope redirects the retired custom quotation entry point', async ({ page }) => {
  await signInCustomer(page);
  await page.goto('/custom-event');
  await expect(page).toHaveURL(/\/packages$/);
  await expect(page.getByRole('heading', { name: 'Find the right setting for your celebration.' })).toBeVisible();
  await expect(page.getByText(/quotation/i)).toHaveCount(0);
  for (const width of targetWidths) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: `test-results/approved-scope-packages-${width}.png`, fullPage: true });
  }
});
