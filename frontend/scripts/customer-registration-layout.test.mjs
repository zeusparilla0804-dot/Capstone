import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.FRONTEND_URL ?? 'http://127.0.0.1:4200';
const executablePath =
  process.env.PLAYWRIGHT_BROWSER_PATH ??
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const parseColor = (value) => {
  const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
  assert.ok(channels.length >= 3, `Unable to parse CSS color: ${value}`);
  return [channels[0], channels[1], channels[2], channels[3] ?? 1];
};

const blend = (foreground, background) => {
  const [r, g, b, alpha] = foreground;
  const [br, bg, bb] = background;
  return [r * alpha + br * (1 - alpha), g * alpha + bg * (1 - alpha), b * alpha + bb * (1 - alpha), 1];
};

const luminance = ([r, g, b]) => {
  const channels = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

const contrast = (foreground, background) => {
  const backgroundColor = parseColor(background);
  const foregroundColor = blend(parseColor(foreground), backgroundColor);
  const lighter = Math.max(luminance(foregroundColor), luminance(backgroundColor));
  const darker = Math.min(luminance(foregroundColor), luminance(backgroundColor));
  return (lighter + 0.05) / (darker + 0.05);
};

const browser = await chromium.launch({ headless: true, executablePath });

try {
  const desktop = await browser.newPage({ viewport: { width: 1680, height: 945 } });
  await desktop.goto(`${baseUrl}/login`);
  await desktop.locator('.auth-shell').waitFor();

  const loginLayout = await desktop.evaluate(() => {
    const shell = document.querySelector('.auth-shell');
    const brand = document.querySelector('.auth-brand');
    const panel = document.querySelector('.auth-panel');
    const logo = document.querySelector('.auth-brand__logo');
    const header = document.querySelector('app-public-header');
    const email = document.querySelector('#email');
    const password = document.querySelector('#password');
    const submit = document.querySelector('form > .btn');
    const createAccount = document.querySelector('.auth-switch__button');
    const adminAccess = document.querySelector('.auth-admin-entry');
    if (
      !(shell instanceof HTMLElement) ||
      !(brand instanceof HTMLElement) ||
      !(panel instanceof HTMLElement) ||
      !(logo instanceof HTMLImageElement) ||
      !(header instanceof HTMLElement) ||
      !(email instanceof HTMLInputElement) ||
      !(password instanceof HTMLInputElement) ||
      !(submit instanceof HTMLElement) ||
      !(createAccount instanceof HTMLElement) ||
      !(adminAccess instanceof HTMLElement)
    ) {
      throw new Error('Customer login did not render before switching modes');
    }
    const shellRect = shell.getBoundingClientRect();
    const page = document.querySelector('.auth-page');
    if (!(page instanceof HTMLElement)) throw new Error('Customer auth page is unavailable');
    const pageRect = page.getBoundingClientRect();
    const shellStyle = getComputedStyle(shell);
    const brandRect = brand.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const adminRect = adminAccess.getBoundingClientRect();
    return {
      shellX: shellRect.x,
      shellY: shellRect.y,
      shellWidth: shellRect.width,
      shellHeight: shellRect.height,
      pageHeight: pageRect.height,
      shellComputedHeight: shellStyle.height,
      shellMinHeight: shellStyle.minHeight,
      shellAlignSelf: shellStyle.alignSelf,
      brandWidth: brandRect.width,
      brandHeight: brandRect.height,
      panelWidth: panelRect.width,
      panelHeight: panelRect.height,
      logoSource: logo.getAttribute('src'),
      headerWidth: headerRect.width,
      headerHeight: headerRect.height,
      emailPlaceholder: email.placeholder,
      passwordPlaceholder: password.placeholder,
      emailValue: email.value,
      passwordValue: password.value,
      passwordType: password.type,
      visibilityToggleCount: document.querySelectorAll('.password-field button').length,
      submitText: submit.textContent?.trim(),
      createAccountText: createAccount.textContent?.trim(),
      adminAccessText: adminAccess.textContent?.trim(),
      adminInsidePanel: adminRect.bottom <= panelRect.bottom && adminRect.top >= panelRect.top,
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    };
  });

  await desktop.locator('.auth-switch__button').click();
  await desktop.locator('#firstName').waitFor();
  await desktop.waitForTimeout(250);

  const desktopLayout = await desktop.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      assertElement(element, selector);
      const bounds = element.getBoundingClientRect();
      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        right: bounds.right,
        bottom: bounds.bottom,
      };
    };

    const assertElement = (element, selector) => {
      if (!(element instanceof HTMLElement)) {
        throw new Error(`Missing registration element: ${selector}`);
      }
    };

    return {
      shell: rect('.auth-shell'),
      brand: rect('.auth-brand'),
      panelRegion: rect('.auth-shell > .auth-panel'),
      firstName: rect('#firstName'),
      lastName: rect('#lastName'),
      phone: rect('#phone'),
      email: rect('#email'),
      password: rect('#password'),
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      logoSource: document.querySelector('.auth-brand__logo')?.getAttribute('src'),
      header: rect('app-public-header'),
      colors: {
        background: getComputedStyle(document.querySelector('.auth-shell')).backgroundColor,
        eyebrow: getComputedStyle(document.querySelector('.auth-eyebrow')).color,
        description: getComputedStyle(document.querySelector('.auth-panel > p')).color,
        buttonBackground: getComputedStyle(document.querySelector('form > .btn')).backgroundColor,
        buttonText: getComputedStyle(document.querySelector('form > .btn')).color,
        placeholder: getComputedStyle(document.querySelector('#phone'), '::placeholder').color,
      },
    };
  });

  assert.ok(Math.abs(loginLayout.shellWidth - 980) <= 1);
  assert.ok(
    loginLayout.shellHeight >= 700 && loginLayout.shellHeight <= 720,
    `Expected a content-sized 700-720px customer login card, received ${loginLayout.shellHeight}px; page=${loginLayout.pageHeight}, computed=${loginLayout.shellComputedHeight}, min=${loginLayout.shellMinHeight}, align=${loginLayout.shellAlignSelf}`,
  );
  assert.ok(
    Math.abs(loginLayout.brandWidth - loginLayout.shellWidth / 2) <= 1 &&
      Math.abs(loginLayout.brandHeight - loginLayout.panelHeight) <= 1,
    'Expected an equal 50/50 customer login split',
  );
  assert.equal(loginLayout.emailPlaceholder, 'you@example.com');
  assert.equal(loginLayout.passwordPlaceholder, 'Enter your password');
  assert.equal(loginLayout.emailValue, '');
  assert.equal(loginLayout.passwordValue, '');
  assert.equal(loginLayout.passwordType, 'password');
  assert.equal(loginLayout.visibilityToggleCount, 1);
  assert.equal(loginLayout.submitText, 'Sign in');
  assert.equal(loginLayout.createAccountText, 'Create an account');
  assert.equal(loginLayout.adminAccessText, 'Administrator access');
  assert.equal(loginLayout.adminInsidePanel, true);
  assert.equal(loginLayout.bodyScrollWidth, loginLayout.viewportWidth);
  assert.equal(desktopLayout.logoSource, loginLayout.logoSource);
  assert.ok(
    Math.abs(desktopLayout.header.width - loginLayout.headerWidth) <= 1 &&
      Math.abs(desktopLayout.header.height - loginLayout.headerHeight) <= 1,
    'Expected registration mode to preserve the existing public header',
  );

  assert.ok(
    Math.abs(desktopLayout.shell.width - 1000) <= 1,
    `Expected a 1000px registration card, received ${desktopLayout.shell.width}px`,
  );
  assert.ok(
    desktopLayout.shell.height >= 755 && desktopLayout.shell.height <= 775,
    `Expected a compact 755-775px registration card, received ${desktopLayout.shell.height}px`,
  );
  assert.ok(
    Math.abs(desktopLayout.brand.width - desktopLayout.shell.width / 2) <= 1 &&
      Math.abs(desktopLayout.brand.right - (desktopLayout.shell.x + desktopLayout.shell.width / 2)) <=
        1,
    'Expected an exact 50/50 registration split',
  );
  assert.ok(
    Math.abs(desktopLayout.brand.height - desktopLayout.panelRegion.height) <= 1,
    'Expected equal-height branding and form panels',
  );
  assert.ok(
    Math.abs(desktopLayout.firstName.width - desktopLayout.lastName.width) <= 1,
    'Expected equal-width first and last name fields',
  );
  assert.ok(
    Math.abs(desktopLayout.phone.width - desktopLayout.email.width) <= 1 &&
      Math.abs(desktopLayout.email.width - desktopLayout.password.width) <= 1,
    'Expected phone, email, and password fields to share one full width',
  );
  assert.equal(desktopLayout.bodyScrollWidth, desktopLayout.viewportWidth);
  assert.ok(contrast(desktopLayout.colors.eyebrow, desktopLayout.colors.background) >= 4.5);
  assert.ok(contrast(desktopLayout.colors.description, desktopLayout.colors.background) >= 4.5);
  assert.ok(contrast(desktopLayout.colors.placeholder, desktopLayout.colors.background) >= 4.5);
  assert.ok(contrast(desktopLayout.colors.buttonText, desktopLayout.colors.buttonBackground) >= 4.5);

  const buttonPositionsBeforeValidation = await desktop.evaluate(() => {
    const submit = document.querySelector('form > .btn');
    const signIn = document.querySelector('.auth-switch__button');
    if (!(submit instanceof HTMLElement) || !(signIn instanceof HTMLElement)) {
      throw new Error('Registration actions did not render');
    }
    return {
      submitTop: submit.getBoundingClientRect().top,
      signInTop: signIn.getBoundingClientRect().top,
    };
  });

  for (const selector of ['#firstName', '#lastName', '#phone', '#email', '#password']) {
    await desktop.locator(selector).focus();
    await desktop.waitForTimeout(200);
    const focusStyle = await desktop.locator(selector).evaluate((input) => {
      const style = getComputedStyle(input);
      return {
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
      };
    });
    assert.equal(
      focusStyle.borderColor,
      'rgb(201, 164, 106)',
      `Expected ${selector} to use the soft-gold focus border`,
    );
    assert.ok(
      focusStyle.boxShadow.includes('rgba(201, 164, 106, 0.15)'),
      `Expected ${selector} to use the soft-gold focus ring`,
    );
  }

  const passwordInput = desktop.locator('#password');
  assert.equal(await passwordInput.getAttribute('placeholder'), 'Enter your password');
  await passwordInput.fill('SecurePassword123');
  assert.equal(await passwordInput.getAttribute('type'), 'password');
  assert.equal(await desktop.locator('.password-field__mask').count(), 0);
  assert.equal(await desktop.locator('.password-field button').count(), 1);
  const selectedRange = await passwordInput.evaluate((input) => {
    if (!(input instanceof HTMLInputElement)) throw new Error('Password input is unavailable');
    input.setSelectionRange(2, 8);
    return [input.selectionStart, input.selectionEnd];
  });
  assert.deepEqual(selectedRange, [2, 8]);
  await desktop.locator('.password-field button').click();
  await desktop.waitForFunction(() => document.querySelector('#password')?.getAttribute('type') === 'text');
  assert.equal(await passwordInput.getAttribute('type'), 'text');
  assert.equal(await passwordInput.inputValue(), 'SecurePassword123');
  await desktop.locator('.password-field button').click();
  await desktop.waitForFunction(() => document.querySelector('#password')?.getAttribute('type') === 'password');
  assert.equal(await passwordInput.getAttribute('type'), 'password');
  await passwordInput.fill('');

  await desktop.locator('form > .btn').click();
  await desktop.waitForTimeout(100);
  const buttonPositionsAfterValidation = await desktop.evaluate(() => {
    const submit = document.querySelector('form > .btn');
    const signIn = document.querySelector('.auth-switch__button');
    if (!(submit instanceof HTMLElement) || !(signIn instanceof HTMLElement)) {
      throw new Error('Registration actions did not render after validation');
    }
    return {
      submitTop: submit.getBoundingClientRect().top,
      signInTop: signIn.getBoundingClientRect().top,
      errors: document.querySelectorAll('.field-feedback--error').length,
    };
  });
  assert.ok(buttonPositionsAfterValidation.errors >= 5, 'Expected invalid fields to show feedback');
  assert.ok(
    Math.abs(buttonPositionsAfterValidation.submitTop - buttonPositionsBeforeValidation.submitTop) <= 1,
    `Expected Create account to stay fixed when validation feedback appears (${buttonPositionsBeforeValidation.submitTop}px -> ${buttonPositionsAfterValidation.submitTop}px)`,
  );
  assert.ok(
    Math.abs(buttonPositionsAfterValidation.signInTop - buttonPositionsBeforeValidation.signInTop) <= 1,
    'Expected Sign in to stay fixed when validation feedback appears',
  );

  await desktop.locator('.auth-switch__button').hover();
  await desktop.waitForTimeout(250);
  const secondaryHover = await desktop.locator('.auth-switch__button').evaluate((button) => {
    const style = getComputedStyle(button);
    return { background: style.backgroundColor, text: style.color };
  });
  assert.ok(contrast(secondaryHover.text, secondaryHover.background) >= 4.5);

  await desktop.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  for (let index = 0; index < 20; index += 1) {
    await desktop.keyboard.press('Tab');
    if (await desktop.evaluate(() => document.activeElement?.matches('form > .btn'))) break;
  }
  assert.ok(
    await desktop.evaluate(() => document.activeElement?.matches('form > .btn')),
    'Expected keyboard navigation to reach the registration submit button',
  );
  const focusedButton = await desktop.locator('form > .btn').evaluate((button) => {
    const style = getComputedStyle(button);
    const panel = document.querySelector('.auth-shell');
    return {
      outline: style.outlineColor,
      background: getComputedStyle(panel).backgroundColor,
    };
  });
  assert.ok(contrast(focusedButton.outline, focusedButton.background) >= 3);

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${baseUrl}/login`);
  await mobile.locator('.auth-admin-entry').waitFor();

  const mobileLoginLayout = await mobile.evaluate(() => {
    const shell = document.querySelector('.auth-shell');
    const email = document.querySelector('#email');
    const password = document.querySelector('#password');
    const submit = document.querySelector('form > .btn');
    const createAccount = document.querySelector('.auth-switch__button');
    const adminAccess = document.querySelector('.auth-admin-entry');
    const elements = [shell, email, password, submit, createAccount, adminAccess];
    if (elements.some((element) => !(element instanceof HTMLElement))) {
      throw new Error('Customer login controls did not render on mobile');
    }
    const bounds = elements.map((element) => element.getBoundingClientRect());
    return {
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      allInsideViewport: bounds.every(
        (rect) => rect.left >= 0 && rect.right <= document.documentElement.clientWidth,
      ),
    };
  });

  assert.equal(mobileLoginLayout.bodyScrollWidth, mobileLoginLayout.viewportWidth);
  assert.equal(mobileLoginLayout.allInsideViewport, true);

  await mobile.locator('.auth-switch__button').click();
  await mobile.locator('#firstName').waitFor();
  await mobile.waitForTimeout(250);

  const mobileLayout = await mobile.evaluate(() => {
    const shell = document.querySelector('.auth-shell');
    const submit = document.querySelector('form > .btn');
    if (!(shell instanceof HTMLElement) || !(submit instanceof HTMLElement)) {
      throw new Error('Registration card did not render on mobile');
    }
    const shellRect = shell.getBoundingClientRect();
    const submitRect = submit.getBoundingClientRect();
    return {
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      shellLeft: shellRect.left,
      shellRight: shellRect.right,
      submitLeft: submitRect.left,
      submitRight: submitRect.right,
    };
  });

  assert.equal(mobileLayout.bodyScrollWidth, mobileLayout.viewportWidth);
  assert.ok(mobileLayout.shellLeft >= 0 && mobileLayout.shellRight <= mobileLayout.viewportWidth);
  assert.ok(mobileLayout.submitLeft >= 0 && mobileLayout.submitRight <= mobileLayout.viewportWidth);
} finally {
  await browser.close();
}
