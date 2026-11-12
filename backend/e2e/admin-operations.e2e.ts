import { verifyFixtureEmail } from './verify-fixture-email.js';
import 'dotenv/config';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sql from 'mssql';

const uploadRoot = await mkdtemp(join(tmpdir(), 'la-chef-admin-e2e-'));
process.env['PAYMENT_PROOF_UPLOAD_ROOT'] = uploadRoot;
// These fixtures import app.ts, never server.ts; no mail worker is started.
process.env['EMAIL_WORKER_ENABLED'] = 'true';

const [{ default: app }, database, { environment }, { hashPassword }, { eventReminderRepository }] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/database.js'),
  import('../src/config/environment.js'),
  import('../src/utils/password.js'),
  import('../src/repositories/event-reminder.repository.js')
]);

if (environment.isProduction) throw new Error('E2E verification is disabled in production.');

const marker = `OPS-${randomUUID().slice(0, 8)}`;
const password = `Ops-${randomUUID()}!aA1`;
const customerAEmail = `${marker.toLowerCase()}-a@example.test`;
const customerAUpdatedEmail = `${marker.toLowerCase()}-a-updated@example.test`;
const customerBEmail = `${marker.toLowerCase()}-b@example.test`;
const adminEmail = `${marker.toLowerCase()}-admin@example.test`;
const created: Record<string, number> = {};
const createdBookingIds: number[] = [];
let server: ReturnType<typeof app.listen> | undefined;

const receiptJpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAEAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKAP/2Q==',
  'base64',
);

type ApiResult = { response: Response; body: any };

function cookie(response: Response): string {
  const value = response.headers.get('set-cookie');
  assert.ok(value, 'Expected a session cookie.');
  return value.split(';', 1)[0]!;
}

async function api(base: string, path: string, init: RequestInit = {}, expected = 200): Promise<ApiResult> {
  const headers = new Headers(init.headers);
  headers.set('x-la-chef-request', '1');
  if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(`${base}${path}`, { ...init, headers });
  const contentType = response.headers.get('content-type') ?? '';
  const body = response.status === 204 ? undefined : contentType.includes('application/json')
    ? await response.json()
    : await response.arrayBuffer();
  assert.equal(response.status, expected, `${init.method ?? 'GET'} ${path}: ${JSON.stringify(body)}`);
  if (path === '/auth/register' && response.status === 201) {
    await verifyFixtureEmail(base, JSON.parse(String(init.body)).email);
  }
  return { response, body };
}

async function proofForm(reference: string, amount: number, paymentDate: string): Promise<FormData> {
  const form = new FormData();
  form.set('method', 'BANK_TRANSFER');
  form.set('claimedAmount', amount.toFixed(2));
  form.set('transactionReference', reference);
  form.set('paymentDate', paymentDate);
  form.set('proof', new Blob([receiptJpeg], { type: 'image/jpeg' }), 'payment-proof.jpg');
  return form;
}

