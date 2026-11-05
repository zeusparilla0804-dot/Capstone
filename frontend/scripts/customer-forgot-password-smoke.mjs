import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const baseUrl = process.env.FRONTEND_URL ?? 'http://127.0.0.1:4200';
const edgePath = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const screenshotDirectory = '.impeccable/review';
const tolerance = 1;
const failures = [];

const browser = await chromium.launch({ headless: true, executablePath: edgePath });

try {
  await mkdir(screenshotDirectory, { recursive: true });

  const desktopPage = await browser.newPage({ viewport: { width: 1550, height: 1024 } });
  await desktopPage.goto(`${baseUrl}/forgot-password`, { waitUntil: 'networkidle' });
  await desktopPage.evaluate(() => document.fonts.ready);

  const desktop = await desktopPage.evaluate(() => {
    const readRect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing element: ${selector}`);
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    const root = document.querySelector('.recovery-page--customer-forgot');
    const returnLink = document.querySelector('.return-link');
    const submitButton = document.querySelector('form > .btn-primary');
    const submitButtonStyle = submitButton ? getComputedStyle(submitButton) : null;
    return {
      rootClassPresent: Boolean(root),
      shell: readRect('.recovery-shell'),
      left: readRect('.recovery-brand'),
      right: readRect('.recovery-panel'),
      logo: readRect('.recovery-brand__customer-logo'),
      returnHref: returnLink?.getAttribute('href'),
      returnText: returnLink?.textContent?.trim(),
      buttonBackground: submitButtonStyle?.backgroundImage,
      buttonTextColor: submitButtonStyle?.color,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });

  const nearlyEqual = (a, b) => Math.abs(a - b) <= tolerance;
  if (!desktop.rootClassPresent) failures.push('Customer forgot-password root class is missing.');
  if (!nearlyEqual(desktop.shell.width, 1040)) failures.push(`Desktop shell width is ${desktop.shell.width}, expected 1040.`);
  if (!nearlyEqual(desktop.shell.height, 640)) failures.push(`Desktop shell height is ${desktop.shell.height}, expected 640.`);
  if (!nearlyEqual(desktop.left.width, desktop.right.width)) failures.push(`Desktop split is not 50/50: ${desktop.left.width}/${desktop.right.width}.`);
  if (!nearlyEqual(desktop.logo.x + desktop.logo.width / 2, desktop.left.x + desktop.left.width / 2)) failures.push('Desktop logo is not horizontally centered.');
  if (!nearlyEqual(desktop.logo.y + desktop.logo.height / 2, desktop.left.y + desktop.left.height / 2)) failures.push('Desktop logo is not vertically centered.');
  if (desktop.returnHref !== '/login') failures.push(`Return link targets ${desktop.returnHref}, expected /login.`);
  if (desktop.returnText !== 'Return to sign in') failures.push(`Return link text is "${desktop.returnText}".`);
  if (desktop.horizontalOverflow) failures.push('Desktop page has horizontal overflow.');

  const rgbTriplets = desktop.buttonBackground?.match(/rgb\((\d+), (\d+), (\d+)\)/g) ?? [];
  const relativeLuminance = ([red, green, blue]) => {
    const channels = [red, green, blue].map(value => {
      const normalized = value / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  for (const color of rgbTriplets) {
    const values = color.match(/\d+/g)?.map(Number) ?? [];
    const contrast = 1.05 / (relativeLuminance(values) + 0.05);
    if (contrast < 4.5) failures.push(`Button gradient stop ${color} has only ${contrast.toFixed(2)}:1 contrast with white text.`);
  }

  await desktopPage.screenshot({
    path: `${screenshotDirectory}/customer-forgot-password-desktop.png`,
    fullPage: true,
  });
  await desktopPage.close();

  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobilePage.goto(`${baseUrl}/forgot-password`, { waitUntil: 'networkidle' });
  await mobilePage.evaluate(() => document.fonts.ready);
  const mobile = await mobilePage.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    logoVisible: Boolean(document.querySelector('.recovery-brand__customer-logo')?.getClientRects().length),
    inputVisible: Boolean(document.querySelector('#recoveryEmail')?.getClientRects().length),
  }));
  if (mobile.scrollWidth > mobile.viewportWidth + 1) failures.push(`Mobile horizontal overflow: ${mobile.scrollWidth}/${mobile.viewportWidth}.`);
  if (!mobile.logoVisible) failures.push('Customer logo is hidden on mobile.');
  if (!mobile.inputVisible) failures.push('Email field is hidden on mobile.');
  await mobilePage.screenshot({
    path: `${screenshotDirectory}/customer-forgot-password-mobile.png`,
    fullPage: true,
  });
  await mobilePage.close();

  const resetPage = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await resetPage.goto(`${baseUrl}/reset-password?token=visual-smoke`, { waitUntil: 'networkidle' });
  const resetHasCustomerForgotClass = await resetPage.locator('.recovery-page--customer-forgot').count();
  if (resetHasCustomerForgotClass) failures.push('Customer reset-password page received forgot-password-only styling.');
  await resetPage.close();

  if (failures.length) {
    console.error(`Customer forgot-password visual verification failed:\n${failures.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('Customer forgot-password layout and responsive smoke checks passed.');
    console.log(JSON.stringify({ desktop, mobile }, null, 2));
  }
} finally {
  await browser.close();
}
