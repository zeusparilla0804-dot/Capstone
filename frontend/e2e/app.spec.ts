import { expect, test, type Page } from '@playwright/test';

const targetWidths = [390, 768, 1024, 1440];
const controlledToken = 'browser-fixture-token';

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
}

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
