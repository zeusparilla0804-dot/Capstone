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
const reportName = process.argv.find(x => x.startsWith('--report='))?.slice(9) || 'audit.json';
if (!/^[\w.-]+\.json$/.test(reportName)) throw new Error('Report must be a JSON filename');
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
  dashboard.priority.qrAssignmentsWaiting = 3;
  dashboard.recentActivity = [
    { id: 'H-1', reservationId: 42, title: 'Payment method selected', detail: 'BK-2026-12345678 · Alexandra Dela Cruz Santos · Bank transfer', updatedAt: '2026-11-12T04:30:00Z' },
    { id: 'A-1', reservationId: 42, title: 'Event time adjusted by admin', detail: 'BK-2026-12345678 · 18:00 → 22:00', updatedAt: '2026-11-12T04:00:00Z' },
  ];
  const detail = await fixture('admin-booking-detail', 'detail');
  const review = await fixture('admin-payment-review', 'review');
  review.proof.fileUrl = '/assets/images/packages/premium-package.webp';
  const invoice = await fixture('invoice', 'invoice');
  const reservationReport = await fixture('admin-reports', 'reservationReport');
  const paymentReport = await fixture('admin-reports', 'paymentReport');
  const booking = await fixture('customer-billing', 'booking');
  booking.id = '42'; booking.paymentMethod = 'bank-transfer';
  const packages = await fixture('packages', 'packages');
  const paginate = items => ({ items, page: 1, pageSize: 10, totalItems: items.length, totalPages: 1 });
  const profile = { id: 7, firstName: 'Alexandra', lastName: 'Dela Cruz Santos', fullName: 'Alexandra Dela Cruz Santos', email: 'alexandra.delacruz.santos@example.test', phone: '09171234567', status: 'ACTIVE', totalBookings: 3, outstandingBalance: 75000, createdAt: '2026-01-01', upcomingEvent: '2026-12-10' };
  const adminBookings = [detail, { ...detail, id: 43, reference: 'BK-2026-12345678', status: 'AWAITING_PAYMENT', invoiceId: 8, packageName: 'Wedding Silver Package for 100 Guests' }];
  const addon = { id: 5, name: 'Coffee Bar for 100 Guests', description: 'Coffee service, cookies, and light snacks for 100 guests.', price: 22000, isActive: true };
  const payment = { id: 5, reservationId: 42, bookingId: 42, bookingStatus: 'AWAITING_PAYMENT', bookingReference: 'BK-2026-12345678', customerName: profile.fullName, amountDue: 85000, amountPaid: 10000, amount: 10000, paymentMethod: 'CASH', method: 'CASH', paymentDate: '2026-10-01', status: 'PARTIALLY_PAID' };
  const destination = { id: 1, method: 'BANK_TRANSFER', label: 'Bank transfer receiving account for catering reservations', accountName: profile.fullName, accountHint: 'Ending 4567', isAvailable: true, assignmentCount: 3 };
  let role = 'customer';
  let currentLayout = '';
  const unhandledEndpoints = new Set();
  const pages = ['/', '/packages', '/events', '/about', '/contact', '/login', '/forgot-password', '/reset-password', '/verify-email', '/dashboard', '/my-bookings', '/billing', '/profile', '/book-event', '/my-bookings/42/payment', '/invoice/8', '/admin/login', '/admin/forgot-password', '/admin/reset-password', '/admin/dashboard', '/admin/bookings', '/admin/bookings/42', '/admin/customers', '/admin/customers/7', '/admin/packages', '/admin/add-ons', '/admin/payments', '/admin/payment-qrs', '/admin/reports', '/admin/payments/proofs/1', '/admin/email-outbox', '/admin/audit-log', '/admin/invoices/8', '/not-a-real-page'];
  const results = [];
  pages.push('/login?layout=register', '/admin/packages?layout=create', '/admin/add-ons?layout=create', '/admin/customers/7?layout=deactivate', '/admin/reports?layout=payments', '/book-event?layout=calendar', '/reset-password?token=local-layout-test', '/admin/reset-password?token=local-layout-test', '/admin/login?layout=mfa');
  pages.push('/book-event?booking=42&layout=addons', '/book-event?booking=42&layout=review', '/my-bookings?layout=cancel', '/book-event?paymentBooking=42&step=4&layout=payment');
  pages.push('/book-event?paymentBooking=42&step=4&layout=payment-confirm', '/admin/payment-qrs?layout=assignment');
  pages.push('/admin/payments?layout=legacy-cash', '/admin/payments?layout=legacy-bank', '/admin/payments/proofs/1?layout=legacy-proof',
    '/my-bookings/42/payment?layout=legacy-proof', '/my-bookings?layout=legacy-choice', '/billing?layout=legacy-choice');
  pages.push('/admin/reports?layout=no-upcoming');
  pages.push('/admin/payments?layout=installment-cash', '/admin/payments?layout=installment-bank');
  pages.push('/admin/bookings/42?layout=edit-time');
  const selectedPages = process.argv.includes('--shell-only') ? ['/', '/contact', '/login']
    : process.argv.includes('--operations-only') ? ['/admin/dashboard', '/admin/bookings/42', '/admin/bookings/42?layout=edit-time', '/my-bookings/42/payment', '/admin/payment-qrs']
    : process.argv.includes('--installments-only') ? pages.filter(route => route.includes('layout=installment-'))
    : process.argv.includes('--details-only') ? ['/admin/bookings/42', '/admin/invoices/8', '/invoice/8', '/admin/reports?layout=payments']
    : process.argv.includes('--payments-only') ? pages.filter(route => /payment|billing|legacy-choice/.test(route))
    : process.argv.includes('--states-only') ? pages.filter(route => route.includes('?')) : pages;
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
      if (p.includes('/payment-destinations/') && p.endsWith('/image')) return route.fulfill({ body: '<svg xmlns="http://www.w3.org/2000/svg" width="540" height="680" viewBox="0 0 540 680"><rect width="540" height="680" fill="white"/><text x="270" y="64" text-anchor="middle" font-size="26">TEST ACCOUNT</text><path d="M70 150h140v140H70zM330 150h140v140H330zM70 410h140v140H70zM250 330h60v60h-60zM330 410h60v60h-60zM410 490h60v60h-60z" fill="black"/><path d="M90 170h100v100H90zM350 170h100v100H350zM90 430h100v100H90z" fill="white"/><path d="M110 190h60v60h-60zM370 190h60v60h-60zM110 450h60v60h-60z" fill="black"/><text x="270" y="625" text-anchor="middle" font-size="20">LAYOUT FIXTURE — NOT FOR PAYMENT</text></svg>', contentType: 'image/svg+xml' });
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
      else if (p.endsWith('/reports/reservations')) data = currentLayout === 'no-upcoming'
        ? { ...reservationReport, upcomingItems: [], items: Array.from({ length: 5 }, (_, index) => ({ ...reservationReport.items[0], reference: `LC-REPORT-${index + 1}`, guestCount: [120, 50, 100, 100, 100][index] })) } : reservationReport;
      else if (p.endsWith('/reports/payments')) data = paymentReport;
      else if (p === '/admin/payments') data = paginate([{ ...payment, ...(currentLayout.startsWith('legacy-') ? { paymentMethod: 'E-WALLET' }
        : currentLayout.startsWith('installment-') ? { paymentMethod: currentLayout === 'installment-cash' ? 'BANK_TRANSFER' : 'CASH', bookingStatus: 'PAYMENT_VERIFIED', amountPaid: 42500 } : {}) }]);
      else if (p === '/admin/payment-proofs') data = paginate([review.proof]);
      else if (/^\/admin\/payment-proofs\/\d+$/.test(p)) data = currentLayout === 'legacy-proof' ? { ...review, proof: { ...review.proof, method: 'E_WALLET' } } : review;
      else if (p === '/admin/email-outbox') data = paginate([{ id: '1', recipient: profile.email, templateKey: 'BOOKING_APPROVED', payload: {}, relatedEntityType: 'BOOKING', relatedEntityId: '42', status: 'FAILED', attemptCount: 3, lastError: 'Mailbox unavailable', createdAt: '2026-10-01', updatedAt: '2026-10-02' }]);
      else if (p === '/admin/audit-log') data = paginate([{ id: '1', adminId: 1, adminName: profile.fullName, action: 'CUSTOMER_UPDATED', entityType: 'CUSTOMER', entityId: 7, createdAt: '2026-10-01', oldValues: { status: 'ACTIVE' }, newValues: { status: 'INACTIVE' } }]);
      else if (p === '/bookings/my') data = [{ ...booking, ...(currentLayout === 'cancel' ? { status: 'pending', amountPaid: 0 }
        : currentLayout.startsWith('legacy-') ? { paymentMethod: 'gcash', status: 'awaiting_payment', amountPaid: currentLayout === 'legacy-choice' ? 0 : 10000, latestProofStatus: undefined } : {}) }];
      else if (/^\/bookings\/\d+$/.test(p)) data = { ...booking, id: '42', amountPaid: currentLayout.startsWith('payment') ? 0 : booking.amountPaid, package: { ...booking.package, packageId: '1' }, paymentMethod: null, status: ['addons', 'review'].includes(currentLayout) ? 'pending' : 'awaiting_payment' };
      else if (p.includes('/invoices/')) data = invoice;
      else if (p.endsWith('/payment-proofs')) data = [];
      else if (p.endsWith('/methods')) data = ['BANK_TRANSFER'];
      else if (p === '/admin/payment-destinations') data = [destination];
      else if (p.endsWith('/waiting-bookings')) data = [{ ...detail, customerName: profile.fullName, paymentMethod: 'BANK_TRANSFER', amountDue: 85000, amountPaid: 0 }];
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
        if (layout === 'edit-time') {
          await page.locator('[data-edit-event-time]').click();
          await page.locator('#admin-event-time').fill('22:00');
          await page.getByRole('button', { name: 'Save time', exact: true }).click();
          await page.getByRole('dialog').waitFor();
          if (!await page.getByRole('dialog').textContent().then(text => text.includes('10:00 PM'))) throw Error('Time adjustment must confirm 10 PM');
        }
        if (layout === 'calendar') await page.getByRole('button', { name: 'Open available dates' }).click();
        if (layout === 'addons' || layout === 'review') {
          await page.getByRole('button', { name: /Continue to Add-ons/ }).click();
          await page.getByRole('heading', { name: 'Select Add-ons', exact: true }).waitFor();
          await page.locator('#addon-5').check();
          if (layout === 'review') { await page.getByRole('button', { name: 'Review Booking', exact: true }).click(); await page.getByRole('button', { name: 'Save Booking Changes', exact: true }).waitFor(); }
        }
        if (layout === 'cancel') await page.getByRole('button', { name: 'Cancel Booking', exact: true }).click();
        if (layout === 'payment-confirm') { await page.locator('input[name="approvedPaymentMethod"][value="bank-transfer"]').check(); await page.getByRole('dialog').waitFor(); }
        if (layout === 'legacy-cash' || layout === 'legacy-bank') {
          await page.locator('[data-record-bank]').click();
          const method = page.locator('select[formControlName="method"]');
          if (JSON.stringify(await method.locator('option').evaluateAll(options => options.map(option => option.value))) !== JSON.stringify(['', 'CASH', 'BANK_TRANSFER'])) throw Error('Unsupported recovery payment choices');
          await method.selectOption(layout === 'legacy-cash' ? 'CASH' : 'BANK_TRANSFER');
        }
        if (layout?.startsWith('installment-')) {
          await page.locator('[data-record-bank],[data-record-cash]').click();
          await page.locator('select[formControlName="method"]').selectOption(layout === 'installment-cash' ? 'CASH' : 'BANK_TRANSFER');
          await page.locator('input[formControlName="amount"]').fill('42500');
          await page.locator('input[formControlName="paymentDate"]').fill('2026-11-01');
          if (layout === 'installment-bank') await page.locator('input[maxlength="150"]').fill('BANK-INSTALLMENT-QA');
          else if (await page.locator('input[maxlength="150"]').count()) throw Error('Cash installment must not require a bank reference');
          if (!await page.locator('.admin-form button[type="submit"]').isEnabled()) throw Error('Valid installment must be recordable');
        }
        if (layout === 'legacy-choice') await page.getByRole('link', { name: 'Change payment method', exact: true }).waitFor();
        if (layout === 'legacy-proof' && await page.locator('#proof-file,[data-testid="verify-proof"]').count()) throw Error('Legacy GCash must not accept new proof or credit');
        if (layout === 'assignment') await page.getByRole('button', { name: 'Choose customer', exact: true }).click();
        if (layout === 'mfa') {
          await page.locator('#identity').fill('local@example.test'); await page.locator('#adminPassword').fill('LocalTestPassword!');
          await page.getByRole('button', { name: 'Sign in', exact: true }).click();
          await page.locator('img.mfa-qr').waitFor();
        }
        if (layout) await page.waitForTimeout(100);
        const blockedActions = await page.evaluate(async () => {
          const blocked = [];
          const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
          for (const top of [...new Set([0, Math.round(max / 2), max])]) {
            scrollTo({ top, behavior: 'instant' });
            await settle();
            const launcher = document.querySelector('app-messenger-contact:not(.is-inline) a');
            if (!launcher || !launcher.checkVisibility({ visibilityProperty: true })) continue;
            const rect = launcher.getBoundingClientRect();
            for (const control of document.querySelectorAll('main a,main button,main input,main select,main textarea,.site-footer a')) {
              if (!control.checkVisibility({ visibilityProperty: true })) continue;
              const box = control.getBoundingClientRect();
              if (Math.min(rect.right, box.right) - Math.max(rect.left, box.left) > 2 && Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top) > 2) blocked.push({ top, text: control.textContent.trim().slice(0, 50) });
            }
          }
          scrollTo({ top: 0, behavior: 'instant' });
          await settle();
          return blocked;
        });
        const measurement = await page.evaluate(() => {
          const viewport = innerWidth;
          const overflowing = [...document.querySelectorAll('main *, .site-footer *, app-public-header *')].filter(el => {
            const r = el.getBoundingClientRect(); if (!el.checkVisibility() || !r.width || !r.height || r.left >= viewport || r.right <= 0) return false;
            let parent = el.parentElement;
            while (parent && parent !== document.body && parent !== document.documentElement) { const s = getComputedStyle(parent); if (['auto', 'scroll', 'hidden', 'clip'].includes(s.overflowX)) return false; parent = parent.parentElement; }
            return r.right > viewport + 1 || r.left < -1;
          }).slice(0, 8).map(el => ({ tag: el.tagName, cls: el.className, text: el.textContent.trim().slice(0, 60) }));
          const actionOffsets = viewport < 768 ? [...document.querySelectorAll('.admin-record-table td[data-label="Actions"]')].map(cell => {
            const control = cell.querySelector('select, button, a');
            return control ? Math.round(control.getBoundingClientRect().left - cell.getBoundingClientRect().left) : 0;
          }).filter(x => x > 3) : [];
          const textOverflow = [...document.querySelectorAll('h1,h2,h3,p,dd,dt,label,address,nav a,.btn')].filter(el => el.checkVisibility() && !el.children.length && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'visible').slice(0, 8).map(el => ({ cls: el.className, text: el.textContent.trim().slice(0, 60) }));
          const dialogOverflow = [...document.querySelectorAll('dialog[open],[role="dialog"][aria-modal="true"]')].filter(el => {
            if (!el.checkVisibility()) return false;
            const rect = el.getBoundingClientRect();
            return rect.top < -1 || rect.bottom > innerHeight + 1 || rect.left < -1 || rect.right > viewport + 1;
          }).map(el => el.className);
          const header = document.querySelector('.bookings-header');
          const headerCopy = header?.querySelector('p');
          const headerAction = header?.querySelector('.btn');
          const headerGap = viewport < 768 && headerCopy && headerAction ? Math.round(headerAction.getBoundingClientRect().top - headerCopy.getBoundingClientRect().bottom) : 0;
          const numericHeaderAlignment = [...document.querySelectorAll('table')].flatMap(table => {
            if (getComputedStyle(table).display !== 'table') return [];
            const headers = [...table.querySelectorAll('thead tr:first-child th')];
            return [...table.querySelectorAll('tbody tr:first-child td')].flatMap((cell, index) => {
              const header = headers[index];
              if (!header || !header.checkVisibility() || !cell.classList.contains('is-number')) return [];
              return getComputedStyle(header).textAlign === getComputedStyle(cell).textAlign ? [] : [{ column: header.textContent.trim(), header: getComputedStyle(header).textAlign, body: getComputedStyle(cell).textAlign }];
            });
          });
          const overlappingControls = [...document.querySelectorAll('main form, .site-footer__inner')].flatMap(form => {
            const controls = (form.classList.contains('site-footer__inner') ? [...form.children] : [...form.querySelectorAll('input:not([type="hidden"]),select,textarea,button')]).filter(el => el.checkVisibility() && el.getBoundingClientRect().width > 0);
            return controls.flatMap((a, i) => controls.slice(i + 1).flatMap(b => {
              const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
              // A calendar/dialog intentionally overlays the form behind it.
              if (a.closest('[role="dialog"],dialog') !== b.closest('[role="dialog"],dialog')) return [];
              // Password toggles sit inside the input border; require padding to protect typed text.
              const input = a.matches('input') ? a : b.matches('input') ? b : null;
              const toggle = a.matches('button') ? a : b.matches('button') ? b : null;
              if (input && toggle && input.parentElement === toggle.parentElement
                && input.parentElement.matches('.password-field,.password-control')
                && /^(Show|Hide).*password/i.test(toggle.getAttribute('aria-label') || '')) {
                const textRight = input.getBoundingClientRect().right - parseFloat(getComputedStyle(input).paddingRight);
                if (textRight <= toggle.getBoundingClientRect().left - 2) return [];
              }
              return Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left) > 2 && Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top) > 2
                ? [{ first: a.getAttribute('aria-label') || a.name || a.textContent.trim().slice(0, 30), second: b.getAttribute('aria-label') || b.name || b.textContent.trim().slice(0, 30) }] : [];
            }));
          });
          // Overflow-wrap can conceal cramped columns by splitting amounts or short labels.
          const splitTokens = [...document.querySelectorAll('.financial-strip dd,.report-summary dd,.invoice-parties dt,.invoice-table th,.invoice-table td')].flatMap(el => {
            if (!el.checkVisibility() || el.children.length) return [];
            const node = [...el.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
            if (!node) return [];
            return [...node.textContent.matchAll(/[₱\d][\d,.]+|[A-Za-z]{4,}/g)].flatMap(match => {
              const range = document.createRange();
              range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
              return new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size > 1 ? [{ text: match[0], cls: el.className }] : [];
            });
          });
          const qr = document.querySelector('.destination-panel img');
          const qrAlignment = qr ? (() => { const box = qr.getBoundingClientRect(), panel = qr.closest('.destination-panel').getBoundingClientRect(); return { width: box.width, centerOffset: Math.abs((box.left + box.right - panel.left - panel.right) / 2) }; })() : null;
          if (qrAlignment && (qrAlignment.centerOffset > 2 || (viewport >= 768 && qrAlignment.width < 350))) textOverflow.push({ cls: 'destination-panel', text: 'Payment QR must be larger and centered' });
          const submission = document.querySelector('[data-testid="submission-date"]');
          if (submission?.querySelector('input,button')) textOverflow.push({ cls: 'submission-date', text: 'Submission date must not be editable' });
          return { scrollWidth: document.documentElement.scrollWidth, overflowing, actionOffsets, textOverflow, dialogOverflow, headerGap, numericHeaderAlignment, overlappingControls, splitTokens, qrAlignment, fonts: [...document.fonts].filter(font => font.status === 'loaded').map(font => font.family), heading: document.querySelector('h1')?.textContent.trim() };
        });
        const result = { width, route, ...measurement, blockedActions, errors: [...errors] }; results.push(result);
        if (measurement.scrollWidth > width + 1 || measurement.overflowing.length || measurement.actionOffsets.length || measurement.textOverflow.length || measurement.dialogOverflow.length || measurement.numericHeaderAlignment.length || measurement.overlappingControls.length || measurement.splitTokens.length || blockedActions.length || measurement.headerGap > 48 || errors.length || width === 390 || process.argv.includes('--screenshots') || (width === 768 && ['/my-bookings', '/admin/payment-qrs'].includes(route))) {
          await page.screenshot({ path: path.join(output, `${width}-${route.replace(/\W+/g, '-') || 'home'}.png`), fullPage: true });
        }
      }
      console.log(`Audited ${width}px: ${selectedPages.length} routes/states`);
    }
    await fs.writeFile(path.join(output, reportName), JSON.stringify(results, null, 2));
    const issues = results.filter(r => r.scrollWidth > r.width + 1 || r.overflowing.length || r.actionOffsets.length || r.textOverflow.length || r.dialogOverflow.length || r.numericHeaderAlignment.length || r.overlappingControls.length || r.splitTokens.length || r.blockedActions.length || r.headerGap > 48 || r.errors.length);
    console.log(JSON.stringify({ total: results.length, unhandledEndpoints: [...unhandledEndpoints], issues }, null, 2));
    if (unhandledEndpoints.size) process.exitCode = 1;
    if (issues.length && !auditOnly) process.exitCode = 1;
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
