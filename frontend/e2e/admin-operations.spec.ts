import { expect, test } from '@playwright/test';

const adminEmail = 'browser.admin@example.test';
const customerEmail = 'browser.customer@example.test';
const password = 'Browser-QA-2026!';

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
  await page.getByRole('link', { name: 'Review proof' }).click();
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
  await expect(page.getByText('Booking detail', { exact: false })).toBeVisible();
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

for (const width of [390, 768, 1024, 1440]) {
  test(`admin dashboard is responsive and keyboard operable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto('/admin/login');
    await page.getByLabel('Email or username').fill(adminEmail);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in to dashboard' }).click();
    await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible();
    await assertNoHorizontalOverflow(page);

    if (width <= 767) {
      const menu = page.getByRole('button', { name: 'Toggle dashboard navigation' });
      await menu.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('navigation', { name: 'Dashboard navigation' })).toBeVisible();
      await page.locator('#dashboard-navigation').getByRole('button', { name: 'Close dashboard navigation' }).click();
      const drawer = page.locator('#dashboard-navigation');
      await expect(drawer).not.toHaveClass(/is-open/);
      await expect.poll(() => drawer.evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
    }

    await page.screenshot({ path: `test-results/admin-dashboard-${width}.png`, fullPage: true });
  });
}