async function cleanup(): Promise<void> {
  try {
    const pool = await database.getDbPool();
    for (const bookingId of createdBookingIds) {
      await pool.request()
        .input('id', sql.Int, bookingId)
        .input('adminId', sql.Int, created.admin)
        .input('emailA', sql.NVarChar(320), customerAEmail)
        .input('emailB', sql.NVarChar(320), customerBEmail)
        .query(`
          DELETE FROM dbo.EMAIL_OUTBOX WHERE recipient IN(@emailA,@emailB)
            OR (related_entity_type='BOOKING' AND related_entity_id=@id);
          DELETE FROM dbo.BOOKING_PAYMENT_DESTINATION WHERE reservation_id=@id;
          DELETE FROM dbo.PAYMENT_PROOF WHERE reservation_id=@id;
          DELETE FROM dbo.BOOKING_STATUS_HISTORY WHERE reservation_id=@id;
          DELETE FROM dbo.ADMIN_AUDIT_LOG WHERE admin_id=@adminId
            OR (entity_type='BOOKING' AND entity_id=@id)
            OR (entity_type='PAYMENT' AND entity_id IN(SELECT payment_id FROM dbo.PAYMENT WHERE reservation_id=@id))
            OR (entity_type='INVOICE' AND entity_id IN(SELECT invoice_id FROM dbo.INVOICE WHERE reservation_id=@id));
          DELETE ii FROM dbo.INVOICE_ITEM ii JOIN dbo.INVOICE i ON i.invoice_id=ii.invoice_id WHERE i.reservation_id=@id;
          DELETE FROM dbo.INVOICE WHERE reservation_id=@id;
          DELETE pt FROM dbo.PAYMENT_TRANSACTION pt JOIN dbo.PAYMENT p ON p.payment_id=pt.payment_id WHERE p.reservation_id=@id;
          DELETE FROM dbo.PAYMENT WHERE reservation_id=@id;
          DELETE FROM dbo.RESERVATION_ADD_ON WHERE reservation_id=@id;
          DELETE FROM dbo.BOOKING_SUBMISSION WHERE reservation_id=@id;
          DELETE FROM dbo.RESERVATION WHERE reservation_id=@id;
        `);
    }
    for (const packageId of [created.package, created.capacityPackage]) {
      if (!packageId) continue;
      await pool.request().input('id', sql.Int, packageId).query('DELETE FROM dbo.PACKAGE WHERE package_id=@id');
    }
    for (const email of [customerAEmail, customerAUpdatedEmail, customerBEmail]) {
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
  } finally {
    await rm(uploadRoot, { recursive: true, force: true });
  }
}

try {
  const pool = await database.getDbPool();
  const event = (await pool.request().query('SELECT TOP 1 event_id,event_type FROM dbo.EVENT ORDER BY event_id')).recordset[0];
  assert.ok(event, 'At least one EVENT reference record is required for admin operations E2E verification.');

  const admin = await pool.request()
    .input('username', sql.NVarChar(100), `${marker}-admin`)
    .input('email', sql.NVarChar(255), adminEmail)
    .input('name', sql.NVarChar(200), `${marker} Administrator`)
    .input('password', sql.NVarChar(255), await hashPassword(password))
    .query(`INSERT dbo.ADMIN(username,email,full_name,password,role,status) OUTPUT INSERTED.admin_id
      VALUES(@username,@email,@name,@password,'ADMIN','ACTIVE')`);
  created.admin = Number(admin.recordset[0].admin_id);

  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server!.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}/api`;

  const adminLogin = await api(base, '/auth/admin/login', {
    method: 'POST', body: JSON.stringify({ identity: adminEmail, password })
  });
  const adminCookie = cookie(adminLogin.response);

  const register = async (email: string) => api(base, '/auth/register', {
    method: 'POST', body: JSON.stringify({ firstName: marker, lastName: 'Customer', email, phone: '09171234567', password })
  }, 201);
  const registeredA = await register(customerAEmail);
  const registeredB = await register(customerBEmail);
  const registrationNotifications = await pool.request()
    .input('emailA', sql.NVarChar(320), customerAEmail)
    .input('emailB', sql.NVarChar(320), customerBEmail)
    .query(`SELECT recipient,template_key templateKey,status FROM dbo.EMAIL_OUTBOX
      WHERE recipient IN(@emailA,@emailB) AND template_key='ACCOUNT_REGISTERED'`);
  assert.equal(registrationNotifications.recordset.length, 2, 'Each registration must queue one confirmation email intent.');
  assert.ok(registrationNotifications.recordset.every(row => row.status === 'PENDING'));
  assert.equal(registeredA.response.headers.get('set-cookie'), null);
  assert.equal(registeredB.response.headers.get('set-cookie'), null);
  const loginB = await api(base, '/auth/login', { method: 'POST', body: JSON.stringify({ email: customerBEmail, password }) });
  const loginA = await api(base, '/auth/login', { method: 'POST', body: JSON.stringify({ email: customerAEmail, password }) });
  const customerBCookie = cookie(loginB.response);
  await api(base, '/auth/logout', { method: 'POST', headers: { cookie: cookie(loginA.response) } }, 204);
  const customerLogin = await api(base, '/auth/login', {
    method: 'POST', body: JSON.stringify({ email: customerAEmail, password })
  });
  const customerACookie = cookie(customerLogin.response);

  const packageCreate = await api(base, '/admin/packages', {
    method: 'POST', headers: { cookie: adminCookie }, body: JSON.stringify({
      eventId: Number(event.event_id), name: `${marker} Package`, description: 'Disposable operations E2E package',
      pricingType: 'PER_HEAD', pricePerGuest: 250, basePrice: null, includedGuests: null,
      excessGuestPrice: null, minGuests: 10, maxGuests: 50, isActive: true
    })
  }, 201);
  created.package = Number(packageCreate.body.data.id);
  const capacityPackageCreate = await api(base, '/admin/packages', {
    method: 'POST', headers: { cookie: adminCookie }, body: JSON.stringify({
      eventId: Number(event.event_id), name: `${marker} Capacity Package`, description: 'Disposable admin capacity package',
      pricingType: 'PER_HEAD', pricePerGuest: 100, basePrice: null, includedGuests: null,
      excessGuestPrice: null, minGuests: 1, maxGuests: 1000, isActive: true
    })
  }, 201);
  created.capacityPackage = Number(capacityPackageCreate.body.data.id);

  const eventDate = new Date(Date.now() + 8 * 86_400_000).toISOString().slice(0, 10);
  const bookingCreate = await api(base, '/bookings', {
    method: 'POST', headers: { cookie: customerACookie }, body: JSON.stringify({
      eventType: event.event_type, eventDate, eventTime: '14:00', venue: `${marker} Venue`, guestCount: 10,
      packageId: created.package, addOnIds: []
    })
  }, 201);
  created.booking = Number(bookingCreate.body.data.id);
  createdBookingIds.push(created.booking);
  assert.equal(bookingCreate.body.data.total, 2500);
  await api(base, `/admin/bookings/${created.booking}/time`, { method: 'PATCH', body: JSON.stringify({ eventTime: '22:00', expectedTime: '14:00' }) }, 401);
  await api(base, `/admin/bookings/${created.booking}/time`, { method: 'PATCH', headers: { cookie: customerACookie }, body: JSON.stringify({ eventTime: '22:00', expectedTime: '14:00' }) }, 401);
  await api(base, `/admin/bookings/${created.booking}/time`, { method: 'PATCH', headers: { cookie: adminCookie }, body: JSON.stringify({ eventTime: '22:00', expectedTime: '14:00' }) });
  await api(base, `/admin/bookings/${created.booking}/time`, { method: 'PATCH', headers: { cookie: adminCookie }, body: JSON.stringify({ eventTime: '23:00', expectedTime: '14:00' }) }, 409);
  const adjustedBooking = await api(base, `/admin/bookings/${created.booking}`, { headers: { cookie: adminCookie } });
  assert.equal(adjustedBooking.body.data.eventTime, '22:00');
  assert.ok(adjustedBooking.body.data.statusHistory.some((entry: any) => entry.reason?.includes('10:00 PM')));
  const customerAfterTimeEdit = await api(base, '/bookings/my', { headers: { cookie: customerACookie } });
  assert.equal(customerAfterTimeEdit.body.data.find((item: any) => item.id === created.booking).eventTime, '22:00');
  const requiredDeposit = 1250;

  const capacityMonth = String((Number.parseInt(marker.slice(-2), 16) % 10) + 1).padStart(2, '0');
  const mediumDate = `2097-${capacityMonth}-20`;
  const staleDate = `2097-${capacityMonth}-21`;
  const capacityBody = (eventDate: string, guestCount: number) => JSON.stringify({
    eventType: event.event_type,
    eventDate,
    eventTime: '14:30',
    venue: `${marker} Capacity Venue`,
    guestCount,
    packageId: created.capacityPackage,
    addOnIds: [],
  });
  const capacityBooking = async (eventDate: string, guestCount: number, sessionCookie: string) => {
    const result = await api(base, '/bookings', {
      method: 'POST', headers: { cookie: sessionCookie }, body: capacityBody(eventDate, guestCount)
    }, 201);
    createdBookingIds.push(Number(result.body.data.id));
    return Number(result.body.data.id);
  };

  const mediumBookingId = await capacityBooking(mediumDate, 250, customerACookie);
  let capacityDetail = await api(base, `/admin/bookings/${mediumBookingId}`, { headers: { cookie: adminCookie } });
  assert.equal(capacityDetail.body.data.capacity.status, 'NEEDS_CONFIRMATION');
  assert.equal(capacityDetail.body.data.capacity.activeBookingCount, 1);
  assert.equal(capacityDetail.body.data.capacity.capacityLimit, 6);
  assert.equal(capacityDetail.body.data.capacity.remainingRequestSlots, 5);
  assert.equal(capacityDetail.body.data.capacity.requiresAdminConfirmation, true);
  const capacityList = await api(base, `/admin/bookings?date=${mediumDate}`, { headers: { cookie: adminCookie } });
  const mediumListItem = capacityList.body.data.items.find((item: { id: number }) => Number(item.id) === mediumBookingId);
  assert.equal(mediumListItem.capacity.requiresAdminConfirmation, true);
  const missingConfirmation = await api(base, `/admin/bookings/${mediumBookingId}/status`, {
    method: 'PATCH', headers: { cookie: adminCookie }, body: JSON.stringify({ status: 'APPROVED' })
  }, 400);
  assert.equal(missingConfirmation.body.code, 'CAPACITY_CONFIRMATION_REQUIRED');
  await api(base, `/admin/bookings/${mediumBookingId}/status`, {
    method: 'PATCH', headers: { cookie: adminCookie }, body: JSON.stringify({ status: 'APPROVED', capacityConfirmed: 'true' })
  }, 400);
  await api(base, `/admin/bookings/${mediumBookingId}/status`, {
    method: 'PATCH', headers: { cookie: adminCookie }, body: JSON.stringify({ status: 'APPROVED', capacityConfirmed: true })
  });
  capacityDetail = await api(base, `/admin/bookings/${mediumBookingId}`, { headers: { cookie: adminCookie } });
  assert.equal(capacityDetail.body.data.status, 'AWAITING_PAYMENT');
  assert.ok(capacityDetail.body.data.statusHistory.some((entry: { nextStatus: string }) => entry.nextStatus === 'APPROVED'));
  const confirmationAudit = await pool.request()
    .input('adminId', sql.Int, created.admin)
    .input('bookingId', sql.Int, mediumBookingId)
    .query(`SELECT TOP 1 new_values newValues FROM dbo.ADMIN_AUDIT_LOG
      WHERE admin_id=@adminId AND entity_type='BOOKING' AND entity_id=@bookingId AND action='BOOKING_STATUS_CHANGED' AND JSON_VALUE(new_values,'$.status')='APPROVED'
      ORDER BY audit_id DESC`);
  assert.equal(JSON.parse(String(confirmationAudit.recordset[0].newValues)).capacityConfirmed, true);

  const staleBookingId = await capacityBooking(staleDate, 100, customerACookie);
  await capacityBooking(staleDate, 100, customerBCookie);
  await capacityBooking(staleDate, 100, customerACookie);
  const forced = await pool.request()
    .input('customerId', sql.Int, Number(registeredA.body.data.id))
    .input('eventId', sql.Int, Number(event.event_id))
    .input('packageId', sql.Int, created.capacityPackage)
    .input('reference', sql.NVarChar(30), `${marker}-STALE`)
    .input('eventDate', sql.Date, new Date(`${staleDate}T00:00:00Z`))
    .query(`INSERT dbo.RESERVATION(customer_id,event_id,package_id,booking_reference,event_date,event_time,guest_count,
      venue_address,status,package_unit_price,subtotal,total_amount)
      OUTPUT INSERTED.reservation_id VALUES(@customerId,@eventId,@packageId,@reference,@eventDate,CAST('15:00' AS time),
      600,'Forced stale capacity fixture','PENDING',100,60000,60000)`);
  createdBookingIds.push(Number(forced.recordset[0].reservation_id));
  const staleApproval = await api(base, `/admin/bookings/${staleBookingId}/status`, {
    method: 'PATCH', headers: { cookie: adminCookie }, body: JSON.stringify({ status: 'APPROVED' })
  }, 409);
  assert.equal(staleApproval.body.code, 'CAPACITY_CHANGED');

  await api(base, `/admin/bookings/${created.booking}/status`, {
    method: 'PATCH', headers: { cookie: adminCookie }, body: JSON.stringify({ status: 'APPROVED' })
  });
  await api(base, `/bookings/${created.booking}/payment-method`, { method: 'PATCH', headers: { cookie: customerACookie }, body: JSON.stringify({ method: 'bank-transfer' }) });
  const activityOverview = await api(base, '/admin/dashboard', { headers: { cookie: adminCookie } });
  assert.ok(activityOverview.body.data.priority.qrAssignmentsWaiting >= 1);
  assert.ok(activityOverview.body.data.recentActivity.some((entry: any) => entry.reservationId === created.booking && entry.title === 'Payment method selected' && entry.detail.includes('Bank transfer')));
  const createdActivity = activityOverview.body.data.recentActivity.find((entry: any) => entry.reservationId === created.booking && entry.title === 'Reservation submitted');
  assert.ok(createdActivity && Math.abs(Date.now() - Date.parse(createdActivity.updatedAt)) < 120_000, 'Creation activity must be returned in UTC before PHT display.');
  const readAdminActivity = async () => (await pool.request().input('id', sql.Int, created.admin)
    .query('SELECT CONVERT(varchar(33),last_seen_at,126) lastSeen FROM dbo.ADMIN_SESSION WHERE admin_id=@id ORDER BY token_hash')).recordset;
  const lastSeenBeforePoll = await readAdminActivity();
  await api(base, '/admin/dashboard', { headers: { cookie: adminCookie, 'X-La-Chef-Background': '1' } });
  assert.deepEqual(await readAdminActivity(), lastSeenBeforePoll, 'Automatic badge polling must not renew server idle activity.');
  const issued = await api(base, `/admin/bookings/${created.booking}/invoice`, {
    method: 'POST', headers: { cookie: adminCookie }, body: '{}'
  }, 201);
  created.invoice = Number(issued.body.data.invoiceId);
  await api(base, `/invoices/${created.invoice}`, { headers: { cookie: customerBCookie } }, 404);
  const destinations = await api(base, '/admin/payment-destinations', { headers: { cookie: adminCookie } });
  const destination = destinations.body.data.find((item: {method: string; isAvailable: boolean}) => item.method === 'BANK_TRANSFER' && item.isAvailable);
  assert.ok(destination, 'An available bank QR is required.');
  await api(base, `/admin/payment-destinations/bookings/${created.booking}/assignment`, {
    method: 'PUT', headers: { cookie: adminCookie }, body: JSON.stringify({ destinationId: destination.id })
  });

  const firstSubmission = await api(base, `/bookings/${created.booking}/payment-proofs`, {
    method: 'POST', headers: { cookie: customerACookie }, body: await proofForm(`${marker}-FIRST`, 300, eventDate)
  }, 201);
  const firstProofId = Number(firstSubmission.body.data.id);
  await api(base, `/bookings/${created.booking}/payment-proofs`, { headers: { cookie: customerBCookie } }, 404);
  await api(base, `/payment-proofs/${firstProofId}/file`, { headers: { cookie: customerBCookie } }, 404);
  const privateFile = await api(base, `/payment-proofs/${firstProofId}/file`, { headers: { cookie: adminCookie } });
  assert.equal(privateFile.response.headers.get('cache-control'), 'private, no-store');
  assert.equal(privateFile.response.headers.get('x-content-type-options'), 'nosniff');

  await api(base, `/admin/payment-proofs/${firstProofId}/reject`, {
    method: 'POST', headers: { cookie: adminCookie }, body: JSON.stringify({ reason: 'Reference cannot be reconciled.' })
  });
  let booking = await api(base, `/admin/bookings/${created.booking}`, { headers: { cookie: adminCookie } });
  assert.equal(booking.body.data.status, 'AWAITING_PAYMENT');

  const secondSubmission = await api(base, `/bookings/${created.booking}/payment-proofs`, {
    method: 'POST', headers: { cookie: customerACookie }, body: await proofForm(`${marker}-FIRST`, requiredDeposit, eventDate)
  }, 201);
  const secondProofId = Number(secondSubmission.body.data.id);
  await api(base, `/admin/payment-proofs/${secondProofId}`, { headers: { cookie: adminCookie } });

  const verifyRequest = () => api(base, `/admin/payment-proofs/${secondProofId}/verify`, {
    method: 'POST', headers: { cookie: adminCookie }, body: JSON.stringify({ verifiedAmount: requiredDeposit })
  }, 200);
  const concurrent = await Promise.allSettled([verifyRequest(), verifyRequest()]);
  const fulfilled = concurrent.filter(result => result.status === 'fulfilled');
  const rejected = concurrent.filter(result => result.status === 'rejected');
  assert.equal(fulfilled.length, 1, 'Exactly one concurrent verification must succeed.');
  assert.equal(rejected.length, 1, 'Exactly one concurrent verification must be rejected.');
  assert.match(String((rejected[0] as PromiseRejectedResult).reason), /409/);

  await api(base, `/admin/bookings/${created.booking}/status`, {
    method: 'PATCH', headers: { cookie: adminCookie }, body: JSON.stringify({ status: 'CONFIRMED' })
  });
  booking = await api(base, `/admin/bookings/${created.booking}`, { headers: { cookie: adminCookie } });
  assert.equal(booking.body.data.status, 'CONFIRMED');
  assert.equal(booking.body.data.amountPaid, requiredDeposit);
  assert.ok(booking.body.data.statusHistory.some((entry: { nextStatus: string }) => entry.nextStatus === 'AWAITING_PAYMENT'));
  assert.ok(booking.body.data.statusHistory.some((entry: { nextStatus: string }) => entry.nextStatus === 'PAYMENT_VERIFIED'));

  const reminderFrom = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  assert.equal(await eventReminderRepository.queueDue(reminderFrom, eventDate), 1,
    'The confirmed booking must queue one upcoming-event reminder.');
  assert.equal(await eventReminderRepository.queueDue(reminderFrom, eventDate), 0,
    'A repeated scheduler run must not duplicate the reminder.');

  const customerBooking = await api(base, `/bookings/${created.booking}`, { headers: { cookie: customerACookie } });
  assert.equal(customerBooking.body.data.status, 'confirmed');
  const customerProofs = await api(base, `/bookings/${created.booking}/payment-proofs`, { headers: { cookie: customerACookie } });
  assert.deepEqual(customerProofs.body.data.map((proof: { status: string }) => proof.status).sort(), ['REJECTED', 'VERIFIED']);

  const state = await pool.request().input('bookingId', sql.Int, created.booking)
    .input('proofId', sql.BigInt, secondProofId)
    .input('email', sql.NVarChar(320), customerAEmail)
    .query(`
      SELECT r.status bookingStatus,p.amount_paid amountPaid,p.status paymentStatus,i.status invoiceStatus
        FROM dbo.RESERVATION r JOIN dbo.PAYMENT p ON p.reservation_id=r.reservation_id
        JOIN dbo.INVOICE i ON i.reservation_id=r.reservation_id WHERE r.reservation_id=@bookingId;
      SELECT pp.status proofStatus,pp.verified_amount verifiedAmount,
        (SELECT COUNT(*) FROM dbo.PAYMENT_TRANSACTION pt WHERE pt.payment_transaction_id=pp.payment_transaction_id) transactionCount
        FROM dbo.PAYMENT_PROOF pp WHERE pp.payment_proof_id=@proofId;
      SELECT next_status nextStatus FROM dbo.BOOKING_STATUS_HISTORY WHERE reservation_id=@bookingId;
      SELECT status,template_key templateKey FROM dbo.EMAIL_OUTBOX WHERE recipient=@email;
    `);
  assert.equal(state.recordsets[0]![0]!.bookingStatus, 'CONFIRMED');
  assert.equal(Number(state.recordsets[0]![0]!.amountPaid), requiredDeposit);
  assert.equal(state.recordsets[0]![0]!.paymentStatus, 'PARTIALLY_PAID');
  assert.equal(state.recordsets[0]![0]!.invoiceStatus, 'PARTIALLY_PAID');
  assert.equal(state.recordsets[1]![0]!.proofStatus, 'VERIFIED');
  assert.equal(Number(state.recordsets[1]![0]!.verifiedAmount), requiredDeposit);
  assert.equal(Number(state.recordsets[1]![0]!.transactionCount), 1);
  const history = state.recordsets[2]!.map(row => row.nextStatus);
  for (const expected of ['APPROVED', 'AWAITING_PAYMENT', 'PAYMENT_SUBMITTED', 'PAYMENT_VERIFIED', 'CONFIRMED']) {
    assert.ok(history.includes(expected), `Missing booking history state: ${expected}`);
  }
  assert.ok(state.recordsets[3]!.length >= 7, 'Expected booking, invoice, proof, and review notification intents.');
  assert.ok(state.recordsets[3]!.every(row => row.status === 'PENDING'), 'SMTP-disabled notifications must remain pending.');
  assert.ok(state.recordsets[3]!.some(row => row.templateKey === 'PAYMENT_PROOF_REJECTED'));
  assert.ok(state.recordsets[3]!.some(row => row.templateKey === 'PAYMENT_PROOF_VERIFIED'));
  assert.equal(state.recordsets[3]!.filter(row => row.templateKey === 'ACCOUNT_REGISTERED').length, 1);
  assert.equal(state.recordsets[3]!.filter(row => row.templateKey === 'UPCOMING_EVENT_REMINDER').length, 1);

  const customerId = Number(registeredA.body.data.id);
  const updatedCustomer = await api(base, `/admin/customers/${customerId}`, {
    method: 'PATCH',
    headers: { cookie: adminCookie },
    body: JSON.stringify({
      firstName: 'Updated',
      lastName: 'Customer',
      email: customerAUpdatedEmail,
      phone: '09179998888',
    }),
  });
  assert.equal(updatedCustomer.body.data.email, customerAUpdatedEmail);
  assert.equal(updatedCustomer.body.data.firstName, 'Updated');
  assert.equal(updatedCustomer.body.data.lastName, 'Customer');

  const duplicateEmail = await api(base, `/admin/customers/${customerId}`, {
    method: 'PATCH',
    headers: { cookie: adminCookie },
    body: JSON.stringify({
      firstName: 'Updated',
      lastName: 'Customer',
      email: customerBEmail,
      phone: '09179998888',
    }),
  }, 409);
  assert.equal(duplicateEmail.body.message, 'Email is already in use.');

  const deactivated = await api(base, `/admin/customers/${customerId}/status`, {
    method: 'PATCH',
    headers: { cookie: adminCookie },
    body: JSON.stringify({ status: 'INACTIVE' }),
  });
  assert.equal(deactivated.body.data.status, 'INACTIVE');
  await api(base, `/bookings/${created.booking}`, { headers: { cookie: customerACookie } }, 401);
  await api(base, '/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: customerAUpdatedEmail, password }),
  }, 401);

  const preservedHistory = await api(base, `/admin/customers/${customerId}`, { headers: { cookie: adminCookie } });
  assert.equal(preservedHistory.body.data.status, 'INACTIVE');
  const preservedBookings = await api(base, `/admin/customers/${customerId}/bookings`, { headers: { cookie: adminCookie } });
  const preservedPayments = await api(base, `/admin/customers/${customerId}/payments`, { headers: { cookie: adminCookie } });
  assert.ok(preservedBookings.body.data.items.some((item: { id: number }) => Number(item.id) === created.booking));
  assert.ok(preservedPayments.body.data.items.some((item: { bookingId: number }) => Number(item.bookingId) === created.booking));

  const reactivated = await api(base, `/admin/customers/${customerId}/status`, {
    method: 'PATCH',
    headers: { cookie: adminCookie },
    body: JSON.stringify({ status: 'ACTIVE' }),
  });
  assert.equal(reactivated.body.data.status, 'ACTIVE');
  await api(base, '/auth/email/resend', {
    method: 'POST',
    body: JSON.stringify({ email: customerAUpdatedEmail }),
  }, 202);
  await verifyFixtureEmail(base, customerAUpdatedEmail);
  await api(base, '/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: customerAUpdatedEmail, password }),
  });

  const reportFixture = await pool.request()
    .input('bookingId', sql.Int, created.booking)
    .input('adminId', sql.Int, created.admin)
    .input('reference', sql.NVarChar(150), `${marker}-REPORT`)
    .query(`
      DECLARE @paymentId int=(SELECT payment_id FROM dbo.PAYMENT WHERE reservation_id=@bookingId);
      INSERT dbo.PAYMENT_TRANSACTION(payment_id,admin_id,amount,payment_method,transaction_ref,payment_date)
        VALUES(@paymentId,@adminId,100,'BANK_TRANSFER',@reference,CONVERT(datetime2,'2099-12-31T00:00:00'));
      UPDATE dbo.PAYMENT SET amount_paid=amount_paid+100,payment_method='BANK_TRANSFER',transaction_ref=@reference,
        payment_date=CONVERT(datetime2,'2099-12-31T00:00:00'),status='PARTIALLY_PAID' WHERE payment_id=@paymentId;
      UPDATE dbo.INVOICE SET status='PARTIALLY_PAID' WHERE reservation_id=@bookingId;
      SELECT CONVERT(varchar(10),i.issued_at,23) reportDate,i.invoice_number invoiceNumber,r.booking_reference bookingReference
        FROM dbo.INVOICE i JOIN dbo.RESERVATION r ON r.reservation_id=i.reservation_id WHERE r.reservation_id=@bookingId;
    `);
  const reportDate = String(reportFixture.recordset[0].reportDate);
  const invoiceNumber = String(reportFixture.recordset[0].invoiceNumber);
  const bookingReference = String(reportFixture.recordset[0].bookingReference);

  await api(base, `/admin/reports/reservations?dateFrom=${eventDate}&dateTo=${eventDate}`, {}, 401);
  const reservationFilters = new URLSearchParams({ dateFrom: eventDate, dateTo: eventDate, status: 'CONFIRMED', eventType: String(event.event_type) });
  const reservationReport = await api(base, `/admin/reports/reservations?${reservationFilters}`, { headers: { cookie: adminCookie } });
  assert.ok(reservationReport.body.data.items.some((item: { reference: string }) => item.reference === bookingReference));
  assert.equal(reservationReport.body.data.summary.reservationCount, reservationReport.body.data.items.length);
  assert.equal(reservationReport.body.data.summary.totalGuests,
    reservationReport.body.data.items.reduce((total: number, item: { guestCount: number }) => total + Number(item.guestCount), 0));

  const paymentFilters = new URLSearchParams({ dateFrom: reportDate, dateTo: reportDate, status: 'PARTIALLY_PAID', method: 'BANK_TRANSFER' });
  const paymentReport = await api(base, `/admin/reports/payments?${paymentFilters}`, { headers: { cookie: adminCookie } });
  const invoiceRows = paymentReport.body.data.items.filter((item: { invoiceNumber: string }) => item.invoiceNumber === invoiceNumber);
  assert.equal(invoiceRows.length, 1, 'Multiple transactions must not duplicate a billing report row.');
  assert.equal(invoiceRows[0].amountDue, 2500);
  assert.equal(invoiceRows[0].amountPaid, requiredDeposit + 100);
  assert.equal(invoiceRows[0].outstandingBalance, 2500 - requiredDeposit - 100);
  assert.equal(paymentReport.body.data.summary.totalBilled,
    paymentReport.body.data.items.reduce((total: number, item: { amountDue: number }) => total + Number(item.amountDue), 0));
  assert.equal(paymentReport.body.data.summary.verifiedPayments,
    paymentReport.body.data.items.reduce((total: number, item: { amountPaid: number }) => total + Number(item.amountPaid), 0));

  const emptyReport = await api(base, '/admin/reports/reservations?dateFrom=2098-01-01&dateTo=2098-01-01', { headers: { cookie: adminCookie } });
  assert.deepEqual(emptyReport.body.data.summary, { reservationCount: 0, totalGuests: 0 });
  assert.deepEqual(emptyReport.body.data.items, []);

  const reservationCsv = await api(base, `/admin/reports/reservations/export?${reservationFilters}`, { headers: { cookie: adminCookie } });
  assert.match(reservationCsv.response.headers.get('content-disposition') ?? '', /^attachment; filename="la-chef-reservations-\d{4}-\d{2}-\d{2}\.csv"$/);
  assert.deepEqual(Array.from(new Uint8Array(reservationCsv.body as ArrayBuffer).slice(0, 3)), [0xef, 0xbb, 0xbf]);
  const csvText = new TextDecoder().decode(reservationCsv.body as ArrayBuffer);
  assert.ok(csvText.startsWith('Reference,Customer,Event date,Event time,Event type,Guests,Venue,Package,Status\r\n'));
  assert.ok(csvText.includes(bookingReference));

  const customerAudit = await pool.request()
    .input('adminId', sql.Int, created.admin)
    .input('customerId', sql.Int, customerId)
    .query(`SELECT action FROM dbo.ADMIN_AUDIT_LOG
      WHERE admin_id=@adminId AND entity_type='CUSTOMER' AND entity_id=@customerId`);
  const customerAuditActions = customerAudit.recordset.map(row => row.action);
  for (const expected of ['CUSTOMER_UPDATED', 'CUSTOMER_DEACTIVATED', 'CUSTOMER_ACTIVATED']) {
    assert.ok(customerAuditActions.includes(expected), `Missing customer audit action: ${expected}`);
  }

  console.log('Admin operations SQL-backed E2E verification passed.');
} finally {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await cleanup();
  await database.closeDatabase();
}
