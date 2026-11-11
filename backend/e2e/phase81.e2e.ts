import { verifyFixtureEmail } from './verify-fixture-email.js';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sql from 'mssql';

const uploadRoot = await mkdtemp(join(tmpdir(), 'la-chef-phase81-e2e-'));
process.env['PAYMENT_PROOF_UPLOAD_ROOT'] = uploadRoot;
// These fixtures import app.ts, never server.ts; no mail worker is started.
process.env['EMAIL_WORKER_ENABLED'] = 'true';

const [{ default: app }, { closeDatabase, getDbPool }, { environment }, { hashPassword }] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/database.js'),
  import('../src/config/environment.js'),
  import('../src/utils/password.js')
]);

if (environment.isProduction) throw new Error('E2E verification is disabled in production.');

const marker = `E2E-${randomUUID().slice(0, 8)}`;
const password = `E2E-${randomUUID()}!aA1`;
const customerAEmail = `${marker.toLowerCase()}-a@example.test`;
const customerBEmail = `${marker.toLowerCase()}-b@example.test`;
const adminEmail = `${marker.toLowerCase()}-admin@example.test`;
const created: Record<string, number> = {};
const createdBookingIds: number[] = [];
let server: ReturnType<typeof app.listen> | undefined;

function cookie(response: Response): string {
  const value = response.headers.get('set-cookie');
  assert.ok(value, 'Expected a session cookie.');
  return value.split(';', 1)[0]!;
}

async function request(base: string, path: string, init: RequestInit = {}, expected = 200) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-la-chef-request': '1', ...(init.headers ?? {}) }
  });
  const body = response.status === 204 ? undefined : await response.json();
  assert.equal(response.status, expected, `${init.method ?? 'GET'} ${path}: ${JSON.stringify(body)}`);
  if (path === '/auth/register' && response.status === 201) {
    await verifyFixtureEmail(base, JSON.parse(String(init.body)).email);
  }
  return { response, body };
}

async function cleanup(): Promise<void> {
  const pool = await getDbPool();
  for (const bookingId of createdBookingIds) {
    await pool.request().input('id', sql.Int, bookingId)
      .input('emailA', sql.NVarChar(320), customerAEmail)
      .input('emailB', sql.NVarChar(320), customerBEmail).query(`
      DELETE FROM dbo.EMAIL_OUTBOX WHERE recipient IN(@emailA,@emailB)
        OR (related_entity_type='BOOKING' AND related_entity_id=@id);
      DELETE FROM dbo.PAYMENT_PROOF WHERE reservation_id=@id;
      DELETE FROM dbo.BOOKING_STATUS_HISTORY WHERE reservation_id=@id;
      DELETE ail FROM dbo.ADMIN_AUDIT_LOG ail WHERE (ail.entity_type='BOOKING' AND ail.entity_id=@id)
        OR (ail.entity_type='PAYMENT' AND ail.entity_id IN(SELECT payment_id FROM dbo.PAYMENT WHERE reservation_id=@id))
        OR (ail.entity_type='INVOICE' AND ail.entity_id IN(SELECT invoice_id FROM dbo.INVOICE WHERE reservation_id=@id));
      DELETE ii FROM dbo.INVOICE_ITEM ii JOIN dbo.INVOICE i ON i.invoice_id=ii.invoice_id WHERE i.reservation_id=@id;
      DELETE FROM dbo.INVOICE WHERE reservation_id=@id;
      DELETE pt FROM dbo.PAYMENT_TRANSACTION pt JOIN dbo.PAYMENT p ON p.payment_id=pt.payment_id WHERE p.reservation_id=@id;
      DELETE FROM dbo.PAYMENT WHERE reservation_id=@id;
      DELETE FROM dbo.RESERVATION_ADD_ON WHERE reservation_id=@id;
      DELETE FROM dbo.BOOKING_SUBMISSION WHERE reservation_id=@id;
      DELETE FROM dbo.RESERVATION WHERE reservation_id=@id;
    `);
  }
  for (const [type, table, key, id] of [
    ['PACKAGE', 'PACKAGE', 'package_id', created.package],
    ['PACKAGE', 'PACKAGE', 'package_id', created.capacityPackage],
    ['ADD_ON', 'ADD_ON', 'add_on_id', created.addOn]
  ] as const) {
    if (!id) continue;
    await pool.request().input('id', sql.Int, id).input('type', sql.NVarChar(50), type)
      .query(`DELETE FROM dbo.ADMIN_AUDIT_LOG WHERE entity_type=@type AND entity_id=@id; DELETE FROM dbo.${table} WHERE ${key}=@id;`);
  }
  for (const email of [customerAEmail, customerBEmail]) {
    await pool.request().input('email', sql.NVarChar(255), email).query(`
      DELETE FROM dbo.EMAIL_OUTBOX WHERE recipient=@email;
      DELETE s FROM dbo.AUTH_SESSION s JOIN dbo.CUSTOMER c ON c.customer_id=s.customer_id WHERE c.email=@email;
      DELETE FROM dbo.CUSTOMER WHERE email=@email;
    `);
  }
  await pool.request().input('email', sql.NVarChar(255), adminEmail).query(`
    DELETE s FROM dbo.ADMIN_SESSION s JOIN dbo.ADMIN a ON a.admin_id=s.admin_id WHERE a.email=@email;
    DELETE l FROM dbo.ADMIN_AUDIT_LOG l JOIN dbo.ADMIN a ON a.admin_id=l.admin_id WHERE a.email=@email;
    DELETE FROM dbo.ADMIN WHERE email=@email;
  `);
}

