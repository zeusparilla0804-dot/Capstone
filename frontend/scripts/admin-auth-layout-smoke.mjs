import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const baseUrl = process.env.FRONTEND_URL ?? 'http://127.0.0.1:4200';
const edgePath =
  process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const tolerance = 1;
const screenshotDirectory = '.impeccable/review';
const desktopViewport = { width: 1750, height: 864 };
const expectedDesktop = {
  signIn: {
    shell: { x: 375, y: 102, width: 1000, height: 660 },
    left: { x: 376, y: 103, width: 499, height: 658 },
    right: { x: 875, y: 103, width: 499, height: 658 },
  },
  forgotPassword: {
    shell: { x: 395, y: 109.5, width: 960, height: 645 },
    left: { x: 396, y: 110.5, width: 502.9375, height: 643 },
    right: { x: 898.9375, y: 110.5, width: 455.046875, height: 643 },
  },
};

const browser = await chromium.launch({ headless: true, executablePath: edgePath });

try {
  await mkdir(screenshotDirectory, { recursive: true });
  const measurements = {};
  const routes = [
    {
      name: 'signIn',
      path: '/admin/login',
      selectors: {
        shell: '.admin-auth-shell',
        left: '.admin-brand',
        right: '.admin-form-panel',
        logo: '.admin-brand__logo',
      },
    },
    {
      name: 'forgotPassword',
      path: '/admin/forgot-password',
      selectors: {
        shell: '.recovery-shell',
        left: '.recovery-brand',
        right: '.recovery-panel',
        logo: '.recovery-brand__approved-logo',
      },
    },
  ];

  for (const route of routes) {
    const page = await browser.newPage({ viewport: desktopViewport });
    await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    measurements[route.name] = await page.evaluate((selectors) => {
      return Object.fromEntries(
        Object.entries(selectors).map(([key, selector]) => {
          const element = document.querySelector(selector);
          if (!element) throw new Error(`Missing layout element: ${selector}`);
          const { x, y, width, height } = element.getBoundingClientRect();
          return [key, { x, y, width, height }];
        }),
      );
    }, route.selectors);
    await page.screenshot({
      path: `${screenshotDirectory}/admin-${route.name}-aligned.png`,
      fullPage: true,
    });
    await page.close();
  }

  const differences = [];
  for (const route of routes) {
    for (const region of ['shell', 'left', 'right']) {
      for (const dimension of ['x', 'y', 'width', 'height']) {
        const actualValue = measurements[route.name][region][dimension];
        const expectedValue = expectedDesktop[route.name][region][dimension];
        if (Math.abs(actualValue - expectedValue) > tolerance) {
          differences.push(
            `${route.name}.${region}.${dimension}: actual=${actualValue}, expected=${expectedValue}`,
          );
        }
      }
    }
  }

  const responsiveViewports = [
    { name: 'narrowLandscape', width: 781, height: 600 },
    { name: 'shortDesktop', width: 901, height: 600 },
    { name: 'mobile', width: 390, height: 844 },
  ];

  for (const viewport of responsiveViewports) {
    for (const route of routes) {
      const page = await browser.newPage({ viewport });
      await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const responsiveState = await page.evaluate((selectors) => {
        const shell = document.querySelector(selectors.shell);
        const left = document.querySelector(selectors.left);
        const right = document.querySelector(selectors.right);
        if (!shell || !left || !right) throw new Error('Missing responsive layout region');
        const isClipped = (element) =>
          element.scrollHeight > element.clientHeight + 1 ||
          element.scrollWidth > element.clientWidth + 1;
        return {
          shellTop: shell.getBoundingClientRect().top,
          pageHorizontalOverflow:
            document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          clippedRegions: [shell, left, right].map(isClipped),
        };
      }, route.selectors);
      if (responsiveState.pageHorizontalOverflow) {
        differences.push(`${route.name}.${viewport.name}: page has horizontal overflow`);
      }
      if (responsiveState.shellTop < 0) {
        differences.push(`${route.name}.${viewport.name}: shell starts above the viewport`);
      }
      if (responsiveState.clippedRegions.some(Boolean)) {
        differences.push(
          `${route.name}.${viewport.name}: shell/left/right clipping=${responsiveState.clippedRegions.join(',')}`,
        );
      }
      if (viewport.name === 'mobile') {
        await page.screenshot({
          path: `${screenshotDirectory}/admin-${route.name}-mobile.png`,
          fullPage: true,
        });
      }
      await page.close();
    }
  }

  if (differences.length > 0) {
    console.error('Admin authentication layout verification failed:\n' + differences.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Admin authentication pages match their approved geometry within 1px.');
    console.log(JSON.stringify(measurements, null, 2));
  }
} finally {
  await browser.close();
}
