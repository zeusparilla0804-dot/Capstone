const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const requireFrontend = createRequire(path.join(root, 'frontend/package.json'));
const ts = requireFrontend('typescript');
const { chromium } = requireFrontend('@playwright/test');
const output = path.join(root, '.codex-temp/responsive');
const widths = (process.argv.find(x => x.startsWith('--widths='))?.split('=')[1] || '320,390,430,768,1024,1440,1920').split(',').map(Number);
const auditOnly = process.argv.includes('--audit-only');
const publicRoot = path.join(root, 'frontend/dist/frontend/browser');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ttf': 'font/ttf' };
async function fixture(feature, name) {
  const file = path.join(root, `frontend/src/app/features/${feature}/${feature}.page.spec.ts`);
  const source = ts.createSourceFile(file, await fs.readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);
  let expr;
  source.forEachChild(node => { if (ts.isVariableStatement(node)) for (const decl of node.declarationList.declarations) if (decl.name.getText() === name) expr = decl.initializer.getText(); });
  if (!expr) throw new Error(`Missing local fixture ${feature}/${name}`);
  return vm.runInNewContext(ts.transpile(`(${expr})`, { target: ts.ScriptTarget.ES2022 }));
}
const server = http.createServer(async (req, res) => {
  try {
    let target = path.resolve(publicRoot, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!target.startsWith(publicRoot + path.sep)) target = path.join(publicRoot, 'index.html');
    let data;
    try { data = await fs.readFile(target); } catch { target = path.join(publicRoot, 'index.html'); data = await fs.readFile(target); }
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'text/html' }).end(data);
  } catch { res.writeHead(500).end(); }
});
(async () => {
  await fs.mkdir(output, { recursive: true });
  const dashboard = await fixture('admin-dashboard', 'dashboard');
  const detail = await fixture('admin-booking-detail', 'detail');
  const review = await fixture('admin-payment-review', 'review');
  review.proof.fileUrl = '/assets/images/packages/premium-package.webp';
  const invoice = await fixture('invoice', 'invoice');
  const reservationReport = await fixture('admin-reports', 'reservationReport');
  const paymentReport = await fixture('admin-reports', 'paymentReport');
  const booking = await fixture('customer-billing', 'booking');
  booking.id = '42'; booking.paymentMethod = 'gcash';
  const packages = await fixture('packages', 'packages');
  const paginate = items => ({ items, page: 1, pageSize: 10, totalItems: items.length, totalPages: 1 });
  const profile = { id: 7, firstName: 'Alexandra', lastName: 'Dela Cruz Santos', fullName: 'Alexandra Dela Cruz Santos', email: 'alexandra.delacruz.santos@example.test', phone: '09171234567', status: 'ACTIVE', totalBookings: 3, outstandingBalance: 75000, createdAt: '2026-01-01', upcomingEvent: '2026-12-10' };
  const adminBookings = [detail, { ...detail, id: 43, reference: 'BK-2026-12345678', status: 'AWAITING_PAYMENT', invoiceId: 8, packageName: 'Wedding Silver Package for 100 Guests' }];
  const addon = { id: 5, name: 'Coffee Bar for 100 Guests', description: 'Coffee service, cookies, and light snacks for 100 guests.', price: 22000, isActive: true };
  const payment = { id: 5, reservationId: 42, bookingId: 42, bookingStatus: 'AWAITING_PAYMENT', bookingReference: 'BK-2026-12345678', customerName: profile.fullName, amountDue: 85000, amountPaid: 10000, amount: 10000, paymentMethod: 'CASH', method: 'CASH', paymentDate: '2026-10-01', status: 'PARTIALLY_PAID' };
  const destination = { id: 1, method: 'E-WALLET', label: 'GCash receiving account for catering reservations', accountName: profile.fullName, accountHint: 'Ending 4567', isAvailable: true, assignmentCount: 3 };
  let role = 'customer';
  let currentLayout = '';
  const unhandledEndpoints = new Set();
  const pages = ['/', '/packages', '/events', '/about', '/contact', '/login', '/forgot-password', '/reset-password', '/verify-email', '/dashboard', '/my-bookings', '/billing', '/profile', '/book-event', '/my-bookings/42/payment', '/invoice/8', '/admin/login', '/admin/forgot-password', '/admin/reset-password', '/admin/dashboard', '/admin/bookings', '/admin/bookings/42', '/admin/customers', '/admin/customers/7', '/admin/packages', '/admin/add-ons', '/admin/payments', '/admin/payment-qrs', '/admin/reports', '/admin/payments/proofs/1', '/admin/email-outbox', '/admin/audit-log', '/admin/invoices/8', '/not-a-real-page'];
  const results = [];
  pages.push('/login?layout=register', '/admin/packages?layout=create', '/admin/add-ons?layout=create', '/admin/customers/7?layout=deactivate', '/admin/reports?layout=payments', '/book-event?layout=calendar', '/reset-password?token=local-layout-test', '/admin/reset-password?token=local-layout-test', '/admin/login?layout=mfa');
  pages.push('/book-event?booking=42&layout=addons', '/book-event?booking=42&layout=review', '/my-bookings?layout=cancel', '/book-event?paymentBooking=42&step=4&layout=payment');
  pages.push('/book-event?paymentBooking=42&step=4&layout=payment-confirm', '/admin/payment-qrs?layout=assignment');
  const selectedPages = process.argv.includes('--states-only') ? pages.filter(route => route.includes('?')) : pages;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage();
    const fontCache = new Map();
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') return route.continue();
      if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        if (!fontCache.has(url.href)) fontCache.set(url.href, (async () => {
          const response = await route.fetch({ timeout: 10000 });
          return { body: await response.body(), contentType: response.headers()['content-type'], headers: { 'access-control-allow-origin': '*' } };
        })().catch(() => null));
        const font = await fontCache.get(url.href);
        return font ? route.fulfill(font) : route.abort();
      }
      if (url.pathname.startsWith('/assets/')) return route.fulfill({ body: await fs.readFile(path.join(publicRoot, 'assets/images/packages/premium-package.webp')), contentType: 'image/webp' });
      return route.abort();
    });
    let errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url()); const p = url.pathname.replace(/^\/api/, '');
      if (p === '/auth/admin/login' && route.request().method() === 'POST') return route.fulfill({ json: { success: true, data: { requiresMfa: true, challenge: 'local-layout-test', setupSecret: 'JBSWY3DPEHPK3PXP', setupUri: 'otpauth://totp/Local:qa?secret=JBSWY3DPEHPK3PXP&issuer=Local' } } });
      if (route.request().method() !== 'GET') throw new Error(`Visual audit blocked mutation: ${p}`);
      if (p.endsWith('/image')) return route.fulfill({ body: await fs.readFile(path.join(publicRoot, 'assets/images/packages/premium-package.webp')), contentType: 'image/webp' });
      let data = [];
      if (p === '/auth/me' || p === '/auth/admin/me') data = { ...profile, role: p.includes('/admin/') ? 'admin' : role };
      else if (p === '/admin/dashboard') data = dashboard;
      else if (p === '/admin/bookings') data = paginate(adminBookings);
      else if (/^\/admin\/bookings\/\d+$/.test(p)) data = detail;
      else if (p === '/admin/customers') data = paginate([profile]);
      else if (/^\/admin\/customers\/\d+$/.test(p)) data = profile;
      else if (/^\/admin\/customers\/\d+\/bookings$/.test(p)) data = paginate(adminBookings.map(b => ({ ...b, outstandingBalance: 75000, invoiceId: 8, invoiceNumber: 'INV-8' })));
      else if (/^\/admin\/customers\/\d+\/payments$/.test(p)) data = paginate([payment]);
      else if (p === '/admin/packages') data = packages.map(x => ({ ...x, eventId: 1, eventType: 'Wedding', isActive: true }));
      else if (p === '/admin/add-ons' || p === '/add-ons') data = [addon];
      else if (p.endsWith('/event-types')) data = [{ id: 1, name: 'Wedding' }, { id: 2, name: 'Birthday' }];
      else if (p === '/packages') data = packages;
      else if (p === '/notifications') data = [];
      else if (p.endsWith('/reports/reservations')) data = reservationReport;
      else if (p.endsWith('/reports/payments')) data = paymentReport;
      else if (p === '/admin/payments') data = paginate([payment]);
      else if (p === '/admin/payment-proofs') data = paginate([review.proof]);
      else if (/^\/admin\/payment-proofs\/\d+$/.test(p)) data = review;
      else if (p === '/admin/email-outbox') data = paginate([{ id: '1', recipient: profile.email, templateKey: 'BOOKING_APPROVED', payload: {}, relatedEntityType: 'BOOKING', relatedEntityId: '42', status: 'FAILED', attemptCount: 3, lastError: 'Mailbox unavailable', createdAt: '2026-10-01', updatedAt: '2026-10-02' }]);
      else if (p === '/admin/audit-log') data = paginate([{ id: '1', adminId: 1, adminName: profile.fullName, action: 'CUSTOMER_UPDATED', entityType: 'CUSTOMER', entityId: 7, createdAt: '2026-10-01', oldValues: { status: 'ACTIVE' }, newValues: { status: 'INACTIVE' } }]);
      else if (p === '/bookings/my') data = [{ ...booking, ...(currentLayout === 'cancel' ? { status: 'pending', amountPaid: 0 } : {}) }];
      else if (/^\/bookings\/\d+$/.test(p)) data = { ...booking, id: '42', amountPaid: currentLayout.startsWith('payment') ? 0 : booking.amountPaid, package: { ...booking.package, packageId: '1' }, paymentMethod: null, status: ['addons', 'review'].includes(currentLayout) ? 'pending' : 'awaiting_payment' };
      else if (p.includes('/invoices/')) data = invoice;
      else if (p.endsWith('/payment-proofs')) data = [];
      else if (p.endsWith('/methods')) data = ['BANK_TRANSFER', 'E-WALLET'];
      else if (p === '/admin/payment-destinations') data = [destination];
      else if (p.endsWith('/waiting-bookings')) data = [{ ...detail, customerName: profile.fullName, paymentMethod: 'E-WALLET', amountDue: 85000, amountPaid: 0 }];
      else if (p.includes('/payment-destinations/bookings/')) data = destination;
      else if (p.includes('/availability')) data = p.includes('month') ? [] : { ...detail.capacity, date: url.searchParams.get('date') || '2027-02-12', guestCount: Number(url.searchParams.get('guestCount') || 100) };
      else if (!p.endsWith('/images')) unhandledEndpoints.add(p);
      await route.fulfill({ json: { success: true, data } });
    });
    for (const width of widths) {
      await page.setViewportSize({ width, height: ({ 320: 568, 390: 844, 430: 932, 768: 1024, 1024: 768, 1440: 900, 1920: 1080 })[width] || 900 });
      for (const route of selectedPages) {
        role = route.startsWith('/admin') ? 'admin' : 'customer'; errors = [];
        currentLayout = new URL(route, 'http://localhost').searchParams.get('layout') || '';
        await page.goto(`http://127.0.0.1:${server.address().port}${route}`, { waitUntil: 'networkidle' });
        if (new URL(page.url()).pathname !== new URL(route, 'http://localhost').pathname) throw new Error(`Unexpected redirect from ${route} to ${page.url()}`);
        const layout = new URL(route, 'http://localhost').searchParams.get('layout');
        if (layout === 'register') await page.getByRole('button', { name: 'Create an account', exact: true }).click();
        if (layout === 'create') await page.getByRole('button', { name: route.includes('add-ons') ? 'Create Add-on' : 'Create Package', exact: true }).click();
        if (layout === 'deactivate') await page.getByRole('button', { name: 'Deactivate account', exact: true }).click();
        if (layout === 'payments') await page.getByRole('tab', { name: 'Payments', exact: true }).click();
        if (layout === 'calendar') await page.getByRole('button', { name: 'Open available dates' }).click();
        if (layout === 'addons' || layout === 'review') {
          await page.getByRole('button', { name: /Continue to Add-ons/ }).click();
          await page.getByRole('heading', { name: 'Select Add-ons', exact: true }).waitFor();
          await page.locator('#addon-5').check();
          if (layout === 'review') { await page.getByRole('button', { name: 'Review Booking', exact: true }).click(); await page.getByRole('button', { name: 'Save Booking Changes', exact: true }).waitFor(); }
        }
        if (layout === 'cancel') await page.getByRole('button', { name: 'Cancel Booking', exact: true }).click();
        if (layout === 'payment-confirm') { await page.locator('input[name="approvedPaymentMethod"][value="gcash"]').check(); await page.getByRole('dialog').waitFor(); }
        if (layout === 'assignment') await page.getByRole('button', { name: 'Choose customer', exact: true }).click();
        if (layout === 'mfa') {
          await page.locator('#identity').fill('local@example.test'); await page.locator('#adminPassword').fill('LocalTestPassword!');
          await page.getByRole('button', { name: 'Sign in', exact: true }).click();
          await page.locator('img.mfa-qr').waitFor();
        }
        if (layout) await page.waitForTimeout(100);
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        const measurement = await page.evaluate(() => {
          const viewport = innerWidth;
          const overflowing = [...document.querySelectorAll('main *')].filter(el => {
            const r = el.getBoundingClientRect(); if (!el.checkVisibility() || !r.width || !r.height || r.left >= viewport || r.right <= 0) return false;
            let parent = el.parentElement;
            while (parent && parent !== document.body && parent !== document.documentElement) { const s = getComputedStyle(parent); if (['auto', 'scroll', 'hidden', 'clip'].includes(s.overflowX)) return false; parent = parent.parentElement; }
            return r.right > viewport + 1 || r.left < -1;
          }).slice(0, 8).map(el => ({ tag: el.tagName, cls: el.className, text: el.textContent.trim().slice(0, 60) }));
          const actionOffsets = viewport < 768 ? [...document.querySelectorAll('.admin-record-table td[data-label="Actions"]')].map(cell => {
            const control = cell.querySelector('select, button, a');
            return control ? Math.round(control.getBoundingClientRect().left - cell.getBoundingClientRect().left) : 0;
          }).filter(x => x > 3) : [];
          const textOverflow = [...document.querySelectorAll('h1,h2,h3,p,dd,dt,label,.btn')].filter(el => el.checkVisibility() && !el.children.length && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'visible').slice(0, 8).map(el => ({ cls: el.className, text: el.textContent.trim().slice(0, 60) }));
          const dialogOverflow = [...document.querySelectorAll('dialog[open],[role="dialog"][aria-modal="true"]')].filter(el => {
            if (!el.checkVisibility()) return false;
            const rect = el.getBoundingClientRect();
            return rect.top < -1 || rect.bottom > innerHeight + 1 || rect.left < -1 || rect.right > viewport + 1;
          }).map(el => el.className);
          const header = document.querySelector('.bookings-header');
          const headerCopy = header?.querySelector('p');
          const headerAction = header?.querySelector('.btn');
          const headerGap = viewport < 768 && headerCopy && headerAction ? Math.round(headerAction.getBoundingClientRect().top - headerCopy.getBoundingClientRect().bottom) : 0;
          return { scrollWidth: document.documentElement.scrollWidth, overflowing, actionOffsets, textOverflow, dialogOverflow, headerGap, fonts: [...document.fonts].filter(font => font.status === 'loaded').map(font => font.family), heading: document.querySelector('h1')?.textContent.trim() };
        });
        const result = { width, route, ...measurement, errors: [...errors] }; results.push(result);
        if (measurement.scrollWidth > width + 1 || measurement.overflowing.length || measurement.actionOffsets.length || measurement.textOverflow.length || measurement.dialogOverflow.length || measurement.headerGap > 48 || errors.length || width === 390 || (width === 768 && ['/my-bookings', '/admin/payment-qrs'].includes(route))) {
          await page.screenshot({ path: path.join(output, `${width}-${route.replace(/\W+/g, '-') || 'home'}.png`), fullPage: true });
        }
      }
      console.log(`Audited ${width}px: ${selectedPages.length} routes/states`);
    }
    await fs.writeFile(path.join(output, 'audit.json'), JSON.stringify(results, null, 2));
    const issues = results.filter(r => r.scrollWidth > r.width + 1 || r.overflowing.length || r.actionOffsets.length || r.textOverflow.length || r.dialogOverflow.length || r.headerGap > 48 || r.errors.length);
    console.log(JSON.stringify({ total: results.length, unhandledEndpoints: [...unhandledEndpoints], issues }, null, 2));
    if (unhandledEndpoints.size) process.exitCode = 1;
    if (issues.length && !auditOnly) process.exitCode = 1;
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