try {
  const pool = await getDbPool();
  const event = (await pool.request().query('SELECT TOP 1 event_id,event_type FROM dbo.EVENT ORDER BY event_id')).recordset[0];
  assert.ok(event, 'At least one real EVENT reference record is required for E2E verification.');
  const admin = await pool.request()
    .input('username', sql.NVarChar(100), `${marker}-admin`)
    .input('email', sql.NVarChar(255), adminEmail)
    .input('name', sql.NVarChar(200), `${marker} Administrator`)
    .input('password', sql.NVarChar(255), await hashPassword(password))
    .query(`INSERT dbo.ADMIN(username,email,full_name,password,role,status) OUTPUT INSERTED.admin_id
            VALUES(@username,@email,@name,@password,'ADMIN','ACTIVE')`);
  created.admin = Number(admin.recordset[0].admin_id);

  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}/api`;

  await request(base, '/bookings/my', {}, 401);
  const adminLogin = await request(base, '/auth/admin/login', { method: 'POST', body: JSON.stringify({ identity: adminEmail, password }) });
  const adminCookie = cookie(adminLogin.response);

  const register = async (email: string) => request(base, '/auth/register', { method: 'POST', body: JSON.stringify({ firstName: marker, lastName: 'Customer', email, phone: '09171234567', password }) }, 201);
  const customerA = await register(customerAEmail);
  const customerB = await register(customerBEmail);
  assert.equal(customerA.body.data.phone, '09171234567', 'Registration must return the customer phone for the profile.');
  assert.equal(customerA.response.headers.get('set-cookie'), null);
  assert.equal(customerB.response.headers.get('set-cookie'), null);
  const loginA = await request(base, '/auth/login', { method: 'POST', body: JSON.stringify({ email: customerAEmail, password }) });
  const loginB = await request(base, '/auth/login', { method: 'POST', body: JSON.stringify({ email: customerBEmail, password }) });
  const customerACookie = cookie(loginA.response);
  const customerBCookie = cookie(loginB.response);
  const currentCustomer = await request(base, '/auth/me', { headers: { cookie: customerACookie } });
  assert.equal(currentCustomer.body.data.phone, '09171234567', 'Session restoration must return the customer phone for the profile.');
  const customerLogin = await request(base, '/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: customerBEmail, password }),
  });
  assert.equal(customerLogin.body.data.phone, '09171234567', 'Login must return the customer phone for the profile.');

  await request(base, '/admin/dashboard', { headers: { cookie: customerACookie } }, 401);
  const packageCreate = await request(base, '/admin/packages', { method: 'POST', headers: { cookie: adminCookie }, body: JSON.stringify({ eventId: Number(event.event_id), name: `${marker} Package`, description: 'Disposable E2E package', pricingType: 'PER_HEAD', pricePerGuest: 123.45, basePrice: null, includedGuests: null, excessGuestPrice: null, minGuests: 10, maxGuests: 50, isActive: true }) }, 201);
  created.package = Number(packageCreate.body.data.id);
  const capacityPackageCreate = await request(base, '/admin/packages', { method: 'POST', headers: { cookie: adminCookie }, body: JSON.stringify({ eventId: Number(event.event_id), name: `${marker} Capacity Package`, description: 'Disposable capacity E2E package', pricingType: 'PER_HEAD', pricePerGuest: 100, basePrice: null, includedGuests: null, excessGuestPrice: null, minGuests: 1, maxGuests: 1000, isActive: true }) }, 201);
  created.capacityPackage = Number(capacityPackageCreate.body.data.id);
  const addOnCreate = await request(base, '/admin/add-ons', { method: 'POST', headers: { cookie: adminCookie }, body: JSON.stringify({ name: `${marker} Add-on`, description: 'Disposable E2E add-on', price: 45.67, isActive: true }) }, 201);
  created.addOn = Number(addOnCreate.body.data.id);

  const packages = await request(base, '/packages');
  assert.ok(packages.body.data.some((item: { id: number }) => Number(item.id) === created.package));
  const addOns = await request(base, '/add-ons');
  assert.ok(addOns.body.data.some((item: { id: number }) => Number(item.id) === created.addOn));

  const tomorrow = new Date(Date.now() + 8 * 86_400_000).toISOString().slice(0, 10);
  const bookingCreate = await request(base, '/bookings', { method: 'POST', headers: { cookie: customerACookie }, body: JSON.stringify({ eventType: event.event_type, eventDate: tomorrow, eventTime: '12:30', venue: `${marker} Venue`, guestCount: 10, packageId: created.package, addOnIds: [created.addOn], total: 0 }) }, 201);
  created.booking = Number(bookingCreate.body.data.id);
  createdBookingIds.push(created.booking);
  assert.equal(bookingCreate.body.data.total, 1280.17, 'Server must ignore the manipulated client total.');

  const capacityMonth = String((Number.parseInt(marker.slice(-2), 16) % 10) + 1).padStart(2, '0');
  const smallDate = `2098-${capacityMonth}-10`;
  const largeDate = `2098-${capacityMonth}-11`;
  const exclusiveDate = `2098-${capacityMonth}-12`;
  const emptyExclusiveDate = `2098-${capacityMonth}-13`;
  const capacityBody = (eventDate: string, guestCount: number) => JSON.stringify({
    eventType: event.event_type,
    eventDate,
    eventTime: '12:30',
    venue: `${marker} Capacity Venue`,
    guestCount,
    packageId: created.capacityPackage,
    addOnIds: [],
  });
  const createCapacityBooking = async (eventDate: string, guestCount: number, sessionCookie: string, expected = 201) => {
    const result = await request(base, '/bookings', {
      method: 'POST',
      headers: { cookie: sessionCookie },
      body: capacityBody(eventDate, guestCount),
    }, expected);
    if (expected === 201) createdBookingIds.push(Number(result.body.data.id));
    return result;
  };

  await request(base, `/bookings/availability?date=${smallDate}&guestCount=100`, {}, 401);
  const preview = await request(base, `/bookings/availability?date=${smallDate}&guestCount=100`, { headers: { cookie: customerACookie } });
  assert.deepEqual(Object.keys(preview.body.data).sort(), [
    'activeBookingCount', 'capacityLimit', 'date', 'guestCount', 'message',
    'remainingRequestSlots', 'requiresAdminConfirmation', 'status',
  ]);
  assert.equal(preview.body.data.status, 'AVAILABLE');
  assert.equal(preview.body.data.capacityLimit, 6);

  for (let index = 0; index < 6; index += 1) {
    await createCapacityBooking(smallDate, 100, index % 2 === 0 ? customerACookie : customerBCookie);
  }
  const fullSmallDate = await createCapacityBooking(smallDate, 100, customerACookie, 409);
  assert.equal(fullSmallDate.body.code, 'BOOKING_DATE_FULL');

  const cancelledId = createdBookingIds.at(-6)!;
  await request(base, `/bookings/${cancelledId}/cancel`, {
    method: 'PATCH',
    headers: { cookie: customerACookie },
    body: JSON.stringify({ reason: 'Capacity release test.' }),
  }, 204);
  await createCapacityBooking(smallDate, 100, customerACookie);

  const rejectedId = createdBookingIds.at(-5)!;
  await request(base, `/admin/bookings/${rejectedId}/status`, {
    method: 'PATCH',
    headers: { cookie: adminCookie },
    body: JSON.stringify({ status: 'REJECTED', reason: 'Capacity release test.' }),
  });
  await createCapacityBooking(smallDate, 100, customerBCookie);

  await createCapacityBooking(largeDate, 100, customerACookie);
  await createCapacityBooking(largeDate, 100, customerBCookie);
  const largeFinalSlot = await createCapacityBooking(largeDate, 600, customerACookie);
  assert.equal(largeFinalSlot.body.data.guestCount, 600);
  const fullLargeDate = await createCapacityBooking(largeDate, 100, customerBCookie, 409);
  assert.equal(fullLargeDate.body.code, 'BOOKING_DATE_FULL');

  await createCapacityBooking(exclusiveDate, 100, customerACookie);
  const occupiedExclusiveDate = await createCapacityBooking(exclusiveDate, 1000, customerBCookie, 409);
  assert.equal(occupiedExclusiveDate.body.code, 'BOOKING_DATE_FULL');
  await createCapacityBooking(emptyExclusiveDate, 1000, customerBCookie);

  const concurrentDay = String((Number.parseInt(marker.slice(-4, -2), 16) % 8) + 20).padStart(2, '0');
  const concurrentDate = `2098-${capacityMonth}-${concurrentDay}`;
  for (let index = 0; index < 5; index += 1) {
    await createCapacityBooking(concurrentDate, 100, index % 2 === 0 ? customerACookie : customerBCookie);
  }
  const concurrentAttempts = await Promise.allSettled([
    fetch(`${base}/bookings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-la-chef-request': '1', cookie: customerACookie },
      body: capacityBody(concurrentDate, 100),
    }),
    fetch(`${base}/bookings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-la-chef-request': '1', cookie: customerBCookie },
      body: capacityBody(concurrentDate, 100),
    }),
  ]);
  assert.ok(concurrentAttempts.every((attempt) => attempt.status === 'fulfilled'));
  const concurrentResponses = concurrentAttempts.map((attempt) => (attempt as PromiseFulfilledResult<Response>).value);
  const concurrentOutcomes = await Promise.all(concurrentResponses.map(async (response) => ({
    status: response.status,
    body: await response.json(),
  })));
  assert.deepEqual(concurrentOutcomes.map((outcome) => outcome.status).sort(), [201, 409]);
  const concurrentSuccess = concurrentOutcomes.find((outcome) => outcome.status === 201)!;
  const concurrentConflict = concurrentOutcomes.find((outcome) => outcome.status === 409)!;
  createdBookingIds.push(Number(concurrentSuccess.body.data.id));
  assert.equal(concurrentConflict.body.code, 'BOOKING_DATE_FULL');
  const concurrentCount = await pool.request().input('eventDate', sql.Date, concurrentDate).query(`
    SELECT COUNT(*) AS count FROM dbo.RESERVATION
    WHERE event_date=@eventDate
      AND status IN('PENDING','APPROVED','AWAITING_PAYMENT','PAYMENT_SUBMITTED','PAYMENT_VERIFIED','CONFIRMED')
  `);
  assert.equal(Number(concurrentCount.recordset[0].count), 6, 'Exactly one concurrent request must claim the final slot.');

  const mine = await request(base, '/bookings/my', { headers: { cookie: customerACookie } });
  assert.ok(mine.body.data.some((item: { id: number }) => Number(item.id) === created.booking));
  const dashboard = await request(base, '/bookings/dashboard', { headers: { cookie: customerACookie } });
  assert.ok(dashboard.body.data.totalBookings >= 1);
  await request(base, `/bookings/${created.booking}`, { headers: { cookie: customerBCookie } }, 404);
  await request(base, '/bookings', { method: 'POST', headers: { cookie: customerACookie }, body: JSON.stringify({ eventType: event.event_type, eventDate: tomorrow, eventTime: '12:30', venue: marker, guestCount: -1, packageId: created.package, addOnIds: [] }) }, 400);
  await request(base, '/bookings', { method: 'POST', headers: { cookie: customerACookie }, body: JSON.stringify({ eventType: event.event_type, eventDate: tomorrow, eventTime: '12:30', venue: marker, guestCount: 10, packageId: 2147483647, addOnIds: [] }) }, 400);
  await request(base, '/bookings', { method: 'POST', headers: { cookie: customerACookie }, body: JSON.stringify({ eventType: event.event_type, eventDate: tomorrow, eventTime: '12:30', venue: marker, guestCount: 10, packageId: created.package, addOnIds: [2147483647] }) }, 400);

  await request(base, `/admin/bookings/${created.booking}/status`, { method: 'PATCH', headers: { cookie: adminCookie }, body: JSON.stringify({ status: 'COMPLETED' }) }, 409);
  await request(base, `/admin/bookings/${created.booking}/status`, { method: 'PATCH', headers: { cookie: adminCookie }, body: JSON.stringify({ status: 'APPROVED' }) });
  await request(base, `/bookings/${created.booking}/payment-method`, { method: 'PATCH', headers: { cookie: customerACookie }, body: JSON.stringify({ method: 'cash' }) });
  const search = await request(base, `/admin/bookings?search=${encodeURIComponent("%' OR 1=1;--")}`, { headers: { cookie: adminCookie } });
  assert.equal(search.body.data.totalItems, 0);
  const invoiceIssue = await request(base, `/admin/bookings/${created.booking}/invoice`, { method: 'POST', headers: { cookie: adminCookie }, body: '{}' }, 201);
  const invoiceId = Number(invoiceIssue.body.data.invoiceId);
  const afterApproval = await request(base, `/admin/bookings/${created.booking}`, { headers: { cookie: adminCookie } });
  assert.equal(afterApproval.body.data.status, 'AWAITING_PAYMENT', 'Approval automatically requests payment.');
  await request(base, `/invoices/${invoiceId}`, { headers: { cookie: customerACookie } });
  await request(base, `/invoices/${invoiceId}`, { headers: { cookie: customerBCookie } }, 404);
  await request(base, '/admin/payments', { method: 'POST', headers: { cookie: adminCookie }, body: JSON.stringify({ reservationId: created.booking, amount: -1, method: 'CASH', reference: `${marker}-NEGATIVE`, paymentDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) }) }, 400);
  await request(base, '/admin/payments', { method: 'POST', headers: { cookie: adminCookie }, body: JSON.stringify({ reservationId: created.booking, amount: 999999, method: 'CASH', requestId: '44410af2-ec71-449b-b3f6-f458a839cf33', paymentDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) }) }, 409);
  await request(base, '/admin/payments', { method: 'POST', headers: { cookie: adminCookie }, body: JSON.stringify({ reservationId: created.booking, amount: 100, method: 'CASH', requestId: 'a9733867-a447-4356-b501-5620b69775a8', paymentDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) }) }, 201);
  await request(base, '/admin/payments', { method: 'POST', headers: { cookie: adminCookie }, body: JSON.stringify({ reservationId: created.booking, amount: 1, method: 'CASH', requestId: 'a9733867-a447-4356-b501-5620b69775a8', paymentDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) }) }, 409);
  const invoice = await request(base, `/admin/invoices/${invoiceId}`, { headers: { cookie: adminCookie } });
  assert.equal(invoice.body.data.amountPaid, 100);
  const auditCount = await pool.request().input('adminId', sql.Int, created.admin).query('SELECT COUNT(*) count FROM dbo.ADMIN_AUDIT_LOG WHERE admin_id=@adminId');
  assert.ok(Number(auditCount.recordset[0].count) >= 5, 'Expected audit records for admin mutations.');

  await request(base, '/auth/logout', { method: 'POST', headers: { cookie: customerACookie }, body: '{}' }, 204);
  await request(base, '/bookings/my', { headers: { cookie: customerACookie } }, 401);

  await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  server = undefined;
  await closeDatabase();
  const reconnected = await getDbPool();
  const persisted = await reconnected.request().input('id', sql.Int, created.booking).query('SELECT status FROM dbo.RESERVATION WHERE reservation_id=@id');
  assert.equal(
    persisted.recordset[0]?.status,
    'AWAITING_PAYMENT',
    'A payment below the required 50% deposit must not verify the reservation.',
  );
  console.log('Phase 8.1 SQL-backed E2E verification passed.');
} finally {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  try { await cleanup(); }
  finally {
    await closeDatabase();
    await rm(uploadRoot, { recursive: true, force: true });
  }
}
