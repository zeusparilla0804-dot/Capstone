import 'dotenv/config';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sql from 'mssql';

const uploadRoot = await mkdtemp(join(tmpdir(), 'la-chef-admin-e2e-'));
process.env['PAYMENT_PROOF_UPLOAD_ROOT'] = uploadRoot;
process.env['EMAIL_WORKER_ENABLED'] = 'false';

const [{ default: app }, database, { environment }, { hashPassword }] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/database.js'),
  import('../src/config/environment.js'),
  import('../src/utils/password.js')
]);

if (environment.isProduction) throw new Error('E2E verification is disabled in production.');

const marker = `OPS-${randomUUID().slice(0, 8)}`;
const password = `Ops-${randomUUID()}!aA1`;
const customerAEmail = `${marker.toLowerCase()}-a@example.test`;
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
  if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(`${base}${path}`, { ...init, headers });
  const contentType = response.headers.get('content-type') ?? '';
  const body = response.status === 204 ? undefined : contentType.includes('application/json')
    ? await response.json()
    : await response.arrayBuffer();
  assert.equal(response.status, expected, `${init.method ?? 'GET'} ${path}: ${JSON.stringify(body)}`);
  return { response, body };
}

async function proofForm(reference: string, amount: number, paymentDate: string): Promise<FormData> {
  const form = new FormData();
  form.set('method', 'E_WALLET');
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
          DELETE FROM dbo.RESERVATION WHERE reservation_id=@id;
        `);
    }
    for (const packageId of [created.package, created.capacityPackage]) {
      if (!packageId) continue;
      await pool.request().input('id', sql.Int, packageId).query('DELETE FROM dbo.PACKAGE WHERE package_id=@id');
    }
    for (const email of [customerAEmail, customerBEmail]) {
      await pool.request().input('email', sql.NVarChar(255), email).query(`
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
  const customerBCookie = cookie(registeredB.response);
  await api(base, '/auth/logout', { method: 'POST', headers: { cookie: cookie(registeredA.response) } }, 204);
  const customerLogin = await api(base, '/auth/login', {
    method: 'POST', body: JSON.stringify({ email: customerAEmail, password })
  });
  const customerACookie = cookie(customerLogin.response);

  const packageCreate = await api(base, '/admin/packages', {
    method: 'POST', headers: { cookie: adminCookie }, body: JSON.stringify({
      eventId: Number(event.event_id), name: `${marker} Package`, description: 'Disposable operations E2E package',
      pricePerGuest: 250, minGuests: 10, maxGuests: 50, isActive: true
    })
  }, 201);
  created.package = Number(packageCreate.body.data.id);
  const capacityPackageCreate = await api(base, '/admin/packages', {
    method: 'POST', headers: { cookie: adminCookie }, body: JSON.stringify({
      eventId: Number(event.event_id), name: `${marker} Capacity Package`, description: 'Disposable admin capacity package',
      pricePerGuest: 100, minGuests: 1, maxGuests: 1000, isActive: true
    })
  }, 201);
  created.capacityPackage = Number(capacityPackageCreate.body.data.id);

  const eventDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const bookingCreate = await api(base, '/bookings', {
    method: 'POST', headers: { cookie: customerACookie }, body: JSON.stringify({
      eventType: event.event_type, eventDate, eventTime: '14:00', venue: `${marker} Venue`, guestCount: 10,
      packageId: created.package, addOnIds: [], paymentMethod: 'e-wallet'
    })
  }, 201);
  created.booking = Number(bookingCreate.body.data.id);
  createdBookingIds.push(created.booking);

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
    paymentMethod: 'cash',
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
  assert.equal(capacityDetail.body.data.status, 'APPROVED');
  assert.ok(capacityDetail.body.data.statusHistory.some((entry: { nextStatus: string }) => entry.nextStatus === 'APPROVED'));
  const confirmationAudit = await pool.request()
    .input('adminId', sql.Int, created.admin)
    .input('bookingId', sql.Int, mediumBookingId)
    .query(`SELECT TOP 1 new_values newValues FROM dbo.ADMIN_AUDIT_LOG
      WHERE admin_id=@adminId AND entity_type='BOOKING' AND entity_id=@bookingId AND action='BOOKING_STATUS_CHANGED'
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
  const issued = await api(base, `/admin/bookings/${created.booking}/invoice`, {
    method: 'POST', headers: { cookie: adminCookie }, body: '{}'
  }, 201);
  created.invoice = Number(issued.body.data.invoiceId);
  await api(base, `/invoices/${created.invoice}`, { headers: { cookie: customerBCookie } }, 404);
  await api(base, `/admin/bookings/${created.booking}/status`, {
    method: 'PATCH', headers: { cookie: adminCookie }, body: JSON.stringify({ status: 'AWAITING_PAYMENT' })
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
    method: 'POST', headers: { cookie: customerACookie }, body: await proofForm(`${marker}-FIRST`, 500, eventDate)
  }, 201);
  const secondProofId = Number(secondSubmission.body.data.id);
  await api(base, `/admin/payment-proofs/${secondProofId}`, { headers: { cookie: adminCookie } });

  const verifyRequest = () => api(base, `/admin/payment-proofs/${secondProofId}/verify`, {
    method: 'POST', headers: { cookie: adminCookie }, body: JSON.stringify({ verifiedAmount: 500 })
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
  assert.equal(booking.body.data.amountPaid, 500);
  assert.ok(booking.body.data.statusHistory.some((entry: { nextStatus: string }) => entry.nextStatus === 'AWAITING_PAYMENT'));
  assert.ok(booking.body.data.statusHistory.some((entry: { nextStatus: string }) => entry.nextStatus === 'PAYMENT_VERIFIED'));

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
  assert.equal(Number(state.recordsets[0]![0]!.amountPaid), 500);
  assert.equal(state.recordsets[0]![0]!.paymentStatus, 'PARTIALLY_PAID');
  assert.equal(state.recordsets[0]![0]!.invoiceStatus, 'PARTIALLY_PAID');
  assert.equal(state.recordsets[1]![0]!.proofStatus, 'VERIFIED');
  assert.equal(Number(state.recordsets[1]![0]!.verifiedAmount), 500);
  assert.equal(Number(state.recordsets[1]![0]!.transactionCount), 1);
  const history = state.recordsets[2]!.map(row => row.nextStatus);
  for (const expected of ['APPROVED', 'AWAITING_PAYMENT', 'PAYMENT_SUBMITTED', 'PAYMENT_VERIFIED', 'CONFIRMED']) {
    assert.ok(history.includes(expected), `Missing booking history state: ${expected}`);
  }
  assert.ok(state.recordsets[3]!.length >= 7, 'Expected booking, invoice, proof, and review notification intents.');
  assert.ok(state.recordsets[3]!.every(row => row.status === 'PENDING'), 'SMTP-disabled notifications must remain pending.');
  assert.ok(state.recordsets[3]!.some(row => row.templateKey === 'PAYMENT_PROOF_REJECTED'));
  assert.ok(state.recordsets[3]!.some(row => row.templateKey === 'PAYMENT_PROOF_VERIFIED'));

  console.log('Admin operations SQL-backed E2E verification passed.');
} finally {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await cleanup();
  await database.closeDatabase();
}
